// ============================================================
// Combat System — damage calc, skills with REAL effects
// ============================================================
import { EventType, createEvent } from '@shared/events.js';
import { SKILLS, PLAYER_DEFAULTS } from '@shared/config.js';
import { tileDistance } from './isometric.js';

// Active effects on entities
const activeEffects = new Map(); // entityId -> [{type, duration, ...params}]

/**
 * Attempt a basic melee attack.
 */
export function meleeAttack(attacker, target, emitEvent) {
  const now = Date.now();
  const cooldown = attacker.attackCooldownMs || PLAYER_DEFAULTS.attackCooldownMs;
  if (attacker.lastAttack && now - attacker.lastAttack < cooldown) {
    return { hit: false, damage: 0, killed: false };
  }

  const range = attacker.attackRange || PLAYER_DEFAULTS.attackRange;
  const dist = tileDistance(attacker.pos, target.pos);
  if (dist > range) return { hit: false, damage: 0, killed: false };

  attacker.lastAttack = now;
  let baseDamage = attacker.damage || PLAYER_DEFAULTS.attackDamage;

  // Check for damage buff (war cry)
  const effects = activeEffects.get(attacker.id) || [];
  const dmgBuff = effects.find(e => e.type === 'damage_buff');
  if (dmgBuff) baseDamage = Math.floor(baseDamage * (1 + dmgBuff.amount));

  const isCrit = Math.random() < 0.15;
  const damage = isCrit ? Math.floor(baseDamage * 1.8) : baseDamage;
  const killed = applyDamage(target, damage);

  emitEvent(createEvent(EventType.ATTACK_HIT, attacker.id, {
    attackerId: attacker.id, targetId: target.id,
    damage, isCritical: isCrit, targetHpRemaining: target.stats.hp,
  }));

  if (killed) {
    emitEvent(createEvent(EventType.DEATH, target.id, { killerId: attacker.id, victimId: target.id }));
  }

  return { hit: true, damage, killed };
}

/**
 * Use a skill — with ACTUAL unique effects per skill.
 */
export function useSkill(attacker, skillId, target, targetPos, emitEvent, world) {
  const skill = SKILLS[skillId];
  if (!skill) return { success: false, result: { reason: 'unknown_skill' } };

  const now = Date.now();
  if (attacker.skillCooldowns?.[skillId] && now < attacker.skillCooldowns[skillId]) {
    return { success: false, result: { reason: 'on_cooldown' } };
  }

  let mp = attacker.stats?.mp ?? attacker.mp ?? 0;
  if (mp < skill.manaCost) return { success: false, result: { reason: 'no_mana' } };

  // Deduct mana
  if (attacker.stats) attacker.stats.mp -= skill.manaCost;
  else if (attacker.mp !== undefined) attacker.mp -= skill.manaCost;

  // Set cooldown
  if (!attacker.skillCooldowns) attacker.skillCooldowns = {};
  attacker.skillCooldowns[skillId] = now + skill.cooldownMs;

  emitEvent(createEvent(EventType.SKILL_USE, attacker.id, {
    skillId, cooldownMs: skill.cooldownMs, manaCost: skill.manaCost,
    targetId: target?.id, targetPos,
  }));

  let result = {};

  // ===== DAMAGE SKILLS =====
  if (skill.damage > 0 && skill.type === 'single') {
    if (target) {
      const dist = tileDistance(attacker.pos, target.pos);
      if (dist <= skill.range) {
        let dmg = skill.damage;

        // Damage buff check
        const effects = activeEffects.get(attacker.id) || [];
        const dmgBuff = effects.find(e => e.type === 'damage_buff');
        if (dmgBuff) dmg = Math.floor(dmg * (1 + dmgBuff.amount));

        const killed = applyDamage(target, dmg);
        result = { hit: true, damage: dmg, killed };

        emitEvent(createEvent(EventType.SKILL_HIT, attacker.id, {
          skillId, targetId: target.id, damage: dmg, targetHpRemaining: target.stats.hp,
        }));

        // === ICE SHARD: Slow target ===
        if (skill.slow && skill.slowDuration) {
          addEffect(target.id, {
            type: 'slow',
            amount: skill.slow,
            expires: now + skill.slowDuration,
            originalSpeed: target.stats?.speed || 2,
          });
          if (target.stats) target.stats.speed *= (1 - skill.slow);
          result.effect = 'slow';
        }

        // === POISON DAGGER: DOT ===
        if (skill.dot && skill.dotDuration) {
          addEffect(target.id, {
            type: 'dot',
            damagePerTick: skill.dot,
            tickInterval: 1000,
            expires: now + skill.dotDuration,
            lastTick: now,
            sourceId: attacker.id,
          });
          result.effect = 'poison';
        }

        // === SHIELD BASH: Stun ===
        if (skill.stun) {
          addEffect(target.id, {
            type: 'stun',
            expires: now + skill.stun,
          });
          target.aiState = 'stunned';
          result.effect = 'stun';
        }

        if (killed) {
          emitEvent(createEvent(EventType.DEATH, target.id, { killerId: attacker.id }));
        }
      } else {
        result = { hit: false, reason: 'out_of_range' };
      }
    }
  }

  // ===== CONE/AOE SKILLS =====
  else if (skill.type === 'cone' && world) {
    const hits = [];
    for (const entity of world.query('isEnemy', 'pos', 'stats')) {
      if (entity.stats.hp <= 0) continue;
      const dist = tileDistance(attacker.pos, entity.pos);
      if (dist <= skill.range) {
        const killed = applyDamage(entity, skill.damage);
        hits.push({ id: entity.id, damage: skill.damage, killed });
        emitEvent(createEvent(EventType.SKILL_HIT, attacker.id, {
          skillId, targetId: entity.id, damage: skill.damage,
        }));
      }
    }
    result = { hit: true, hits, aoe: true };
  }

  // ===== HEAL =====
  else if (skill.type === 'self' && skill.healAmount) {
    const healTarget = attacker;
    const healed = Math.min(skill.healAmount, healTarget.stats.maxHp - healTarget.stats.hp);
    healTarget.stats.hp += healed;
    result = { healed };
  }

  // ===== WAR CRY: Damage buff =====
  else if (skill.type === 'self' && skill.buffDamage) {
    addEffect(attacker.id, {
      type: 'damage_buff',
      amount: skill.buffDamage,
      expires: now + (skill.buffDuration || 5000),
    });
    result = { buffed: true, amount: skill.buffDamage, duration: skill.buffDuration };
  }

  // ===== MOVEMENT SKILLS (teleport, dash) =====
  else if (skill.type === 'movement') {
    if (targetPos) {
      attacker.pos = { ...targetPos };
      result = { teleported: true, pos: targetPos };
    } else {
      // Dash forward in facing direction
      const dx = attacker.direction === 'E' ? 3 : attacker.direction === 'W' ? -3 : 0;
      const dy = attacker.direction === 'S' ? 3 : attacker.direction === 'N' ? -3 : 0;
      attacker.pos = {
        x: Math.max(1, Math.min(18, attacker.pos.x + dx)),
        y: Math.max(1, Math.min(18, attacker.pos.y + dy)),
      };
      result = { dashed: true, pos: attacker.pos };
    }
  }

  return { success: true, result };
}

