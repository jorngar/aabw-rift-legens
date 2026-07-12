// ============================================================
// A/B Testing SOP — standard operating procedure runner, built on
// the same pattern as the Telemetry SOP (telemetry-sop.js):
// pull evidence from Postgres, generate a reasoning SOP prompt,
// execute it on the local Hermes CLI, and gate every side effect
// behind deterministic guardrails.
//
// Phases:
//   1. ingest     — pull A/B evidence from Postgres (sessions,
//                   purchases, defects, deaths, engagements, layouts)
//                   and compute the deterministic composite verdict
//   2. measure    — Hermes reasons about each variant's player
//                   experience per KPI, grounded in the numbers
//   3. recommend  — Hermes produces ranked recommendations, a
//                   salvage-from-loser plan, and expected KPIs
//   4. verdict    — deterministic promote/hold/collect-more decision
//                   (scoring.computeScore is the single source of truth)
//   5. deploy     — shift LB weights toward the winner (only when a
//                   real winner exists and autoDeploy is requested)
//
// Runs are persisted through the same sop_runs audit trail as the
// telemetry SOP, tagged with agent: 'ab-testing'.
// ============================================================
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as scoring from '@rift-seed/shared/scoring.js';
import { pool } from '../db/pool.js';
import { fetchSummary, fetchLayoutBreakdown } from '../ab-data-viewer.js';
import { fetchBreakdowns } from '../ab-breakdowns.js';
import { saveSOPRun, getSOPRuns, saveDB } from '../database.js';
import { parseJsonResponse } from './hermes-balance-agent.js';

export const AB_SOP_PHASES = Object.freeze([
  { key: 'ingest', title: 'Ingest A/B evidence from Postgres' },
  { key: 'measure', title: 'Measure variant player experience' },
  { key: 'recommend', title: 'Recommendations + salvage plan + expected KPIs' },
  { key: 'verdict', title: 'Composite verdict + decision' },
  { key: 'deploy', title: 'Deploy — shift LB weights to the winner' },
]);

// Deterministic salvage hints per KPI, mirrored from the original
// winner-picker CLI so narratives stay consistent with the dashboard.
const SALVAGE_HINTS = Object.freeze({
  retention: 'loser held players longer → salvage its spawn/exploration layout',
  revenue: 'loser drove more purchases → salvage its shop placement',
  safety: 'loser had fewer defects/deaths → preserve its lower obstacle density',
  completion: 'loser had a higher completion rate → adopt its portal placement',
  balance: 'loser felt fairer in combat → reduce enemy count in the hybrid',
});

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

export class ABTestingSOP {
  constructor({
    hermesAgent,
    onUpdate = null,
    lbBaseUrl = process.env.AB_TESTING_BASE || 'http://localhost:3000',
    fetchers = null,
  } = {}) {
    this.hermesAgent = hermesAgent;
    this.onUpdate = onUpdate;
    this.lbBaseUrl = lbBaseUrl;
    this.fetchers = fetchers || {
      summary: fetchSummary,
      breakdowns: fetchBreakdowns,
      layouts: fetchLayoutBreakdown,
      activePatches: async () =>
        (await pool.query(`SELECT id, name, description FROM patches WHERE status = 'active' ORDER BY id`)).rows,
      shiftWeights: async (weights) => {
        const response = await fetch(`${this.lbBaseUrl}/api/lb/weights`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(weights),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`LB weight update failed: ${JSON.stringify(payload)}`);
        return payload;
      },
    };
    this.currentRun = null;
    this.history = [];
  }

  get running() {
    return Boolean(this.currentRun && this.currentRun.status === 'running');
  }

  /**
   * Kick off a full A/B SOP run. Validates evidence up front (active patch
   * + at least one recorded session), then executes phases in the background.
   */
  async start({ autoDeploy = false } = {}) {
    if (this.running || this._starting) throw new Error('An A/B SOP run is already in progress');
    this._starting = true;
    let evidence;
    try {
      evidence = await this._collectEvidence();
    } finally {
      this._starting = false;
    }

    const run = {
      id: `absop_${randomUUID().slice(0, 8)}`,
      agent: 'ab-testing',
      source: 'postgres',
      patchId: evidence.patchId,
      patchName: evidence.patchName,
      autoDeploy,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      phases: AB_SOP_PHASES.map(p => ({ ...p, status: 'pending', startedAt: null, durationMs: null, output: null, error: null })),
    };
    this.currentRun = run;
    this._notify();

    // Fire and forget; callers poll GET /api/agents/ab/sop.
    // (_runPromise is awaited by tests to observe completion.)
    this._runPromise = this._execute(run, evidence).catch(() => {});
    return run;
  }

