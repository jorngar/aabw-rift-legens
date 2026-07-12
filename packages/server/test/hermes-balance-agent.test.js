import test from 'node:test';
import assert from 'node:assert/strict';
import { HermesBalanceAgent, parseJsonResponse } from '../src/agents/hermes-balance-agent.js';
import { TelemetryAgent } from '../src/agents/telemetry-agent.js';

const evidence = {
  patchId: 'v0.1.0',
  sample: { events: 80, sessions: 5, observedMinutes: 10, sufficientForDirection: true },
  outcomes: { kills: 2, playerDeaths: 8, killDeathRatio: 0.25 },
  damage: { received: 900, weapon: 100, skill: 300 },
};

function harness(output) {
  const values = {
    'enemy.shadow_beast.damage': 20,
    'skill.shadow_strike.cooldown': 3000,
  };
  const writes = [];
  return {
    writes,
    agent: new HermesBalanceAgent({
      telemetryAgent: { getEvidence: () => evidence },
      execute: async () => output,
      balanceStore: {
        getAll: () => ({ ...values }),
        get: key => values[key],
        set: (key, value, reason, source) => { values[key] = value; writes.push({ key, value, reason, source }); },
      },
    }),
  };
}

test('parses fenced Hermes JSON output', () => {
  const parsed = parseJsonResponse('```json\n{"summary":"ok","changes":[]}\n```');
  assert.equal(parsed.summary, 'ok');
});

test('validates allowlisted patch changes and rejects unknown keys', async () => {
  const { agent } = harness(JSON.stringify({
    summary: 'Reduce early spike damage',
    rationale: 'Deaths exceed kills',
    expectedImpact: 'Validate lower early exits in the next cohort',
    confidence: 0.82,
    changes: [
      { key: 'enemy.shadow_beast.damage', proposedValue: 18, reason: 'High incoming damage', evidence: ['playerDeaths=8'] },
      { key: 'server.shell_command', proposedValue: 1, reason: 'invalid' },
    ],
  }));
  const proposal = await agent.analyze();
  assert.equal(proposal.source, 'hermes-local');
  assert.equal(proposal.changes.length, 1);
  assert.equal(proposal.changes[0].proposedValue, 18);
  assert.equal(proposal.rejectedChanges.length, 1);
  assert.equal(proposal.status, 'proposed');
});

test('clamps requested changes to thirty percent of the current value', async () => {
  const { agent } = harness(JSON.stringify({
    summary: 'Large reduction', confidence: 0.7,
    changes: [{ key: 'enemy.shadow_beast.damage', proposedValue: 1, reason: 'test', evidence: [] }],
  }));
  const proposal = await agent.analyze();
  assert.equal(proposal.changes[0].requestedValue, 1);
  assert.equal(proposal.changes[0].proposedValue, 16);
  assert.equal(proposal.changes[0].clamped, true);
});

test('does not let integer rounding cross the thirty percent boundary', async () => {
  const values = { 'skill.shadow_strike.cooldown': 251 };
  const agent = new HermesBalanceAgent({
    telemetryAgent: { getEvidence: () => evidence },
    execute: async () => JSON.stringify({
      summary: 'Small integer edge case', confidence: 0.2,
      changes: [{ key: 'skill.shadow_strike.cooldown', proposedValue: 327, reason: 'test', evidence: [] }],
    }),
    balanceStore: {
      getAll: () => ({ ...values }),
      get: key => values[key],
      set: () => {},
    },
  });
  const proposal = await agent.analyze();
  assert.equal(proposal.changes[0].proposedValue, 326);
  assert.equal(proposal.changes[0].percentChange, 29.9);
  assert.equal(proposal.changes[0].clamped, true);
});

test('applies a validated proposal exactly once', async () => {
  const { agent, writes } = harness(JSON.stringify({
    summary: 'Measured nerf', confidence: 0.8,
    changes: [{ key: 'enemy.shadow_beast.damage', proposedValue: 18, reason: 'test', evidence: [] }],
  }));
  const proposal = await agent.analyze();
  const applied = agent.applyProposal(proposal.id);
  assert.equal(applied.status, 'applied');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].source, 'hermes');
  assert.throws(() => agent.applyProposal(proposal.id), /already applied/);
});

test('surfaces invalid Hermes output as an agent error', async () => {
  const { agent } = harness('not json');
  await assert.rejects(agent.analyze(), /invalid JSON|no JSON/);
  assert.equal(agent.getSnapshot().status, 'error');
});

test('hydrates durable Postgres events when server memory is empty', async () => {
  const telemetryAgent = new TelemetryAgent({ matchHistoryReader: () => [] });
  const agent = new HermesBalanceAgent({
    telemetryAgent,
    evidenceLoader: async () => [{
      eventId: 'persisted:1', schemaVersion: '1.1.0', type: 'attack:hit',
      timestamp: Date.now(), patchId: 'v-persisted', sessionId: 'persisted-session',
      actor: { id: 'player', type: 'player' }, target: { id: 'slime', type: 'enemy' },
      source: { id: 'gunblade', type: 'weapon' }, metrics: { damage: 42 }, context: {},
    }],
    execute: async () => JSON.stringify({ summary: 'Persisted evidence', confidence: 0.4, changes: [] }),
    balanceStore: {
      getAll: () => ({ 'player.base_damage': 30 }),
      get: () => 30,
      set: () => {},
    },
  });
  const proposal = await agent.analyze({ patchId: 'v-persisted' });
  assert.equal(proposal.sample.events, 1);
  assert.equal(agent.getSnapshot().evidenceSource, 'postgres');
});

test('falls back to match history when Postgres hydration fails', async () => {
  const telemetryAgent = {
    getEvidence: () => null,
    ingest: () => {},
    getHistoricalEvidence: () => evidence,
  };
  const agent = new HermesBalanceAgent({
    telemetryAgent,
    evidenceLoader: async () => { throw new Error('database offline'); },
    execute: async () => JSON.stringify({ summary: 'History fallback', confidence: 0.3, changes: [] }),
    balanceStore: {
      getAll: () => ({ 'player.base_damage': 30 }),
      get: () => 30,
      set: () => {},
    },
  });
  await agent.analyze();
  const snapshot = agent.getSnapshot();
  assert.equal(snapshot.evidenceSource, 'match_history');
  assert.equal(snapshot.hydrationError, 'database offline');
});
