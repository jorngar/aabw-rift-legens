// ============================================================
// Telemetry Agent SOP — standard operating procedure runner
//
// Turns raw SDK telemetry into a deployed, validated game patch
// through six auditable phases:
//   1. ingest       — collect current data points (SDK evidence + DB)
//   2. measure      — reason about the current player experience
//   3. recommend    — recommendation list backed by metrics
//   4. propose      — dev-facing patch proposal + expected KPIs
//   5. datasources  — propose new data points worth instrumenting
//   6. deploy       — apply the patch + publish the new data inputs
//
// Phases 2–5 use the local Hermes CLI for reasoning; every phase
// records its inputs, outputs, and timing so the whole run is
// reviewable from the dashboard.
// ============================================================
import { randomUUID } from 'crypto';
import {
  getAggregateStats, getMatchHistory, getAllBalance, getAdjustments,
  saveSOPRun, getSOPRuns, addDataSources, setDataSourceStatus, saveDB,
} from '../database.js';
import { parseJsonResponse, PATCH_LIMITS } from './hermes-balance-agent.js';

export const SOP_PHASES = Object.freeze([
  { key: 'ingest', title: 'Ingest current data points' },
  { key: 'measure', title: 'Measure player experience' },
  { key: 'recommend', title: 'Generate recommendations' },
  { key: 'propose', title: 'Patch proposal + expected KPIs' },
  { key: 'datasources', title: 'Propose new data sources' },
  { key: 'deploy', title: 'Deploy patch + new data inputs' },
]);

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const clampScore = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

// Data sources the SOP can ingest from. The skill/API passes a free-form
// phrase ("data points from the match history db"); it is resolved fuzzily
// against these entries.
export const DATA_SOURCES = Object.freeze([
  { id: 'sdk', name: 'Live SDK telemetry', description: 'Events streamed from the running game client this server session', pattern: /sdk|telemetry|event|live|stream/ },
  { id: 'matches', name: 'Match history database', description: 'Persisted per-session match rows from the SQLite game database', pattern: /match|session|history|database|db|sqlite/ },
  { id: 'all', name: 'All sources combined', description: 'SDK telemetry evidence enriched with the match history summary', pattern: /\ball\b|both|combined|everything/ },
]);

export class TelemetrySOP {
  constructor({ telemetryAgent, hermesAgent, onUpdate = null } = {}) {
    this.telemetryAgent = telemetryAgent;
    this.hermesAgent = hermesAgent;
    this.onUpdate = onUpdate;
    this.currentRun = null;
    this.history = [];
  }

  get running() {
    return Boolean(this.currentRun && this.currentRun.status === 'running');
  }

  /**
   * Kick off a full SOP run. Validates that evidence exists synchronously,
   * then executes the phases in the background. Returns the run skeleton.
   */
  start({ source = 'sdk', patchId = null, autoDeploy = true } = {}) {
    if (this.running) throw new Error('An SOP run is already in progress');
    const resolved = this._resolveSource(source);
    const evidence = this._buildEvidence(resolved.id, patchId);

    const run = {
      id: `sop_${randomUUID().slice(0, 8)}`,
      source: resolved.id,
      sourceLabel: String(source),
      patchId: evidence.patchId,
      autoDeploy,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      phases: SOP_PHASES.map(p => ({ ...p, status: 'pending', startedAt: null, durationMs: null, output: null, error: null })),
    };
    this.currentRun = run;
    this._notify();

    // Fire and forget; callers poll GET /api/agents/telemetry/sop.
    // (_runPromise is awaited by tests to observe completion.)
    this._runPromise = this._execute(run, evidence).catch(() => {});
    return run;
  }

  getSnapshot() {
    return {
      running: this.running,
      phases: SOP_PHASES,
      availableSources: this.getAvailableSources(),
      currentRun: this.currentRun,
      history: this.history.slice(-5).reverse(),
      persistedRuns: getSOPRuns(5),
    };
  }

  /** Resolve a free-form source phrase against the known data sources. */
  _resolveSource(input) {
    const text = String(input || 'sdk').toLowerCase().trim();
    const source = DATA_SOURCES.find(s => s.id === text) || DATA_SOURCES.find(s => s.pattern.test(text));
    if (!source) {
      const available = DATA_SOURCES.map(s => `${s.id} (${s.name})`).join(', ');
      throw new Error(`Unknown data source "${input}". Available sources: ${available}`);
    }
    return source;
  }