  getSnapshot() {
    return {
      running: this.running,
      phases: AB_SOP_PHASES,
      lbBaseUrl: this.lbBaseUrl,
      currentRun: this.currentRun,
      history: this.history.slice(-5).reverse(),
      persistedRuns: getSOPRuns(20).filter(r => r?.agent === 'ab-testing').slice(0, 5),
    };
  }

  /**
   * Deterministic verdict without any Hermes call — used by the CLI's
   * --verdict-only mode and by the verdict phase itself.
   */
  async computeVerdict() {
    const evidence = await this._collectEvidence();
    return { patchId: evidence.patchId, patchName: evidence.patchName, ...evidence.verdict, sampleSizes: evidence.sampleSizes };
  }

  async _collectEvidence() {
    const patches = await this.fetchers.activePatches();
    if (!patches.length) throw new Error('no active patch — nothing to A/B test');
    if (patches.length > 1) throw new Error(`${patches.length} active patches; the SOP supports exactly one`);
    const patch = patches[0];
    const patchId = Number(patch.id);

    const [summary, breakdowns, layouts] = await Promise.all([
      this.fetchers.summary(),
      this.fetchers.breakdowns(),
      this.fetchers.layouts ? this.fetchers.layouts() : [],
    ]);

    const findRow = (rows, variant) => (rows || []).find(r => r.patch_id === patchId && r.variant === variant) || {};
    const merge = variant => ({
      ...findRow(summary, variant),
      ...findRow(breakdowns.extras?.completion, variant),
      ...findRow(breakdowns.extras?.balance, variant),
      progression: findRow(breakdowns.extras?.progression, variant),
    });
    const A = merge('A');
    const B = merge('B');
    const sampleSizes = { A: A.sessions || 0, B: B.sessions || 0 };
    if (!sampleSizes.A && !sampleSizes.B) {
      throw new Error('no sessions collected for the active patch yet — play both variants first');
    }

    const verdict = scoring.computeScore(A, B);
    const perPatch = rows => (rows || []).filter(r => r.patch_id === patchId);

    return {
      patchId,
      patchName: patch.name || `patch-${patchId}`,
      description: patch.description || '',
      collectedAt: Date.now(),
      variants: { A, B },
      sampleSizes,
      verdict,
      breakdowns: {
        defectsByType: perPatch(breakdowns.breakdowns?.defectsByType),
        deathsByEnemy: perPatch(breakdowns.breakdowns?.deathsByEnemy),
        purchasesByItem: perPatch(breakdowns.breakdowns?.purchasesByItem),
        engagementsByEnemy: perPatch(breakdowns.breakdowns?.engagementsByEnemy),
        endReasons: perPatch(breakdowns.breakdowns?.endReasons),
      },
      layouts: perPatch(layouts),
      dataQuality: {
        sessions: sampleSizes.A + sampleSizes.B,
        minPerVariant: scoring.MIN_SESSIONS,
        sufficientForPromotion: sampleSizes.A >= scoring.MIN_SESSIONS && sampleSizes.B >= scoring.MIN_SESSIONS,
        note: sampleSizes.A >= scoring.MIN_SESSIONS && sampleSizes.B >= scoring.MIN_SESSIONS
          ? 'Both variants meet the minimum session count for promotion decisions'
          : `Weak sample — promotion requires >=${scoring.MIN_SESSIONS} sessions per variant`,
      },
    };
  }

  async _execute(run, evidence) {
    try {
      const ingest = await this._phase(run, 'ingest', () => this._ingest(evidence));
      const experience = await this._phase(run, 'measure', () => this._measure(ingest));
      await this._phase(run, 'recommend', () => this._recommend(ingest, experience));
      const verdict = await this._phase(run, 'verdict', () => this._verdict(ingest));
      await this._phase(run, 'deploy', () => this._deploy(run, verdict));
      run.status = 'completed';
    } catch (error) {
      run.status = 'failed';
      run.error = error.message;
    } finally {
      run.finishedAt = Date.now();
      this.history.push(run);
      if (this.history.length > 20) this.history.shift();
      try { saveSOPRun(run); saveDB(); } catch { /* persistence is best effort */ }
      this._notify();
    }
  }

