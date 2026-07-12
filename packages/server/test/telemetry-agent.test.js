import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryAgent } from '../src/agents/telemetry-agent.js';

function event(type, overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    type,
    timestamp: Date.now(),
    patchId: 'v-test',
    sessionId: 'session-1',
    actor: { id: 'p1', type: 'player' },
    target: { id: 'e1', type: 'enemy', enemyType: 'shadowBeast' },
    source: { type: 'weapon', id: 'seed_blade' },
    metrics: {},
    context: {},
    ...overrides,
  };
}

test('aggregates normalized SDK evidence for Hermes', () => {
  const agent = new TelemetryAgent();
  agent.ingest([
    event('attack:hit', { metrics: { damage: 30 } }),
    event('skill:hit', { source: { type: 'skill', id: 'shadowStrike' }, metrics: { damage: 45 } }),
    event('damage:taken', { source: { type: 'enemy', id: 'shadowBeast' }, metrics: { damage: 8 } }),
    event('combat:kill'),
    event('state:sample', { metrics: { hpAfter: 92, mpAfter: 35 } }),
    event('path:sample', { metrics: { distance: 2.5 } }),
  ]);

  const evidence = agent.getEvidence('v-test');
  assert.equal(evidence.sample.events, 6);
  assert.equal(evidence.sample.sessions, 1);
  assert.equal(evidence.damage.weapon, 30);
  assert.equal(evidence.damage.skill, 45);
  assert.equal(evidence.damage.received, 8);
  assert.equal(evidence.resources.hp.lost, 8);
  assert.equal(evidence.outcomes.kills, 1);
  assert.equal(evidence.outcomes.playerDeaths, 0);
  assert.equal(evidence.movement.distanceTiles, 2.5);
});

test('only counts deaths whose target is the player', () => {
  const agent = new TelemetryAgent();
  agent.ingest([
    event('death'),
    event('death', { actor: { id: 'e1', type: 'enemy' }, target: { id: 'p1', type: 'player' } }),
  ]);
  assert.equal(agent.getEvidence('v-test').outcomes.playerDeaths, 1);
});

test('builds restart-safe evidence from persisted match history', () => {
  const agent = new TelemetryAgent({
    matchHistoryReader: () => [
      { kills: 4, deaths: 1, damage_dealt: 600, damage_taken: 180, skills_used: 8, duration_seconds: 120 },
      { kills: 2, deaths: 0, damage_dealt: 300, damage_taken: 90, skills_used: 3, duration_seconds: 60 },
      { kills: 3, deaths: 1, damage_dealt: 450, damage_taken: 120, skills_used: 5, duration_seconds: 90 },
    ],
  });
  const evidence = agent.getHistoricalEvidence('v-persisted');
  assert.equal(evidence.source, 'match_history');
  assert.equal(evidence.sample.sessions, 3);
  assert.equal(evidence.sample.sufficientForDirection, true);
  assert.equal(evidence.outcomes.kills, 9);
  assert.equal(evidence.outcomes.playerDeaths, 2);
  assert.equal(evidence.damage.totalDealt, 1350);
  assert.equal(evidence.skills.totalUses, 16);
});

test('reconstructs observed duration from persisted session timestamps', () => {
  const agent = new TelemetryAgent({ matchHistoryReader: () => [] });
  const startedAt = 1_700_000_000_000;
  agent.ingest([
    event('session:start', { sessionId: 's1', timestamp: startedAt }),
    event('combat:kill', { sessionId: 's1', timestamp: startedAt + 60_000 }),
    event('session:end', { sessionId: 's1', timestamp: startedAt + 120_000, metrics: { durationMs: 120_000 } }),
    event('session:start', { sessionId: 's2', timestamp: startedAt + 180_000 }),
    event('combat:kill', { sessionId: 's2', timestamp: startedAt + 240_000 }),
  ]);
  const evidence = agent.getEvidence('v-test');
  assert.equal(evidence.sample.observedMinutes, 3);
  assert.equal(evidence.outcomes.killsPerMinute, 0.67);
});