  /** Build the primary evidence object for the resolved data source. */
  _buildEvidence(sourceId, patchId = null) {
    if (sourceId === 'sdk') {
      const evidence = this.telemetryAgent?.getEvidence(patchId);
      if (!evidence) throw new Error("Data source 'sdk' has no telemetry evidence yet — play a session first");
      return evidence;
    }
    if (sourceId === 'matches') return this._matchEvidence();
    // 'all' — combine whatever is available.
    const sdk = this.telemetryAgent?.getEvidence(patchId);
    let matches = null;
    try { matches = this._matchEvidence(); } catch { /* empty table is fine here */ }
    if (!sdk && !matches) throw new Error('No data is available in any source — play a session first');
    if (sdk && matches) return { ...sdk, matchHistorySummary: matches };
    return sdk || matches;
  }

  /** Evidence built from the persisted match_history table instead of the live SDK stream. */
  _matchEvidence() {
    const rows = getMatchHistory(500);
    if (!rows.length) throw new Error("Data source 'matches' is empty — no match history has been recorded yet");
    const sum = key => rows.reduce((total, r) => total + (Number(r[key]) || 0), 0);
    const kills = sum('kills');
    const deaths = sum('deaths');
    const durationSeconds = sum('duration_seconds');
    const perClass = {};
    for (const r of rows) {
      const cls = r.class_type || 'unknown';
      perClass[cls] = perClass[cls] || { class: cls, matches: 0, kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0 };
      perClass[cls].matches++;
      perClass[cls].kills += r.kills || 0;
      perClass[cls].deaths += r.deaths || 0;
      perClass[cls].damageDealt += r.damage_dealt || 0;
      perClass[cls].damageTaken += r.damage_taken || 0;
    }
    return {
      patchId: 'match_history',
      sample: {
        events: rows.length,
        sessions: rows.length,
        observedMinutes: Number((durationSeconds / 60).toFixed(2)),
        sufficientForDirection: rows.length >= 5,
      },
      outcomes: {
        kills,
        playerDeaths: deaths,
        killDeathRatio: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
        killsPerMatch: Number((kills / rows.length).toFixed(2)),
        deathsPerMatch: Number((deaths / rows.length).toFixed(2)),
      },
      damage: {
        totalDealt: sum('damage_dealt'),
        received: sum('damage_taken'),
        perMatchDealt: Math.round(sum('damage_dealt') / rows.length),
        perMatchTaken: Math.round(sum('damage_taken') / rows.length),
      },
      progression: {
        avgLevel: Number((sum('level_reached') / rows.length).toFixed(1)),
        avgXp: Math.round(sum('xp_earned') / rows.length),
        avgGold: Math.round(sum('gold_earned') / rows.length),
        skillsUsedTotal: sum('skills_used'),
        wavesClearedTotal: sum('waves_cleared'),
      },
      session: {
        matches: rows.length,
        averageDurationSeconds: Math.round(durationSeconds / rows.length),
        classesSeen: Object.keys(perClass),
      },
      perClass: Object.values(perClass),
    };
  }

  /** Current readiness of every data source, for the dashboard picker and the skill. */
  getAvailableSources() {
    let sdkEvidence = null;
    try { sdkEvidence = this.telemetryAgent?.getEvidence() || null; } catch { /* treat as not ready */ }
    let matchCount = 0;
    try { matchCount = getMatchHistory(500).length; } catch { /* treat as empty */ }
    return DATA_SOURCES.map(s => {
      const base = { id: s.id, name: s.name, description: s.description };
      if (s.id === 'sdk') {
        return {
          ...base,
          ready: Boolean(sdkEvidence),
          detail: sdkEvidence
            ? `${sdkEvidence.sample.events} events / ${sdkEvidence.sample.sessions} sessions (patch ${sdkEvidence.patchId})`
            : 'no events yet — play a session',
        };
      }
      if (s.id === 'matches') {
        return { ...base, ready: matchCount > 0, detail: matchCount > 0 ? `${matchCount} recorded matches` : 'no matches recorded yet' };
      }
      return { ...base, ready: Boolean(sdkEvidence) || matchCount > 0, detail: 'sdk + matches combined' };
    });
  }

