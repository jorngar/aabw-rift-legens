// ============================================================
// Event Taxonomy — the contract between game client, server,
// and all three AI agents.
// ============================================================

/** @enum {string} */
export const EventType = Object.freeze({
  // -- Movement
  MOVE_START:     'move:start',
  MOVE_STOP:      'move:stop',
  TELEPORT:       'teleport',

  // -- Combat
  ATTACK:         'attack',
  ATTACK_HIT:     'attack:hit',
  ATTACK_MISS:    'attack:miss',
  DAMAGE_TAKEN:   'damage:taken',
  KILL:           'combat:kill',
  DEATH:          'death',
  RESPAWN:        'respawn',

  // -- Skills
  SKILL_USE:      'skill:use',
  SKILL_HIT:      'skill:hit',
  SKILL_COOLDOWN: 'skill:cooldown',

  // -- Items
  ITEM_PICKUP:    'item:pickup',
  ITEM_USE:       'item:use',
  ITEM_PURCHASE:  'item:purchase',
  ITEM_SELL:      'item:sell',
  WEAPON_EQUIP:   'weapon:equip',

  // -- Progression / spawning
  XP_GAIN:        'progression:xp',
  LEVEL_UP:       'progression:level_up',
  ENEMY_SPAWN:    'enemy:spawn',

  // -- Session
  SESSION_START:  'session:start',
  SESSION_END:    'session:end',
  AREA_ENTER:     'area:enter',
  AREA_EXIT:      'area:exit',
  RIFT_ENTER:     'rift:enter',
  RIFT_EXIT:      'rift:exit',

  // -- SDK observations
  RESOURCE_CHANGE: 'resource:change',
  STATE_SAMPLE:    'state:sample',
  PATH_SAMPLE:     'path:sample',

  // -- Bugs / Reports
  BUG_REPORT:     'bug:report',

  // -- A/B Testing
  AB_ASSIGNED:    'ab:assigned',
  AB_EXPOSURE:    'ab:exposure',

  // -- A/B Data Collection (Phase 2 additions — for map-variant KPI ingest)
  PATH_STUCK:        'path:stuck',
  PATHFIND_FAIL:     'pathfind:fail',
  IMPOSSIBLE_STATE:  'state:impossible',
  JS_ERROR:          'js:error',
  TRAJECTORY_SAMPLE: 'trajectory:sample',
  ENEMY_ENGAGED:     'combat:engaged',

  // -- Agent outputs
  TELEMETRY_REPORT: 'agent:telemetry:report',
  AB_RESULT:        'agent:ab:result',
  DATA_EXPORT:      'agent:data:export',
});

/** Version of the normalized event envelope emitted by the SDK. */
export const TELEMETRY_SCHEMA_VERSION = '1.1.0';

/**
 * @typedef {Object} GameEvent
 * @property {string} type       - one of EventType
 * @property {number} timestamp  - Date.now()
 * @property {string} playerId   - unique session/player ID
 * @property {string} [sessionId]
 * @property {Object} [payload]  - event-specific data
 */

/**
 * Create a game event with automatic timestamp.
 * @param {string} type
 * @param {string} playerId
 * @param {Object} [payload]
 * @returns {GameEvent}
 */
export function createEvent(type, playerId, payload = {}) {
  return {
    type,
    timestamp: Date.now(),
    playerId,
    ...payload,
  };
}

/**
 * Movement event payload
 * @typedef {Object} MovePayload
 * @property {number} fromX  - tile X
 * @property {number} fromY  - tile Y
 * @property {number} toX
 * @property {number} toY
 * @property {number} [velocity]
 * @property {string} [direction] - N/NE/E/SE/S/SW/W/NW
 */

/**
 * Combat event payload
 * @typedef {Object} CombatPayload
 * @property {string} attackerId
 * @property {string} targetId
 * @property {number} damage
 * @property {string} [skillId]
 * @property {boolean} [isCritical]
 * @property {number} [targetHpRemaining]
 */

/**
 * Skill event payload
 * @typedef {Object} SkillPayload
 * @property {string} skillId
 * @property {number} [cooldownMs]
 * @property {number} [manaCost]
 * @property {string} [targetId]
 * @property {{x: number, y: number}} [targetPos]
 */

/**
 * Item event payload
 * @typedef {Object} ItemPayload
 * @property {string} itemId
 * @property {number} [quantity]
 * @property {number} [goldSpent]
 */
