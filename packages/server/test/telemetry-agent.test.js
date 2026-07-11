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