  async _phase(run, key, fn) {
    const phase = run.phases.find(p => p.key === key);
    phase.status = 'running';
    phase.startedAt = Date.now();
    this._notify();
    try {
      phase.output = await fn();
      phase.status = 'done';
      return phase.output;
    } catch (error) {
      phase.status = 'failed';
      phase.error = error.message;
      throw error;
    } finally {
      phase.durationMs = Date.now() - phase.startedAt;
      this._notify();
    }
  }

  _notify() {
    try { this.onUpdate?.(this.currentRun); } catch { /* observers must not break the run */ }
  }

  _reason(prompt) {
    // Same executor as the telemetry SOP: the Hermes agent owns binary
    // resolution and timeout handling.
    return this.hermesAgent.execute(prompt);
  }

  async _reasonJson(prompt) {
    try {
      return parseJsonResponse(await this._reason(prompt));
    } catch (firstError) {
      const retryOutput = await this._reason(
        `${prompt}\n\nIMPORTANT: Your previous attempt was rejected (${firstError.message}). Respond with ONLY the JSON object, nothing else.`,
      );
      return parseJsonResponse(retryOutput);
    }
  }

  // ── Phase 1: ingest ─────────────────────────────────────────
  _ingest(evidence) {
    return evidence;
  }

  // ── Phase 2: measure variant experience ─────────────────────
  async _measure(ingest) {
    const prompt = `You are a game analytics agent comparing two A/B variants (A and B) of an action RPG patch from live Postgres KPI data.

RULES:
- Output JSON only, no markdown or commentary.
- Ground every statement in numeric evidence from the data ("metric=value").
- KPIs and their weights: retention ${scoring.WEIGHTS.retention}, revenue ${scoring.WEIGHTS.revenue}, safety ${scoring.WEIGHTS.safety}, completion ${scoring.WEIGHTS.completion}, balance ${scoring.WEIGHTS.balance}.
- If a variant has fewer than ${scoring.MIN_SESSIONS} sessions, say so and keep confidence low.

Required JSON shape:
{"summary":"...","confidence":0.0,
 "kpiReadings":[{"kpi":"retention","leader":"A|B|tie","reasoning":"...","evidence":["metric=value"]}],
 "variantExperience":{"A":{"score":0,"note":"..."},"B":{"score":0,"note":"..."}}}

Use exactly these five kpi names: retention, revenue, safety, completion, balance.

patch=${ingest.patchName}
variant_kpis=${JSON.stringify(ingest.variants)}
composite_verdict=${JSON.stringify(ingest.verdict)}
breakdowns=${JSON.stringify(ingest.breakdowns)}
layouts=${JSON.stringify(ingest.layouts)}
data_quality=${JSON.stringify(ingest.dataQuality)}`;

    const raw = await this._reasonJson(prompt);
    const validKpis = ['retention', 'revenue', 'safety', 'completion', 'balance'];
    return {
      summary: String(raw.summary || ''),
      confidence: clamp01(raw.confidence),
      kpiReadings: (Array.isArray(raw.kpiReadings) ? raw.kpiReadings : []).slice(0, 6)
        .filter(r => validKpis.includes(r?.kpi))
        .map(r => ({
          kpi: r.kpi,
          leader: ['A', 'B'].includes(r.leader) ? r.leader : 'tie',
          reasoning: String(r.reasoning || ''),
          evidence: Array.isArray(r.evidence) ? r.evidence.map(String).slice(0, 5) : [],
        })),
      variantExperience: {
        A: { score: Math.round(clamp01((raw.variantExperience?.A?.score || 0) / 100) * 100), note: String(raw.variantExperience?.A?.note || '') },
        B: { score: Math.round(clamp01((raw.variantExperience?.B?.score || 0) / 100) * 100), note: String(raw.variantExperience?.B?.note || '') },
      },
    };
  }

