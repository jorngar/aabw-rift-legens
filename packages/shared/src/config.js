// ============================================================
// Game Configuration — balance params, A/B test defs, constants
// ============================================================

/** Isometric tile dimensions (pixels) */
export const TILE = Object.freeze({
  WIDTH: 128,
  HEIGHT: 128,
  /** Scale factor applied to tiles in the renderer */
  SCALE: 0.5,
  /** Effective rendered tile width */
  RENDER_W: 64,
  /** Effective rendered tile height */
  RENDER_H: 64,
});

/** Player starting stats */
export const PLAYER_DEFAULTS = Object.freeze({
  hp: 500,
  maxHp: 500,
  mp: 100,
  maxMp: 100,
  speed: 3,
  attackDamage: 30,
  attackCooldownMs: 600,
  attackRange: 2.0,
  startingGold: 100,
  /** Collision radius in tiles — combat ranges measure edge-to-edge */
  hitRadius: 0.4,
  critChance: 0.15,
  critMult: 1.8,
});

/**
 * Per-class combat modifiers, applied as multipliers over PLAYER_DEFAULTS
 * (so Hermes runtime tuning of the defaults still affects every class).
 * Passive fields map to entity flags read by the combat system.
 */
export const CLASS_STATS = Object.freeze({
  warrior: {
    hpMult: 1.3, mpMult: 0.6, damageMult: 1.15, speedMult: 0.93, rangeMult: 1.0,
    attackSpeedMult: 0.95, basicDamageLevelMult: 1.15,
    damageTakenMult: 0.9, // Thick Skin: -10% damage taken
    weaponAffinities: { martial: 1.2, finesse: 0.9, ranged: 0.8, arcane: 0.7, heavy: 1.15 },
  },
  mage: {
    hpMult: 0.7, mpMult: 1.5, damageMult: 0.7, speedMult: 0.85, rangeMult: 1.0,
    attackSpeedMult: 0.9, basicDamageLevelMult: 0.75,
    skillDamageMult: 1.2, // Arcane Overflow: +20% skill damage
    weaponAffinities: { martial: 0.7, finesse: 0.8, ranged: 0.9, arcane: 1.3, heavy: 0.65 },
  },
  rogue: {
    hpMult: 0.8, mpMult: 0.8, damageMult: 0.95, speedMult: 1.33, rangeMult: 1.0,
    attackSpeedMult: 1.15, basicDamageLevelMult: 1.0,
    critChance: 0.25, // Backstab: sharply improved crit chance
    weaponAffinities: { martial: 0.95, finesse: 1.25, ranged: 1.05, arcane: 0.8, heavy: 0.7 },
  },
  ranger: {
    hpMult: 0.75, mpMult: 1.0, damageMult: 0.85, speedMult: 1.07,
    attackSpeedMult: 1.08, basicDamageLevelMult: 0.9,
    rangeMult: 1.2, // Eagle Eye: +20% attack range
    weaponAffinities: { martial: 0.9, finesse: 1.0, ranged: 1.25, arcane: 0.85, heavy: 1.05 },
  },
});

/** Enemy definitions */
export const ENEMIES = Object.freeze({
  shadowBeast: {
    // Keep the stable telemetry/config key while presenting the new pack's
    // creature honestly in the game UI.
    name: 'Rift Slime',
    hp: 200,
    damage: 3,
    speed: 1.5,
    aggroRange: 4,
    attackRange: 1.2,
    attackCooldownMs: 1500,
    xpReward: 25,
    /** Collision radius in tiles — the slime renders at 2x scale */
    hitRadius: 0.7,
  },
  riftKnight: {
    name: 'Rift Knight',
    hp: 500,
    damage: 8,
    speed: 1.0,
    aggroRange: 5,
    attackRange: 1.5,
    attackCooldownMs: 2500,
    xpReward: 100,
    isBoss: true,
    hitRadius: 0.55,
  },
});

