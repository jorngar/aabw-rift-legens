// ============================================================
// Isometric Coordinate System & Camera
// ============================================================
import { TILE } from '@shared/config.js';

/**
 * Convert tile coordinates to screen (pixel) coordinates.
 * Standard isometric projection: diamond grid.
 * @param {number} tileX
 * @param {number} tileY
 * @returns {{x: number, y: number}}
 */
export function tileToScreen(tileX, tileY) {
  return {
    x: (tileX - tileY) * (TILE.RENDER_W / 2),
    y: (tileX + tileY) * (TILE.RENDER_H / 4),
  };
}

/**
 * Convert screen coordinates back to tile coordinates.
 * @param {number} screenX
 * @param {number} screenY
 * @returns {{x: number, y: number}}
 */
export function screenToTile(screenX, screenY) {
  const halfW = TILE.RENDER_W / 2;
  const halfH = TILE.RENDER_H / 4;
  return {
    x: (screenX / halfW + screenY / halfH) / 2,
    y: (screenY / halfH - screenX / halfW) / 2,
  };
}

/**
 * Calculate Manhattan distance between two tile positions.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {number}
 */
export function tileDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Get the isometric direction string from a movement delta.
 * @param {number} dx
 * @param {number} dy
 * @returns {string} one of: S, SE, E, NE, N, NW, W, SW
 */
export function getDirection(dx, dy) {
  if (dx === 0 && dy === 0) return 'S';
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle >= -22.5 && angle < 22.5)   return 'E';
  if (angle >= 22.5 && angle < 67.5)    return 'SE';
  if (angle >= 67.5 && angle < 112.5)   return 'S';
  if (angle >= 112.5 && angle < 157.5)  return 'SW';
  if (angle >= 157.5 || angle < -157.5) return 'W';
  if (angle >= -157.5 && angle < -112.5) return 'NW';
  if (angle >= -112.5 && angle < -67.5) return 'N';
  if (angle >= -67.5 && angle < -22.5)  return 'NE';
  return 'S';
}

/**
 * Camera that follows a target with smooth lerp.
 */
export class Camera {
  constructor(app) {
    this.container = new PIXI.Container();
    this.targetX = 0;
    this.targetY = 0;
    this.followSpeed = 0.1;
    this.screenW = app.screen.width;
    this.screenH = app.screen.height;
  }

  /**
   * Set the camera to follow a world position.
   * @param {number} worldX
   * @param {number} worldY
   */
  follow(worldX, worldY) {
    this.targetX = worldX;
    this.targetY = worldY;
  }

  /**
   * Update camera position (call each frame).
   */
  update() {
    const offsetX = this.screenW / 2 - this.targetX;
    const offsetY = this.screenH / 2 - this.targetY;
    this.container.x += (offsetX - this.container.x) * this.followSpeed;
    this.container.y += (offsetY - this.container.y) * this.followSpeed;
  }

  /**
   * Convert screen coords to world coords.
   * @param {number} sx
   * @param {number} sy
   * @returns {{x: number, y: number}}
   */
  screenToWorld(sx, sy) {
    return {
      x: sx - this.container.x,
      y: sy - this.container.y,
    };
  }
}

// Need PIXI for Camera
import * as PIXI from 'pixi.js';
