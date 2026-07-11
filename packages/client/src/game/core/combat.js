// ============================================================
// Combat System — damage calc, skills with REAL effects
// ============================================================
import { EventType, createEvent } from '@rift-seed/shared/events';
import { SKILLS, PLAYER_DEFAULTS } from '@rift-seed/shared/config';
import {
  calculateAttackCooldown,
  calculateAttackRange,
  calculateBasicAttackDamage,
  calculateHealAmount,
  calculateSkillDamage,
  getWeaponContribution,
} from '@rift-seed/shared/balance';

// Active effects on entities
const activeEffects = new Map(); // entityId -> [{type, duration, ...params}]

/**
 * Edge-to-edge distance between two entities in tiles: Euclidean distance
 * between centers minus both hit radii. All combat range checks use this so
 * big sprites (large hitRadius) are reachable at visually consistent gaps.
 */
export function combatDistance(a, b) {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const dist = Math.hypot(dx, dy);
  return Math.max(0, dist - (a.hitRadius || 0) - (b.hitRadius || 0));
}

const DIR_VECTORS = {
  E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1],
  NE: [0.7071, -0.7071], NW: [-0.7071, -0.7071],
  SE: [0.7071, 0.7071], SW: [-0.7071, 0.7071],
};
const CONE_COS = Math.cos((75 * Math.PI) / 180); // 150° total arc

/** True if target lies within the attacker's facing cone. */
function inCone(attacker, target) {
  const facing = DIR_VECTORS[attacker.direction];
  if (!facing) return true;
  const dx = target.pos.x - attacker.pos.x;
  const dy = target.pos.y - attacker.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return true; // on top of each other
  return (dx / len) * facing[0] + (dy / len) * facing[1] >= CONE_COS;
}

/**
 * Basic-attack damage derived from immutable class base, level, weapon affinity,
 * and active buffs. Equipment order cannot change the result.
 */
function getDamageBuff(attacker) {
  const effects = activeEffects.get(attacker.id) || [];
  const dmgBuff = effects.find(e => e.type === 'damage_buff');
  return dmgBuff?.amount || 0;
}

export function computeBaseDamage(attacker) {
  const rawDamage = attacker.stats?.baseDamage ?? attacker.stats?.damage ?? attacker.damage ?? PLAYER_DEFAULTS.attackDamage;
  if (!attacker.isPlayer) {
    return Math.max(1, Math.floor(rawDamage * (1 + getDamageBuff(attacker))));
  }
  return calculateBasicAttackDamage({
    baseDamage: rawDamage,
    classId: attacker.classId,
    level: attacker.level,
    weaponId: attacker.equippedWeaponId,
    damageBuff: getDamageBuff(attacker),
  });
}

/**
 * Skill damage: per-skill base scaled by caster level, class skill-damage
 * passive, weapon skill power, and active damage buffs.
 */
export function computeSkillDamage(attacker, skill) {
  return calculateSkillDamage({
    baseDamage: skill.damage,
    classId: attacker.classId,
    level: attacker.level,
    weaponId: attacker.equippedWeaponId,
    damageBuff: getDamageBuff(attacker),
  });
}

export function getEffectiveAttackRange(attacker) {
  if (!attacker.isPlayer) return attacker.attackRange || PLAYER_DEFAULTS.attackRange;
  return calculateAttackRange({
    baseRange: attacker.baseAttackRange ?? attacker.attackRange ?? PLAYER_DEFAULTS.attackRange,
    level: attacker.level,
    weaponId: attacker.equippedWeaponId,
  });
}

export function getEffectiveAttackCooldown(attacker) {
  if (!attacker.isPlayer) return attacker.attackCooldownMs || PLAYER_DEFAULTS.attackCooldownMs;
  return calculateAttackCooldown({
    baseCooldownMs: attacker.baseAttackCooldownMs ?? attacker.attackCooldownMs ?? PLAYER_DEFAULTS.attackCooldownMs,
    classId: attacker.classId,
    weaponId: attacker.equippedWeaponId,
  });
}

/**
 * Attempt a basic melee attack.
 */
