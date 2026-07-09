// ============================================================
// Isometric Tile Map Renderer — with rich variety
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

// Simple seeded random for deterministic variety
function seededRandom(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Render an isometric tile map using clean procedural diamonds.
 */
export function renderTileMap(assets, grid, parent) {
  const container = new PIXI.Container();
  container.sortableChildren = true;
  const rows = grid.length;
  const cols = grid[0].length;

  // Color palette — multiple shades per tile type for variety
  const PALETTES = {
    [TILE_TYPES.GRASS]: [
      { fill: 0x4a8b45, border: 0x3a7a38 },
      { fill: 0x3d7d3a, border: 0x2d6d2a },
      { fill: 0x559a50, border: 0x458a40 },
      { fill: 0x4e8f48, border: 0x3e7f38 },
      { fill: 0x42833e, border: 0x32732e },
    ],
    [TILE_TYPES.STONE]: [
      { fill: 0x7a7a8a, border: 0x6a6a7a },
      { fill: 0x6e6e7e, border: 0x5e5e6e },
      { fill: 0x868696, border: 0x767686 },
      { fill: 0x727282, border: 0x626272 },
    ],
    [TILE_TYPES.DIRT]: [
      { fill: 0x8a7a5a, border: 0x7a6a4a },
      { fill: 0x7e6e4e, border: 0x6e5e3e },
      { fill: 0x968666, border: 0x867656 },
      { fill: 0x847450, border: 0x746440 },
    ],
    [TILE_TYPES.RIFT_CRACK]: [
      { fill: 0x7a5a9a, border: 0x6a4a8a },
      { fill: 0x8a6aaa, border: 0x7a5a9a },
      { fill: 0x6a4a8a, border: 0x5a3a7a },
    ],
    [TILE_TYPES.WALL]: [
      { fill: 0x5a5a6a, border: 0x4a4a5a },
      { fill: 0x4e4e5e, border: 0x3e3e4e },
    ],
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileType = grid[y][x];
      if (tileType === -1) continue;

      // Pick a palette variant based on position (deterministic)
      const palette = PALETTES[tileType] || PALETTES[TILE_TYPES.GRASS];
      const variantIdx = Math.floor(seededRandom(x, y, 42) * palette.length);
      const colors = palette[variantIdx % palette.length];

      // Create diamond-shaped tile
      const g = new PIXI.Graphics();
      const hw = 64;
      const hh = 32;

      // Main diamond fill
      g.beginFill(colors.fill);
      g.lineStyle(1, colors.border, 0.6);
      g.moveTo(0, -hh);
      g.lineTo(hw, 0);
      g.lineTo(0, hh);
      g.lineTo(-hw, 0);
      g.closePath();
      g.endFill();

      // Add subtle inner highlight for depth
      const highlightAlpha = 0.08 + seededRandom(x, y, 7) * 0.06;
      g.beginFill(0xffffff, highlightAlpha);
      g.moveTo(0, -hh + 4);
      g.lineTo(hw - 8, 0);
      g.lineTo(0, hh - 4);
      g.lineTo(-hw + 8, 0);
      g.closePath();
      g.endFill();

      // Type-specific details
      const detailSeed = seededRandom(x, y, 13);

      if (tileType === TILE_TYPES.GRASS) {
        // Grass blades
        g.lineStyle(1, 0x5aab55, 0.3);
        const bladeCount = 2 + Math.floor(detailSeed * 3);
        for (let i = 0; i < bladeCount; i++) {
          const bx = (seededRandom(x, y, i * 3) - 0.5) * 40;
          const by = (seededRandom(x, y, i * 3 + 1) - 0.5) * 16;
          g.moveTo(bx, by);
          g.lineTo(bx + (seededRandom(x, y, i * 5) - 0.5) * 4, by - 4 - detailSeed * 4);
        }
        // Occasional flower
        if (detailSeed > 0.85) {
          g.lineStyle(0);
          g.beginFill(0xddcc44, 0.5);
          g.drawCircle(
            (seededRandom(x, y, 99) - 0.5) * 30,
            (seededRandom(x, y, 100) - 0.5) * 12,
            1.5
          );
          g.endFill();
        }
      } else if (tileType === TILE_TYPES.STONE) {
        // Stone cracks
        g.lineStyle(0.5, 0x5a5a6a, 0.25);
        if (detailSeed > 0.4) {
          g.moveTo(-15 + detailSeed * 10, -5);
          g.lineTo(10 - detailSeed * 8, 3);
        }
        if (detailSeed > 0.7) {
          g.moveTo(-5, 6);
          g.lineTo(12, -2);
        }
      } else if (tileType === TILE_TYPES.DIRT) {
        // Dirt speckles
        g.lineStyle(0);
        g.beginFill(0x6a5a3a, 0.12);
        const speckCount = 1 + Math.floor(detailSeed * 3);
        for (let i = 0; i < speckCount; i++) {
          g.drawCircle(
            (seededRandom(x, y, i * 7) - 0.5) * 40,
            (seededRandom(x, y, i * 7 + 1) - 0.5) * 16,
            1 + detailSeed
          );
        }
        g.endFill();
      } else if (tileType === TILE_TYPES.RIFT_CRACK) {
        // Purple glow lines
        g.lineStyle(1, 0xaa77dd, 0.4);
        g.moveTo(-18, 0);
        g.lineTo(0, -8);
        g.lineTo(18, 0);
        if (detailSeed > 0.5) {
          g.moveTo(0, -8);
          g.lineTo(0, 8);
        }
        // Glow dot
        g.lineStyle(0);
        g.beginFill(0xbb88ee, 0.3);
        g.drawCircle(0, 0, 2);
        g.endFill();
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
 * Generate a garden map with varied terrain.
 */
export function generateGardenMap(width = 20, height = 20) {
  const grid = [];
  const rand = (x, y) => ((x * 2654435761 + y * 2246822519) >>> 0) % 100;
  const rand2 = (x, y) => ((x * 17 + y * 31) >>> 0) % 100;

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const r = rand(x, y);
      const r2 = rand2(x, y);

      // Rift crack area near center
      if (Math.abs(x - width / 2) < 2 && Math.abs(y - height / 2) < 2) {
        row.push(TILE_TYPES.RIFT_CRACK);
      }
      // Dirt patches (scattered)
      else if (r < 15 && r2 > 30) {
        row.push(TILE_TYPES.DIRT);
      }
      // Stone paths
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
