// ============================================================
// Patch layer — tile types, ASCII-layout parser, patch schema
// helpers, and deterministic player→variant hashing.
// ============================================================

/**
 * Tile-type integers stored in map.tiles[y][x]. Values are aligned with
 * the client renderer's palette (packages/client/src/game/core/tilemap.js)
 * so shared JSON blobs render correctly without translation.
 */
export const TILE_TYPES = Object.freeze({
  FLOOR:      0,  // grass (garden) / stone floor (dungeon) — walkable
  STONE:      1,  // walkable stone path
  DIRT:       2,  // walkable dirt path (visually distinct hint)
  RIFT_CRACK: 3,  // purple rift damage — BLOCKED
  WATER:      4,  // BLOCKED
  WALL:       5,  // solid wall — BLOCKED
});

/** Tile types the player cannot cross (used by pathfinding + WASD + click). */
export const BLOCKED_TILES = Object.freeze(
  new Set([TILE_TYPES.WALL, TILE_TYPES.RIFT_CRACK, TILE_TYPES.WATER])
);

/** True if the given tile type is impassable. */
export function isBlocked(tileType) {
  return BLOCKED_TILES.has(tileType);
}

// ASCII legend used by parseLayout(). Marker cells (S/P/$/E) render as the
// underlying FLOOR — the marker only tells the parser what game entity lives
// there. Impassable obstacles use `#` (wall) or `*` (rift crack).
const CHAR_MAP = Object.freeze({
  '#': TILE_TYPES.WALL,
  '*': TILE_TYPES.RIFT_CRACK,  // impassable rift-damaged obstacle
  '~': TILE_TYPES.DIRT,        // walkable path hint
  '.': TILE_TYPES.FLOOR,
  'S': TILE_TYPES.FLOOR,       // player spawn
  'P': TILE_TYPES.FLOOR,       // portal (garden→dungeon) or exit/boss (dungeon)
  '$': TILE_TYPES.FLOOR,       // shop terminal (garden only)
  'E': TILE_TYPES.FLOOR,       // enemy spawn
});

/**
 * @typedef {Object} MapAsset
 * @property {string} zone            'garden' | 'dungeon'
 * @property {number} width
 * @property {number} height
 * @property {number[][]} tiles       [row][col] tile-type ints
 * @property {{x:number,y:number}} spawn
 * @property {{x:number,y:number}} portal
 * @property {{x:number,y:number}} [shop]
 * @property {Array<{x:number,y:number,type:string}>} enemySpawns
 */

/**
 * Parse an ASCII layout string into a MapAsset.
 * Rows are separated by newlines; leading/trailing blank lines are ignored.
 * Every row MUST have the same width and the perimeter should be walls (#).
 *
 * @param {string} zone
 * @param {string} ascii
 * @param {{ defaultEnemy?: string }} [opts]
 * @returns {MapAsset}
 */
export function parseLayout(zone, ascii, opts = {}) {
  const defaultEnemy = opts.defaultEnemy || 'shadowBeast';
  // Strip trailing \r (Windows CRLF) but NOT leading indent — indent would
  // silently break future maps that use offset rows.
  const lines = ascii.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length > 0);
  if (lines.length === 0) throw new Error('parseLayout: empty ascii');

  const height = lines.length;
  const width = lines[0].length;
  const tiles = [];
  let spawn = null, portal = null, shop = null;
  const enemySpawns = [];

  for (let y = 0; y < height; y++) {
    if (lines[y].length !== width) {
      throw new Error(`parseLayout: row ${y} width ${lines[y].length} != ${width}`);
    }
    const row = [];
    for (let x = 0; x < width; x++) {
      const ch = lines[y][x];
      const tile = CHAR_MAP[ch];
      if (tile == null) throw new Error(`parseLayout: unknown char '${ch}' at (${x},${y})`);
      row.push(tile);
      if      (ch === 'S') spawn = { x, y };
      else if (ch === 'P') portal = { x, y };
      else if (ch === '$') shop = { x, y };
      else if (ch === 'E') enemySpawns.push({ x, y, type: defaultEnemy });
    }
    tiles.push(row);
  }

  if (!spawn)  throw new Error(`parseLayout(${zone}): missing spawn 'S'`);
  if (!portal) throw new Error(`parseLayout(${zone}): missing portal 'P'`);

  const asset = { zone, width, height, tiles, spawn, portal, enemySpawns };
  if (shop) asset.shop = shop;
  return asset;
}

/**
 * Deterministic hash of playerId + patchId → 'A' or 'B'.
 * Server uses this to assign a persistent variant on first session.
 */
export function hashPlayerToVariant(playerId, patchId) {
  const s = `${playerId}::${patchId}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  // Use unsigned right-shift so we never hit the Math.abs(INT32_MIN) edge case.
  return ((h >>> 0) % 2) === 0 ? 'A' : 'B';
}

/**
 * Cheap structural validation. Throws on missing required fields.
 * Not a full JSON-schema check — YAGNI at hackathon scale.
 */
export function validatePatch(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('validatePatch: not an object');
  for (const key of ['id', 'name', 'variantA', 'variantB']) {
    if (!(key in patch)) throw new Error(`validatePatch: missing '${key}'`);
  }
  for (const v of ['variantA', 'variantB']) {
    const variant = patch[v];
    if (!variant.garden) {
      throw new Error(`validatePatch: ${v} missing garden`);
    }
    // Accept either the new `dungeons` pool (array of layouts, rotated at
    // runtime) or the legacy single `dungeon` for backwards-compat with
    // any patch still shipping the old shape.
    const dungeons = Array.isArray(variant.dungeons)
      ? variant.dungeons
      : (variant.dungeon ? [variant.dungeon] : null);
    if (!dungeons || dungeons.length === 0) {
      throw new Error(`validatePatch: ${v} needs at least one dungeon (in .dungeons array)`);
    }
    const gm = variant.garden;
    if (!gm.tiles || !gm.spawn || !gm.portal || !Array.isArray(gm.enemySpawns)) {
      throw new Error(`validatePatch: ${v}.garden malformed`);
    }
    dungeons.forEach((m, i) => {
      if (!m.tiles || !m.spawn || !m.portal || !Array.isArray(m.enemySpawns)) {
        throw new Error(`validatePatch: ${v}.dungeons[${i}] malformed`);
      }
    });
  }
}
