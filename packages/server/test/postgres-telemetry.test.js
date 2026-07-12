import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameCatalog, GAME_CATALOG_VERSION } from '../src/game-catalog.js';
import {
  buildGameplayEventInsert,
  GAMEPLAY_EVENT_COLUMNS,
  toGameplayEventRow,
} from '../src/gameplay-event.js';

test('game catalog contains every durable gameplay definition category', () => {
  const catalog = buildGameCatalog();
  const categories = new Set(catalog.map(row => row.category));
  assert.deepEqual([...categories].sort(), ['class', 'enemy', 'item', 'skill', 'weapon']);
  assert.ok(catalog.length >= 20);
  assert.ok(catalog.every(row => row.version === GAME_CATALOG_VERSION));

  const ranger = catalog.find(row => row.category === 'class' && row.key === 'ranger');
  assert.deepEqual(ranger.definition.skills, ['arrowShot', 'riftSlash', 'summonWolf', 'heal']);
  assert.equal(ranger.definition.stats.weaponAffinities.ranged, 1.25);
});

test('normalized gameplay events map into typed balance and economy dimensions', () => {
  const event = {
    eventId: 'session-1:8', schemaVersion: '1.1.0', sessionId: 'session-1',
    playerId: 'player-1', patchId: 'patch-2', gameVersion: '0.1.0',
    type: 'item:purchase', timestamp: 1_700_000_000_000,
    actor: { id: 'player-entity', type: 'player' },
    source: { id: 'rift_staff', type: 'shop' },
    target: { id: null, type: 'unknown', enemyType: null },
    metrics: { unitPrice: 300, goldBefore: 450, goldAfter: 150, quantity: 1 },
    context: {
      classId: 'mage', playerLevel: 3, weaponClass: 'arcane', itemType: 'weapon',
      mapZone: 'seed_garden', layoutId: 'layout-2',
    },
    position: { x: 8, y: 9 },
  };
  const row = toGameplayEventRow(event);
  assert.equal(row.source_id, 'rift_staff');
  assert.equal(row.class_id, 'mage');
  assert.equal(row.player_level, 3);
  assert.equal(row.unit_price, 300);
  assert.equal(row.gold_after, 150);
  assert.equal(row.layout_id, 'layout-2');
  assert.equal(row.x, 8);
});

test('gameplay insert is parameterized and idempotent by event id', () => {
  const malicious = "staff'); DROP TABLE gameplay_events; --";
  const query = buildGameplayEventInsert([{
    eventId: 'session-1:9', schemaVersion: '1.1.0', type: 'weapon:equip',
    timestamp: Date.now(), source: { id: malicious, type: 'weapon' },
    context: { classId: 'mage', weaponClass: 'arcane' },
  }]);

  assert.equal(query.rowCount, 1);
  assert.equal(query.params.length, GAMEPLAY_EVENT_COLUMNS.length);
  assert.ok(query.text.includes('ON CONFLICT (event_id) DO NOTHING'));
  assert.equal(query.text.includes(malicious), false);
  assert.ok(query.params.includes(malicious));
});
