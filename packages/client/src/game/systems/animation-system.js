// ============================================================
// Animation state machine — idle / move / attack / hit / death
// ============================================================
import * as PIXI from 'pixi.js';

function materializeProfile(assets, profile) {
  const result = {};
  for (const [state, definition] of Object.entries(profile)) {
    const textures = assets.textures(
      definition.sheet,
      definition.prefix || 'frame_',
      definition.start || 0,
      definition.end,
    );
    if (textures.length === 0) continue;
    result[state] = {
      textures,
      speed: (definition.fps || 10) / 60,
      loop: definition.loop !== false,
    };
  }
  return result;
}

export function createStatefulSprite(assets, profile, options = {}) {
  const animations = materializeProfile(assets, profile);
  const initial = animations.idle || Object.values(animations)[0];
  const sprite = new PIXI.AnimatedSprite(initial.textures);
  sprite.anchor.set(options.anchorX ?? 0.5, options.anchorY ?? 0.84);
  sprite.scale.set(options.scale ?? 1);
  sprite.loop = false;
  sprite.stop();
  sprite.gotoAndStop(0);
  return { sprite, animations };
}

export function setEntityAnimation(entity, state, force = false) {
  const animation = entity.animations?.[state];
  if (!animation || !entity.sprite) return;
  if (!force && entity.animationState === state) return;

  const sprite = entity.sprite;
  sprite.onComplete = null;
  sprite.textures = animation.textures;
  sprite.animationSpeed = animation.speed;
  sprite.loop = animation.loop;
  entity.animationState = state;

  if (state === 'idle') {
    sprite.stop();
    sprite.gotoAndStop(0);
    return;
  }

  if (!animation.loop) {
    const token = entity.animationToken;
    sprite.onComplete = () => {
      if (token === entity.animationToken && entity.actionAnimationState === state) {
        entity.isAttacking = false;
        entity.actionAnimationState = null;
      }
    };
  }
  sprite.gotoAndPlay(0);
}

export function triggerAttackAnimation(entity, requestedState = 'attack') {
  if (!entity?.animations?.attack) return;
  const state = entity.animations[requestedState] ? requestedState : 'attack';
  entity.animationToken = (entity.animationToken || 0) + 1;
  entity.isAttacking = true;
  entity.actionAnimationState = state;
  setEntityAnimation(entity, state, true);
}

export function triggerHitReaction(entity, durationMs = 140) {
  if (!entity) return;
  entity.hitReactUntil = Date.now() + durationMs;
}

export function animationSystem(world) {
  const now = Date.now();
  for (const entity of world.query('sprite', 'animations')) {
    let desired = 'idle';
    const actionState = entity.actionAnimationState || 'attack';
    if (entity.stats?.hp <= 0 && entity.animations.death) desired = 'death';
    else if (entity.isAttacking && entity.animations[actionState]) desired = actionState;
    else if ((entity.hitReactUntil || 0) > now && entity.animations.hit) desired = 'hit';
    else if (entity.isMoving && entity.animations.walk) desired = 'walk';
    setEntityAnimation(entity, desired);
  }
}

export const SOLDIER_ANIMATION_PROFILE = Object.freeze({
  idle: { sheet: 'soldierIdle', start: 0, end: 1, loop: false },
  walk: { sheet: 'soldierWalk', fps: 10, loop: true },
  attack: { sheet: 'soldierAttack', fps: 16, loop: false },
  attack2: { sheet: 'soldierAttack2', fps: 16, loop: false },
  block: { sheet: 'soldierBlock', fps: 12, loop: false },
  jump: { sheet: 'soldierJump', fps: 12, loop: false },
  hit: { sheet: 'soldierHurt', fps: 18, loop: false },
  death: { sheet: 'soldierDeath', fps: 12, loop: false },
});

export const RANGER_ANIMATION_PROFILE = Object.freeze({
  idle: { sheet: 'rangerIdle', start: 0, end: 1, loop: false },
  walk: { sheet: 'rangerWalk', fps: 10, loop: true },
  attack: { sheet: 'rangerAttack', fps: 15, loop: false },
  attack2: { sheet: 'rangerAttack2', fps: 15, loop: false },
  attack3: { sheet: 'rangerAttack3', fps: 16, loop: false },
  block: { sheet: 'rangerBlock', fps: 12, loop: false },
  jump: { sheet: 'rangerJump', fps: 12, loop: false },
  hit: { sheet: 'rangerHurt', fps: 18, loop: false },
  death: { sheet: 'rangerDeath', fps: 12, loop: false },
});

