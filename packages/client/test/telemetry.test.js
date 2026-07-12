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

test('normalizes balance and economy dimensions for Postgres telemetry', () => {
  const sdk = new TelemetrySystem({ playerId: 'player-1', sessionId: 'session-1' });
  const normalized = sdk.record({
    type: EventType.ITEM_PURCHASE,
    timestamp: 1,
    actorId: 'player-entity',
    actorType: 'player',
    sourceType: 'shop',
    sourceId: 'gunblade',
    itemId: 'gunblade',
    itemType: 'weapon',
    classId: 'warrior',
    playerLevel: 3,
    weaponClass: 'martial',
    unitPrice: 200,
    goldBefore: 250,
    goldAfter: 50,
  });

  assert.equal(normalized.schemaVersion, '1.1.0');
  assert.equal(normalized.context.classId, 'warrior');
  assert.equal(normalized.context.playerLevel, 3);
  assert.equal(normalized.context.weaponClass, 'martial');
  assert.equal(normalized.metrics.unitPrice, 200);
  assert.equal(normalized.metrics.goldBefore, 250);
  assert.equal(normalized.metrics.goldAfter, 50);
});

test('keeps weapon ids and rift layout dimensions in the normalized envelope', () => {
  const sdk = new TelemetrySystem({ playerId: 'p-layout', sessionId: 's-layout' });
  const weapon = sdk.record({
    type: EventType.WEAPON_EQUIP,
    playerId: 'entity',
    actorId: 'entity',
    actorType: 'player',
    weaponId: 'seed_rifle',
    weaponClass: 'heavy',
  });
  const rift = sdk.record({
    type: EventType.RIFT_ENTER,
    playerId: 'entity',
    tier: 2,
    layoutId: 'layout-3',
    runNumber: 4,
    area: 'rift_tier_2',
  });

  assert.equal(weapon.source.id, 'seed_rifle');
  assert.equal(weapon.context.weaponClass, 'heavy');
  assert.equal(rift.context.layoutId, 'layout-3');
  assert.equal(rift.context.runNumber, 4);
  assert.equal(rift.layoutId, 'layout-3');
});

test('does not emit per-frame telemetry for fractional mana regeneration', () => {
  const sdk = new TelemetrySystem({ playerId: 'p-regen', sessionId: 's-regen' });
  const player = {
    id: 'player', classId: 'mage', level: 1, pos: { x: 1, y: 1 },
    stats: { hp: 100, maxHp: 100, mp: 50, maxMp: 100 },
  };
  sdk.observePlayerState(player, { classId: 'mage', playerLevel: 1 });
  const initial = sdk.buffer.length;
  player.stats.mp += 0.016;
  sdk.observePlayerState(player, { classId: 'mage', playerLevel: 1 });
  assert.equal(sdk.buffer.length, initial);
});
