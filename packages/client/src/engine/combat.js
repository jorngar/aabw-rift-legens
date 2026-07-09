// ============================================================
// Combat System — damage calc, hit detection, cooldowns
// ============================================================
import { EventType, createEvent } from '@shared/events.js';
import { SKILLS, PLAYER_DEFAULTS, ENEMIES } from '@shared/config.js';
import { tileDistance } from './isometric.js';

/**
 * Attempt a basic attack from attacker to target.
 * @param {Object} attacker - entity with pos, stats, attackCooldown
 * @param {Object} target - entity with pos, stats.hp
 * @param {Function} emitEvent - callback to send game events
 * @returns {{hit: boolean, damage: number, killed: boolean}}
 */
export function meleeAttack(attacker, target, emitEvent) {
  const now = Date.now();
  const cooldown = attacker.attackCooldownMs || PLAYER_DEFAULTS.attackCooldownMs;
  if (attacker.lastAttack && now - attacker.lastAttack < cooldown) {
    return { hit: false, damage: 0, killed: false };
  }

  const range = attacker.attackRange || PLAYER_DEFAULTS.attackRange;
  const dist = tileDistance(attacker.pos, target.pos);
  if (dist > range) {
    return { hit: false, damage: 0, killed: false };
  }

  attacker.lastAttack = now;
  const baseDamage = attacker.damage || PLAYER_DEFAULTS.attackDamage;
  const isCrit = Math.random() < 0.15;
  const damage = isCrit ? Math.floor(baseDamage * 1.8) : baseDamage;
  const killed = applyDamage(target, damage);

  emitEvent(createEvent(EventType.ATTACK_HIT, attacker.id, {
    attackerId: attacker.id,
    targetId: target.id,
    damage,
    isCritical: isCrit,
    targetHpRemaining: target.stats.hp,
  }));

  if (killed) {
    emitEvent(createEvent(EventType.DEATH, target.id, {
      killerId: attacker.id,
      victimId: target.id,
    }));
  }

  return { hit: true, damage, killed };
}

/**
 * Use a skill from attacker on a target position/entity.
 * @param {Object} attacker
 * @param {string} skillId
 * @param {Object} [target] - target entity (for single-target skills)
 * @param {{x: number, y: number}} [targetPos]
 * @param {Function} emitEvent
 * @returns {{success: boolean, result: Object}}
 */
export function useSkill(attacker, skillId, target, targetPos, emitEvent) {
  const skill = SKILLS[skillId];
  if (!skill) return { success: false, result: { reason: 'unknown_skill' } };

  const now = Date.now();
  if (attacker.skillCooldowns?.[skillId] && now < attacker.skillCooldowns[skillId]) {
    return { success: false, result: { reason: 'on_cooldown' } };
  }

  if ((attacker.stats?.mp || attacker.mp || 0) < skill.manaCost) {
    return { success: false, result: { reason: 'no_mana' } };
  }

  // Deduct mana
  if (attacker.stats) attacker.stats.mp -= skill.manaCost;
  else if (attacker.mp !== undefined) attacker.mp -= skill.manaCost;

  // Set cooldown
  if (!attacker.skillCooldowns) attacker.skillCooldowns = {};
  attacker.skillCooldowns[skillId] = now + skill.cooldownMs;

  emitEvent(createEvent(EventType.SKILL_USE, attacker.id, {
    skillId,
    cooldownMs: skill.cooldownMs,
    manaCost: skill.manaCost,
    targetId: target?.id,
    targetPos,
  }));

  let result = {};

  switch (skill.type) {
    case 'single': {
      if (target) {
        const dist = tileDistance(attacker.pos, target.pos);
        if (dist <= skill.range) {
          const killed = applyDamage(target, skill.damage);
          result = { hit: true, damage: skill.damage, killed };
          emitEvent(createEvent(EventType.SKILL_HIT, attacker.id, {
            skillId,
            targetId: target.id,
            damage: skill.damage,
            targetHpRemaining: target.stats.hp,
          }));
        } else {
          result = { hit: false, reason: 'out_of_range' };
        }
      }
      break;
    }
    case 'self': {
      const healTarget = attacker;
      const healed = Math.min(skill.healAmount, healTarget.stats.maxHp - healTarget.stats.hp);
      healTarget.stats.hp += healed;
      result = { healed };
      break;
    }
    case 'movement': {
      if (targetPos) {
        attacker.pos = { ...targetPos };
        result = { teleported: true, pos: targetPos };
      }
      break;
    }
    case 'cone': {
      // AoE: hit all enemies within range
      result = { hits: [] };
      break;
    }
  }

  return { success: true, result };
}

/**
 * Apply damage to an entity. Returns true if killed.
 * @param {Object} entity
 * @param {number} damage
 * @returns {boolean}
 */
export function applyDamage(entity, damage) {
  if (!entity.stats) return false;
  entity.stats.hp = Math.max(0, entity.stats.hp - damage);
  return entity.stats.hp <= 0;
}

/**
 * Update cooldowns, mana regen, etc.
 * @param {Object} entity
 * @param {number} dt - seconds
 */
export function combatTick(entity, dt) {
  // Mana regen (1 MP/sec)
  if (entity.stats && entity.stats.mp < entity.stats.maxMp) {
    entity.stats.mp = Math.min(entity.stats.maxMp, entity.stats.mp + dt);
  }
}