export const MAGE_ANIMATION_PROFILE = Object.freeze({
  idle: { sheet: 'mageIdle', start: 0, end: 1, loop: false },
  walk: { sheet: 'mageWalk', fps: 10, loop: true },
  attack: { sheet: 'mageAttack', fps: 15, loop: false },
  attack2: { sheet: 'mageAttack2', fps: 15, loop: false },
  block: { sheet: 'mageBlock', fps: 12, loop: false },
  jump: { sheet: 'mageJump', fps: 12, loop: false },
  hit: { sheet: 'mageHurt', fps: 18, loop: false },
  death: { sheet: 'mageDeath', fps: 12, loop: false },
});

export const ROGUE_ANIMATION_PROFILE = Object.freeze({
  idle: { sheet: 'rogueIdle', start: 0, end: 1, loop: false },
  walk: { sheet: 'rogueWalk', fps: 11, loop: true },
  attack: { sheet: 'rogueAttack', fps: 17, loop: false },
  attack2: { sheet: 'rogueAttack2', fps: 17, loop: false },
  block: { sheet: 'rogueBlock', fps: 12, loop: false },
  jump: { sheet: 'rogueJump', fps: 12, loop: false },
  hit: { sheet: 'rogueHurt', fps: 18, loop: false },
  death: { sheet: 'rogueDeath', fps: 12, loop: false },
});

const PLAYER_PROFILES = Object.freeze({
  warrior: SOLDIER_ANIMATION_PROFILE,
  mage: MAGE_ANIMATION_PROFILE,
  rogue: ROGUE_ANIMATION_PROFILE,
  ranger: RANGER_ANIMATION_PROFILE,
});

export function playerAnimationProfile(classId) {
  return PLAYER_PROFILES[classId] || SOLDIER_ANIMATION_PROFILE;
}

export const SLIME_ANIMATION_PROFILE = Object.freeze({
  idle: { sheet: 'packSlimeIdle', start: 0, end: 1, loop: false },
  walk: { sheet: 'packSlimeWalk', fps: 9, loop: true },
  attack: { sheet: 'packSlimeAttack', fps: 15, loop: false },
  attack2: { sheet: 'packSlimeAttack2', fps: 15, loop: false },
  block: { sheet: 'packSlimeBlock', fps: 12, loop: false },
  jump: { sheet: 'packSlimeJump', fps: 12, loop: false },
  hit: { sheet: 'packSlimeHurt', fps: 18, loop: false },
  death: { sheet: 'packSlimeDeath', fps: 12, loop: false },
});

export const ORC_ANIMATION_PROFILE = Object.freeze({
  idle: { sheet: 'orcIdle', start: 0, end: 1, loop: false },
  walk: { sheet: 'orcWalk', fps: 9, loop: true },
  attack: { sheet: 'orcAttack', fps: 14, loop: false },
  attack2: { sheet: 'orcAttack2', fps: 14, loop: false },
  block: { sheet: 'orcBlock', fps: 12, loop: false },
  hit: { sheet: 'orcHurt', fps: 18, loop: false },
  death: { sheet: 'orcDeath', fps: 10, loop: false },
});

// Ready-to-use profiles for the rest of the pack's monsters, so new encounter
// types can be added without touching the asset layer.
function monsterProfile(prefix, { walkFps = 9, attackFps = 14 } = {}) {
  return Object.freeze({
    idle: { sheet: `${prefix}Idle`, start: 0, end: 1, loop: false },
    walk: { sheet: `${prefix}Walk`, fps: walkFps, loop: true },
    attack: { sheet: `${prefix}Attack`, fps: attackFps, loop: false },
    attack2: { sheet: `${prefix}Attack2`, fps: attackFps, loop: false },
    block: { sheet: `${prefix}Block`, fps: 12, loop: false },
    hit: { sheet: `${prefix}Hurt`, fps: 18, loop: false },
    death: { sheet: `${prefix}Death`, fps: 10, loop: false },
  });
}

export const GOBLIN_ANIMATION_PROFILE = monsterProfile('goblin', { walkFps: 11, attackFps: 15 });
export const ORC_SHIELD_ANIMATION_PROFILE = monsterProfile('orcShield');
export const ORC_FIST_ANIMATION_PROFILE = monsterProfile('orcFist', { attackFps: 16 });
export const MACE_SOLDIER_ANIMATION_PROFILE = monsterProfile('mace');
