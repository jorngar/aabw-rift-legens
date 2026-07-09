// ============================================================
// Isometric Tile Map Renderer
// ============================================================
import * as PIXI from 'pixi.js';
import { tileToScreen } from './isometric.js';

export const TILE_TYPES = Object.freeze({
  GRASS: 0,
  STONE: 1,
  DIRT: 2,
  RIFT_CRACK: 3,
  WATER: 4,
  WALL: 5,
  PORTAL: 6,
});

/**
 * Render an isometric tile map using clean procedural tiles.
 * Generates diamond-shaped tiles directly instead of using the noisy sheet.
 */
export function renderTileMap(assets, grid, parent) {
  const container = new PIXI.Container();
  container.sortableChildren = true;
  const rows = grid.length;
  const cols = grid[0].length;

  // Tile colors by type
  const TILE_COLORS = {
    [TILE_TYPES.GRASS]:      { fill: 0x3a6b35, border: 0x2a5a28 },
    [TILE_TYPES.STONE]:      { fill: 0x6a6a7a, border: 0x5a5a6a },
    [TILE_TYPES.DIRT]:       { fill: 0x7a6a4a, border: 0x6a5a3a },
    [TILE_TYPES.RIFT_CRACK]: { fill: 0x6a4a8a, border: 0x5a3a7a },
    [TILE_TYPES.WALL]:       { fill: 0x4a4a5a, border: 0x3a3a4a },
    [TILE_TYPES.PORTAL]:     { fill: 0x4a3a8a, border: 0x6a4aaa },
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileType = grid[y][x];
      if (tileType === -1) continue;

      const colors = TILE_COLORS[tileType] || TILE_COLORS[TILE_TYPES.GRASS];

      // Create diamond-shaped tile graphic
      const g = new PIXI.Graphics();

      // Diamond shape (isometric)
      const hw = 64; // half width
      const hh = 32; // half height

      g.beginFill(colors.fill);
      g.lineStyle(1, colors.border, 0.5);
      g.moveTo(0, -hh);    // top
      g.lineTo(hw, 0);     // right
      g.lineTo(0, hh);     // bottom
      g.lineTo(-hw, 0);    // left
      g.closePath();
      g.endFill();

      // Add subtle detail based on type
      if (tileType === TILE_TYPES.GRASS) {
        // Grass tufts
        g.lineStyle(1, 0x4a8b45, 0.3);
        for (let i = 0; i < 3; i++) {
          const gx = (Math.sin(x * 7 + y * 13 + i * 2) * 20);
          const gy = (Math.cos(x * 11 + y * 7 + i * 3) * 10);
          g.moveTo(gx, gy - 4);
          g.lineTo(gx + 2, gy - 8);
          g.moveTo(gx, gy - 4);
          g.lineTo(gx - 2, gy - 7);
        }
      } else if (tileType === TILE_TYPES.STONE) {
        // Stone cracks
        g.lineStyle(1, 0x5a5a6a, 0.3);
        g.moveTo(-15, -5);
        g.lineTo(10, 5);
        g.moveTo(-5, 8);
        g.lineTo(15, -3);
      } else if (tileType === TILE_TYPES.RIFT_CRACK) {
        // Purple glow lines
        g.lineStyle(1, 0x9a6abb, 0.4);
        g.moveTo(-20, 0);
        g.lineTo(0, -10);
        g.lineTo(20, 0);
        g.moveTo(0, -10);
        g.lineTo(0, 10);
      }

      const pos = tileToScreen(x, y);
      g.x = pos.x;
      g.y = pos.y;
      g.zIndex = pos.y;

      g.tileX = x;
      g.tileY = y;
      g.tileType = tileType;

      container.addChild(g);
    }
  }

  parent.addChild(container);
  return container;
}

/**
 * Generate a garden map with more variation.
 */
export function generateGardenMap(width = 16, height = 16) {
  const grid = [];
  // Seed for pseudo-random
  const rand = (x, y) => ((x * 2654435761 + y * 2246822519) >>> 0) % 100;

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const r = rand(x, y);

      // Rift crack area near center
      if (Math.abs(x - width / 2) < 2 && Math.abs(y - height / 2) < 2) {
        row.push(TILE_TYPES.RIFT_CRACK);
      }
      // Dirt paths
      else if (r < 12) {
        row.push(TILE_TYPES.DIRT);
      }
      // Stone patches
      else if (r < 30) {
        row.push(TILE_TYPES.STONE);
      }
      // Default grass
      else {
        row.push(TILE_TYPES.GRASS);
      }
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Generate a dungeon map.
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
