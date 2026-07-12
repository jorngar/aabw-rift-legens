import test from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeConfig } from '../src/runtime-config.js';

test('publishes server balance values in the client config shape', () => {
  const config = getRuntimeConfig();
  assert.equal(config.player.attackDamage, 30);
  assert.equal(config.player.maxHp, config.player.hp);
  assert.equal(config.enemies.shadowBeast.damage, 16);
  assert.equal(config.enemies.riftKnight.damage, 32);
  assert.equal(config.skills.shadowStrike.cooldownMs, 3000);
  assert.equal(config.skills.heal.healAmount, 40);
});
