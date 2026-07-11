// ============================================================
// Input Handler — class-aware, proper controls
// ============================================================
import { screenToTile } from '../core/isometric.js';
import { combatDistance } from '../core/combat.js';
import { isBlocked } from '@rift-seed/shared/patch';
import { SKILLS } from '@rift-seed/shared/config';

/**
 * Sets up keyboard and mouse input.
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {Object} opts.camera
 * @param {Object} opts.player
 * @param {Object} opts.world
 * @param {Function} opts.emitEvent
 * @param {Function} opts.useSkillFn
 * @param {Array} opts.skillKeys — ['shadowStrike','riftSlash','heal','riftTeleport'] from class config
 */
export function setupInput({ canvas, camera, player, world, emitEvent, useSkillFn, skillKeys }) {
  const keys = new Set();
  const cooldowns = {};

  // Map Q/E/R/T to the class's skill IDs
  const skillBindings = {
    'q': skillKeys?.[0] || 'shadowStrike',
    'e': skillKeys?.[1] || 'riftSlash',
    'r': skillKeys?.[2] || 'heal',
    't': skillKeys?.[3] || 'riftTeleport',
  };

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys.add(key);

    // Skill usage — only on keydown, respect cooldowns
    if (skillBindings[key] && player) {
      const skillId = skillBindings[key];
      const now = Date.now();
      if (cooldowns[skillId] && now < cooldowns[skillId]) return;

      const nearestEnemy = findNearestEnemy(player, world);
      const result = useSkillFn(player, skillId, nearestEnemy, nearestEnemy?.pos, emitEvent);
      if (result.success) {
        const skill = SKILLS[skillId];
        cooldowns[skillId] = now + (skill?.cooldownMs || 3000);
        updateSkillUI(key, skill?.cooldownMs || 3000);
      }
    }

    if (key === 'tab') {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
  });

  // Click to move or attack
  canvas.addEventListener('click', (e) => {
    if (!player || !camera) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const worldPos = camera.screenToWorld(sx, sy);
    const tilePos = screenToTile(worldPos.x, worldPos.y);
    const tx = Math.round(tilePos.x);
    const ty = Math.round(tilePos.y);

    // Check if clicking on an enemy — hit circle sized to the enemy's
    // collision radius plus a small click-tolerance pad
    let clickedEnemy = null;
    let clickedDist = Infinity;
    for (const enemy of world.query('isEnemy', 'pos', 'stats')) {
      if (enemy.stats.hp <= 0) continue;
      const dist = Math.hypot(enemy.pos.x - tilePos.x, enemy.pos.y - tilePos.y);
      if (dist <= (enemy.hitRadius || 0.5) + 0.4 && dist < clickedDist) {
        clickedEnemy = enemy;
        clickedDist = dist;
      }
    }

    if (clickedEnemy) {
      player.targetPos = { x: clickedEnemy.pos.x, y: clickedEnemy.pos.y };
      player.attackTarget = clickedEnemy;
    } else {
      // Reject clicks outside the grid or on a wall — the map edge is
      // now a hard boundary (matches the 10x10 A/B variants).
      const rows = world.grid?.length || 0;
      const cols = world.grid?.[0]?.length || 0;
      const inBounds = tx >= 0 && ty >= 0 && tx < cols && ty < rows;
      if (!inBounds || isBlocked(world.grid[ty][tx])) return;
      player.targetPos = { x: tx, y: ty };
      player.attackTarget = null;
    }
  });

  // Movement: WASD
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
    const dist = combatDistance(player, enemy);
    if (dist < minDist) {
      minDist = dist;
      nearest = enemy;
    }
  }
  return minDist <= 3 ? nearest : null;
}

function updateSkillUI(key, cooldownMs) {
  const slot = document.getElementById(`skill-${key}`);
  if (!slot) return;
  const old = slot.querySelector('.cooldown-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.className = 'cooldown-overlay';
  overlay.style.cssText = `position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);height:100%;transition:height ${cooldownMs}ms linear;border-radius:0 0 6px 6px;pointer-events:none;`;
  slot.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.height = '0%'; });
  setTimeout(() => overlay.remove(), cooldownMs);
}
