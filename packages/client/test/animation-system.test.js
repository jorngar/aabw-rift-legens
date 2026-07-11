import test from 'node:test';
import assert from 'node:assert/strict';
import {
  animationSystem,
  ORC_ANIMATION_PROFILE,
  playerAnimationProfile,
  RANGER_ANIMATION_PROFILE,
  SLIME_ANIMATION_PROFILE,
  setEntityAnimation,
  triggerAttackAnimation,
} from '../src/game/systems/animation-system.js';
import { spriteSyncSystem } from '../src/game/systems/game-systems.js';

function fakeEntity() {
  const sprite = {
    textures: [], animationSpeed: 0, loop: false, onComplete: null,
    stopped: false, played: false, frame: null,
    stop() { this.stopped = true; this.played = false; },
    gotoAndStop(frame) { this.frame = frame; this.stopped = true; },
    gotoAndPlay(frame) { this.frame = frame; this.played = true; this.stopped = false; },
  };
  return {
    sprite,
    animations: {
      idle: { textures: ['idle'], speed: 0, loop: false },
      walk: { textures: ['walk-1', 'walk-2'], speed: 0.2, loop: true },
      attack: { textures: ['attack-1', 'attack-2'], speed: 0.3, loop: false },
      attack2: { textures: ['attack2-1', 'attack2-2'], speed: 0.3, loop: false },
      block: { textures: ['block-1', 'block-2'], speed: 0.2, loop: false },
      jump: { textures: ['jump-1', 'jump-2'], speed: 0.2, loop: false },
      hit: { textures: ['hit'], speed: 0, loop: false },
      death: { textures: ['death-1', 'death-2'], speed: 0.1, loop: false },
    },
    animationState: null,
    stats: { hp: 100 },
    isMoving: false,
    isAttacking: false,
  };
}

test('stationary entities hold one idle frame instead of looping', () => {
  const entity = fakeEntity();
  const world = { query: () => [entity] };
  animationSystem(world);
  assert.equal(entity.animationState, 'idle');
  assert.equal(entity.sprite.stopped, true);
  assert.equal(entity.sprite.loop, false);
  assert.deepEqual(entity.sprite.textures, ['idle']);
});

test('movement loops walk frames and returns to a static idle frame', () => {
  const entity = fakeEntity();
  const world = { query: () => [entity] };
  entity.isMoving = true;
  animationSystem(world);
  assert.equal(entity.animationState, 'walk');
  assert.equal(entity.sprite.played, true);
  assert.equal(entity.sprite.loop, true);

  entity.isMoving = false;
  animationSystem(world);
  assert.equal(entity.animationState, 'idle');
  assert.equal(entity.sprite.stopped, true);
});

test('attack animation plays once and releases the attack lock on completion', () => {
  const entity = fakeEntity();
  triggerAttackAnimation(entity);
  assert.equal(entity.animationState, 'attack');
  assert.equal(entity.isAttacking, true);
  assert.equal(entity.sprite.loop, false);
  entity.sprite.onComplete();
  assert.equal(entity.isAttacking, false);
});

test('death animation takes priority over movement and attacks', () => {
  const entity = fakeEntity();
  entity.stats.hp = 0;
  entity.isMoving = true;
  entity.isAttacking = true;
  animationSystem({ query: () => [entity] });
  assert.equal(entity.animationState, 'death');
  assert.equal(entity.sprite.loop, false);
});

test('every selectable class uses its own complete player rig', () => {
  // Each class maps to a distinct sheet family from the 96x96 pack.
  const classSheetPrefixes = { warrior: 'soldier', mage: 'mage', rogue: 'rogue', ranger: 'ranger' };
  for (const [classId, prefix] of Object.entries(classSheetPrefixes)) {
    const profile = playerAnimationProfile(classId);
    assert.equal(profile.idle.sheet, `${prefix}Idle`, classId);
    assert.equal(profile.walk.sheet, `${prefix}Walk`, classId);
    assert.equal(profile.attack.sheet, `${prefix}Attack`, classId);
    assert.equal(profile.attack2.sheet, `${prefix}Attack2`, classId);
    assert.equal(profile.block.sheet, `${prefix}Block`, classId);
    assert.equal(profile.jump.sheet, `${prefix}Jump`, classId);
    assert.equal(profile.hit.sheet, `${prefix}Hurt`, classId);
    assert.equal(profile.death.sheet, `${prefix}Death`, classId);
  }
  assert.equal(playerAnimationProfile('ranger'), RANGER_ANIMATION_PROFILE);
  assert.equal(playerAnimationProfile('unknown-class'), playerAnimationProfile('warrior'));
  assert.equal(RANGER_ANIMATION_PROFILE.attack3.sheet, 'rangerAttack3');
});

test('the orc boss rig replaces the legacy heavy character sheet', () => {
  assert.equal(ORC_ANIMATION_PROFILE.idle.sheet, 'orcIdle');
  assert.equal(ORC_ANIMATION_PROFILE.walk.sheet, 'orcWalk');
  assert.equal(ORC_ANIMATION_PROFILE.attack.sheet, 'orcAttack');
  assert.equal(ORC_ANIMATION_PROFILE.attack2.sheet, 'orcAttack2');
  assert.equal(ORC_ANIMATION_PROFILE.death.sheet, 'orcDeath');
});

test('the slime rig exposes both attacks, aggro hop, block, hurt, and death', () => {
  assert.equal(SLIME_ANIMATION_PROFILE.attack.sheet, 'packSlimeAttack');
  assert.equal(SLIME_ANIMATION_PROFILE.attack2.sheet, 'packSlimeAttack2');
  assert.equal(SLIME_ANIMATION_PROFILE.jump.sheet, 'packSlimeJump');
  assert.equal(SLIME_ANIMATION_PROFILE.block.sheet, 'packSlimeBlock');
  assert.equal(SLIME_ANIMATION_PROFILE.hit.sheet, 'packSlimeHurt');
  assert.equal(SLIME_ANIMATION_PROFILE.death.sheet, 'packSlimeDeath');
});

test('hurt reactions play their available frames once', () => {
  const entity = fakeEntity();
  setEntityAnimation(entity, 'hit', true);
  assert.equal(entity.sprite.played, true);
  assert.equal(entity.sprite.loop, false);
});

test('alternate action animations release their action lock on completion', () => {
  for (const state of ['attack2', 'block', 'jump']) {
    const entity = fakeEntity();
    triggerAttackAnimation(entity, state);
    assert.equal(entity.animationState, state);
    assert.equal(entity.actionAnimationState, state);
    assert.equal(entity.isAttacking, true);
    entity.sprite.onComplete();
    assert.equal(entity.isAttacking, false);
    assert.equal(entity.actionAnimationState, null);
  }
});

test('sprite facing mirrors west/east and restores the class tint', () => {
  const entity = {
    id: 'player',
    pos: { x: 2, y: 3 },
    direction: 'W',
    baseTint: 0xbfdcff,
    sprite: { x: 0, y: 0, tint: 0xffffff, scale: { x: 2.2 } },
  };
  const world = { query: () => [entity] };

  spriteSyncSystem(world, 0);
  assert.equal(entity.sprite.scale.x, -2.2);
  assert.equal(entity.sprite.tint, 0xbfdcff);

  entity.direction = 'E';
  spriteSyncSystem(world, 0);
  assert.equal(entity.sprite.scale.x, 2.2);
});
