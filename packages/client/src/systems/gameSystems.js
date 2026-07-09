// ============================================================
// Systems — game-loop systems that run each tick
// ============================================================
import { EventType, createEvent } from '@shared/events.js';
import { ENEMIES } from '@shared/config.js';
import { tileDistance, getDirection, tileToScreen } from '../engine/isometric.js';
import { findPath, smoothPath } from '../engine/pathfinding.js';
import { meleeAttack, combatTick } from '../engine/combat.js';

/**
 * Movement system: moves entities toward their target tile.
 */
export function movementSystem(world, dt, emitEvent) {
  for (const entity of world.query('pos', 'targetPos', 'stats')) {
    if (!entity.targetPos) continue;
    if (entity.pos.x === entity.targetPos.x && entity.pos.y === entity.targetPos.y) {
      entity.targetPos = null;
      entity.isMoving = false;
      continue;
    }

    // Follow path
    if (entity.path && entity.path.length > 0) {
      const next = entity.path[0];
      const dx = next.x - entity.pos.x;
      const dy = next.y - entity.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = entity.stats.speed || 3;
      const step = speed * dt;

      if (dist <= step) {
        const oldPos = { ...entity.pos };
        entity.pos = { x: next.x, y: next.y };
        entity.path.shift();

        emitEvent(createEvent(EventType.MOVE_STOP, entity.id, {
          fromX: oldPos.x, fromY: oldPos.y,
          toX: entity.pos.x, toY: entity.pos.y,
        }));
      } else {
        const oldPos = { ...entity.pos };
        entity.pos.x += (dx / dist) * step;
        entity.pos.y += (dy / dist) * step;
        entity.direction = getDirection(dx, dy);
        entity.isMoving = true;

        if (Math.floor(oldPos.x) !== Math.floor(entity.pos.x) ||
            Math.floor(oldPos.y) !== Math.floor(entity.pos.y)) {
          emitEvent(createEvent(EventType.MOVE_START, entity.id, {
            fromX: oldPos.x, fromY: oldPos.y,
            toX: entity.pos.x, toY: entity.pos.y,
            velocity: speed,
            direction: entity.direction,
          }));
        }
      }
    } else {
      // No path, calculate one
      entity.path = smoothPath(findPath(world.grid, entity.pos, entity.targetPos));
      if (entity.path.length === 0) {
        entity.targetPos = null;
        entity.isMoving = false;
      }
    }
  }
}

/**
 * Sprite sync system: updates PixiJS sprite positions from entity positions.
 */
export function spriteSyncSystem(world, dt) {
  for (const entity of world.query('pos', 'sprite')) {
    const screenPos = tileToScreen(entity.pos.x, entity.pos.y);
    entity.sprite.x = screenPos.x;
    entity.sprite.y = screenPos.y;

    // Update animation
    if (entity.isMoving && entity.walkAnim) {
      if (!entity.sprite._isWalking) {
        entity.sprite.textures = entity.walkAnim;
        entity.sprite.play();
        entity.sprite._isWalking = true;
      }
    } else if (!entity.isMoving && entity.idleAnim) {
      if (entity.sprite._isWalking) {
        entity.sprite.textures = entity.idleAnim;
        entity.sprite.play();
        entity.sprite._isWalking = false;
      }
    }
  }
}

/**
 * Enemy AI system: patrol, chase, attack.
 */
export function enemyAISystem(world, dt, emitEvent) {
  const player = world.query('isPlayer').find(e => e.isPlayer);
  if (!player) return;

  for (const entity of world.query('isEnemy', 'pos', 'stats')) {
    if (entity.stats.hp <= 0) continue;

    const dist = tileDistance(entity.pos, player.pos);
    const def = ENEMIES[entity.enemyType] || ENEMIES.shadowBeast;

    combatTick(entity, dt);

    if (entity.aiState === 'dead') continue;

    // State transitions
    if (dist <= def.attackRange && entity.aiState !== 'attacking') {
      entity.aiState = 'attacking';
    } else if (dist <= def.aggroRange && entity.aiState !== 'chasing') {
      entity.aiState = 'chasing';
    } else if (dist > def.aggroRange + 2) {
      entity.aiState = 'idle';
    }

    switch (entity.aiState) {
      case 'idle':
        // Patrol: move to random nearby tile occasionally
        if (!entity.patrolTimer) entity.patrolTimer = Math.random() * 3;
        entity.patrolTimer -= dt;
        if (entity.patrolTimer <= 0) {
          entity.patrolTimer = 2 + Math.random() * 3;
          const rx = entity.spawnPos.x + (Math.random() * 4 - 2);
          const ry = entity.spawnPos.y + (Math.random() * 4 - 2);
          entity.targetPos = { x: Math.round(rx), y: Math.round(ry) };
        }
        break;

      case 'chasing':
        entity.targetPos = { x: Math.round(player.pos.x), y: Math.round(player.pos.y) };
        break;

      case 'attacking':
        entity.targetPos = null;
        entity.path = [];
        const result = meleeAttack(entity, player, emitEvent);
        if (result.hit) {
          entity.isAttacking = true;
          setTimeout(() => { entity.isAttacking = false; }, 300);
        }
        break;
    }
  }
}

/**
 * Sort system: update zIndex for proper 2.5D depth ordering.
 */
export function depthSortSystem(world, dt) {
  for (const entity of world.query('pos', 'sprite')) {
    const screenPos = tileToScreen(entity.pos.x, entity.pos.y);
    entity.sprite.zIndex = screenPos.y;
  }
}

/**
 * Combat tick system for the player.
 */
export function playerCombatSystem(world, dt) {
  const player = world.query('isPlayer', 'stats').find(e => e.isPlayer);
  if (player) combatTick(player, dt);
}