export function meleeAttack(attacker, target, emitEvent) {
  const now = Date.now();
  const cooldown = getEffectiveAttackCooldown(attacker);
  if (attacker.lastAttack && now - attacker.lastAttack < cooldown) {
    return { hit: false, damage: 0, killed: false };
  }

  const range = getEffectiveAttackRange(attacker);
  const dist = combatDistance(attacker, target);
  if (dist > range) return { hit: false, damage: 0, killed: false };

  attacker.lastAttack = now;
  const baseDamage = computeBaseDamage(attacker);

  const isCrit = Math.random() < (attacker.critChance ?? PLAYER_DEFAULTS.critChance);
  const damage = isCrit ? Math.floor(baseDamage * (attacker.critMult ?? PLAYER_DEFAULTS.critMult)) : baseDamage;
  const hpBefore = target.stats?.hp ?? 0;
  const damageResult = resolveDamage(target, damage);
  const killed = damageResult.killed;
  const damageTaken = damageResult.damageTaken;
  const actorType = getEntityType(attacker);
  const targetType = getEntityType(target);
  const sourceId = attacker.equippedWeaponId || attacker.weaponId || 'basic_attack';
  const weaponContribution = getWeaponContribution({
    classId: attacker.classId,
    level: attacker.level,
    weaponId: sourceId,
  });

  emitEvent(createEvent(EventType.ATTACK_HIT, attacker.id, {
    actorId: attacker.id, actorType, attackerId: attacker.id,
    targetId: target.id, targetType, targetEnemyType: target.enemyType,
    sourceType: actorType === 'player' ? 'weapon' : 'enemy', sourceId,
    enemyType: attacker.enemyType,
    damage: damageTaken, isCritical: isCrit, hpBefore, hpAfter: target.stats.hp,
    classId: attacker.classId, playerLevel: attacker.level,
    weaponClass: weaponContribution.weaponClass,
    weaponDamage: weaponContribution.damage,
    weaponAffinity: weaponContribution.affinity,
    targetHpRemaining: target.stats.hp,
  }));

  if (targetType === 'player') {
    emitEvent(createEvent(EventType.DAMAGE_TAKEN, target.id, {
      actorId: target.id, actorType: 'player', targetId: target.id, targetType: 'player',
      sourceType: 'enemy', sourceId: attacker.enemyType || attacker.name || String(attacker.id),
      enemyType: attacker.enemyType || 'unknown', attackerId: attacker.id,
      damage: damageTaken, hpBefore, hpAfter: target.stats.hp,
    }));
  }

  if (killed) {
    emitCombatOutcome(attacker, target, sourceId, emitEvent);
  }

  return { hit: true, damage: damageTaken, killed, isCrit };
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
  const mpBefore = mp;
  if (attacker.stats) attacker.stats.mp -= skill.manaCost;
  else if (attacker.mp !== undefined) attacker.mp -= skill.manaCost;
  const mpAfter = attacker.stats?.mp ?? attacker.mp ?? 0;

  // Set cooldown
  if (!attacker.skillCooldowns) attacker.skillCooldowns = {};
  attacker.skillCooldowns[skillId] = now + skill.cooldownMs;

  emitEvent(createEvent(EventType.SKILL_USE, attacker.id, {
    actorId: attacker.id, actorType: getEntityType(attacker), sourceType: 'skill', sourceId: skillId,
    skillId, cooldownMs: skill.cooldownMs, manaCost: skill.manaCost,
    targetId: target?.id, targetType: target ? getEntityType(target) : 'none', targetPos,
    mpBefore, mpAfter,
  }));
  emitEvent(createEvent(EventType.RESOURCE_CHANGE, attacker.id, {
    actorId: attacker.id, actorType: getEntityType(attacker), sourceType: 'skill', sourceId: skillId,
    resource: 'mp', delta: mpAfter - mpBefore, mpBefore, mpAfter,
  }));

  let result = {};

  // ===== DAMAGE SKILLS =====
  if (skill.damage > 0 && skill.type === 'single') {
    if (target) {
      const dist = combatDistance(attacker, target);
      if (dist <= skill.range) {
        const dmg = computeSkillDamage(attacker, skill);
        const hpBefore = target.stats?.hp ?? 0;
        const damageResult = resolveDamage(target, dmg);
        const killed = damageResult.killed;
        result = { hit: true, damage: damageResult.damageTaken, killed };

        emitEvent(createEvent(EventType.SKILL_HIT, attacker.id, {
          actorId: attacker.id, actorType: getEntityType(attacker), sourceType: 'skill', sourceId: skillId,
          skillId, targetId: target.id, targetType: getEntityType(target), targetEnemyType: target.enemyType,
          damage: damageResult.damageTaken, hpBefore, hpAfter: target.stats.hp, targetHpRemaining: target.stats.hp,
          classId: attacker.classId, playerLevel: attacker.level,
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
          emitCombatOutcome(attacker, target, skillId, emitEvent, 'skill');
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
      const dist = combatDistance(attacker, entity);
      if (dist <= skill.range && inCone(attacker, entity)) {
        const dmg = computeSkillDamage(attacker, skill);
        const hpBefore = entity.stats?.hp ?? 0;
        const damageResult = resolveDamage(entity, dmg);
        const killed = damageResult.killed;
        hits.push({ id: entity.id, damage: damageResult.damageTaken, killed });
        emitEvent(createEvent(EventType.SKILL_HIT, attacker.id, {
          actorId: attacker.id, actorType: getEntityType(attacker), sourceType: 'skill', sourceId: skillId,
          skillId, targetId: entity.id, targetType: getEntityType(entity), targetEnemyType: entity.enemyType,
          damage: damageResult.damageTaken, hpBefore, hpAfter: entity.stats.hp,
          classId: attacker.classId, playerLevel: attacker.level,
        }));
        if (killed) emitCombatOutcome(attacker, entity, skillId, emitEvent, 'skill');
      }
    }
    result = { hit: true, hits, aoe: true };
  }

  // ===== HEAL =====
  else if (skill.type === 'self' && skill.healAmount) {
    const healTarget = attacker;
    const hpBefore = healTarget.stats.hp;
    const healAmount = calculateHealAmount({ baseAmount: skill.healAmount, level: attacker.level });
    const healed = Math.min(healAmount, healTarget.stats.maxHp - healTarget.stats.hp);
    healTarget.stats.hp += healed;
    result = { healed };
    emitEvent(createEvent(EventType.RESOURCE_CHANGE, attacker.id, {
      actorId: attacker.id, actorType: getEntityType(attacker), sourceType: 'skill', sourceId: skillId,
      resource: 'hp', delta: healed, hpBefore, hpAfter: healTarget.stats.hp,
    }));
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

function getEntityType(entity) {
  if (entity?.isPlayer) return 'player';
  if (entity?.isEnemy) return 'enemy';
  return 'unknown';
}

function emitCombatOutcome(attacker, victim, sourceId, emitEvent, sourceType = null) {
  const killerType = getEntityType(attacker);
  const victimType = getEntityType(victim);
  const payload = {
    actorId: attacker.id,
    actorType: killerType,
    killerId: attacker.id,
    killerType,
    victimId: victim.id,
    victimType,
    targetId: victim.id,
    targetType: victimType,
    enemyType: victim.enemyType,
    sourceType: sourceType || (killerType === 'player' ? 'weapon' : 'enemy'),
    sourceId,
  };
  if (killerType === 'player' && victimType === 'enemy') {
    emitEvent(createEvent(EventType.KILL, attacker.id, payload));
  }
  emitEvent(createEvent(EventType.DEATH, victim.id, payload));
}

/**
 * Apply damage to an entity, honoring damage-taken passives (Thick Skin).
 * Returns true if killed.
 */
export function applyDamage(entity, damage) {
  return resolveDamage(entity, damage).killed;
}

export function resolveDamage(entity, damage) {
  if (!entity.stats) return { killed: false, damageTaken: 0 };
  const taken = Math.max(1, Math.round(damage * (entity.damageTakenMult ?? 1)));
  entity.stats.hp = Math.max(0, entity.stats.hp - taken);
  entity.hitReactUntil = Date.now() + 140;
  return { killed: entity.stats.hp <= 0, damageTaken: taken };
}

/**
 * Apply a timed effect from outside the combat system (e.g. consumables).
 * Example: applyEffect(playerId, { type: 'damage_buff', amount: 0.25, expires: Date.now() + 15000 })
 */
export function applyEffect(entityId, effect) {
  addEffect(entityId, effect);
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
