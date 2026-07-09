// ============================================================
// Enemy Health Bars — floating HP bars above enemies
// ============================================================

const healthBars = new Map(); // entityId -> DOM element

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

    const { tileToScreen } = require('./engine/isometric.js');
    const screen = tileToScreen(entity.pos.x, entity.pos.y);
    const sx = screen.x + camera.container.x;
    const sy = screen.y + camera.container.y - 50;

    let bar = healthBars.get(entity.id);
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;pointer-events:none;z-index:60;';
      bar.innerHTML = `
        <div style="width:40px;height:4px;background:rgba(0,0,0,0.6);border-radius:2px;overflow:hidden;">
          <div class="hp-fill" style="width:100%;height:100%;background:#ff4444;border-radius:2px;transition:width 0.2s;"></div>
        </div>
        <div style="font-size:8px;color:#fff;text-align:center;text-shadow:1px 1px 2px #000;margin-top:1px;">${entity.name || '?'}</div>
      `;
      document.body.appendChild(bar);
      healthBars.set(entity.id, bar);
    }

    bar.style.left = `${sx - 20}px`;
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