/**
 * Monster stat scaling. Multipliers compound additively:
 * mult = 1 + wave*perWave + (playerLevel-1)*perPlayerLevel + (tier-1)*perTier
 */
export const ENEMY_SCALING = Object.freeze({
  hp: { perWave: 0.15, perPlayerLevel: 0.10, perTier: 0.5 },
  damage: { perWave: 0.12, perPlayerLevel: 0.08, perTier: 0.4 },
  speed: { perWave: 0.01, perPlayerLevel: 0.005, perTier: 0.03, maxMultiplier: 1.2 },
  reward: { perWave: 0.10, perPlayerLevel: 0.05, perTier: 0.3 }, // applies to xp and gold
  minimumMultiplier: 0.55,
});

/** Skill definitions */
export const SKILLS = Object.freeze({
  shadowStrike: {
    id: 'shadowStrike',
    name: 'Shadow Strike',
    damage: 45,
    manaCost: 15,
    cooldownMs: 3000,
    range: 2.5,
    type: 'single',
    icon: '⚔',
    desc: 'High damage single target',
  },
  riftSlash: {
    id: 'riftSlash',
    name: 'Rift Slash',
    damage: 30,
    manaCost: 10,
    cooldownMs: 2000,
    range: 2.0,
    type: 'cone',
    icon: '🌀',
    desc: 'AoE cone attack',
  },
  heal: {
    id: 'heal',
    name: 'Seed Heal',
    healAmount: 40,
    manaCost: 20,
    cooldownMs: 5000,
    range: 0,
    type: 'self',
    icon: '💚',
    desc: 'Restore HP',
  },
  riftTeleport: {
    id: 'riftTeleport',
    name: 'Rift Teleport',
    damage: 0,
    manaCost: 25,
    cooldownMs: 8000,
    range: 5,
    type: 'movement',
    icon: '◆',
    desc: 'Dash forward',
  },
  shieldBash: {
    id: 'shieldBash',
    name: 'Shield Bash',
    damage: 20,
    manaCost: 12,
    cooldownMs: 2500,
    range: 1.5,
    type: 'single',
    icon: '🛡',
    desc: 'Stun enemy for 1s',
    stun: 1000,
  },
  warCry: {
    id: 'warCry',
    name: 'War Cry',
    damage: 0,
    manaCost: 18,
    cooldownMs: 6000,
    range: 0,
    type: 'self',
    icon: '📢',
    desc: '+30% damage for 5s',
    buffDuration: 5000,
    buffDamage: 0.3,
  },
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    damage: 55,
    manaCost: 22,
    cooldownMs: 3500,
    range: 4,
    type: 'single',
    icon: '🔥',
    desc: 'Ranged fire attack',
  },
  iceShard: {
    id: 'iceShard',
    name: 'Ice Shard',
    damage: 35,
    manaCost: 16,
    cooldownMs: 2500,
    range: 3.5,
    type: 'single',
    icon: '❄',
    desc: 'Slows enemy by 50%',
    slow: 0.5,
    slowDuration: 3000,
  },
  poisonDagger: {
    id: 'poisonDagger',
    name: 'Poison Dagger',
    damage: 15,
    manaCost: 10,
    cooldownMs: 1500,
    range: 1.5,
    type: 'single',
    icon: '🗡',
    desc: 'Applies poison (10 dmg/s for 3s)',
    dot: 10,
    dotDuration: 3000,
  },
  dash: {
    id: 'dash',
    name: 'Dash',
    damage: 0,
    manaCost: 12,
    cooldownMs: 3000,
    range: 4,
    type: 'movement',
    icon: '💨',
    desc: 'Quick dash, iframe 0.5s',
  },
  arrowShot: {
    id: 'arrowShot',
    name: 'Arrow Shot',
    damage: 25,
    manaCost: 8,
    cooldownMs: 1200,
    range: 5,
    type: 'single',
    icon: '🏹',
    desc: 'Fast ranged attack',
  },
  summonWolf: {
    id: 'summonWolf',
    name: 'Summon Wolf',
    damage: 0,
    manaCost: 30,
    cooldownMs: 15000,
    range: 0,
    type: 'self',
    icon: '🐺',
    desc: 'Summon wolf companion for 10s',
  },
});

