// ============================================================
// main.js — Entry point for Rift SEED Hackathon Demo
// ============================================================
import * as PIXI from 'pixi.js';
import { loadRiftAssets } from '@assets/scripts/riftAssets.js';
import { Camera, tileToScreen, tileDistance } from './engine/isometric.js';
import { renderTileMap, generateGardenMap } from './engine/tilemap.js';
import { World, createEntity } from './engine/ecs.js';
import { meleeAttack, combatTick, useSkill } from './engine/combat.js';
import { movementSystem, spriteSyncSystem, enemyAISystem, depthSortSystem, playerCombatSystem } from './systems/gameSystems.js';
import { TelemetrySystem } from './systems/telemetry.js';
import { ABTestingSystem } from './systems/ab-testing.js';
import { DataLoggingSystem } from './systems/data-logging.js';
import { setupInput } from './input.js';
import { EventType, createEvent } from '@shared/events.js';
import { PLAYER_DEFAULTS, ENEMIES, SKILLS, CLIENT } from '@shared/config.js';

// ---- Bootstrap ----
async function main() {
  const container = document.getElementById('game-container');

  const app = new PIXI.Application({
    background: '#0a0612',
    antialias: true,
    resizeTo: container,
    width: CLIENT.CANVAS_WIDTH,
    height: CLIENT.CANVAS_HEIGHT,
  });
  container.appendChild(app.view);

  // ---- Load Assets ----
  console.log('[RiftSEED] Loading assets...');
  const assets = await loadRiftAssets();
  console.log('[RiftSEED] Assets loaded:', Object.keys(assets.sheets).join(', '));

  // ---- Init Systems ----
  const playerId = 'player_' + Math.random().toString(36).slice(2, 8);
  const telemetry = new TelemetrySystem();
  const abTesting = new ABTestingSystem(playerId);
  const dataLog = new DataLoggingSystem();

  // Try to connect to server (non-blocking)
  telemetry.connect('ws://localhost:3001/ws/telemetry');
  dataLog.connect('ws://localhost:3001/ws/data');

  // Event emitter — routes to all three agent systems
  function emitEvent(event) {
    telemetry.record(event);
    dataLog.record(event);
    if (event.type !== EventType.MOVE_START && event.type !== EventType.MOVE_STOP) {
      console.log(`[Event] ${event.type}`, event);
    }
  }

  // Assign A/B test cohorts
  abTesting.assignAll(emitEvent);
  console.log('[AB] Assignments:', Object.fromEntries(abTesting.assignments));

  // ---- Create World ----
  const world = new World();
  const grid = generateGardenMap(16, 16);
  world.grid = grid;

  // ---- Render Tile Map ----
  const camera = new Camera(app);
  renderTileMap(assets, grid, camera.container);
  app.stage.addChild(camera.container);

  // ---- Create Player Entity ----
  const cadetSheet = assets.sheets.seedCadetWalk;
  const cadetAttackSheet = assets.sheets.seedCadetAttack;

  const playerSprite = assets.anim('seedCadetWalk', 'frame_', 10, true);
  playerSprite.anchor.set(0.5, 0.8);
  playerSprite.scale.set(0.5);

  const playerEntity = createEntity({
    isPlayer: true,
    name: 'SEED Cadet',
    pos: { x: 8, y: 8 },
    targetPos: null,
    path: null,
    direction: 'S',
    isMoving: false,
    attackTarget: null,
    lastAttack: 0,
    attackCooldownMs: abTesting.getOverride('skills.shadowStrike.cooldownMs', PLAYER_DEFAULTS.attackCooldownMs),
    attackRange: PLAYER_DEFAULTS.attackRange,
    stats: {
      hp: PLAYER_DEFAULTS.hp,
      maxHp: PLAYER_DEFAULTS.maxHp,
      mp: PLAYER_DEFAULTS.mp,
      maxMp: PLAYER_DEFAULTS.maxMp,
      speed: PLAYER_DEFAULTS.speed,
      damage: PLAYER_DEFAULTS.attackDamage,
    },
    skillCooldowns: {},
    sprite: playerSprite,
    walkAnim: Object.values(cadetSheet.textures).sort(),
    idleAnim: Object.values(cadetSheet.textures).sort().slice(0, 4),
  });
  world.addEntity(playerEntity);
  camera.container.addChild(playerSprite);

  // ---- Spawn Enemies ----
  function spawnEnemy(type, x, y) {
    const def = ENEMIES[type];
    const sheetKey = type === 'shadowBeast' ? 'shadowBeast' : 'riftKnight';
    const sprite = assets.anim(sheetKey, 'frame_', 8, true);
    sprite.anchor.set(0.5, 0.8);
    sprite.scale.set(0.45);

    const entity = createEntity({
      isEnemy: true,
      enemyType: type,
      name: def.name,
      pos: { x, y },
      spawnPos: { x, y },
      targetPos: null,
      path: null,
      direction: 'S',
      isMoving: false,
      aiState: 'idle',
      patrolTimer: Math.random() * 3,
      lastAttack: 0,
      attackCooldownMs: def.attackCooldownMs,
      attackRange: def.attackRange,
      stats: {
        hp: def.hp,
        maxHp: def.hp,
        damage: def.damage,
        speed: def.speed,
      },
      sprite,
      walkAnim: Object.values(assets.sheets[sheetKey].textures).sort(),
      idleAnim: Object.values(assets.sheets[sheetKey].textures).sort().slice(0, 4),
    });

    world.addEntity(entity);
    camera.container.addChild(sprite);
    return entity;
  }

  // Spawn some enemies
  spawnEnemy('shadowBeast', 5, 5);
  spawnEnemy('shadowBeast', 10, 6);
  spawnEnemy('shadowBeast', 6, 11);
  spawnEnemy('riftKnight', 12, 12);

  // ---- Spawn Rift Portal ----
  const portalSprite = assets.anim('riftPortal', 'frame_', 8, true);
  portalSprite.anchor.set(0.5, 0.5);
  portalSprite.scale.set(0.35);
  const portalPos = tileToScreen(8, 3);
  portalSprite.x = portalPos.x;
  portalSprite.y = portalPos.y;
  camera.container.addChild(portalSprite);

  // ---- Input ----
  const { keys, getMovementInput } = setupInput({
    canvas: app.view,
    camera,
    player: playerEntity,
    world,
    emitEvent,
    useSkillFn: (attacker, skillId, target, targetPos, emit) => {
      return useSkill(attacker, skillId, target, targetPos, emit);
    },
  });

  // ---- Session Start ----
  emitEvent(createEvent(EventType.SESSION_START, playerId, {
    abAssignments: Object.fromEntries(abTesting.assignments),
  }));

  // ---- HUD Update ----
  function updateHUD() {
    const hpPct = (playerEntity.stats.hp / playerEntity.stats.maxHp) * 100;
    const mpPct = (playerEntity.stats.mp / playerEntity.stats.maxMp) * 100;
    const hpFill = document.getElementById('hp-fill');
    const mpFill = document.getElementById('mp-fill');
    if (hpFill) hpFill.style.width = `${hpPct * 2}px`;
    if (mpFill) mpFill.style.width = `${mpPct * 1.5}px`;
  }

  // ---- Game Loop ----
  app.ticker.add((delta) => {
    const dt = delta / 60; // seconds

    // Player combat target auto-attack
    if (playerEntity.attackTarget) {
      const target = playerEntity.attackTarget;
      if (target.stats.hp > 0) {
        const dist = tileDistance(playerEntity.pos, target.pos);
        if (dist <= playerEntity.attackRange) {
          playerEntity.targetPos = null;
          playerEntity.path = [];
          const result = meleeAttack(playerEntity, target, emitEvent);
          if (result.hit && result.killed) {
            playerEntity.attackTarget = null;
            // Remove dead enemy sprite
            if (target.sprite?.parent) {
              target.sprite.parent.removeChild(target.sprite);
            }
            world.removeEntity(target.id);
          }
        } else {
          playerEntity.targetPos = { x: Math.round(target.pos.x), y: Math.round(target.pos.y) };
        }
      } else {
        playerEntity.attackTarget = null;
      }
    }

    // WASD continuous movement (overrides click-to-move)
    const { dx, dy } = getMovementInput();
    if (dx !== 0 || dy !== 0) {
      const speed = playerEntity.stats.speed * dt;
      playerEntity.pos.x += dx * speed;
      playerEntity.pos.y += dy * speed;
      // Clamp to map bounds
      playerEntity.pos.x = Math.max(1, Math.min(14, playerEntity.pos.x));
      playerEntity.pos.y = Math.max(1, Math.min(14, playerEntity.pos.y));
      playerEntity.isMoving = true;
      playerEntity.targetPos = null;
      playerEntity.path = null;
    }

    // Run systems
    movementSystem(world, dt, emitEvent);
    enemyAISystem(world, dt, emitEvent);
    spriteSyncSystem(world, dt);
    depthSortSystem(world, dt);
    playerCombatSystem(world, dt);

    // Camera follow
    const playerScreen = tileToScreen(playerEntity.pos.x, playerEntity.pos.y);
    camera.follow(playerScreen.x, playerScreen.y);
    camera.update();

    // Telemetry tick
    telemetry.tick();

    // HUD
    updateHUD();

    // Portal proximity
    const portalDist = tileDistance(playerEntity.pos, { x: 8, y: 3 });
    if (portalDist < 1.5) {
      portalSprite.tint = 0xe8ff47;
    } else {
      portalSprite.tint = 0xffffff;
    }
  });

  // Periodic data flush
  setInterval(() => {
    dataLog.flush();
    telemetry.flush();
  }, 5000);

  console.log('[RiftSEED] Game initialized. WASD to move, click to move/attack, Q/W/E/R for skills, Tab for agent panel.');
}

main().catch(console.error);
