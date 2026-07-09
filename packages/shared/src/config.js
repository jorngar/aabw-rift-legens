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
  hp: 100,
  maxHp: 100,
  mp: 50,
  maxMp: 50,
  speed: 3,          // tiles per second
  attackDamage: 25,
  attackCooldownMs: 800,
  attackRange: 1.5,  // tiles
});

/** Enemy definitions */
export const ENEMIES = Object.freeze({
  shadowBeast: {
    name: 'Shadow Beast',
    hp: 60,
    damage: 15,
    speed: 1.8,
    aggroRange: 4,
    attackRange: 1.2,
    attackCooldownMs: 1200,
    xpReward: 25,
  },
  riftKnight: {
    name: 'Rift Knight',
    hp: 200,
    damage: 35,
    speed: 1.2,
    aggroRange: 5,
    attackRange: 1.5,
    attackCooldownMs: 2000,
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
