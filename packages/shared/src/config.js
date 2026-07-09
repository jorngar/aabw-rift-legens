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
});

/** Enemy definitions */
export const ENEMIES = Object.freeze({
  shadowBeast: {
    name: 'Shadow Beast',
    hp: 200,
    damage: 3,
    speed: 1.5,
    aggroRange: 4,
    attackRange: 1.2,
    attackCooldownMs: 1500,
    xpReward: 25,
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
  },
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
  },
  riftSlash: {
    id: 'riftSlash',
    name: 'Rift Slash',
    damage: 30,
    manaCost: 10,
    cooldownMs: 2000,
    range: 2.0,
    type: 'cone',
  },
  heal: {
    id: 'heal',
    name: 'Seed Heal',
    healAmount: 40,
    manaCost: 20,
    cooldownMs: 5000,
    range: 0,
    type: 'self',
  },
  riftTeleport: {
    id: 'riftTeleport',
    name: 'Rift Teleport',
    damage: 0,
    manaCost: 25,
    cooldownMs: 8000,
    range: 5,
    type: 'movement',
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
});

/** SEED Rank progression */
export const RANKS = Object.freeze({
  D: { name: 'D', title: 'Cadet', level: 1, xp: 0, color: '#888' },
  C: { name: 'C', title: 'Mercenary', level: 2, xp: 100, color: '#4a9eff' },
  B: { name: 'B', title: 'Knight', level: 3, xp: 250, color: '#a855f7' },
  A: { name: 'A', title: 'Elite', level: 4, xp: 500, color: '#f59e0b' },
  S: { name: 'S', title: 'Shadow Lord', level: 5, xp: 1000, color: '#e8ff47' },
});

/** Level stat bonuses */
export const LEVEL_BONUS = Object.freeze({ maxHp: 10, maxMp: 5, damage: 3 });

/** Missions */
export const MISSIONS = Object.freeze([
  { id: 'rift_clear', desc: 'Clear Rift Tier 1', check: 'riftCleared', reward: 50 },
  { id: 'kill_10', desc: 'Defeat 10 Enemies', check: 'kills>=10', reward: 30 },
  { id: 'rank_c', desc: 'Reach Rank C', check: 'rank>=C', reward: 40 },
  { id: 'use_skills_5', desc: 'Use 5 Skills', check: 'skillsUsed>=5', reward: 25 },
]);

/** Items */
export const ITEMS = Object.freeze({
  health_potion: { name: 'Health Potion', type: 'consumable', heal: 50, price: 25, desc: 'Restores 50 HP' },
  mana_potion: { name: 'Mana Potion', type: 'consumable', mana: 30, price: 25, desc: 'Restores 30 MP' },
  rift_shard: { name: 'Rift Shard', type: 'consumable', price: 50, desc: 'Teleport to rift' },
  scroll: { name: 'Scroll', type: 'misc', price: 15, desc: 'Ancient text' },
  key: { name: 'Rift Key', type: 'key', price: 100, desc: 'Opens rift gates' },
  ether_crystal: { name: 'Ether Crystal', type: 'material', price: 75, desc: 'Rift energy' },
  rune_stone: { name: 'Rune Stone', type: 'material', price: 60, desc: 'Enchanted stone' },
});

/** Weapons */
export const WEAPONS = Object.freeze({
  gunblade: { name: 'Gunblade', damage: 15, speed: 0, price: 200 },
  rift_staff: { name: 'Rift Staff', damage: 10, maxMp: 20, skillDmg: 10, price: 300 },
  pistol: { name: 'Pistol', damage: 10, speed: 0.2, price: 150 },
  seed_rifle: { name: 'SEED Rifle', damage: 25, speed: -0.3, price: 350 },
  rune_daggers: { name: 'Rune Daggers', damage: 8, speed: 0.5, price: 250 },
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
