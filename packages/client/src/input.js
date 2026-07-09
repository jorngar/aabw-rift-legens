// ============================================================
// Input Handler — fixed: arrow keys = move, Q/E/R/T = skills
// ============================================================
import { screenToTile } from './engine/isometric.js';
import { SKILLS } from '@shared/config.js';

export function setupInput({ canvas, camera, player, world, emitEvent, useSkillFn }) {
  const keys = new Set();

  // Skills: Q, E, R, T (NOT W/A/S/D — those are movement)
  const skillKeys = {
    'q': 'shadowStrike',
    'e': 'riftSlash',
    'r': 'heal',
    't': 'riftTeleport',
  };

  // Track skill cooldowns
  const cooldowns = {};

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys.add(key);

    // Skill usage — only on keydown, respect cooldowns
    if (skillKeys[key] && player) {
      const skillId = skillKeys[key];
      const now = Date.now();
      if (cooldowns[skillId] && now < cooldowns[skillId]) return; // on cooldown

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

    // Check if clicking on an enemy
    let clickedEnemy = null;
    for (const enemy of world.query('isEnemy', 'pos', 'stats')) {
      if (enemy.stats.hp <= 0) continue;
      const dx = Math.abs(Math.round(enemy.pos.x) - tx);
      const dy = Math.abs(Math.round(enemy.pos.y) - ty);
      if (dx <= 1 && dy <= 1) {
        clickedEnemy = enemy;
        break;
      }
    }

    if (clickedEnemy) {
      player.targetPos = { x: clickedEnemy.pos.x, y: clickedEnemy.pos.y };
      player.attackTarget = clickedEnemy;
    } else {
      player.targetPos = { x: tx, y: ty };
      player.attackTarget = null;
    }
  });

  // Movement: WASD only (no arrow keys to avoid scroll)
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
  // Only return if in skill range (3 tiles)
  return minDist <= 3 ? nearest : null;
}

function updateSkillUI(key, cooldownMs) {
  const slot = document.getElementById(`skill-${key}`);
  if (!slot) return;

  // Remove old overlay
  const old = slot.querySelector('.cooldown-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'cooldown-overlay';
  overlay.style.cssText = `position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);height:100%;transition:height ${cooldownMs}ms linear;border-radius:0 0 6px 6px;pointer-events:none;`;
  slot.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.height = '0%';
  });
  setTimeout(() => overlay.remove(), cooldownMs);
}
