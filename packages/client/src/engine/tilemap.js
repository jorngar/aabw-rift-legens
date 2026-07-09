// ============================================================
// Isometric Tile Map Renderer
// ============================================================
import * as PIXI from 'pixi.js';
import { tileToScreen } from './isometric.js';
import { TILE } from '@shared/config.js';

/**
 * Tile types and their atlas frame indices in terrain-garden / terrain-walls.
 * These map to frame_NNN in the sprite sheets.
 */
export const TILE_TYPES = Object.freeze({
  GRASS:       0,
  STONE:       1,
  DIRT:        2,
  RIFT_CRACK:  3,
  WATER:       4,
  WALL:        5,
  PORTAL:      6,
});

/**
 * Render an isometric tile map.
 * @param {Object} assets - from loadRiftAssets()
 * @param {number[][]} grid - 2D array of tile type indices
 * @param {PIXI.Container} parent - container to add tiles to
 * @returns {PIXI.Container}
 */
export function renderTileMap(assets, grid, parent) {
  const container = new PIXI.Container();
  const rows = grid.length;
  const cols = grid[0].length;

  // Get the terrain sheet
  const terrainSheet = assets.sheets.terrainGarden;
  const wallSheet = assets.sheets.terrainWalls;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileType = grid[y][x];

      // Skip empty tiles
      if (tileType === -1) continue;

      // Pick frame from appropriate sheet
      let frameId;
      let sheet;
      if (tileType === TILE_TYPES.WALL) {
        sheet = wallSheet;
        // Use wall tile frames (first 8 are wall variants)
        const wallIdx = (y * cols + x) % 8;
        frameId = `frame_${String(wallIdx + 1).padStart(3, '0')}`;
      } else {
        sheet = terrainSheet;
        // Map tile types to terrain frame ranges
        const frameOffset = tileType * 8; // 8 variants per type
        const variant = (x + y) % 8;
        frameId = `frame_${String(frameOffset + variant + 1).padStart(3, '0')}`;
      }

      // Try to get the texture, fallback to first frame
      let texture;
      try {
        texture = sheet.textures[frameId];
      } catch (e) {
        texture = null;
      }
      if (!texture) {
        // Fallback: use a numbered frame
        const fallbackIdx = (y * cols + x) % 62 + 1;
        frameId = `frame_${String(fallbackIdx).padStart(3, '0')}`;
        try { texture = sheet.textures[frameId]; } catch (e) { texture = null; }
      }
      if (!texture) continue;

      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      sprite.scale.set(TILE.SCALE);

      const pos = tileToScreen(x, y);
      sprite.x = pos.x;
      sprite.y = pos.y;

      // Store tile coords on the sprite for hit testing
      sprite.tileX = x;
      sprite.tileY = y;
      sprite.tileType = tileType;

      container.addChild(sprite);
    }
  }

  // Sort by Y for proper depth
  container.sortableChildren = true;
  container.children.forEach((child, i) => {
    child.zIndex = child.y;
  });

  parent.addChild(container);
  return container;
}

/**
 * Generate a simple garden map for testing.
 * @param {number} width
 * @param {number} height
 * @returns {number[][]}
 */
export function generateGardenMap(width = 16, height = 16) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      // Border walls
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        row.push(TILE_TYPES.WALL);
      }
      // Some rift-cracked tiles in the center
      else if (Math.abs(x - width/2) < 2 && Math.abs(y - height/2) < 2) {
        row.push(TILE_TYPES.RIFT_CRACK);
      }
      // Random variation
      else if ((x * 7 + y * 13) % 11 === 0) {
        row.push(TILE_TYPES.STONE);
      }
      else {
        row.push(TILE_TYPES.GRASS);
      }
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Generate a dungeon map (smaller, more walls, rift portal at center).
 * @param {number} width
 * @param {number} height
 * @returns {{grid: number[][], portalPos: {x: number, y: number}}}
 */
export function generateDungeonMap(width = 12, height = 12) {
  const grid = [];
  const portalPos = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        row.push(TILE_TYPES.WALL);
      } else if (x === portalPos.x && y === portalPos.y) {
        row.push(TILE_TYPES.PORTAL);
      } else if ((x + y) % 5 === 0 && Math.random() > 0.5) {
        row.push(TILE_TYPES.WALL);
      } else {
        row.push(TILE_TYPES.STONE);
      }
    }
    grid.push(row);
  }

  return { grid, portalPos };
}
