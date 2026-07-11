// ============================================================
// Patch layer — tile types, ASCII-layout parser, patch schema
// helpers, and deterministic player→variant hashing.
// ============================================================

/** Tile-type integers stored in map.tiles[y][x]. */
export const TILE_TYPES = Object.freeze({
  FLOOR: 0,
  WALL:  1,
});

// ASCII legend used by parseLayout(). Every marker cell is still walkable —
// the marker just tells the parser what game entity lives there.
const CHAR_MAP = Object.freeze({
  '#': TILE_TYPES.WALL,
  '.': TILE_TYPES.FLOOR,
  'S': TILE_TYPES.FLOOR,  // player spawn
  'P': TILE_TYPES.FLOOR,  // portal (garden→dungeon) or exit/boss (dungeon)
  '$': TILE_TYPES.FLOOR,  // shop terminal (garden only)
  'E': TILE_TYPES.FLOOR,  // enemy spawn
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
    if (!variant.garden || !variant.dungeon) {
      throw new Error(`validatePatch: ${v} missing garden/dungeon`);
    }
    for (const zone of ['garden', 'dungeon']) {
      const m = variant[zone];
      if (!m.tiles || !m.spawn || !m.portal || !Array.isArray(m.enemySpawns)) {
        throw new Error(`validatePatch: ${v}.${zone} malformed`);
      }
    }
  }
}
