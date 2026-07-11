import test from 'node:test';
import assert from 'node:assert/strict';
import { animationSystem, setEntityAnimation, triggerAttackAnimation } from '../src/systems/animationSystem.js';

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
