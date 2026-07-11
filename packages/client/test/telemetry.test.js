import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetrySystem } from '../src/infrastructure/analytics/telemetry.js';
import { EventType } from '../../shared/src/events.js';

test('attributes weapon, skill, and enemy damage without mixing actors', () => {
  const sdk = new TelemetrySystem({ playerId: 'player-1' });
  sdk.bindPlayer({ id: 1 });
  sdk.record({
    type: EventType.ATTACK_HIT, timestamp: 1, playerId: 1,
    actorId: 1, actorType: 'player', targetId: 2, targetType: 'enemy',
    sourceType: 'weapon', sourceId: 'seed_blade', damage: 30,
  });
  sdk.record({
    type: EventType.SKILL_HIT, timestamp: 2, playerId: 1,
    actorId: 1, actorType: 'player', targetId: 2, targetType: 'enemy',
    sourceType: 'skill', sourceId: 'shadowStrike', damage: 45,
  });
  sdk.record({
    type: EventType.ATTACK_HIT, timestamp: 3, playerId: 2,
    actorId: 2, actorType: 'enemy', targetId: 1, targetType: 'player',
    sourceType: 'enemy', sourceId: 'shadowBeast', damage: 8,
  });
  sdk.record({
    type: EventType.DAMAGE_TAKEN, timestamp: 4, playerId: 1,
    actorId: 1, actorType: 'player', sourceType: 'enemy', sourceId: 'shadowBeast',
    enemyType: 'shadowBeast', damage: 8,
  });

  const { metrics, counters } = sdk.getSnapshot();
  assert.equal(metrics.damage.dealt.total, 75);
  assert.equal(metrics.damage.dealt.weapon, 30);
  assert.equal(metrics.damage.dealt.skill, 45);
  assert.equal(metrics.damage.dealt.byWeapon.seed_blade, 30);
  assert.equal(metrics.damage.dealt.bySkill.shadowStrike, 45);
  assert.equal(metrics.damage.received.total, 8);
  assert.equal(metrics.damage.received.byEnemy.shadowBeast, 8);
  assert.equal(counters.total_damage_dealt, 75);
});

test('counts kills and player deaths as separate outcomes', () => {
  const sdk = new TelemetrySystem({ playerId: 'player-1' });
  sdk.record({ type: EventType.KILL, timestamp: 1, actorType: 'player', victimType: 'enemy' });
  sdk.record({ type: EventType.DEATH, timestamp: 2, actorType: 'player', victimType: 'enemy' });
  sdk.record({ type: EventType.DEATH, timestamp: 3, actorType: 'enemy', victimType: 'player' });
  const snapshot = sdk.getSnapshot();
  assert.equal(snapshot.metrics.outcomes.kills, 1);
  assert.equal(snapshot.metrics.outcomes.playerDeaths, 1);
  assert.equal(snapshot.counters.total_kills, 1);
  assert.equal(snapshot.counters.total_deaths, 1);
});

test('samples HP, MP, and player path over time', () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const sdk = new TelemetrySystem({ playerId: 'player-1' });
    const player = { id: 1, pos: { x: 2, y: 3 }, stats: { hp: 100, maxHp: 100, mp: 50, maxMp: 50 } };
    sdk.observePlayerState(player, { area: 'garden' });
    now += 1100;
    player.pos = { x: 5, y: 7 };
    player.stats.hp = 72;
    player.stats.mp = 35;
    sdk.observePlayerState(player, { area: 'garden' });

    const metrics = sdk.getSnapshot().metrics;
    assert.equal(metrics.resources.hp.lost, 28);
    assert.equal(metrics.resources.mp.spent, 15);
    assert.equal(metrics.resources.hp.current, 72);
    assert.equal(metrics.resources.mp.current, 35);
    assert.equal(metrics.path.distance, 5);
    assert.equal(metrics.path.samples.length, 2);
  } finally {
    Date.now = originalNow;
  }
});

test('keeps buffered telemetry while offline', () => {
  const sdk = new TelemetrySystem({ playerId: 'player-1' });
  sdk.record({ type: EventType.SESSION_START, timestamp: 1 });
  assert.equal(sdk.flush(), false);
  assert.equal(sdk.getSnapshot().eventsBuffered, 1);
});
