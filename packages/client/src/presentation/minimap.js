// ============================================================
// Minimap — canvas rendering of game state
// ============================================================
import { tileToScreen } from '../game/core/isometric.js';

export class Minimap {
  constructor(world, player) {
    this.world = world;
    this.player = player;
    this.canvas = null;
    this.ctx = null;
    this._interval = null;
  }

  init() {
    this.canvas = document.getElementById('minimap');
    if (!this.canvas) return;
    this.canvas.width = 160;
    this.canvas.height = 160;
    this.ctx = this.canvas.getContext('2d');

    this._interval = setInterval(() => this.render(), 100);
  }

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = 160, h = 160;
    // Derive from the live grid — supports 10x10, 20x20, and any future
    // patch size without editing this file.
    const rows = this.world.grid?.length || 20;
    const cols = this.world.grid?.[0]?.length || rows;
    const cellW = w / cols;
    const cellH = h / rows;

    // Clear with terrain-colored background
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, w, h);

    // Grid lines — one per tile boundary
    ctx.strokeStyle = '#2a3a2a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellW, 0);
      ctx.lineTo(i * cellW, h);
      ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellH);
      ctx.lineTo(w, i * cellH);
      ctx.stroke();
    }

    // Tiles with terrain colors
    if (this.world.grid) {
      const tileColors = { 0: '#3a5a35', 1: '#5a5a6a', 2: '#6a5a3a', 3: '#5a3a7a', 5: '#3a3a4a', 6: '#4a3a8a' };
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < (this.world.grid[y]?.length || 0); x++) {
          const t = this.world.grid[y][x];
          ctx.fillStyle = tileColors[t] || '#2a3a2a';
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }

    // Portal — read live position from riftSystem so it matches the
    // actual variant map instead of the legacy (8,3) hardcoded tile.
    const portal = this.world.portalPos;
    if (portal) {
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(portal.x * cellW + cellW / 2, portal.y * cellH + cellH / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies
    for (const e of this.world.query('isEnemy', 'pos', 'stats')) {
      if (e.stats.hp <= 0) continue;
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(Math.round(e.pos.x) * cellW + 1, Math.round(e.pos.y) * cellH + 1, cellW - 2, cellH - 2);
    }

    // Player
    ctx.fillStyle = '#44ff44';
    ctx.fillRect(Math.round(this.player.pos.x) * cellW, Math.round(this.player.pos.y) * cellH, cellW, cellH);

    // Border
    ctx.strokeStyle = '#e8ff47';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
  }

  destroy() {
    if (this._interval) clearInterval(this._interval);
  }
}
