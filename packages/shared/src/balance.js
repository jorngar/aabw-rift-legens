import {
  CLASS_STATS,
  ENEMY_SCALING,
  LEVEL_BONUS,
  SKILL_SCALING,
  WEAPONS,
  WEAPON_SCALING,
} from './config.js';

function positiveLevel(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

export function getWeaponAffinity(classId, weaponClass) {
  const affinities = CLASS_STATS[classId]?.weaponAffinities;
  return affinities?.[weaponClass] ?? 1;
}

export function getWeaponContribution({ classId, level = 1, weaponId } = {}) {
  const weapon = WEAPONS[weaponId];
  if (!weapon) return { damage: 0, skillPower: 0, affinity: 1, weaponClass: null };

  const resolvedLevel = positiveLevel(level);
  const affinity = getWeaponAffinity(classId, weapon.weaponClass);
  const levelSteps = resolvedLevel - 1;
  const damageScale = 1 + WEAPON_SCALING.damagePerLevelPct * levelSteps;
  const skillScale = 1 + WEAPON_SCALING.skillPowerPerLevelPct * levelSteps;

  return {
    affinity,
    weaponClass: weapon.weaponClass,
    damage: Math.round((weapon.damage || 0) * affinity * damageScale),
    skillPower: Math.round((weapon.skillDmg || 0) * affinity * skillScale),
  };
}

export function calculateBasicAttackDamage({
  baseDamage,
  classId,
  level = 1,
  weaponId,
  damageBuff = 0,
} = {}) {
  const resolvedLevel = positiveLevel(level);
  const classStats = CLASS_STATS[classId] || {};
  const levelDamage = Math.round((resolvedLevel - 1)
    * LEVEL_BONUS.damage
    * (classStats.basicDamageLevelMult || 1));
  const weapon = getWeaponContribution({ classId, level: resolvedLevel, weaponId });
  const subtotal = Math.max(1, (Number(baseDamage) || 0) + levelDamage + weapon.damage);
  return Math.max(1, Math.floor(subtotal * (1 + Math.max(0, damageBuff))));
}

export function calculateSkillDamage({
  baseDamage,
  classId,
  level = 1,
  weaponId,
  damageBuff = 0,
} = {}) {
  const resolvedLevel = positiveLevel(level);
  const classStats = CLASS_STATS[classId] || {};
  const weapon = getWeaponContribution({ classId, level: resolvedLevel, weaponId });
  const scaledBase = (Number(baseDamage) || 0)
    * (1 + SKILL_SCALING.damagePerLevelPct * (resolvedLevel - 1))
    * (classStats.skillDamageMult || 1);
  return Math.max(1, Math.floor((scaledBase + weapon.skillPower) * (1 + Math.max(0, damageBuff))));
}

export function calculateHealAmount({ baseAmount, level = 1 } = {}) {
  const resolvedLevel = positiveLevel(level);
  return Math.max(0, Math.floor(
    (Number(baseAmount) || 0) * (1 + SKILL_SCALING.healPerLevelPct * (resolvedLevel - 1)),
  ));
}

export function calculateAttackCooldown({ baseCooldownMs, classId, weaponId } = {}) {
  const weapon = WEAPONS[weaponId];
  const classSpeed = CLASS_STATS[classId]?.attackSpeedMult || 1;
  const weaponSpeed = 1 + (weapon?.attackSpeedPct || 0);
  return Math.max(150, Math.round((Number(baseCooldownMs) || 600) / classSpeed / weaponSpeed));
}

export function calculateAttackRange({ baseRange, level = 1, weaponId } = {}) {
  const weapon = WEAPONS[weaponId];
  return Math.max(0.5, Number(baseRange || 0) + (positiveLevel(level) - 1) * LEVEL_BONUS.attackRange + (weapon?.rangeBonus || 0));
}

function scalingMultiplier(rules, { wave = 0, playerLevel = 1, tier = 1 } = {}) {
  const value = 1
    + Math.max(0, wave) * (rules.perWave || 0)
    + (positiveLevel(playerLevel) - 1) * (rules.perPlayerLevel || 0)
    + Math.max(0, tier - 1) * (rules.perTier || 0);
  return Math.max(ENEMY_SCALING.minimumMultiplier || 0.5, Math.min(value, rules.maxMultiplier || Infinity));
}

export function scaleEnemyStats(enemy, context = {}) {
  const hpMultiplier = scalingMultiplier(ENEMY_SCALING.hp, context);
  const damageMultiplier = scalingMultiplier(ENEMY_SCALING.damage, context);
  const speedMultiplier = scalingMultiplier(ENEMY_SCALING.speed, context);
  const rewardMultiplier = scalingMultiplier(ENEMY_SCALING.reward, context);

  return {
    hp: Math.max(1, Math.round(enemy.hp * hpMultiplier)),
    damage: Math.max(1, Math.round(Math.max(enemy.damage, enemy.damageFloor || 1) * damageMultiplier)),
    speed: Number((enemy.speed * speedMultiplier).toFixed(2)),
    xpReward: Math.max(1, Math.round(enemy.xpReward * rewardMultiplier)),
    goldMultiplier: Number(rewardMultiplier.toFixed(3)),
    multipliers: {
      hp: Number(hpMultiplier.toFixed(3)),
      damage: Number(damageMultiplier.toFixed(3)),
      speed: Number(speedMultiplier.toFixed(3)),
      reward: Number(rewardMultiplier.toFixed(3)),
    },
  };
}

export function getSellPrice(item) {
  if (!item) return 0;
  return Math.max(0, Math.floor(item.sellPrice ?? (item.price || 0) / 2));
}
