#!/usr/bin/env node
// ============================================================
// A/B Testing SOP orchestrator — self-contained entry point that runs
// the full /ab-testing skill's SOP without needing the .claude/skills/
// wrapper. Callers only need repo access + Node 20+.
//
// Modes:
//   (default)         interactive — prompts PROMOTE/SKIP-PR/CANCEL on stdin
//   --verdict-only    prints verdict JSON and exits (for LLM callers)
//   --promote-winner  auto-executes PROMOTE (skips prompt)
//   --cancel          shows verdict, exits with no side effects
//
// Reads: /api/ab-tests/summary, /api/ab-tests/breakdowns
// Writes: /api/lb/weights (POST on PROMOTE), patches.status flip
//
// Usage:
//   node packages/server/src/agents/ab-testing-sop.js
//   AB_TESTING_BASE=http://localhost:5173 node .../ab-testing-sop.js --verdict-only
// ============================================================
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import * as scoring from '@rift-seed/shared/scoring.js';

const BASE  = process.env.AB_TESTING_BASE || 'http://localhost:3000';
const MODES = new Set(['--verdict-only', '--promote-winner', '--cancel']);
const MODE  = process.argv.find((a) => MODES.has(a)) || '--interactive';

// ---- Step 0: prereqs -----------------------------------------------

function checkDocker() {
  try { execSync('docker ps --format "{{.Names}}" | grep -q rift-seed-postgres', { stdio: 'ignore' }); }
  catch { throw new Error('rift-seed-postgres container is not running'); }
}

async function checkLb() {
  try { const r = await fetch(`${BASE}/api/lb/weights`); if (!r.ok) throw 0; }
  catch { throw new Error(`LB not responding at ${BASE} — run 'pnpm dev:lb-all'`); }
}

function singleActivePatchId() {
  const raw = execSync(
    `docker exec rift-seed-postgres psql -U rift -d rift_seed -t -c "SELECT id FROM patches WHERE status='active';"`,
    { encoding: 'utf8' },
  );
  const ids = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error('no active patch — nothing to A/B');
  if (ids.length > 1) throw new Error(`${ids.length} active patches; skill supports exactly one (see plan.md → Locked Decisions)`);
  return Number(ids[0]);
}

// ---- Step 1-2: fetch + compute -------------------------------------

async function fetchSnapshot() {
  const [summary, breakdowns] = await Promise.all([
    fetch(`${BASE}/api/ab-tests/summary`).then((r) => r.json()),
    fetch(`${BASE}/api/ab-tests/breakdowns`).then((r) => r.json()),
  ]);
  return { summary, breakdowns };
}

function computeVerdictFor(patchId, summary, breakdowns) {
  const findRow = (rows, v) => (rows || []).find((r) => r.patch_id === patchId && r.variant === v) || {};
  const merge = (v) => ({
    ...findRow(summary, v),
    ...findRow(breakdowns.extras?.completion, v),
    ...findRow(breakdowns.extras?.balance, v),
  });
  const a = merge('A'), b = merge('B');
  const patchName = summary.find((r) => r.patch_id === patchId)?.patch_name || `patch-${patchId}`;
  return {
    patch_id: patchId,
    patch_name: patchName,
    ...scoring.computeScore(a, b),
    sample_sizes: { A: a.sessions || 0, B: b.sessions || 0 },
    raw: { A: a, B: b },
  };
}

// ---- Step 4: present -----------------------------------------------

const KPI_LABEL = { retention: 'Retention', revenue: 'Revenue', safety: 'Safety', completion: 'Completion', balance: 'Balance' };

function presentVerdict(v) {
  const w = v.winner || 'tie';
  const deltaPct = (v.delta * 100).toFixed(1);
  const lines = [
    '',
    `Patch:    ${v.patch_name} (id=${v.patch_id})`,
    `Sessions: A=${v.sample_sizes.A}  B=${v.sample_sizes.B}  (min per variant: 10)`,
    '',
    'Composite Score',
    `  A: ${v.scores.A}`,
    `  B: ${v.scores.B}`,
    `  Δ: ${deltaPct}%`,
    `  Winner: ${w}`,
    `  Reason: ${v.reason}`,
    '',
    'Per-KPI winners',
    ...Object.entries(v.perKpi).map(([k, side]) => `  ${KPI_LABEL[k].padEnd(11)}: ${side || 'tie'}`),
  ];
  console.log(lines.join('\n'));
}