/** Rift wave configuration per tier */
export const RIFT_WAVES = Object.freeze({
  1: [
    { count: 3, type: 'shadowBeast', delay: 2 },
    { count: 5, type: 'shadowBeast', delay: 3 },
    { count: 7, type: 'shadowBeast', delay: 3 },
    { count: 1, type: 'riftKnight', delay: 5, isBoss: true },
  ],
  2: [
    { count: 4, type: 'shadowBeast', delay: 2 },
    { count: 6, type: 'shadowBeast', delay: 3 },
    { count: 8, type: 'shadowBeast', delay: 3 },
    { count: 2, type: 'riftKnight', delay: 5, isBoss: true },
  ],
  3: [
    { count: 6, type: 'shadowBeast', delay: 2 },
    { count: 8, type: 'shadowBeast', delay: 3 },
    { count: 10, type: 'shadowBeast', delay: 3 },
    { count: 3, type: 'riftKnight', delay: 5, isBoss: true },
  ],
});

/** SEED Rank progression */
export const RANKS = Object.freeze({
  D: { name: 'D', title: 'Cadet', level: 1, xp: 0, color: '#888' },
  C: { name: 'C', title: 'Mercenary', level: 2, xp: 100, color: '#4a9eff' },
  B: { name: 'B', title: 'Knight', level: 3, xp: 250, color: '#a855f7' },
  A: { name: 'A', title: 'Elite', level: 4, xp: 500, color: '#f59e0b' },
  S: { name: 'S', title: 'Shadow Lord', level: 5, xp: 1000, color: '#e8ff47' },
});

/** Level stat bonuses — scale per level */
export const LEVEL_BONUS = Object.freeze({
  maxHp: 15,
  maxMp: 8,
  damage: 4,
  speed: 0.1,
  attackRange: 0.1,
});

/**
 * Skill scaling per level — applied at cast time in combat.js so every
 * skill scales and the shared SKILLS config is never mutated.
 */
export const SKILL_SCALING = Object.freeze({
  damagePerLevelPct: 0.10,
  healPerLevelPct: 0.10,
});

export const WEAPON_SCALING = Object.freeze({
  damagePerLevelPct: 0.04,
  skillPowerPerLevelPct: 0.05,
});

/** Missions */
export const MISSIONS = Object.freeze([
  { id: 'rift_clear', desc: 'Clear Rift Tier 1', check: 'riftCleared', reward: 50 },
  { id: 'kill_10', desc: 'Defeat 10 Enemies', check: 'kills>=10', reward: 30 },
  { id: 'rank_c', desc: 'Reach Rank C', check: 'rank>=C', reward: 40 },
  { id: 'use_skills_5', desc: 'Use 5 Skills', check: 'skillsUsed>=5', reward: 25 },
]);

/** Items */
export const ITEMS = Object.freeze({
  health_potion: { name: 'Health Potion', type: 'consumable', usableFromInventory: true, heal: 50, price: 15, desc: 'Restores 50 HP' },
  mana_potion: { name: 'Mana Potion', type: 'consumable', usableFromInventory: true, mana: 30, price: 15, desc: 'Restores 30 MP' },
  rift_shard: { name: 'Rift Shard', type: 'consumable', price: 40, desc: 'Use (key 3) to open the Rift instantly' },
  scroll: { name: 'Battle Scroll', type: 'consumable', usableFromInventory: true, buffDamage: 0.25, buffDuration: 15000, price: 35, desc: '+25% damage for 15s' },
  key: { name: 'Rift Key', type: 'key', price: 50, desc: 'Required to enter Rifts above Tier 1' },
  ether_crystal: { name: 'Ether Crystal', type: 'material', sellOnly: true, sellPrice: 60, price: 120, desc: 'Boss loot — sells for 60 gold' },
  rune_stone: { name: 'Rune Stone', type: 'material', sellOnly: true, sellPrice: 12, price: 24, desc: 'Monster loot — sells for 12 gold' },
});

