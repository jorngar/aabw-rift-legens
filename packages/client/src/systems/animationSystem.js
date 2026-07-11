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

  if (state === 'idle' || state === 'hit') {
    sprite.stop();
    sprite.gotoAndStop(0);
    return;
  }

  if (!animation.loop) {
    const token = entity.animationToken;
    sprite.onComplete = () => {
      if (state === 'attack' && token === entity.animationToken) entity.isAttacking = false;
    };
  }
  sprite.gotoAndPlay(0);
}

export function triggerAttackAnimation(entity) {
  if (!entity?.animations?.attack) return;
  entity.animationToken = (entity.animationToken || 0) + 1;
  entity.isAttacking = true;
  setEntityAnimation(entity, 'attack', true);
}

export function triggerHitReaction(entity, durationMs = 140) {
  if (!entity) return;
  entity.hitReactUntil = Date.now() + durationMs;
}

export function animationSystem(world) {
  const now = Date.now();
  for (const entity of world.query('sprite', 'animations')) {
    let desired = 'idle';
    if (entity.stats?.hp <= 0 && entity.animations.death) desired = 'death';
    else if (entity.isAttacking && entity.animations.attack) desired = 'attack';
    else if ((entity.hitReactUntil || 0) > now && entity.animations.hit) desired = 'hit';
    else if (entity.isMoving && entity.animations.walk) desired = 'walk';
    setEntityAnimation(entity, desired);
  }
}

export const PLAYER_ANIMATION_PROFILE = Object.freeze({
  idle: { sheet: 'chibiIdle', start: 0, end: 1, loop: false },
  walk: { sheet: 'chibiWalk', fps: 11, loop: true },
  attack: { sheet: 'chibiAttack', fps: 16, loop: false },
  hit: { sheet: 'chibiIdle', start: 1, end: 2, loop: false },
});

export function enemyAnimationProfile(sheet) {
  return {
    idle: { sheet, start: 0, end: 1, loop: false },
    walk: { sheet, start: 0, end: 4, fps: 9, loop: true },
    attack: { sheet, start: 3, end: 6, fps: 13, loop: false },
    hit: { sheet, start: 6, end: 7, loop: false },
    death: { sheet, start: 6, end: 8, fps: 8, loop: false },
  };
}