function salvageNarrative(perKpi, winner) {
  if (!winner) return 'Verdict is a tie — no salvage recommendation. Collect more sessions.';
  const loserWins = Object.entries(perKpi).filter(([, side]) => side && side !== winner).map(([k]) => k);
  if (!loserWins.length) return `Loser matched winner on every KPI. Hybrid patch offers no lift.`;
  const hints = {
    retention:  "loser held players longer → salvage its spawn/exploration layout",
    revenue:    "loser drove more purchases → salvage its shop placement",
    safety:     "loser had fewer defects/deaths → preserve its lower obstacle density",
    completion: "loser had a higher completion rate → adopt its portal placement",
    balance:    "loser felt fairer in combat → reduce enemy count in the hybrid",
  };
  const picks = loserWins.map((k) => hints[k]).filter(Boolean).join('; ');
  return `Salvage from loser (${loserWins.join(', ')}): ${picks}.`;
}

// ---- Step 6-7: prompt + execute ------------------------------------

async function promptChoice(canPromote) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const opts = canPromote
    ? '  1) PROMOTE — shift LB toward the winner\n  2) SKIP-PR  — no LB change (PR flow stubbed)\n  3) CANCEL   — no side effects'
    : '  1) SKIP-PR  — no LB change (PR flow stubbed)\n  2) CANCEL   — no side effects\n  (PROMOTE hidden: insufficient samples)';
  console.log('\nChoose an action:');
  console.log(opts);
  const answer = (await rl.question('\n> ')).trim().toUpperCase();
  rl.close();
  const map = canPromote
    ? { '1': 'PROMOTE', '2': 'SKIP-PR', '3': 'CANCEL', 'PROMOTE': 'PROMOTE', 'SKIP': 'SKIP-PR', 'SKIP-PR': 'SKIP-PR', 'CANCEL': 'CANCEL' }
    : { '1': 'SKIP-PR', '2': 'CANCEL', 'SKIP': 'SKIP-PR', 'SKIP-PR': 'SKIP-PR', 'CANCEL': 'CANCEL' };
  return map[answer] || 'CANCEL';
}

async function executePromote(verdict, patchId) {
  const winner = verdict.winner;
  if (!winner) { console.log('No winner — refusing to shift weights on a tie.'); return; }
  const body = winner === 'A' ? { A: 100, B: 0 } : { A: 0, B: 100 };
  const r = await fetch(`${BASE}/api/lb/weights`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await r.json();
  if (!r.ok) throw new Error(`LB weight update failed: ${JSON.stringify(payload)}`);
  console.log(`\n[PROMOTE] LB weights shifted → A=${body.A}% B=${body.B}% at ${payload.at}`);

  if (existsSync('packages/shared/src/maps/patch-v02/index.js')) {
    execSync(`docker exec rift-seed-postgres psql -U rift -d rift_seed -c "UPDATE patches SET status='completed' WHERE id=${patchId};"`, { stdio: 'inherit' });
    console.log(`[PROMOTE] Flipped patch id=${patchId} to status='completed' (patch-v02 now takes over)`);
  } else {
    console.log('[PROMOTE] patch-v02 not present — kept patch-v01 active (Phase 4 not deployed)');
  }
}

// ---- Main ----------------------------------------------------------

async function main() {
  checkDocker();
  await checkLb();
  const patchId = singleActivePatchId();

  const { summary, breakdowns } = await fetchSnapshot();
  const verdict = computeVerdictFor(patchId, summary, breakdowns);
  if (!verdict.sample_sizes.A && !verdict.sample_sizes.B) throw new Error('no sessions collected for this patch yet');

  if (MODE === '--verdict-only') { console.log(JSON.stringify(verdict, null, 2)); return; }

  presentVerdict(verdict);
  console.log('\n' + salvageNarrative(verdict.perKpi, verdict.winner));
  console.log('\nBug diagnosis: pending (Phase 5)');
  console.log('patch-v02 generation: pending (Phase 4)');

  const canPromote = verdict.reason !== 'insufficient_samples';
  let choice;
  if (MODE === '--promote-winner') choice = canPromote ? 'PROMOTE' : 'CANCEL';
  else if (MODE === '--cancel')    choice = 'CANCEL';
  else                             choice = await promptChoice(canPromote);

  console.log(`\n=== ${choice} ===`);
  if (choice === 'PROMOTE') await executePromote(verdict, patchId);
  else if (choice === 'SKIP-PR') console.log('[SKIP-PR] PR flow stubbed until Phase 4');
  else console.log('[CANCEL] no changes made');

  console.log('\nReminder: LB weights RESET on LB restart (documented as future work).');
}

main().catch((err) => { console.error(`[ab-testing] abort: ${err.message}`); process.exit(1); });
