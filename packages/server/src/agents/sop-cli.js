#!/usr/bin/env node
// ============================================================
// SOP CLI — run an agent SOP programmatically from the command line,
// without the game server. The flow for both agents is identical:
//
//   pull evidence from Postgres → generate the SOP prompt →
//   execute it on the local Hermes CLI → validate → (optionally) deploy
//
// Usage:
//   node src/agents/sop-cli.js telemetry [source phrase] [--no-deploy] [--json]
//   node src/agents/sop-cli.js ab [--promote] [--verdict-only] [--json]
//
// telemetry — six-phase telemetry SOP (telemetry-sop.js).
//   source phrase: sdk | matches | all (fuzzy, default sdk). The sdk
//   source rehydrates persisted gameplay events from Postgres.
//   Deploys the validated patch by default; --no-deploy leaves the
//   proposal reviewable in the dashboard patch tab.
//
// ab — five-phase A/B SOP (ab-testing-sop.js) over the Postgres
//   collection tables. Deploy (LB weight shift) is OFF by default;
//   pass --promote to shift traffic to the winner when one exists.
//   --verdict-only prints the deterministic verdict JSON and exits
//   without calling Hermes (parity with the old winner-picker CLI).
//
// Env: DATABASE_URL (Postgres), HERMES_BIN, HERMES_TIMEOUT_MS,
//      AB_TESTING_BASE (LB base URL for --promote, default :3000).
// ============================================================
import { initDB, saveDB } from '../database.js';
import { closePool } from '../db/pool.js';
import { findRecentGameplayEvents } from '../db/repositories.js';
import { TelemetryAgent } from './telemetry-agent.js';
import { HermesBalanceAgent } from './hermes-balance-agent.js';
import { TelemetrySOP } from './telemetry-sop.js';
import { ABTestingSOP } from './ab-testing-sop.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));
const command = positional[0];
const asJson = flags.has('--json');

function usage() {
  console.error(`Usage:
  node src/agents/sop-cli.js telemetry [source phrase] [--no-deploy] [--json]
  node src/agents/sop-cli.js ab [--promote] [--verdict-only] [--json]`);
  process.exitCode = 1;
}

function phaseLogger(label) {
  const seen = new Map();
  return run => {
    for (const phase of run?.phases || []) {
      const previous = seen.get(phase.key);
      if (phase.status !== previous && phase.status !== 'pending') {
        seen.set(phase.key, phase.status);
        const duration = phase.durationMs != null ? ` (${(phase.durationMs / 1000).toFixed(1)}s)` : '';
        console.error(`[${label}] ${phase.key}: ${phase.status}${duration}${phase.error ? ` — ${phase.error}` : ''}`);
      }
    }
  };
}

function printRun(run) {
  if (asJson) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  console.log(`\nRun ${run.id} — ${run.status}${run.error ? ` (${run.error})` : ''}`);
  for (const phase of run.phases) {
    console.log(`\n== ${phase.title} [${phase.status}] ==`);
    if (phase.error) console.log(`   error: ${phase.error}`);
    if (phase.output) console.log(JSON.stringify(phase.output, null, 2));
  }
}

async function buildHermesStack() {
  // SQLite holds the balance store + SOP audit trail; Postgres holds the
  // telemetry evidence. Both are needed for a full standalone run.
  await initDB();
  const telemetryAgent = new TelemetryAgent();
  const hermesAgent = new HermesBalanceAgent({
    telemetryAgent,
    evidenceLoader: patchId => findRecentGameplayEvents({ patchId, limit: 3000 }),
  });
  return { telemetryAgent, hermesAgent };
}

async function runTelemetry() {
  const source = positional.slice(1).join(' ') || 'sdk';
  const autoDeploy = !flags.has('--no-deploy');
  const { telemetryAgent, hermesAgent } = await buildHermesStack();
  const sop = new TelemetrySOP({ telemetryAgent, hermesAgent, onUpdate: phaseLogger('telemetry-sop') });

  console.error(`[telemetry-sop] source="${source}" autoDeploy=${autoDeploy} — pulling evidence…`);
  const run = await sop.start({ source, autoDeploy });
  await sop._runPromise;
  printRun(run);
  saveDB();
  return run.status === 'completed';
}

async function runAB() {
  const { hermesAgent } = await buildHermesStack();
  const sop = new ABTestingSOP({ hermesAgent, onUpdate: phaseLogger('ab-sop') });

  if (flags.has('--verdict-only')) {
    const verdict = await sop.computeVerdict();
    console.log(JSON.stringify(verdict, null, 2));
    return true;
  }

  const autoDeploy = flags.has('--promote');
  console.error(`[ab-sop] autoDeploy=${autoDeploy} — pulling A/B evidence from Postgres…`);
  const run = await sop.start({ autoDeploy });
  await sop._runPromise;
  printRun(run);
  saveDB();
  return run.status === 'completed';
}

async function main() {
  if (command === 'telemetry') return runTelemetry();
  if (command === 'ab') return runAB();
  usage();
  return false;
}

main()
  .then(ok => { if (!ok && process.exitCode === undefined) process.exitCode = 1; })
  .catch(error => {
    console.error(`[sop-cli] abort: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closePool('sop-cli-exit'));
