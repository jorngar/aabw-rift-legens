import test from 'node:test';
import assert from 'node:assert/strict';
import { ABTestingSOP, AB_SOP_PHASES } from '../src/agents/ab-testing-sop.js';

const measureReply = JSON.stringify({
  summary: 'Variant A retains players longer; B monetizes slightly better.',
  confidence: 0.6,
  kpiReadings: [
    { kpi: 'retention', leader: 'A', reasoning: 'longer sessions', evidence: ['avg_duration_ms=90000 vs 60000'] },
    { kpi: 'revenue', leader: 'B', reasoning: 'more purchases', evidence: ['purchases=12 vs 8'] },
  ],
  variantExperience: { A: { score: 70, note: 'stable' }, B: { score: 55, note: 'grindier' } },
});

const recommendReply = JSON.stringify({
  recommendations: [
    { title: 'Promote A, salvage B shop placement', severity: 'high', kpi: 'retention', rationale: 'A wins composite', evidence: ['scoreA=0.7 scoreB=0.4'] },
  ],
  salvage: [
    { kpi: 'revenue', fromVariant: 'B', what: 'shop placement near spawn', why: 'B drove more purchases' },
  ],
  expectedKPIs: [
    { kpi: 'avg_duration_ms', current: 60000, target: 90000, direction: 'increase', rationale: 'A layout holds players' },
  ],
});

function variantRow(patchId, variant, overrides = {}) {
  return {
    patch_id: patchId, variant,
    sessions: 12, ended: 12, avg_duration_ms: variant === 'A' ? 90000 : 60000,
    purchases: variant === 'A' ? 8 : 12, gold_spent: 100,
    defects: variant === 'A' ? 1 : 4, deaths: variant === 'A' ? 2 : 6,
    engagements: 30, paths: 10,
    ...overrides,
  };
}

function harness({ replies = [measureReply, recommendReply], sessions = 12 } = {}) {
  const queue = [...replies];
  const shifted = [];
  const sop = new ABTestingSOP({
    hermesAgent: {
      execute: async () => {
        if (!queue.length) throw new Error('unexpected extra Hermes call');
        return queue.shift();
      },
    },
    fetchers: {
      activePatches: async () => [{ id: 1, name: 'patch-v01', description: 'baseline' }],
      summary: async () => [
        variantRow(1, 'A', { sessions }),
        variantRow(1, 'B', { sessions }),
      ],
      breakdowns: async () => ({
        breakdowns: {
          defectsByType: [{ patch_id: 1, variant: 'B', bucket: 'stuck', n: 3 }],
          deathsByEnemy: [], purchasesByItem: [], engagementsByEnemy: [], endReasons: [],
        },
        extras: {
          completion: [
            { patch_id: 1, variant: 'A', total: sessions, completed: 8 },
            { patch_id: 1, variant: 'B', total: sessions, completed: 4 },
          ],
          balance: [
            { patch_id: 1, variant: 'A', damage_dealt: 5000, damage_taken: 4800 },
            { patch_id: 1, variant: 'B', damage_dealt: 5000, damage_taken: 2000 },
          ],
          progression: [],
        },
      }),
      layouts: async () => [{ patch_id: 1, variant: 'A', layout_id: 'crypt', rift_entries: 5, distinct_sessions: 4 }],
      shiftWeights: async (weights) => { shifted.push(weights); return { ok: true, weights, at: 'test-time' }; },
    },
  });
  return { sop, shifted };
}

test('runs all five phases; deploy is skipped without autoDeploy', async () => {
  const { sop, shifted } = harness();
  const run = await sop.start({});
  assert.equal(run.status, 'running');
  assert.equal(run.agent, 'ab-testing');
  await sop._runPromise;

  assert.equal(run.status, 'completed');
  assert.deepEqual(run.phases.map(p => p.status), AB_SOP_PHASES.map(() => 'done'));

  const ingest = run.phases.find(p => p.key === 'ingest').output;
  assert.equal(ingest.patchName, 'patch-v01');
  assert.equal(ingest.dataQuality.sufficientForPromotion, true);

  const measure = run.phases.find(p => p.key === 'measure').output;
  assert.equal(measure.kpiReadings.length, 2);
  assert.equal(measure.variantExperience.A.score, 70);

  const recommend = run.phases.find(p => p.key === 'recommend').output;
  assert.equal(recommend.salvage[0].fromVariant, 'B');
  assert.equal(recommend.expectedKPIs[0].kpi, 'avg_duration_ms');

  const verdict = run.phases.find(p => p.key === 'verdict').output;
  assert.equal(verdict.decision, 'promote');
  assert.ok(['A', 'B'].includes(verdict.winner));

  const deploy = run.phases.find(p => p.key === 'deploy').output;
  assert.equal(deploy.skipped, true);
  assert.deepEqual(shifted, []);
});

test('autoDeploy=true shifts LB weights fully to the winner', async () => {
  const { sop, shifted } = harness();
  const run = await sop.start({ autoDeploy: true });
  await sop._runPromise;

  assert.equal(run.status, 'completed');
  const verdict = run.phases.find(p => p.key === 'verdict').output;
  const deploy = run.phases.find(p => p.key === 'deploy').output;
  assert.equal(deploy.promoted, verdict.winner);
  assert.equal(shifted.length, 1);
  assert.equal(shifted[0][verdict.winner], 100);
});

test('insufficient samples: decision=collect_more and deploy refuses even with autoDeploy', async () => {
  const { sop, shifted } = harness({ sessions: 3 });
  const run = await sop.start({ autoDeploy: true });
  await sop._runPromise;

  assert.equal(run.status, 'completed');
  const verdict = run.phases.find(p => p.key === 'verdict').output;
  assert.equal(verdict.decision, 'collect_more');
  assert.equal(verdict.winner, null);
  const deploy = run.phases.find(p => p.key === 'deploy').output;
  assert.equal(deploy.skipped, true);
  assert.deepEqual(shifted, []);
});

test('start rejects when there is no active patch or no sessions', async () => {
  const { sop } = harness();
  sop.fetchers.activePatches = async () => [];
  await assert.rejects(sop.start({}), /no active patch/);

  const { sop: sop2 } = harness();
  sop2.fetchers.summary = async () => [variantRow(1, 'A', { sessions: 0 }), variantRow(1, 'B', { sessions: 0 })];
  await assert.rejects(sop2.start({}), /no sessions collected/);
});

test('computeVerdict is deterministic and makes no Hermes calls', async () => {
  const { sop } = harness({ replies: [] }); // any Hermes call would throw
  const verdict = await sop.computeVerdict();
  assert.equal(verdict.patchName, 'patch-v01');
  assert.ok(verdict.scores.A !== undefined && verdict.scores.B !== undefined);
  assert.deepEqual(verdict.sampleSizes, { A: 12, B: 12 });
});

test('a failed reasoning phase fails the run and preserves phase state', async () => {
  const { sop } = harness({ replies: ['not json', 'still not json'] });
  const run = await sop.start({});
  await sop._runPromise;

  assert.equal(run.status, 'failed');
  assert.equal(run.phases.find(p => p.key === 'ingest').status, 'done');
  assert.equal(run.phases.find(p => p.key === 'measure').status, 'failed');
  assert.equal(run.phases.find(p => p.key === 'verdict').status, 'pending');
  assert.match(run.error, /JSON/i);
});

test('concurrent runs are rejected', async () => {
  const { sop } = harness();
  await sop.start({});
  await assert.rejects(sop.start({}), /already in progress/);
  await sop._runPromise;
});