  async _execute(run, evidence) {
    try {
      const ingest = await this._phase(run, 'ingest', () => this._ingest(evidence, run.source));
      const experience = await this._phase(run, 'measure', () => this._measure(ingest));
      let analysis;
      await this._phase(run, 'recommend', async () => {
        analysis = await this._analyzeAndPropose(ingest, experience);
        return { recommendations: analysis.recommendations };
      });
      const proposal = await this._phase(run, 'propose', () => this._buildProposal(analysis, ingest));
      const sources = await this._phase(run, 'datasources', () => this._proposeDataSources(ingest, experience, analysis));
      await this._phase(run, 'deploy', () => this._deploy(run, proposal, sources));
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
    // Reuse the Hermes agent's executor (binary resolution + timeout handling).
    return this.hermesAgent.execute(prompt);
  }

  async _reasonJson(prompt) {
    try {
      return parseJsonResponse(await this._reason(prompt));
    } catch (firstError) {
      // Local models occasionally answer with prose or truncated JSON — one
      // retry with an explicit reminder recovers most of these.
      const retryOutput = await this._reason(
        `${prompt}\n\nIMPORTANT: Your previous attempt was rejected (${firstError.message}). Respond with ONLY the JSON object, nothing else.`,
      );
      return parseJsonResponse(retryOutput);
    }
  }

  // ── Phase 1: ingest ─────────────────────────────────────────
  _ingest(evidence, source) {
    const aggregates = getAggregateStats();
    const matches = getMatchHistory(200);
    const balance = getAllBalance();
    return {
      source,
      collectedAt: Date.now(),
      evidence,
      aggregates,
      matchCount: matches.length,
      classesSeen: [...new Set(matches.map(m => m.class_type))],
      balanceKeyCount: Object.keys(balance).length,
      balance,
      recentAdjustments: getAdjustments(5),
      dataQuality: {
        events: evidence.sample.events,
        sessions: evidence.sample.sessions,
        sufficientForDirection: evidence.sample.sufficientForDirection,
        note: evidence.sample.sufficientForDirection
          ? 'Sample is large enough for directional conclusions'
          : 'Weak sample — treat all downstream conclusions as low confidence',
      },
    };
  }

  // ── Phase 2: measure player experience ──────────────────────
  async _measure(ingest) {
    const prompt = `You are a game analytics agent measuring the current player experience of an action RPG from live telemetry.

RULES:
- Output JSON only, no markdown or commentary.
- Score each dimension 0-100 (100 = ideal experience) and ground every score in numeric evidence from the data.
- If the sample is weak (${ingest.dataQuality.events} events, ${ingest.dataQuality.sessions} sessions), say so in the reasoning and keep confidence low.

Required JSON shape:
{"overallScore":0,"confidence":0.0,"summary":"...","dimensions":[{"name":"survivability","score":0,"reasoning":"...","evidence":["metric=value"]}],"keyIssues":["..."]}

Use exactly these five dimension names: survivability, combat_agency, progression_pacing, threat_balance, engagement.

data_source=${ingest.source}
telemetry_evidence=${JSON.stringify(ingest.evidence)}
aggregate_match_stats=${JSON.stringify(ingest.aggregates)}
match_count=${ingest.matchCount}`;

    const raw = await this._reasonJson(prompt);
    return {
      overallScore: clampScore(raw.overallScore),
      confidence: clamp01(raw.confidence),
      summary: String(raw.summary || ''),
      dimensions: (Array.isArray(raw.dimensions) ? raw.dimensions : []).slice(0, 6).map(d => ({
        name: String(d.name || 'unknown'),
        score: clampScore(d.score),
        reasoning: String(d.reasoning || ''),
        evidence: Array.isArray(d.evidence) ? d.evidence.map(String).slice(0, 5) : [],
      })),
      keyIssues: (Array.isArray(raw.keyIssues) ? raw.keyIssues : []).map(String).slice(0, 6),
    };
  }

  // ── Phases 3+4 share one reasoning pass ──────────────────────
  async _analyzeAndPropose(ingest, experience) {
    const allowed = Object.entries(PATCH_LIMITS).map(([key, [min, max]]) => ({
      key, current: Number(ingest.balance[key] ?? min), min, max,
    }));
    const prompt = `You are a game balance analyst. Based on the measured player experience and live telemetry, produce (a) a ranked recommendation list and (b) one conservative patch proposal with expected KPIs.

RULES:
- Output JSON only.
- Every recommendation must cite numeric evidence ("metric=value") and name the balance keys it relates to.
- The patch proposal may only change keys from allowed_changes, each at most 30% from its listed current value (prefer <=15%).
- Expected KPIs must reference measurable telemetry (killDeathRatio, deathsPerMinute, skill usage share, session duration, heal usage...) with a numeric current value and a numeric target.
- Weak evidence (${ingest.dataQuality.events} events, ${ingest.dataQuality.sessions} sessions) means low confidence and smaller changes.

Required JSON shape:
{"recommendations":[{"title":"...","severity":"high|medium|low","rationale":"...","evidence":["metric=value"],"relatedKeys":["..."]}],
 "patch":{"summary":"...","rationale":"...","expectedImpact":"...","confidence":0.0,"changes":[{"key":"...","proposedValue":0,"reason":"...","evidence":["metric=value"]}]},
 "expectedKPIs":[{"kpi":"...","current":0,"target":0,"direction":"increase|decrease","rationale":"..."}]}

player_experience=${JSON.stringify(experience)}
telemetry_evidence=${JSON.stringify(ingest.evidence)}
allowed_changes=${JSON.stringify(allowed)}`;

    const raw = await this._reasonJson(prompt);
    return {
      recommendations: (Array.isArray(raw.recommendations) ? raw.recommendations : []).slice(0, 8).map(r => ({
        title: String(r.title || 'Recommendation'),
        severity: ['high', 'medium', 'low'].includes(r.severity) ? r.severity : 'medium',
        rationale: String(r.rationale || ''),
        evidence: Array.isArray(r.evidence) ? r.evidence.map(String).slice(0, 5) : [],
        relatedKeys: Array.isArray(r.relatedKeys) ? r.relatedKeys.map(String).slice(0, 5) : [],
      })),
      patch: raw.patch || {},
      expectedKPIs: (Array.isArray(raw.expectedKPIs) ? raw.expectedKPIs : []).slice(0, 6).map(k => ({
        kpi: String(k.kpi || 'unknown'),
        current: Number(k.current) || 0,
        target: Number(k.target) || 0,
        direction: k.direction === 'decrease' ? 'decrease' : 'increase',
        rationale: String(k.rationale || ''),
      })),
    };
  }

  _buildProposal(analysis, ingest) {
    // Route the raw patch through the Hermes agent's ±30% safety validation so
    // SOP patches obey exactly the same rails as manually generated ones, and
    // show up in the existing patch-implementation tab.
    const proposal = this.hermesAgent._validateProposal(
      {
        summary: analysis.patch.summary || 'Telemetry SOP balance patch',
        rationale: analysis.patch.rationale || '',
        expectedImpact: analysis.patch.expectedImpact || '',
        confidence: analysis.patch.confidence,
        changes: Array.isArray(analysis.patch.changes) ? analysis.patch.changes : [],
      },
      ingest.evidence,
      ingest.balance,
    );
    proposal.source = 'telemetry-sop';
    this.hermesAgent.proposals.push(proposal);
    if (this.hermesAgent.proposals.length > 50) this.hermesAgent.proposals.shift();
    if (!proposal.changes.length) throw new Error('Patch proposal contained no valid changes after safety validation');
    return { proposal, expectedKPIs: analysis.expectedKPIs };
  }

  // ── Phase 5: propose new data sources ────────────────────────
  async _proposeDataSources(ingest, experience, analysis) {
    const measuredNow = Object.keys(ingest.evidence).join(', ');
    const prompt = `You are a telemetry engineer. Given what the SDK already measures and the open questions from this balance analysis, propose the 3 most valuable NEW data points to instrument next.

RULES:
- Output JSON only.
- Do not propose anything already measured (currently measured groups: ${measuredNow}; events cover combat damage, kills/deaths, skill use, hp/mp deltas, movement paths, session duration).
- Each proposal must say which KPI or open question it unblocks.
- id must be snake_case.

Required JSON shape:
{"dataSources":[{"id":"...","name":"...","description":"...","rationale":"...","kpiSupported":"...","exampleEvent":{"type":"...","fields":["..."]}}]}

key_issues=${JSON.stringify(experience.keyIssues)}
expected_kpis=${JSON.stringify(analysis.expectedKPIs)}`;

    const raw = await this._reasonJson(prompt);
    const sources = (Array.isArray(raw.dataSources) ? raw.dataSources : []).slice(0, 5).map(s => ({
      id: String(s.id || `source_${randomUUID().slice(0, 6)}`).replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
      name: String(s.name || 'New data source'),
      description: String(s.description || ''),
      rationale: String(s.rationale || ''),
      kpiSupported: String(s.kpiSupported || ''),
      exampleEvent: s.exampleEvent && typeof s.exampleEvent === 'object' ? s.exampleEvent : null,
    }));
    if (sources.length) addDataSources(sources);
    return { dataSources: sources };
  }

  // ── Phase 6: deploy ─────────────────────────────────────────
  _deploy(run, proposalPhase, sourcesPhase) {
    if (!run.autoDeploy) {
      return { skipped: true, note: 'autoDeploy=false — review the proposal in the dashboard and deploy from the patch tab' };
    }
    const applied = this.hermesAgent.applyProposal(proposalPhase.proposal.id);
    const deployedSources = sourcesPhase.dataSources.map(s => {
      setDataSourceStatus(s.id, 'deployed');
      return s.id;
    });
    saveDB();
    return {
      appliedPatchId: applied.id,
      appliedChanges: applied.changes.filter(c => c.operation !== 'no_change')
        .map(c => ({ key: c.key, from: c.currentValue, to: c.proposedValue, percentChange: c.percentChange })),
      deployedDataSources: deployedSources,
      note: 'Balance changes are live in /api/runtime-config; new data inputs are published to the SDK via runtime config.',
    };
  }
}
