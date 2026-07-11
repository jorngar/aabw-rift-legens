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
  // Marker so RiftSystem._rebuildTilemap can find and destroy previous tile
  // containers on rift entry/exit — without this, containers stack and later
  // ones cover merchant / player / props.
  container.__isTileMap = true;
  // Force tiles to the BOTTOM of camera.container's sort. Without this,
  // adding a fresh tile container on rift exit puts it at the end of
  // children[], and since it ties zIndex=0 with player/merchant, it wins
  // the stable sort and draws ON TOP of them. Any large negative works.
  container.zIndex = -1000;
  const rows = grid.length;
  const cols = grid[0].length;

  // Helper: vary a color by amount
  const vary = (color, amount) => {
    const r = Math.min(255, Math.max(0, ((color >> 16) & 0xff) + amount));
    const g = Math.min(255, Math.max(0, ((color >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (color & 0xff) + amount));
    return (r << 16) | (g << 8) | b;
  };

  // Color palette — clearly distinct colors per type
  const PALETTES = {
    [TILE_TYPES.GRASS]: [
      { fill: 0x294438, border: 0x1d332a },
      { fill: 0x243b34, border: 0x192c25 },
      { fill: 0x315043, border: 0x213a30 },
      { fill: 0x2b493d, border: 0x1d352c },
      { fill: 0x263f36, border: 0x1a3028 },
    ],
    [TILE_TYPES.STONE]: [
      { fill: 0x4b4b63, border: 0x37374d },
      { fill: 0x414158, border: 0x303044 },
      { fill: 0x56566d, border: 0x3f3f56 },
      { fill: 0x3c3c52, border: 0x2c2c40 },
    ],
    [TILE_TYPES.DIRT]: [
      { fill: 0x58483d, border: 0x41332c },
      { fill: 0x4f4038, border: 0x382d28 },
      { fill: 0x625044, border: 0x493a32 },
      { fill: 0x534239, border: 0x3b3029 },
    ],
    [TILE_TYPES.RIFT_CRACK]: [
      { fill: 0x51386d, border: 0x362448 },
      { fill: 0x60417d, border: 0x412b57 },
      { fill: 0x462f61, border: 0x30203f },
    ],
    [TILE_TYPES.WALL]: [
      { fill: 0x5a5a70, border: 0x4a4a60 },
      { fill: 0x4e4e64, border: 0x3e3e54 },
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

      // Main diamond fill with stronger borders
      g.beginFill(colors.fill);
      g.lineStyle(1.5, colors.border, 0.8);
      g.moveTo(0, -hh);
      g.lineTo(hw, 0);
      g.lineTo(0, hh);
      g.lineTo(-hw, 0);
      g.closePath();
      g.endFill();

      // Top face highlight (makes tiles look 3D)
      const lighterFill = vary(colors.fill, 15);
      g.beginFill(lighterFill, 0.25);
      g.lineStyle(0);
      g.moveTo(0, -hh);
      g.lineTo(hw, 0);
      g.lineTo(0, -hh + 6);
      g.lineTo(-hw, 0);
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
