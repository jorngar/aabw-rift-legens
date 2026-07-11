import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGameplayEventInsert,
  insertGameplayEventBatch,
  toGameplayEventRow,
  upsertGameCatalog,
} from '../src/db/repositories.js';

function event() {
  return {
    eventId: 'session-1:1', schemaVersion: '1.1.0', sessionId: 'session-1',
    playerId: 'player-1', patchId: 'v-test', gameVersion: '0.1.0',
    type: 'attack:hit', timestamp: 1_700_000_000_000,
    actor: { id: 'player-entity', type: 'player' },
    target: { id: 'enemy-1', type: 'enemy', enemyType: 'shadowBeast' },
    source: { id: 'gunblade', type: 'weapon' },
    metrics: {
      damage: 53, hpBefore: 200, hpAfter: 147, unitPrice: 200, quantity: 1,
      goldBefore: 250, goldAfter: 50, weaponDamage: 19, weaponSkillPower: 0,
      weaponAffinity: 1.2,
    },
    position: { x: 4, y: 7 },
    context: { area: 'rift_tier_2', classId: 'warrior', playerLevel: 3, enemyLevel: 3, wave: 2, tier: 2, weaponClass: 'martial', rank: 'B' },
  };
}

test('maps normalized game telemetry into typed Postgres columns', () => {
  const row = toGameplayEventRow(event());
  assert.equal(row[0], 'session-1:1');
  assert.equal(row[6], 'attack:hit');
  assert.equal(row[15], 53);
  assert.equal(row[21], 'warrior');
  assert.equal(row[22], 3);
  assert.equal(row[26], 'martial');
  assert.equal(row[28], 'B');
  assert.equal(row[29], 200);
  assert.equal(row[35], 1.2);
});

test('builds a parameterized, idempotent telemetry batch insert', async () => {
  const insert = buildGameplayEventInsert([event(), { type: 'invalid' }]);
  assert.equal(insert.rowCount, 1);
  assert.equal(insert.params.length, 37);
  assert.match(insert.text, /INSERT INTO gameplay_events/);
  assert.match(insert.text, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.doesNotMatch(insert.text, /player-1/);

  const calls = [];
  const fakeDb = { query: async (...args) => calls.push(args) };
  assert.equal(await insertGameplayEventBatch([event()], fakeDb), 1);
  assert.equal(calls.length, 1);
});

test('upserts versioned game catalog definitions with parameters', async () => {
  const calls = [];
  const fakeDb = { query: async (...args) => calls.push(args) };
  const count = await upsertGameCatalog('0.1.0', {
    weapon: { gunblade: { damage: 15, weaponClass: 'martial' } },
    skill: { shadowStrike: { damage: 45 } },
  }, fakeDb);
  assert.equal(count, 2);
  assert.equal(calls[0][1][0], '0.1.0');
  assert.equal(calls[0][1][1], 'weapon');
  assert.equal(calls[0][1][2], 'gunblade');
});
