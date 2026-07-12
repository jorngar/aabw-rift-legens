import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetrySOP, SOP_PHASES } from '../src/agents/telemetry-sop.js';
import { HermesBalanceAgent } from '../src/agents/hermes-balance-agent.js';

const evidence = {
  patchId: 'v0.1.0',
  sample: { events: 80, sessions: 5, observedMinutes: 10, sufficientForDirection: true },
  outcomes: { kills: 2, playerDeaths: 8, killDeathRatio: 0.25 },
  damage: { received: 900, weapon: 100, skill: 300 },
};

const measureReply = JSON.stringify({
  overallScore: 42,
  confidence: 0.5,
  summary: 'Players die faster than they kill.',
  dimensions: [
    { name: 'survivability', score: 25, reasoning: 'K/D 0.25', evidence: ['killDeathRatio=0.25'] },
    { name: 'combat_agency', score: 60, reasoning: 'skills used', evidence: ['skillShare=0.75'] },
  ],
  keyIssues: ['Player deaths exceed kills 4:1'],
});

const proposeReply = JSON.stringify({
  recommendations: [
    { title: 'Lower shadow beast damage', severity: 'high', rationale: 'Deaths exceed kills', evidence: ['killDeathRatio=0.25'], relatedKeys: ['enemy.shadow_beast.damage'] },
  ],
  patch: {
    summary: 'Survivability patch',
    rationale: 'K/D 0.25',
    expectedImpact: 'Fewer deaths',
    confidence: 0.5,
    changes: [
      { key: 'enemy.shadow_beast.damage', proposedValue: 18, reason: 'Deaths exceed kills', evidence: ['killDeathRatio=0.25'] },
      { key: 'not.a.real.key', proposedValue: 1, reason: 'should be rejected', evidence: [] },
    ],
  },
  expectedKPIs: [
    { kpi: 'killDeathRatio', current: 0.25, target: 0.8, direction: 'increase', rationale: 'less punishing' },
  ],
});

const dataSourceReply = JSON.stringify({
  dataSources: [
    { id: 'potion_usage_timing', name: 'Potion usage timing', description: 'HP% when potions are drunk', rationale: 'explains deaths', kpiSupported: 'deathsPerMinute', exampleEvent: { type: 'item:use', fields: ['hpPctAtUse'] } },
  ],
});

function harness({ replies, autoDeploy = true } = {}) {
  const values = { 'enemy.shadow_beast.damage': 20, 'skill.shadow_strike.cooldown': 3000 };
  const writes = [];
  const queue = [...replies];
  const hermesAgent = new HermesBalanceAgent({
    telemetryAgent: { getEvidence: () => evidence },
    execute: async () => {
      if (!queue.length) throw new Error('unexpected extra Hermes call');
      return queue.shift();
    },
    balanceStore: {
      getAll: () => ({ ...values }),
      get: key => values[key],
      set: (key, value, reason, source) => { values[key] = value; writes.push({ key, value, source }); },
    },
  });
  const sop = new TelemetrySOP({
    telemetryAgent: { getEvidence: () => evidence },
    hermesAgent,
  });
  return { sop, hermesAgent, writes };
}

test('runs all six phases and deploys the validated patch', async () => {
  const { sop, hermesAgent, writes } = harness({ replies: [measureReply, proposeReply, dataSourceReply] });
  const run = await sop.start({ source: 'sdk test' });
  assert.equal(run.status, 'running');
  await sop._runPromise;

  assert.equal(run.status, 'completed');
  assert.deepEqual(run.phases.map(p => p.status), SOP_PHASES.map(() => 'done'));

  const measure = run.phases.find(p => p.key === 'measure').output;
  assert.equal(measure.overallScore, 42);
  assert.equal(measure.dimensions.length, 2);

  const recommend = run.phases.find(p => p.key === 'recommend').output;
  assert.equal(recommend.recommendations[0].severity, 'high');

  const propose = run.phases.find(p => p.key === 'propose').output;
  assert.equal(propose.proposal.changes.length, 1); // unknown key rejected
  assert.equal(propose.proposal.rejectedChanges.length, 1);
  assert.equal(propose.expectedKPIs[0].kpi, 'killDeathRatio');

  const deploy = run.phases.find(p => p.key === 'deploy').output;
  assert.deepEqual(deploy.appliedChanges, [{ key: 'enemy.shadow_beast.damage', from: 20, to: 18, percentChange: -10 }]);
  assert.deepEqual(deploy.deployedDataSources, ['potion_usage_timing']);
  assert.deepEqual(writes, [{ key: 'enemy.shadow_beast.damage', value: 18, source: 'hermes' }]);

  // The SOP proposal is visible to the regular patch tab and marked applied.
  assert.equal(hermesAgent.proposals.at(-1).status, 'applied');
});

