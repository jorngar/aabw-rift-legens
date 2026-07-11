// ============================================================
// Isometric Coordinate System & Camera
// ============================================================
import * as PIXI from 'pixi.js';
import { TILE } from '@rift-seed/shared/config';

// Tile dimensions for isometric projection (2:1 ratio)
const ISO_W = 128; // full tile width in pixels
const ISO_H = 64;  // half tile height for proper iso ratio

/**
 * Convert tile coordinates to screen (pixel) coordinates.
 * Standard isometric projection: 2:1 diamond grid.
 */
export function tileToScreen(tileX, tileY) {
  return {
    x: (tileX - tileY) * (ISO_W / 2),
    y: (tileX + tileY) * (ISO_H / 2),
  };
}

/**
 * Convert screen coordinates back to tile coordinates.
 */
export function screenToTile(screenX, screenY) {
  const halfW = ISO_W / 2;
  const halfH = ISO_H / 2;
  return {
    x: (screenX / halfW + screenY / halfH) / 2,
    y: (screenY / halfH - screenX / halfW) / 2,
  };
}

/**
 * Manhattan distance between two tile positions.
 */
export function tileDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Get isometric direction from movement delta.
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
    this.container.sortableChildren = true;
    this.targetX = 0;
    this.targetY = 0;
    this.followSpeed = 0.25;
    this.screenW = app.screen.width;
    this.screenH = app.screen.height;
  }

  follow(worldX, worldY) {
    this.targetX = worldX;
    this.targetY = worldY;
  }

  update() {
    const offsetX = this.screenW / 2 - this.targetX;
    const offsetY = this.screenH / 2 - this.targetY;
    this.container.x += (offsetX - this.container.x) * this.followSpeed;
    this.container.y += (offsetY - this.container.y) * this.followSpeed;
  }

  screenToWorld(sx, sy) {
    return {
      x: sx - this.container.x,
      y: sy - this.container.y,
    };
  }
}
