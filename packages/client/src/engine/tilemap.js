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
        const idx = (y * cols + x) % wallFrames.length;
        texture = wallSheet.textures[wallFrames[idx]];
      } else {
        // Use terrain frames based on tile type
        const baseIdx = Math.min(tileType * 4, terrainFrames.length - 1);
        const variant = (x + y) % 4;
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
 * Generate a garden map.
 */
export function generateGardenMap(width = 16, height = 16) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        row.push(TILE_TYPES.WALL);
      } else if (Math.abs(x - width / 2) < 2 && Math.abs(y - height / 2) < 2) {
        row.push(TILE_TYPES.RIFT_CRACK);
      } else if ((x * 7 + y * 13) % 11 === 0) {
        row.push(TILE_TYPES.STONE);
      } else {
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
