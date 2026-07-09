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
import { ProgressionSystem } from './systems/progression.js';
import { RiftSystem } from './systems/riftSystem.js';
import { InventorySystem } from './systems/inventorySystem.js';
import { setupInput } from './input.js';
import { EventType, createEvent } from '@shared/events.js';
import { PLAYER_DEFAULTS, ENEMIES, SKILLS, CLIENT, GOLD_DROPS } from '@shared/config.js';

// UI
import { showTitleScreen } from './ui/titleScreen.js';
import { AgentPanel } from './ui/agentPanel.js';
import { ShopUI } from './ui/shopUI.js';
import { PurchaseSimulator } from './ui/purchaseUI.js';
import { Minimap } from './ui/minimap.js';
import { createDamageNumber, screenShake, flashRed, goldenFlash, showVictory, showDefeat } from './ui/screenEffects.js';
import { showSkillEffect, showDamageHit, showGoldDrop } from './ui/skillVFX.js';
import { DemoRunner } from './demo/scenarioRunner.js';

// ---- Bootstrap ----
showTitleScreen(() => initGame());

async function initGame() {
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

  telemetry.connect('ws://localhost:3001/ws/telemetry');
  dataLog.connect('ws://localhost:3001/ws/data');

  let progressionSystem = null;
  function emitEvent(event) {
    telemetry.record(event);
    dataLog.record(event);
    if (progressionSystem) progressionSystem.trackEvent(event);
  }

  abTesting.assignAll(emitEvent);

  // ---- Create World ----
  const world = new World();
  const grid = generateGardenMap(16, 16);
  world.grid = grid;

  // ---- Render Tile Map ----
  const camera = new Camera(app);
  renderTileMap(assets, grid, camera.container);
  app.stage.addChild(camera.container);

  // ---- Create Player ----
  const heroSheet = assets.sheets.hero;
  const playerSprite = assets.anim('hero', 'frame_', 8, true);
  playerSprite.anchor.set(0.5, 0.8);
  playerSprite.scale.set(0.55);

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
    attackCooldownMs: PLAYER_DEFAULTS.attackCooldownMs,
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
    walkAnim: Object.values(heroSheet.textures).sort(),
    idleAnim: Object.values(heroSheet.textures).sort().slice(0, 8),
  });
  world.addEntity(playerEntity);
  camera.container.addChild(playerSprite);

  // ---- Init Game Systems ----
  progressionSystem = new ProgressionSystem(playerEntity, emitEvent);
  const inventorySystem = new InventorySystem(playerEntity, emitEvent);
  const riftSystem = new RiftSystem(playerEntity, world, assets, camera, emitEvent, progressionSystem);

  // ---- Init UI ----
  const agentPanel = new AgentPanel(telemetry, abTesting, dataLog, progressionSystem);
  agentPanel.init();

  const shopUI = new ShopUI(inventorySystem);
  shopUI.init();

  const purchaseUI = new PurchaseSimulator(inventorySystem, emitEvent);
  purchaseUI.init();

  const minimap = new Minimap(world, playerEntity);
  minimap.init();

  // ---- Shop Merchant NPC ----
  const merchantSprite = assets.anim('magician', 'frame_', 6, true);
  merchantSprite.anchor.set(0.5, 0.8);
  merchantSprite.scale.set(0.5);
  const merchantPos = { x: 4, y: 6 };
  const mScreen = tileToScreen(merchantPos.x, merchantPos.y);
  merchantSprite.x = mScreen.x;
  merchantSprite.y = mScreen.y;
  camera.container.addChild(merchantSprite);

  // ---- Spawn Enemies ----
  function spawnEnemy(type, x, y) {
    const def = ENEMIES[type];
    const sheetKey = type === 'shadowBeast' ? 'skeleton' : 'ogre';
    const sprite = assets.anim(sheetKey, 'frame_', 8, true);
    sprite.anchor.set(0.5, 0.8);
    sprite.scale.set(0.5);

    const entity = createEntity({
      isEnemy: true, enemyType: type, name: def.name,
      pos: { x, y }, spawnPos: { x, y }, targetPos: null, path: null,
      direction: 'S', isMoving: false, aiState: 'idle',
      patrolTimer: Math.random() * 3, lastAttack: 0,
      attackCooldownMs: def.attackCooldownMs, attackRange: def.attackRange,
      stats: { hp: def.hp, maxHp: def.hp, damage: def.damage, speed: def.speed },
      sprite,
      walkAnim: Object.values(assets.sheets[sheetKey].textures).sort(),
      idleAnim: Object.values(assets.sheets[sheetKey].textures).sort().slice(0, 4),
    });

    world.addEntity(entity);
    camera.container.addChild(sprite);
    return entity;
  }

  if (!riftSystem.inDungeon) {
    spawnEnemy('shadowBeast', 5, 5);
    spawnEnemy('shadowBeast', 10, 6);
    spawnEnemy('shadowBeast', 6, 11);
    spawnEnemy('riftKnight', 12, 12);
  }

  // ---- Portal Sprite ----
  const portalSprite = assets.anim('riftPortal', 'frame_', 8, true);
  portalSprite.anchor.set(0.5, 0.5);
  portalSprite.scale.set(0.5);
  const portalScreen = tileToScreen(8, 3);
  portalSprite.x = portalScreen.x;
  portalSprite.y = portalScreen.y;
  camera.container.addChild(portalSprite);

  // ---- Input ----
  const { keys, getMovementInput } = setupInput({
    canvas: app.view,
    camera,
    player: playerEntity,
    world,
    emitEvent,
    useSkillFn: (attacker, skillId, target, targetPos, emit) => {
      const result = useSkill(attacker, skillId, target, targetPos, emit);
      if (result.success) {
        progressionSystem.addSkillUse();
        const ps = tileToScreen(playerEntity.pos.x, playerEntity.pos.y);
        showSkillEffect(skillId, ps.x + camera.container.x, ps.y + camera.container.y - 20);
      }
      return result;
    },
  });

  // ---- Additional Key Handlers ----
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // F — interact (rift portal or shop)
    if (key === 'f') {
      if (riftSystem.showPrompt) {
        riftSystem.enterRift();
      } else if (tileDistance(playerEntity.pos, merchantPos) < 2) {
        shopUI.toggle();
      }
    }

    // I — inventory
    if (key === 'i') {
      shopUI.toggle();
    }

    // 1/2/3 — use items
    if (key === '1' && inventorySystem.hasItem('health_potion')) {
      inventorySystem.useItem('health_potion');
    }
    if (key === '2' && inventorySystem.hasItem('mana_potion')) {
      inventorySystem.useItem('mana_potion');
    }

    // P — purchase UI
    if (key === 'p') {
      purchaseUI.toggle();
    }

    // P with Shift — demo mode
    if (key === 'p' && e.shiftKey) {
      if (!demoRunner.running) demoRunner.start();
      else demoRunner.stop();
    }
  });

  // ---- Demo Runner ----
  const demoRunner = new DemoRunner(
    playerEntity, world, progressionSystem, inventorySystem,
    riftSystem, shopUI, purchaseUI, agentPanel
  );

  // ---- Session Start ----
  emitEvent(createEvent(EventType.SESSION_START, playerId, {
    abAssignments: Object.fromEntries(abTesting.assignments),
  }));

  // ---- HUD Update ----
  function updateHUD() {
    const hpPct = (playerEntity.stats.hp / playerEntity.stats.maxHp) * 100;
    const mpPct = (playerEntity.stats.mp / playerEntity.stats.maxMp) * 100;
    const xpProgress = progressionSystem.getProgress();
    const xpPct = (xpProgress.pct || 0) * 100;

    const hpFill = document.getElementById('hp-fill');
    const mpFill = document.getElementById('mp-fill');
    const xpFill = document.getElementById('xp-fill');
    if (hpFill) hpFill.style.width = `${hpPct * 2}px`;
    if (mpFill) mpFill.style.width = `${mpPct * 1.5}px`;
    if (xpFill) xpFill.style.width = `${xpPct}px`;

    // Rank + Level
    const rankEl = document.getElementById('rank-display');
    if (rankEl) rankEl.textContent = `Rank: ${progressionSystem.rank}`;
    const levelEl = document.getElementById('level-display');
    if (levelEl) levelEl.textContent = `Lv.${progressionSystem.level}`;

    // Gold
    const goldEl = document.getElementById('gold-display');
    if (goldEl) goldEl.textContent = `⬡ ${inventorySystem.gold}g`;

    // Item hotbar
    const hpQty = document.getElementById('hp-qty');
    const mpQty = document.getElementById('mp-qty');
    const shardQty = document.getElementById('shard-qty');
    if (hpQty) hpQty.textContent = inventorySystem.getCount('health_potion');
    if (mpQty) mpQty.textContent = inventorySystem.getCount('mana_potion');
    if (shardQty) shardQty.textContent = inventorySystem.getCount('rift_shard');

    // Missions
    const missionsEl = document.getElementById('missions');
    if (missionsEl) {
      const killCount = progressionSystem.kills;
      const skillCount = progressionSystem.skillsUsed;
      const rankOrder = {D:0,C:1,B:2,A:3,S:4};
      const missions = [
        { desc: 'Clear Rift Tier 1', done: progressionSystem.riftsCleared > 0 },
        { desc: 'Defeat 10 Enemies', done: killCount >= 10, progress: `${killCount}/10` },
        { desc: 'Reach Rank C', done: (rankOrder[progressionSystem.rank]||0) >= 1 },
        { desc: 'Use 5 Skills', done: skillCount >= 5, progress: `${skillCount}/5` },
      ];
      missionsEl.innerHTML = missions.map(m =>
        `<div class="mission-item${m.done ? ' complete' : ''}">${m.done ? '✓' : '○'} ${m.desc}${m.progress ? ' ('+m.progress+')' : ''}</div>`
      ).join('');
    }
  }

  // ---- Game Loop ----
  app.ticker.add((delta) => {
    const dt = delta / 60;

    // Rift system update
    riftSystem.update(dt);

    // Auto-target nearest enemy if no current target
    if (!playerEntity.attackTarget) {
      let nearest = null;
      let minDist = Infinity;
      for (const e of world.query('isEnemy', 'pos', 'stats')) {
        if (e.stats.hp <= 0) continue;
        const d = tileDistance(playerEntity.pos, e.pos);
        if (d < minDist) { minDist = d; nearest = e; }
      }
      if (nearest && minDist < 6) {
        playerEntity.attackTarget = nearest;
      }
    }

    // Player auto-attack target
    if (playerEntity.attackTarget) {
      const target = playerEntity.attackTarget;
      if (target.stats.hp > 0) {
        const dist = tileDistance(playerEntity.pos, target.pos);
        if (dist <= playerEntity.attackRange) {
          playerEntity.targetPos = null;
          playerEntity.path = [];
          const result = meleeAttack(playerEntity, target, emitEvent);
          if (result.hit) {
            const screen = tileToScreen(target.pos.x, target.pos.y);
            const sx = screen.x + camera.container.x;
            const sy = screen.y + camera.container.y - 30;
            showDamageHit(sx, sy, result.damage, result.isCrit);
            if (result.isCrit) screenShake(4, 150);
            if (result.killed) {
              playerEntity.attackTarget = null;
              const drops = GOLD_DROPS[target.enemyType] || { min: 5, max: 15 };
              const gold = drops.min + Math.floor(Math.random() * (drops.max - drops.min));
              progressionSystem.addGold(gold);
              inventorySystem.gold = progressionSystem.gold;
              showGoldDrop(sx, sy - 20, gold);
              progressionSystem.addKill(target.enemyType);
              progressionSystem.addXP(target.enemyType === 'riftKnight' ? 100 : 25, 'kill');
              if (target.sprite?.parent) target.sprite.parent.removeChild(target.sprite);
              world.removeEntity(target.id);
            }
          }
        } else {
          playerEntity.targetPos = { x: Math.round(target.pos.x), y: Math.round(target.pos.y) };
        }
      } else {
        playerEntity.attackTarget = null;
      }
    }

    // WASD movement
    const { dx, dy } = getMovementInput();
    if (dx !== 0 || dy !== 0) {
      const speed = (playerEntity.stats.speed || 3) * 0.05;
      playerEntity.pos.x += dx * speed;
      playerEntity.pos.y += dy * speed;
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

    // Portal proximity glow
    if (!riftSystem.inDungeon) {
      const portalDist = tileDistance(playerEntity.pos, { x: 8, y: 3 });
      portalSprite.tint = portalDist < 2 ? 0xe8ff47 : 0xffffff;
    }

    // Player death check
    if (playerEntity.stats.hp <= 0) {
      flashRed();
      showDefeat({ waves: riftSystem.currentWave, kills: progressionSystem.kills });
      playerEntity.stats.hp = playerEntity.stats.maxHp; // prevent re-trigger
    }
  });

  // Periodic flush
  setInterval(() => {
    dataLog.flush();
    telemetry.flush();
  }, 5000);

  console.log('[RiftSEED] Game initialized. WASD=move, click=move/attack, QWER=skills, F=interact, I=inventory, Tab=agents, P=shop');
}
