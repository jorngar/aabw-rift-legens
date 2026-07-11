// ============================================================
// Projectile System — visual-only ballistic arrows
// ============================================================
// Damage is applied instantly by the combat code that spawns the arrow.
// This system just draws the arc for feedback — arrow flies from
// shooter to target with a parabolic hop, then despawns on land.

import * as PIXI from 'pixi.js';
import { tileToScreen } from '../core/isometric.js';

/**
 * Manages active arrow sprites on top of the camera container.
 */
export class ProjectileSystem {
  constructor(container) {
    this.container = container;
    this.projectiles = [];
  }

  /**
   * Spawn a ballistic arrow that arcs from one tile to another.
   * @param {{x:number,y:number}} fromTile shooter tile position
   * @param {{x:number,y:number}} toTile   target tile position
   * @param {number} durationMs            travel time (default 380ms)
   */
  spawnArrow(fromTile, toTile, durationMs = 380) {
    const gfx = new PIXI.Graphics();
    // Shaft
    gfx.lineStyle(2, 0x6b4a24);
    gfx.moveTo(-8, 0);
    gfx.lineTo(6, 0);
    // Head (triangle)
    gfx.lineStyle(0);
    gfx.beginFill(0xd8ccb0);
    gfx.moveTo(6, -3);
    gfx.lineTo(11, 0);
    gfx.lineTo(6, 3);
    gfx.closePath();
    gfx.endFill();
    // Fletchings
    gfx.beginFill(0xffffff);
    gfx.drawPolygon([-8, -2, -12, 0, -8, 2]);
    gfx.endFill();

    const from = tileToScreen(fromTile.x, fromTile.y);
    const to = tileToScreen(toTile.x, toTile.y);
    // Slight vertical offset so the arrow launches from bow height, not feet.
    gfx.x = from.x;
    gfx.y = from.y - 22;
    gfx.zIndex = 999; // above tiles + entities
    this.container.addChild(gfx);

    this.projectiles.push({
      gfx,
      fromX: from.x,
      fromY: from.y - 22,
      toX: to.x,
      toY: to.y - 6,
      elapsed: 0,
      duration: durationMs,
      peakHeight: 38,
    });
  }

  update(dt) {
    if (this.projectiles.length === 0) return;
    const finished = [];
    for (const p of this.projectiles) {
      p.elapsed += dt * 1000;
      const t = Math.min(1, p.elapsed / p.duration);
      // Linear interp for base X/Y trajectory, plus 4t(1-t) parabolic
      // arc that peaks at 0.5 for a natural hop.
      const arc = -p.peakHeight * (4 * t * (1 - t));
      p.gfx.x = p.fromX + (p.toX - p.fromX) * t;
      p.gfx.y = p.fromY + (p.toY - p.fromY) * t + arc;
      // Point the arrow along its instantaneous velocity so it looks
      // like it's rotating with the arc, not sliding sideways.
      const vx = p.toX - p.fromX;
      const vy = (p.toY - p.fromY) - p.peakHeight * (4 - 8 * t);
      p.gfx.rotation = Math.atan2(vy, vx);
      if (t >= 1) finished.push(p);
    }
    for (const p of finished) {
      if (p.gfx.parent) p.gfx.parent.removeChild(p.gfx);
      p.gfx.destroy();
      const i = this.projectiles.indexOf(p);
      if (i >= 0) this.projectiles.splice(i, 1);
    }
  }
}
