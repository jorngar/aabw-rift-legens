// ============================================================
// Input Handler — keyboard + mouse for isometric RPG
// ============================================================
import { screenToTile } from './engine/isometric.js';
import { SKILLS } from '@shared/config.js';

/**
 * Sets up keyboard and mouse input for the game.
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {Object} opts.camera
 * @param {Object} opts.player
 * @param {Object} opts.world
 * @param {Function} opts.emitEvent
 * @param {Function} opts.useSkill
 */
export function setupInput({ canvas, camera, player, world, emitEvent, useSkillFn }) {
  const keys = new Set();

  // Skill key map
  const skillKeys = {
    'q': 'shadowStrike',
    'w': 'riftSlash',
    'e': 'heal',
    'r': 'riftTeleport',
  };

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys.add(key);

    // Skill usage
    if (skillKeys[key] && player) {
      const nearestEnemy = findNearestEnemy(player, world);
      const result = useSkillFn(player, skillKeys[key], nearestEnemy, nearestEnemy?.pos, emitEvent);
      if (result.success) {
        updateSkillUI(key, SKILLS[skillKeys[key]].cooldownMs);
      }
    }

    // Tab to toggle agent panel
    if (key === 'tab') {
      e.preventDefault();
      document.getElementById('agent-panel')?.classList.toggle('visible');
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
  });

  // Mouse click: move player or attack
  canvas.addEventListener('click', (e) => {
    if (!player || !camera) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const worldPos = camera.screenToWorld(sx, sy);
    const tilePos = screenToTile(worldPos.x, worldPos.y);
    const tx = Math.round(tilePos.x);
    const ty = Math.round(tilePos.y);

    // Check if clicking on an enemy
    const clickedEnemy = world.query('isEnemy', 'pos').find(enemy => {
      return Math.abs(Math.round(enemy.pos.x) - tx) <= 0 &&
             Math.abs(Math.round(enemy.pos.y) - ty) <= 0 &&
             enemy.stats.hp > 0;
    });

    if (clickedEnemy) {
      player.targetPos = { x: clickedEnemy.pos.x, y: clickedEnemy.pos.y };
      player.attackTarget = clickedEnemy;
    } else {
      player.targetPos = { x: tx, y: ty };
      player.attackTarget = null;
    }
  });

  // Continuous movement from WASD
  function getMovementInput() {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup'))    dy -= 1;
    if (keys.has('s') || keys.has('arrowdown'))  dy += 1;
    if (keys.has('a') || keys.has('arrowleft'))  dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    return { dx, dy };
  }

  return { keys, getMovementInput };
}

function findNearestEnemy(player, world) {
  let nearest = null;
  let minDist = Infinity;
  for (const enemy of world.query('isEnemy', 'pos', 'stats')) {
    if (enemy.stats.hp <= 0) continue;
    const dist = Math.abs(enemy.pos.x - player.pos.x) + Math.abs(enemy.pos.y - player.pos.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = enemy;
    }
  }
  return nearest;
}

function updateSkillUI(key, cooldownMs) {
  const slot = document.getElementById(`skill-${key}`);
  if (!slot) return;
  const overlay = slot.querySelector('.cooldown-overlay') || (() => {
    const div = document.createElement('div');
    div.className = 'cooldown-overlay';
    slot.appendChild(div);
    return div;
  })();
  overlay.style.height = '100%';
  overlay.style.transition = `height ${cooldownMs}ms linear`;
  requestAnimationFrame(() => {
    overlay.style.height = '0%';
  });
  setTimeout(() => overlay.remove(), cooldownMs);
}