test('autoDeploy=false stops before applying anything', async () => {
  const { sop, writes } = harness({ replies: [measureReply, proposeReply, dataSourceReply] });
  const run = await sop.start({ source: 'sdk', autoDeploy: false });
  await sop._runPromise;

  assert.equal(run.status, 'completed');
  assert.equal(run.phases.find(p => p.key === 'deploy').output.skipped, true);
  assert.deepEqual(writes, []);
});

test('a failed reasoning phase fails the run and preserves phase state', async () => {
  // Two non-JSON replies: the retry also fails, so the measure phase fails.
  const { sop } = harness({ replies: ['this is not json at all', 'still not json'] });
  const run = await sop.start({});
  await sop._runPromise;

  assert.equal(run.status, 'failed');
  assert.equal(run.phases.find(p => p.key === 'ingest').status, 'done');
  assert.equal(run.phases.find(p => p.key === 'measure').status, 'failed');
  assert.equal(run.phases.find(p => p.key === 'recommend').status, 'pending');
  assert.match(run.error, /JSON/i);
});

test('resolves free-form data source phrases and records the resolved id', async () => {
  const { sop } = harness({ replies: [measureReply, proposeReply, dataSourceReply] });
  const run = await sop.start({ source: 'data points from the live SDK stream' });
  assert.equal(run.source, 'sdk');
  assert.equal(run.sourceLabel, 'data points from the live SDK stream');
  await sop._runPromise;
  assert.equal(run.status, 'completed');
});

test('unknown data sources are rejected with the available list', async () => {
  const { sop } = harness({ replies: [] });
  await assert.rejects(sop.start({ source: 'mongo cluster prod-7' }), /Unknown data source .* Available sources: sdk .* matches .* all/);
});

test('match-history source fails clearly when the table is empty', async () => {
  // Tests run without initDB, so getMatchHistory returns [] — the resolver
  // should still accept the phrase but ingest must fail with a clear message.
  const { sop } = harness({ replies: [] });
  await assert.rejects(sop.start({ source: 'match history database' }), /'matches' is empty/);
});

test('reports readiness of every data source', () => {
  const { sop } = harness({ replies: [] });
  const sources = sop.getAvailableSources();
  assert.deepEqual(sources.map(s => s.id), ['sdk', 'matches', 'all']);
  assert.equal(sources.find(s => s.id === 'sdk').ready, true); // fake agent always has evidence
  assert.equal(sources.find(s => s.id === 'matches').ready, false); // no DB in unit tests
});

test('rejects concurrent runs and runs without telemetry evidence', async () => {
  const { sop } = harness({ replies: [measureReply, proposeReply, dataSourceReply] });
  await sop.start({});
  await assert.rejects(sop.start({}), /already in progress/);
  await sop._runPromise;

  const empty = new TelemetrySOP({ telemetryAgent: { getEvidence: () => null }, hermesAgent: null });
  await assert.rejects(empty.start({}), /no telemetry evidence/i);
});

test('sdk source rehydrates evidence through the hermes agent when memory is empty', async () => {
  const { hermesAgent } = harness({ replies: [measureReply, proposeReply, dataSourceReply] });
  // In-memory agent is empty; ensureEvidence must be consulted instead.
  let hydrated = false;
  const sop = new TelemetrySOP({
    telemetryAgent: { getEvidence: () => null },
    hermesAgent: {
      ...hermesAgent,
      execute: hermesAgent.execute,
      _validateProposal: hermesAgent._validateProposal.bind(hermesAgent),
      applyProposal: hermesAgent.applyProposal.bind(hermesAgent),
      proposals: hermesAgent.proposals,
      ensureEvidence: async () => { hydrated = true; return evidence; },
    },
  });
  const run = await sop.start({ source: 'sdk', autoDeploy: false });
  await sop._runPromise;
  assert.equal(hydrated, true);
  assert.equal(run.status, 'completed');
});
