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

  // Tile colors by type (with per-tile variation)
  const vary = (color, amount) => {
    const r = Math.min(255, Math.max(0, ((color >> 16) & 0xff) + amount));
    const g = Math.min(255, Math.max(0, ((color >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (color & 0xff) + amount));
    return (r << 16) | (g << 8) | b;
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileType = grid[y][x];
      if (tileType === -1) continue;

      // Per-tile color variation
      const VARIATION = ((x * 13 + y * 29) % 20) - 10;
      const TILE_COLORS = {
        [TILE_TYPES.GRASS]:      { fill: vary(0x4a8b45, VARIATION), border: 0x3a7a38 },
        [TILE_TYPES.STONE]:      { fill: vary(0x7a7a8a, VARIATION), border: 0x6a6a7a },
        [TILE_TYPES.DIRT]:       { fill: vary(0x8a7a5a, VARIATION), border: 0x7a6a4a },
        [TILE_TYPES.RIFT_CRACK]: { fill: vary(0x7a5a9a, VARIATION), border: 0x6a4a8a },
        [TILE_TYPES.WALL]:       { fill: vary(0x5a5a6a, VARIATION), border: 0x4a4a5a },
        [TILE_TYPES.PORTAL]:     { fill: vary(0x5a4a9a, VARIATION), border: 0x7a5abb },
      };

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
        // Grass tufts — small, subtle
        g.lineStyle(1, 0x4a8b45, 0.3);
        for (let i = 0; i < 3; i++) {
          const gx = (Math.sin(x * 7 + y * 13 + i * 2.5) * 18);
          const gy = (Math.cos(x * 11 + y * 7 + i * 3.1) * 8);
          g.moveTo(gx, gy - 2);
          g.lineTo(gx + 1, gy - 6);
        }
      } else if (tileType === TILE_TYPES.STONE) {
        // Subtle stone texture — single thin crack
        g.lineStyle(0.5, 0x5a5a6a, 0.2);
        g.moveTo(-12, -3);
        g.lineTo(8, 2);
      } else if (tileType === TILE_TYPES.DIRT) {
        // Subtle dirt — tiny dots
        g.lineStyle(0);
        g.beginFill(0x6a5a3a, 0.15);
        g.drawCircle(Math.sin(x * 5) * 15, Math.cos(y * 7) * 6, 1.5);
        g.endFill();
      } else if (tileType === TILE_TYPES.RIFT_CRACK) {
        // Purple glow — clean lines
        g.lineStyle(1, 0x9a6abb, 0.35);
        g.moveTo(-15, 0);
        g.lineTo(0, -8);
        g.lineTo(15, 0);
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
      const r2 = ((x * 17 + y * 31) >>> 0) % 100; // second random for variety

      // Rift crack area near center
      if (Math.abs(x - width / 2) < 2 && Math.abs(y - height / 2) < 2) {
        row.push(TILE_TYPES.RIFT_CRACK);
      }
      // Dirt patches (scattered, not grid-aligned)
      else if (r < 15 && r2 > 30) {
        row.push(TILE_TYPES.DIRT);
      }
      // Stone paths (larger clusters)
      else if (r < 35 && r2 > 20) {
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
