// ============================================================
// Systems — game-loop systems that run each tick
// ============================================================
import { EventType, createEvent } from '@shared/events.js';
import { ENEMIES } from '@shared/config.js';
import { meleeAttack, combatTick, hasEffect } from '../engine/combat.js';
import { tileDistance, getDirection, tileToScreen } from '../engine/isometric.js';
import { triggerAttackAnimation } from './animationSystem.js';

/**
 * Movement system: simple direct movement toward target.
 */
export function movementSystem(world, dt, emitEvent) {
  for (const entity of world.query('pos', 'stats')) {
    if (!entity.targetPos) {
      if (!entity.manualMovement) entity.isMoving = false;
      continue;
    }

    const dx = entity.targetPos.x - entity.pos.x;
    const dy = entity.targetPos.y - entity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.3) {
      entity.pos.x = entity.targetPos.x;
      entity.pos.y = entity.targetPos.y;
      entity.targetPos = null;
      entity.isMoving = false;
      continue;
    }

    const speed = (entity.stats?.speed || 2) * 0.03;
    entity.pos.x += (dx / dist) * speed;
    entity.pos.y += (dy / dist) * speed;
    entity.direction = getDirection(dx, dy);
    entity.isMoving = true;
  }
}

/**
 * Sprite sync system: updates positions, facing direction, idle bobbing.
 */
export function spriteSyncSystem(world, dt) {
  for (const entity of world.query('pos', 'sprite')) {
    const screenPos = tileToScreen(entity.pos.x, entity.pos.y);
    entity.sprite.x = screenPos.x;
    entity.sprite.y = screenPos.y;

    // Facing direction: flip sprite based on movement direction
    if (entity.direction) {
      if (entity.direction === 'W' || entity.direction === 'NW' || entity.direction === 'SW') {
        entity.sprite.scale.x = -Math.abs(entity.sprite.scale.x);
      } else if (entity.direction === 'E' || entity.direction === 'NE' || entity.direction === 'SE') {
        entity.sprite.scale.x = Math.abs(entity.sprite.scale.x);
      }
    }

    // Visual effect indicators
    if ((entity.hitReactUntil || 0) > Date.now()) {
      entity.sprite.tint = 0xff7777;
    } else if (hasEffect(entity.id, 'slow')) {
      entity.sprite.tint = 0x8888ff; // blue tint for slowed
    } else if (hasEffect(entity.id, 'stun')) {
      entity.sprite.tint = 0xffff00; // yellow tint for stunned
    } else if (hasEffect(entity.id, 'dot')) {
      entity.sprite.tint = 0x88ff88; // green tint for poisoned
    } else {
      entity.sprite.tint = 0xffffff;
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

    // Stun check — skip all AI if stunned
    if (hasEffect(entity.id, 'stun')) {
      entity.aiState = 'stunned';
      entity.targetPos = null;
      continue;
    }

    // State transitions
    if (dist <= def.attackRange) {
      entity.aiState = 'attacking';
    } else if (dist <= def.aggroRange) {
      entity.aiState = 'chasing';
    } else {
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
          triggerAttackAnimation(entity);
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