/** Weapons — weaponClass controls class affinity; attackSpeedPct affects attack cadence. */
export const WEAPONS = Object.freeze({
  pistol: { name: 'Pistol', weaponClass: 'ranged', damage: 8, attackSpeedPct: 0.10, rangeBonus: 1.5, price: 150, desc: 'Fast ranged sidearm' },
  gunblade: { name: 'Gunblade', weaponClass: 'martial', damage: 15, rangeBonus: 0.25, price: 200, desc: 'Reliable close-range blade' },
  rune_daggers: { name: 'Rune Daggers', weaponClass: 'finesse', damage: 12, attackSpeedPct: 0.25, price: 250, desc: 'Rapid finesse strikes' },
  rift_staff: { name: 'Rift Staff', weaponClass: 'arcane', damage: 6, maxMp: 30, skillDmg: 15, rangeBonus: 1.0, price: 300, desc: 'Amplifies spell damage' },
  seed_rifle: { name: 'SEED Rifle', weaponClass: 'heavy', damage: 25, attackSpeedPct: -0.15, rangeBonus: 2.5, price: 350, desc: 'Slow, high-impact ranged weapon' },
});

/** Monster loot drops (besides gold) */
export const ITEM_DROPS = Object.freeze({
  shadowBeast: [{ itemId: 'rune_stone', chance: 0.2 }],
  riftKnight: [{ itemId: 'ether_crystal', chance: 1.0 }, { itemId: 'key', chance: 0.5 }],
});

/** Gold drops */
export const GOLD_DROPS = Object.freeze({
  shadowBeast: { min: 10, max: 20 },
  riftKnight: { min: 50, max: 100 },
});

/** Premium packages */
export const PREMIUM_PACKAGES = Object.freeze([
  { id: 'starter', name: 'Starter Pack', crystals: 100, price: '$0.99', popular: false },
  { id: 'hunter', name: 'Hunter Pack', crystals: 500, price: '$4.99', popular: true },
  { id: 'shadow_lord', name: 'Shadow Lord Pack', crystals: 1200, price: '$9.99', popular: false },
]);

/** Map dimensions (tiles) */
export const MAP = Object.freeze({
  GARDEN_WIDTH: 16,
  GARDEN_HEIGHT: 16,
  DUNGEON_WIDTH: 12,
  DUNGEON_HEIGHT: 12,
});

/** A/B test definitions — each defines what varies and the KPIs to track */
export const AB_TESTS = Object.freeze({
  shadowStrikeCooldown: {
    name: 'Shadow Strike Cooldown',
    param: 'skills.shadowStrike.cooldownMs',
    variants: {
      A: { value: 3000, label: '3s cooldown' },
      B: { value: 2000, label: '2s cooldown' },
    },
    primaryKpi: 'session_duration',
    secondaryKpis: ['skill_usage_count', 'death_count', 'completion_rate'],
    minSamples: 10,
    significanceLevel: 0.05,
  },
  enemyDensity: {
    name: 'Dungeon Enemy Density',
    param: 'dungeon.enemyCount',
    variants: {
      A: { value: 5, label: '5 enemies' },
      B: { value: 8, label: '8 enemies' },
    },
    primaryKpi: 'completion_rate',
    secondaryKpis: ['death_count', 'session_duration', 'xp_per_minute'],
    minSamples: 10,
    significanceLevel: 0.05,
  },
});

/** Server config */
export const SERVER = Object.freeze({
  PORT: 3001,
  WS_PATH: '/ws',
  TICK_RATE_MS: 100,  // 10 Hz game tick
});

/** Client config */
export const CLIENT = Object.freeze({
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  CAMERA_FOLLOW_SPEED: 0.1,
});