  // ── Phase 3: recommendations + salvage + expected KPIs ───────
  async _recommend(ingest, experience) {
    const winner = ingest.verdict.winner;
    const loserWins = Object.entries(ingest.verdict.perKpi)
      .filter(([, side]) => side && winner && side !== winner)
      .map(([kpi]) => ({ kpi, hint: SALVAGE_HINTS[kpi] }));

    const prompt = `You are a game A/B testing analyst. Based on the measured variant experience and the deterministic composite verdict, produce (a) a ranked recommendation list, (b) a salvage plan describing what to keep from the losing variant, and (c) expected KPIs for the next iteration.

RULES:
- Output JSON only.
- Every recommendation must cite numeric evidence ("metric=value") and name the KPI it targets.
- The composite verdict below is authoritative — do not contradict its winner; your job is to explain and extend it.
- Salvage items must come from KPIs where the LOSER beat the winner (candidates listed below). If there are none, return an empty salvage array.
- Expected KPIs must have numeric current and target values from the data.

Required JSON shape:
{"recommendations":[{"title":"...","severity":"high|medium|low","kpi":"...","rationale":"...","evidence":["metric=value"]}],
 "salvage":[{"kpi":"...","fromVariant":"A|B","what":"...","why":"..."}],
 "expectedKPIs":[{"kpi":"...","current":0,"target":0,"direction":"increase|decrease","rationale":"..."}]}

composite_verdict=${JSON.stringify(ingest.verdict)}
salvage_candidates=${JSON.stringify(loserWins)}
variant_kpis=${JSON.stringify(ingest.variants)}
measured_experience=${JSON.stringify(experience)}`;

    const raw = await this._reasonJson(prompt);
    return {
      recommendations: (Array.isArray(raw.recommendations) ? raw.recommendations : []).slice(0, 8).map(r => ({
        title: String(r.title || 'Recommendation'),
        severity: ['high', 'medium', 'low'].includes(r.severity) ? r.severity : 'medium',
        kpi: String(r.kpi || ''),
        rationale: String(r.rationale || ''),
        evidence: Array.isArray(r.evidence) ? r.evidence.map(String).slice(0, 5) : [],
      })),
      salvage: (Array.isArray(raw.salvage) ? raw.salvage : []).slice(0, 5).map(s => ({
        kpi: String(s.kpi || ''),
        fromVariant: ['A', 'B'].includes(s.fromVariant) ? s.fromVariant : (winner === 'A' ? 'B' : 'A'),
        what: String(s.what || ''),
        why: String(s.why || ''),
      })),
      expectedKPIs: (Array.isArray(raw.expectedKPIs) ? raw.expectedKPIs : []).slice(0, 6).map(k => ({
        kpi: String(k.kpi || 'unknown'),
        current: Number(k.current) || 0,
        target: Number(k.target) || 0,
        direction: k.direction === 'decrease' ? 'decrease' : 'increase',
        rationale: String(k.rationale || ''),
      })),
    };
  }

  // ── Phase 4: deterministic verdict + decision ────────────────
  _verdict(ingest) {
    const v = ingest.verdict;
    const decision = v.reason === 'insufficient_samples'
      ? 'collect_more'
      : v.winner
        ? 'promote'
        : 'hold';
    return {
      winner: v.winner,
      reason: v.reason,
      scores: v.scores,
      delta: v.delta,
      perKpi: v.perKpi,
      sampleSizes: ingest.sampleSizes,
      decision,
      note: decision === 'promote'
        ? `Variant ${v.winner} wins the composite score by ${(v.delta * 100).toFixed(1)}%`
        : decision === 'collect_more'
          ? `Insufficient samples (need >=${scoring.MIN_SESSIONS} per variant, have A=${ingest.sampleSizes.A} B=${ingest.sampleSizes.B})`
          : 'Tie under threshold — no promotion',
    };
  }

  // ── Phase 5: deploy — LB weight shift ────────────────────────
  async _deploy(run, verdict) {
    if (!run.autoDeploy) {
      return { skipped: true, note: 'autoDeploy=false — review the verdict, then promote via the CLI (--promote) or POST /api/lb/weights' };
    }
    if (verdict.decision !== 'promote') {
      return { skipped: true, note: `decision is '${verdict.decision}' — refusing to shift LB weights (${verdict.note})` };
    }
    const weights = verdict.winner === 'A' ? { A: 100, B: 0 } : { A: 0, B: 100 };
    const lbResponse = await this.fetchers.shiftWeights(weights);
    const result = {
      promoted: verdict.winner,
      weights,
      lbConfirmedAt: lbResponse.at || null,
      note: 'LB weights shifted; they reset to 50/50 on LB restart (documented v1 behaviour).',
    };
    // Flip the patch to completed only when its successor exists on disk,
    // mirroring the original winner-picker flow. Anchored to the repo root
    // so the check works regardless of the caller's cwd (server vs CLI).
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
    if (existsSync(join(repoRoot, 'packages/shared/src/maps/patch-v02/index.js'))) {
      await pool.query(`UPDATE patches SET status = 'completed' WHERE id = $1`, [run.patchId]);
      result.patchStatus = 'completed (patch-v02 takes over)';
    } else {
      result.patchStatus = 'kept active (no successor patch deployed)';
    }
    return result;
  }
}
