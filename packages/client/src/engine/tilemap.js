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
 * Render an isometric tile map.
 * Tiles are positioned using tileToScreen and scaled to fit the grid.
 */
export function renderTileMap(assets, grid, parent) {
  const container = new PIXI.Container();
  container.sortableChildren = true;
  const rows = grid.length;
  const cols = grid[0].length;

  const terrainSheet = assets.sheets.terrainGarden;
  const wallSheet = assets.sheets.terrainWalls;

  // Get all available frame IDs
  const terrainFrames = Object.keys(terrainSheet.textures).sort();
  const wallFrames = Object.keys(wallSheet.textures).sort();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileType = grid[y][x];
      if (tileType === -1) continue;

      let texture;
      if (tileType === TILE_TYPES.WALL) {
        const idx = (y * 13 + x * 7) % wallFrames.length;
        texture = wallSheet.textures[wallFrames[idx]];
      } else {
        // Use more frame variety to reduce repetition
        const framesPerType = Math.max(1, Math.floor(terrainFrames.length / 6));
        const baseIdx = Math.min(tileType * framesPerType, terrainFrames.length - 1);
        const variant = ((x * 31 + y * 17) % framesPerType);
        const frameIdx = Math.min(baseIdx + variant, terrainFrames.length - 1);
        texture = terrainSheet.textures[terrainFrames[frameIdx]];
      }

      if (!texture) continue;

      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.5);

      // Scale tile to fit the isometric grid cell (128x64)
      const texW = texture.width;
      const texH = texture.height;
      sprite.scale.set(128 / texW, 64 / texH);

      // Brighten tiles for visibility
      if (tileType === TILE_TYPES.GRASS) {
        sprite.tint = 0x4a6a3a; // green tint
      } else if (tileType === TILE_TYPES.STONE) {
        sprite.tint = 0x8a8a9a; // light grey
      } else if (tileType === TILE_TYPES.DIRT) {
        sprite.tint = 0x7a6a4a; // brown
      } else if (tileType === TILE_TYPES.RIFT_CRACK) {
        sprite.tint = 0x6a4a8a; // purple tint
      } else if (tileType === TILE_TYPES.WALL) {
        sprite.tint = 0x5a5a6a; // dark grey
      } else {
        sprite.tint = 0x9a9aaa; // default light
      }

      const pos = tileToScreen(x, y);
      sprite.x = pos.x;
      sprite.y = pos.y;
      sprite.zIndex = pos.y;

      sprite.tileX = x;
      sprite.tileY = y;
      sprite.tileType = tileType;

      container.addChild(sprite);
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
      // Border walls
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        row.push(TILE_TYPES.WALL);
        continue;
      }

      const r = rand(x, y);

      // Rift crack area near center
      if (Math.abs(x - width / 2) < 2 && Math.abs(y - height / 2) < 2) {
        row.push(TILE_TYPES.RIFT_CRACK);
      }
      // Dirt paths
      else if (r < 10) {
        row.push(TILE_TYPES.DIRT);
      }
      // Stone patches
      else if (r < 25) {
        row.push(TILE_TYPES.STONE);
      }
      // Occasional wall pillar
      else if (r < 30 && x > 2 && x < width - 2 && y > 2 && y < height - 2) {
        row.push(TILE_TYPES.WALL);
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