/**
 * Apply damage to an entity. Returns true if killed.
 */
export function applyDamage(entity, damage) {
  if (!entity.stats) return false;
  entity.stats.hp = Math.max(0, entity.stats.hp - damage);
  return entity.stats.hp <= 0;
}

/**
 * Add an effect to an entity.
 */
function addEffect(entityId, effect) {
  if (!activeEffects.has(entityId)) activeEffects.set(entityId, []);
  // Remove existing effect of same type
  const effects = activeEffects.get(entityId).filter(e => e.type !== effect.type);
  effects.push(effect);
  activeEffects.set(entityId, effects);
}

/**
 * Tick combat effects (DOT, slow expiry, stun expiry, buff expiry).
 * Call each frame.
 */
export function combatTick(entity, dt) {
  // Mana regen (1 MP/sec)
  if (entity.stats && entity.stats.mp < entity.stats.maxMp) {
    entity.stats.mp = Math.min(entity.stats.maxMp, entity.stats.mp + dt);
  }

  // Process active effects
  const effects = activeEffects.get(entity.id);
  if (!effects || effects.length === 0) return;

  const now = Date.now();
  const expired = [];

  for (const effect of effects) {
    if (now > effect.expires) {
      expired.push(effect);
      continue;
    }

    // DOT damage
    if (effect.type === 'dot') {
      if (now - effect.lastTick >= effect.tickInterval) {
        effect.lastTick = now;
        if (entity.stats) {
          entity.stats.hp = Math.max(0, entity.stats.hp - effect.damagePerTick);
        }
      }
    }

    // Stun — prevent action
    if (effect.type === 'stun') {
      entity.targetPos = null;
      entity.path = [];
    }
  }

  // Remove expired effects and restore stats
  for (const effect of expired) {
    if (effect.type === 'slow' && entity.stats) {
      entity.stats.speed = effect.originalSpeed;
    }
    if (effect.type === 'stun') {
      entity.aiState = 'idle';
    }
    const idx = effects.indexOf(effect);
    if (idx !== -1) effects.splice(idx, 1);
  }
}

/**
 * Check if entity has a specific effect.
 */
export function hasEffect(entityId, effectType) {
  const effects = activeEffects.get(entityId);
  return effects?.some(e => e.type === effectType) || false;
}
