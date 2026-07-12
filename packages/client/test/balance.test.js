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
import { EventType } from '@rift-seed/shared/events';
import { applyEffect, computeBaseDamage, meleeAttack, resolveDamage, useSkill } from '../src/game/core/combat.js';

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
  assert.equal(scaled.damage, 29);
  assert.equal(scaled.xpReward, 40);
  assert.ok(scaled.speed > ENEMIES.shadowBeast.speed);
});

test('legacy runtime enemy values cannot undercut combat damage floors', () => {
  const staleSlime = { ...ENEMIES.shadowBeast, damage: 3 };
  const staleBoss = { ...ENEMIES.riftKnight, damage: 7 };
  assert.equal(scaleEnemyStats(staleSlime).damage, 16);
  assert.equal(scaleEnemyStats(staleBoss).damage, 32);
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

test('enemy hits retain player class and level context for telemetry', () => {
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    const attacker = {
      id: 'slime', isEnemy: true, enemyType: 'shadowBeast', level: 3,
      pos: { x: 0, y: 0 }, stats: { damage: 16 }, lastAttack: 0,
      attackRange: 2, attackCooldownMs: 100,
    };
    const target = {
      id: 'ranger', isPlayer: true, classId: 'ranger', level: 2,
      pos: { x: 1, y: 0 }, stats: { hp: 100, maxHp: 100 },
    };
    const events = [];
    meleeAttack(attacker, target, event => events.push(event));
    const damageTaken = events.find(event => event.type === EventType.DAMAGE_TAKEN);
    assert.equal(damageTaken.classId, 'ranger');
    assert.equal(damageTaken.playerLevel, 2);
    assert.equal(damageTaken.enemyLevel, 3);
  } finally {
    Math.random = originalRandom;
  }
});

test('combat outcomes retain player and enemy progression dimensions', () => {
  const originalRandom = Math.random;
  Math.random = () => 1;
  try {
    const attacker = {
      id: 'killer', isPlayer: true, classId: 'rogue', level: 4,
      pos: { x: 0, y: 0 }, stats: { baseDamage: 29 }, lastAttack: 0,
      baseAttackRange: 2, baseAttackCooldownMs: 100,
    };
    const target = {
      id: 'victim', isEnemy: true, enemyType: 'shadowBeast', level: 5,
      pos: { x: 1, y: 0 }, stats: { hp: 1, maxHp: 1 },
    };
    const events = [];
    meleeAttack(attacker, target, event => events.push(event));
    const kill = events.find(event => event.type === EventType.KILL);
    assert.equal(kill.classId, 'rogue');
    assert.equal(kill.playerLevel, 4);
    assert.equal(kill.enemyLevel, 5);
  } finally {
    Math.random = originalRandom;
  }
});

test('invalid targeted skills do not consume mana or start cooldowns', () => {
  const attacker = {
    id: 'invalid-caster', isPlayer: true, classId: 'mage', level: 1,
    pos: { x: 0, y: 0 }, stats: { hp: 100, maxHp: 100, mp: 100, maxMp: 100 },
  };
  const target = { id: 'far-enemy', isEnemy: true, pos: { x: 20, y: 20 }, stats: { hp: 100 } };
  const result = useSkill(attacker, 'fireball', target, null, () => {});
  assert.equal(result.success, false);
  assert.equal(result.result.reason, 'out_of_range');
  assert.equal(attacker.stats.mp, 100);
  assert.equal(attacker.skillCooldowns, undefined);
});

test('different damage buff sources stack while the same source refreshes', () => {
  const attacker = {
    id: 'buff-caster', isPlayer: true, classId: 'warrior', level: 1,
    stats: { baseDamage: 35, damage: 35 },
  };
  const expires = Date.now() + 10_000;
  applyEffect(attacker.id, { type: 'damage_buff', sourceId: 'war_cry', amount: 0.3, expires });
  applyEffect(attacker.id, { type: 'damage_buff', sourceId: 'scroll', amount: 0.25, expires });
  applyEffect(attacker.id, { type: 'damage_buff', sourceId: 'scroll', amount: 0.25, expires });
  assert.equal(computeBaseDamage(attacker), 54);
});

test('Ranger Spirit Wolf is a real attributed combat buff', () => {
  const attacker = {
    id: 'spirit-ranger', isPlayer: true, classId: 'ranger', level: 2,
    stats: { hp: 100, maxHp: 100, mp: 100, maxMp: 100, baseDamage: 26 },
  };
  const events = [];
  const result = useSkill(attacker, 'summonWolf', null, null, event => events.push(event));
  assert.equal(result.success, true);
  assert.equal(result.result.buffed, true);
  assert.ok(computeBaseDamage(attacker) > 26);
  const use = events.find(event => event.type === EventType.SKILL_USE);
  assert.equal(use.classId, 'ranger');
  assert.equal(use.playerLevel, 2);
});
