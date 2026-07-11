import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAttackCooldown,
  calculateBasicAttackDamage,
  calculateSkillDamage,
  getWeaponContribution,
  scaleEnemyStats,
} from '@rift-seed/shared/balance';
import { ENEMIES } from '@rift-seed/shared/config';
import { computeBaseDamage, meleeAttack, resolveDamage } from '../src/game/core/combat.js';

test('weapon class affinity changes real basic attack damage', () => {
  const warrior = calculateBasicAttackDamage({
    baseDamage: 35, classId: 'warrior', level: 1, weaponId: 'gunblade',
  });
  const mage = calculateBasicAttackDamage({
    baseDamage: 21, classId: 'mage', level: 1, weaponId: 'gunblade',
  });
  assert.equal(warrior, 53);
  assert.equal(mage, 32);
  assert.ok(warrior > mage);
});

test('level and caster weapon scale skills without mutating the skill definition', () => {
  const contribution = getWeaponContribution({ classId: 'mage', level: 3, weaponId: 'rift_staff' });
  assert.equal(contribution.affinity, 1.3);
  assert.equal(contribution.skillPower, 21);
  assert.equal(calculateSkillDamage({
    baseDamage: 55, classId: 'mage', level: 3, weaponId: 'rift_staff',
  }), 100);
});

test('weapon and class attack speed affect DPS cadence', () => {
  assert.equal(calculateAttackCooldown({
    baseCooldownMs: 600, classId: 'rogue', weaponId: 'rune_daggers',
  }), 417);
  assert.equal(calculateAttackCooldown({
    baseCooldownMs: 600, classId: 'warrior', weaponId: 'seed_rifle',
  }), 743);
});

test('enemy stats scale consistently with wave, player level, and tier', () => {
  const scaled = scaleEnemyStats(ENEMIES.shadowBeast, { wave: 2, playerLevel: 3, tier: 2 });
  assert.equal(scaled.hp, 400);
  assert.equal(scaled.damage, 5);
  assert.equal(scaled.xpReward, 40);
  assert.ok(scaled.speed > ENEMIES.shadowBeast.speed);
});

test('melee attack uses equipped weapon and records mitigated damage', () => {
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    const attacker = {
      id: 'player', isPlayer: true, classId: 'warrior', level: 1,
      equippedWeaponId: 'gunblade', pos: { x: 0, y: 0 }, hitRadius: 0.4,
      lastAttack: 0, baseAttackCooldownMs: 600, baseAttackRange: 2,
      stats: { baseDamage: 35, damage: 35 },
    };
    const target = {
      id: 'enemy', isEnemy: true, pos: { x: 1, y: 0 }, hitRadius: 0.4,
      damageTakenMult: 0.5, stats: { hp: 100, maxHp: 100 },
    };
    const events = [];
    assert.equal(computeBaseDamage(attacker), 53);
    const result = meleeAttack(attacker, target, event => events.push(event));
    assert.equal(result.damage, 27);
    assert.equal(target.stats.hp, 73);
    assert.equal(events[0].damage, 27);
  } finally {
    Math.random = originalRandom;
  }
});

test('damage resolution returns the actual post-mitigation amount', () => {
  const target = { damageTakenMult: 0.9, stats: { hp: 100 } };
  assert.deepEqual(resolveDamage(target, 30), { killed: false, damageTaken: 27 });
});
