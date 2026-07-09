// ============================================================
// Enemy Health Bars — floating HP bars above enemies
// ============================================================
import { tileToScreen } from '../engine/isometric.js';

const healthBars = new Map();

export function updateEnemyHealthBars(world, camera) {
  // Remove bars for dead/removed enemies
  for (const [id, bar] of healthBars) {
    const entity = world.getEntity(id);
    if (!entity || entity.stats.hp <= 0) {
      bar.remove();
      healthBars.delete(id);
    }
  }

  // Update or create bars for living enemies
  for (const entity of world.query('isEnemy', 'pos', 'stats')) {
    if (entity.stats.hp <= 0) continue;

    const screen = tileToScreen(entity.pos.x, entity.pos.y);
    const sx = screen.x + camera.container.x;
    const sy = screen.y + camera.container.y - 55;

    let bar = healthBars.get(entity.id);
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;pointer-events:none;z-index:60;';
      bar.innerHTML = `
        <div style="width:44px;height:5px;background:rgba(0,0,0,0.7);border-radius:3px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
          <div class="hp-fill" style="width:100%;height:100%;background:linear-gradient(180deg,#ff6644,#cc3322);border-radius:2px;transition:width 0.2s;"></div>
        </div>
        <div style="font-size:8px;color:#ddd;text-align:center;text-shadow:1px 1px 2px #000;margin-top:1px;font-family:monospace;">${entity.name || '?'}</div>
      `;
      document.body.appendChild(bar);
      healthBars.set(entity.id, bar);
    }

    bar.style.left = `${sx - 22}px`;
    bar.style.top = `${sy}px`;

    const hpPct = (entity.stats.hp / entity.stats.maxHp) * 100;
    const fill = bar.querySelector('.hp-fill');
    if (fill) fill.style.width = `${hpPct}%`;
  }
}

export function cleanupHealthBars() {
  for (const [id, bar] of healthBars) {
    bar.remove();
  }
  healthBars.clear();
}
