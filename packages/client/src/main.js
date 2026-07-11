// ============================================================
// main.js — Entry point for Rift SEED Hackathon Demo
// ============================================================
import * as PIXI from 'pixi.js';
import { loadRiftAssets } from './infrastructure/assets/rift-asset-loader.js';
import { Camera, getDirection, tileToScreen, tileDistance } from './game/core/isometric.js';
import { renderTileMap, generateGardenMap } from './game/core/tilemap.js';
import { isBlocked } from '@rift-seed/shared/patch';
import { World, createEntity } from './game/core/ecs.js';
import { meleeAttack, combatTick, useSkill, combatDistance, computeBaseDamage, getEffectiveAttackRange } from './game/core/combat.js';
import { movementSystem, spriteSyncSystem, enemyAISystem, depthSortSystem, playerCombatSystem } from './game/systems/game-systems.js';
import { TelemetrySystem } from './infrastructure/analytics/telemetry.js';
import { ABTestingSystem } from './infrastructure/analytics/ab-testing.js';
import { DataLoggingSystem } from './infrastructure/analytics/data-logging.js';
import { API_BASE, WS_BASE } from './infrastructure/runtime-endpoints.js';
import { TrajectorySampler } from './game/systems/trajectory-sampler.js';
import { DefectDetector } from './game/systems/defect-detector.js';
import { ProgressionSystem } from './game/systems/progression.js';
import { RiftSystem } from './game/systems/rift-system.js';
import { InventorySystem } from './game/systems/inventory-system.js';
import { setupInput } from './game/controllers/input-controller.js';
import { EventType, createEvent } from '@rift-seed/shared/events';
import { PLAYER_DEFAULTS, ENEMIES, SKILLS, CLIENT, GOLD_DROPS, CLASS_STATS, ITEM_DROPS } from '@rift-seed/shared/config';
import { scaleEnemyStats } from '@rift-seed/shared/balance';

// UI
import { showTitleScreen } from './presentation/title-screen.js';
import { showClassSelection, getClassConfig } from './presentation/class-select.js';
import { AgentPanel } from './presentation/agent-panel.js';
import { ShopUI } from './presentation/shop-ui.js';
import { PurchaseSimulator } from './presentation/purchase-ui.js';
import { Minimap } from './presentation/minimap.js';
import { createDamageNumber, screenShake, flashRed, goldenFlash, showVictory, showDefeat } from './presentation/screen-effects.js';
import { showSkillEffect, showDamageHit, showGoldDrop } from './presentation/skill-vfx.js';
import { LightingSystem } from './presentation/lighting.js';
import { addGardenProps } from './presentation/garden-props.js';
import { updateEnemyHealthBars } from './presentation/enemy-health-bars.js';
import { DemoRunner } from './app/demo/scenario-runner.js';
import {
  animationSystem,
  createStatefulSprite,
  ORC_ANIMATION_PROFILE,
  playerAnimationProfile,
  SLIME_ANIMATION_PROFILE,
  setEntityAnimation,
  triggerAttackAnimation,
} from './game/systems/animation-system.js';

const CLASS_SPRITE_TINTS = Object.freeze({
  warrior: 0xffffff,
  mage: 0xbfdcff,
  rogue: 0xc9ffc2,
  ranger: 0xffddb0,
});

const BLOCK_ANIMATION_SKILLS = new Set(['heal', 'warCry', 'summonWolf']);
const JUMP_ANIMATION_SKILLS = new Set(['dash', 'riftTeleport']);

function animationStateForSkill(skillId, classId) {
  if (classId === 'ranger' && skillId === 'arrowShot') return 'attack3';
  if (JUMP_ANIMATION_SKILLS.has(skillId)) return 'jump';
  if (BLOCK_ANIMATION_SKILLS.has(skillId)) return 'block';
  return 'attack2';
}

// ---- Bootstrap ----
const debugClass = new URLSearchParams(window.location.search).get('autostart');
if (debugClass) {
  initGame(debugClass);
} else {
  showTitleScreen(() => {
    showClassSelection((classId) => {
      initGame(classId);
    });
  });
}

async function initGame(classId = 'warrior') {
  const classConfig = getClassConfig(classId);
  console.log(`[RiftSEED] Playing as ${classConfig.name} (${classId})`);

  const container = document.getElementById('game-container');

  const app = new PIXI.Application({
    background: '#1a1525',
    antialias: true,
    preserveDrawingBuffer: true,
    resizeTo: container,
    width: CLIENT.CANVAS_WIDTH,
    height: CLIENT.CANVAS_HEIGHT,
  });
  container.appendChild(app.view);

  // ---- Load Assets ----
  console.log('[RiftSEED] Loading assets...');
  const assets = await loadRiftAssets();
  console.log('[RiftSEED] Assets loaded:', Object.keys(assets.sheets).join(', '));

  // Approved Hermes patches are published as runtime config for the next session.
  const runtimePlayerDefaults = await loadRuntimeBalance();

  // ---- Init Systems ----
  // A/B routing is decided by the LB — the client just needs a random
  // handle so the server can key its session row and reconnect logic.
  // We do not track individual players; the dashboard aggregates by
  // variant only.
  const playerId = 'player_' + Math.random().toString(36).slice(2, 8);
  const telemetry = new TelemetrySystem({
    playerId,
    patchId: 'v0.1.0',
    gameVersion: '0.1.0',
  });
  const abTesting = new ABTestingSystem(playerId);
  const dataLog = new DataLoggingSystem();

  telemetry.connect(`${WS_BASE}/ws?channel=telemetry&playerId=${encodeURIComponent(playerId)}`);
  dataLog.connect(`${WS_BASE}/ws?channel=data`);

  let progressionSystem = null;
  function emitEvent(event) {
    telemetry.record(event);
    dataLog.record(event);
  }

  abTesting.assignAll(emitEvent);

  // A/B: request server-side variant + map. Non-fatal if server is down —
  // fall back to procedural garden so the game still boots offline.
  let abAssignment = null;
  try {
    abAssignment = await telemetry.handshake(playerId, { timeoutMs: 4000 });
    console.log(`[A/B] variant ${abAssignment.variant} (${abAssignment.patchName}) session=${abAssignment.sessionId}`);
    // Feed the real variant back into the legacy ABTestingSystem map so
    // the AgentPanel dashboard (which still reads getVariant('shadowStrikeCooldown'))
    // shows the correct A/B badge instead of always defaulting to 'A'.
    abTesting.assignments.set('shadowStrikeCooldown', abAssignment.variant);
    abTesting.assignments.set(`patch-${abAssignment.patchId}`, abAssignment.variant);
  } catch (err) {
    console.warn('[A/B] handshake failed, falling back to procedural map:', err.message);
  }

  // ---- Create World ----
  const world = new World();
  // Use server-assigned garden map if available; otherwise fall back to
  // the legacy procedural 20x20.
  const gardenMap = abAssignment?.mapConfig?.garden;
  const grid = gardenMap ? gardenMap.tiles : generateGardenMap(20, 20);
  world.grid = grid;

  // ---- Render Tile Map ----
  const camera = new Camera(app);
  renderTileMap(assets, grid, camera.container);

  // Add garden props (trees, torches, crystals, flowers)
  addGardenProps(camera.container, grid);

  app.stage.addChild(camera.container);


  // Snap camera to the assigned spawn (or legacy 8,8 fallback).
  const spawnTile = gardenMap?.spawn || { x: 8, y: 8 };
  const startScreen = tileToScreen(spawnTile.x, spawnTile.y);
  camera.targetX = startScreen.x;
  camera.targetY = startScreen.y;
  camera.container.x = app.screen.width / 2 - startScreen.x;
  camera.container.y = app.screen.height / 2 - startScreen.y;

  // ---- Create Player — explicit idle / move / attack states ----
  const playerVisual = createStatefulSprite(assets, playerAnimationProfile(classId), {
    scale: 2.2,
    anchorY: 0.60,
  });
  const playerSprite = playerVisual.sprite;

  // Class-specific color overlay — disabled; the neon+cream oval combo
  // made the visible "footprint" much wider than the actual tile hitbox.
  // Keep only playerShadow as the ground indicator.
  const classColorEl = null;

  // Update skill bar HTML with class-specific skills
  const classSkills = classConfig.skills;
  const skillBarEl = document.getElementById('skill-bar');
  if (skillBarEl && classSkills) {
    const keys = ['q', 'e', 'r', 't'];
    skillBarEl.innerHTML = classSkills.map((sid, i) => {
      const skill = SKILLS[sid];
      return `<div class="skill-slot" id="skill-${keys[i]}"><span class="key">${keys[i].toUpperCase()}</span><span style="font-size:16px;">${skill?.icon || '?'}</span><span style="font-size:8px;">${skill?.name || sid}</span></div>`;
    }).join('');
  }

  // Yellow glow disabled — see classColorEl note above.
  const playerGlow = null;

  // Add drop shadow under player
  const playerShadow = document.createElement('div');
  playerShadow.style.cssText = 'position:fixed;width:40px;height:12px;background:radial-gradient(ellipse,rgba(0,0,0,0.4) 0%,transparent 70%);pointer-events:none;z-index:43;border-radius:50%;';
  document.body.appendChild(playerShadow);

  // Class modifiers over runtime-tuned defaults: stat multipliers + passives
  const classStats = CLASS_STATS[classId] || CLASS_STATS.warrior;
  const classHp = Math.round(runtimePlayerDefaults.maxHp * classStats.hpMult);
  const classMp = Math.round(runtimePlayerDefaults.maxMp * classStats.mpMult);
  const playerEntity = createEntity({
    isPlayer: true,
    name: 'SEED Cadet',
    classId,
    level: 1,
    pos: { x: spawnTile.x, y: spawnTile.y },
    targetPos: null,
    path: null,
    direction: 'S',
    isMoving: false,
    attackTarget: null,
    lastAttack: 0,
    attackCooldownMs: runtimePlayerDefaults.attackCooldownMs,
    baseAttackCooldownMs: runtimePlayerDefaults.attackCooldownMs,
    attackRange: runtimePlayerDefaults.attackRange * classStats.rangeMult,
    baseAttackRange: runtimePlayerDefaults.attackRange * classStats.rangeMult,
    hitRadius: runtimePlayerDefaults.hitRadius ?? PLAYER_DEFAULTS.hitRadius,
    critChance: classStats.critChance ?? runtimePlayerDefaults.critChance ?? PLAYER_DEFAULTS.critChance,
    damageTakenMult: classStats.damageTakenMult ?? 1,
    skillDamageMult: classStats.skillDamageMult ?? 1,
    stats: {
      hp: classHp,
      maxHp: classHp,
      mp: classMp,
      maxMp: classMp,
      speed: runtimePlayerDefaults.speed * classStats.speedMult,
      damage: Math.round(runtimePlayerDefaults.attackDamage * classStats.damageMult),
      baseDamage: Math.round(runtimePlayerDefaults.attackDamage * classStats.damageMult),
    },
    skillCooldowns: {},
    sprite: playerSprite,
    baseTint: CLASS_SPRITE_TINTS[classId] || 0xffffff,
    animations: playerVisual.animations,
    animationState: 'idle',
  });
  world.addEntity(playerEntity);
  camera.container.addChild(playerSprite);
  telemetry.bindPlayer(playerEntity);

  // ---- Init Game Systems ----
  progressionSystem = new ProgressionSystem(playerEntity, emitEvent);
  const inventorySystem = new InventorySystem(playerEntity, emitEvent);
  const riftSystem = new RiftSystem(playerEntity, world, assets, camera, emitEvent, progressionSystem, inventorySystem);
  // Default portal — Minimap reads world.portalPos; keep it in sync with
  // rift-system's fallback in case A/B assignment is skipped.
  world.portalPos = riftSystem.portalPos;
  // Hand the A/B-assigned map bundle over so the rift renders the
  // assigned dungeon variant instead of the procedural fallback.
  if (abAssignment?.mapConfig) {
    riftSystem.setVariantMaps(abAssignment.mapConfig);
    // Move the garden's portal marker so the "Press F to enter Rift"
    // prompt shows near the actual assigned portal tile.
    if (abAssignment.mapConfig.garden?.portal) {
      riftSystem.portalPos = { ...abAssignment.mapConfig.garden.portal };
      // Mirror to world so systems that don't hold a riftSystem ref
      // (Minimap) can read the portal tile directly.
      world.portalPos = riftSystem.portalPos;
    }
  }

  // ---- Init UI ----
  const agentPanel = new AgentPanel(telemetry, abTesting, dataLog, progressionSystem);
  agentPanel.init();

  const shopUI = new ShopUI(inventorySystem, {
    emitEvent,
    playerId,
    getPlayerPos: () => playerEntity.pos,
  });
  shopUI.init();

  const purchaseUI = new PurchaseSimulator(inventorySystem, emitEvent);
  purchaseUI.init();

  const minimap = new Minimap(world, playerEntity);
  minimap.init();

  const lighting = new LightingSystem();

  // ---- Shop Merchant NPC ----
  const merchantSprite = assets.anim('magician', 'frame_', 6, true);
  merchantSprite.anchor.set(0.5, 0.8);
  merchantSprite.scale.set(0.65);
  merchantSprite.stop();
  merchantSprite.gotoAndStop(0);
  const merchantPos = { x: 4, y: 6 };
  const mScreen = tileToScreen(merchantPos.x, merchantPos.y);
  merchantSprite.x = mScreen.x;
  merchantSprite.y = mScreen.y;
  camera.container.addChild(merchantSprite);

  // Merchant name label (HTML overlay)
  const merchantLabel = document.createElement('div');
  merchantLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:60;font-family:monospace;font-size:10px;color:#e8ff47;text-align:center;text-shadow:1px 1px 2px #000;';
  merchantLabel.textContent = 'MERCHANT';
  document.body.appendChild(merchantLabel);

  // Merchant interaction prompt
  const merchantPrompt = document.createElement('div');
  merchantPrompt.style.cssText = 'position:fixed;pointer-events:none;z-index:60;font-family:monospace;font-size:12px;color:#e8ff47;text-align:center;background:rgba(10,6,18,0.85);padding:4px 12px;border:1px solid rgba(232,255,71,0.4);border-radius:4px;display:none;';
  merchantPrompt.textContent = 'Press F — Talk to Merchant';
  document.body.appendChild(merchantPrompt);

  // ---- Spawn Enemies ----
  function spawnEnemy(type, x, y) {
    const def = ENEMIES[type];
    const playerLevel = progressionSystem?.level || 1;
    const scaled = scaleEnemyStats(def, { playerLevel });
    const isShadowSlime = type === 'shadowBeast';
    const visual = createStatefulSprite(assets, isShadowSlime ? SLIME_ANIMATION_PROFILE : ORC_ANIMATION_PROFILE, {
      scale: isShadowSlime ? 2 : 2.3,
      anchorY: 0.68,
    });
    const sprite = visual.sprite;

    const entity = createEntity({
      isEnemy: true, enemyType: type, name: def.name,
      pos: { x, y }, spawnPos: { x, y }, targetPos: null, path: null,
      direction: 'S', isMoving: false, aiState: 'idle',
      patrolTimer: Math.random() * 3, lastAttack: 0,
      attackCooldownMs: def.attackCooldownMs, attackRange: def.attackRange,
      hitRadius: def.hitRadius,
      level: playerLevel,
      stats: { hp: scaled.hp, maxHp: scaled.hp, damage: scaled.damage, speed: scaled.speed },
      xpReward: scaled.xpReward,
      goldMult: scaled.goldMultiplier,
      sprite,
      animations: visual.animations,
      animationState: 'idle',
      hasShadow: true,
    });

    world.addEntity(entity);
    camera.container.addChild(sprite);
    emitEvent(createEvent(EventType.ENEMY_SPAWN, entity.id, {
      actorId: entity.id, actorType: 'enemy', enemyType: type,
      enemyLevel: playerLevel, playerLevel, area: 'seed_garden',
      hpAfter: scaled.hp, damage: scaled.damage,
      position: { x, y }, scaling: scaled.multipliers,
    }));
    return entity;
  }

  function handleEnemyDefeated(target) {
    if (!target || target.isDying) return;
    target.isDying = true;
    target.aiState = 'dead';
    target.targetPos = null;
    target.path = [];
    setEntityAnimation(target, 'death', true);

    const screen = tileToScreen(target.pos.x, target.pos.y);
    const sx = screen.x + camera.container.x;
    const sy = screen.y + camera.container.y - 30;
    const drops = GOLD_DROPS[target.enemyType] || { min: 5, max: 15 };
    const rolled = drops.min + Math.floor(Math.random() * (drops.max - drops.min + 1));
    const gold = Math.round(rolled * (target.goldMult || 1));
    // inventory.gold is canonical (shop spends from it); progression mirrors it
    inventorySystem.gold += gold;
    progressionSystem.gold = inventorySystem.gold;
    progressionSystem.addKill(target.enemyType);
    progressionSystem.addXP(target.xpReward ?? ENEMIES[target.enemyType]?.xpReward ?? 25, 'kill');
    showGoldDrop(sx, sy - 20, gold);
    for (const drop of ITEM_DROPS[target.enemyType] || []) {
      if (Math.random() < drop.chance) inventorySystem.addItem(drop.itemId);
    }

    setTimeout(() => {
      if (target.sprite) target.sprite.alpha = 0;
      if (target.sprite?.parent) target.sprite.parent.removeChild(target.sprite);
      world.removeEntity(target.id);
    }, 820);
  }

  if (!riftSystem.inDungeon) {
    if (gardenMap?.enemySpawns?.length) {
      // Use the assigned patch's hand-designed enemy positions.
      for (const s of gardenMap.enemySpawns) {
        spawnEnemy(s.type || 'shadowBeast', s.x, s.y);
      }
    } else {
      // Legacy 20x20 procedural fallback: enemies AWAY from player start.
      spawnEnemy('shadowBeast', 3, 3);     // stable ID; presented as Rift Slime
      spawnEnemy('shadowBeast', 14, 4);    // upper-right
      spawnEnemy('shadowBeast', 3, 14);    // lower-left
      spawnEnemy('shadowBeast', 14, 14);   // lower-right
      spawnEnemy('shadowBeast', 10, 3);    // near portal
      spawnEnemy('riftKnight', 15, 10);    // far right boss
    }
  }

  // ---- A/B Data Collection Samplers ----
  // Only meaningful once we have a real session (i.e. the handshake worked).
  // trajectory-sampler produces the canonical path artifact; defect-detector
  // flags stuck / errored playthroughs.
  let trajSampler = null;
  let defectDetector = null;
  if (abAssignment) {
    trajSampler = new TrajectorySampler({
      player: playerEntity,
      emit: emitEvent,
      playerId,
      getZone: () => (riftSystem.inDungeon ? 'dungeon' : 'garden'),
    });
    trajSampler.start();
    defectDetector = new DefectDetector({
      player: playerEntity,
      emit: emitEvent,
      playerId,
    });
    defectDetector.start();

    // Small HUD chip so testers can visually confirm the variant.
    const chip = document.createElement('div');
    chip.textContent = `${abAssignment.variant} · ${abAssignment.patchName}`;
    chip.title = `session ${abAssignment.sessionId}`;
    chip.style.cssText = 'position:fixed;bottom:8px;left:8px;padding:4px 10px;background:rgba(10,6,18,0.85);color:#e8ff47;font:11px/1.2 monospace;border:1px solid #e8ff47;border-radius:4px;z-index:900;pointer-events:none;';
    document.body.appendChild(chip);
  }

  // ---- Portal (animated CSS effect) ----
  const { createPortal } = await import('./presentation/portal-effect.js');
  const portalEl = createPortal();
  // Draw the portal effect on the SAME tile the rift-system uses to gate
  // entry, so what the player sees matches what "Press F" checks.
  const portalPos = { ...riftSystem.portalPos };

  // ---- Input ----
  const { keys, getMovementInput } = setupInput({
    canvas: app.view,
    camera,
    player: playerEntity,
    world,
    emitEvent,
    skillKeys: classSkills,
    useSkillFn: (attacker, skillId, target, targetPos, emit) => {
      const result = useSkill(attacker, skillId, target, targetPos, emit, world);
      if (result.success) {
        progressionSystem.addSkillUse();
        if (target?.pos) {
          playerEntity.direction = getDirection(
            target.pos.x - playerEntity.pos.x,
            target.pos.y - playerEntity.pos.y,
          );
        }
        triggerAttackAnimation(playerEntity, animationStateForSkill(skillId, classId));
        const effectTarget = target && result.result?.hit ? target : playerEntity;
        const ps = tileToScreen(effectTarget.pos.x, effectTarget.pos.y);
        const sx = ps.x + camera.container.x;
        const sy = ps.y + camera.container.y - 30;
        showSkillEffect(skillId, sx, sy);
        if (result.result?.damage) showDamageHit(sx, sy, result.result.damage, false);
        if (result.result?.killed && target) handleEnemyDefeated(target);
        for (const hit of result.result?.hits || []) {
          const enemy = world.getEntity(hit.id);
          if (!enemy) continue;
          const hitPos = tileToScreen(enemy.pos.x, enemy.pos.y);
          showDamageHit(hitPos.x + camera.container.x, hitPos.y + camera.container.y - 30, hit.damage, false);
          if (hit.killed) handleEnemyDefeated(enemy);
        }
      }
      return result;
    },
  });

  // ---- Additional Key Handlers ----
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // F — interact (rift portal or shop). Merchant is garden-only; block
    // the shop toggle while the player is inside a rift so they can't
    // restock mid-run (matches the "no mid-dungeon shopping" design).
    if (key === 'f') {
      if (riftSystem.showPrompt) {
        riftSystem.enterRift();
      } else if (!riftSystem.inDungeon && tileDistance(playerEntity.pos, merchantPos) < 2) {
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
    // Rift Shard — open the Rift from anywhere in the garden.
    // Only consumed if entry succeeds (tier 2+ still needs a Rift Key).
    if (key === '3' && inventorySystem.hasItem('rift_shard') && !riftSystem.inDungeon) {
      riftSystem.enterRift();
      if (riftSystem.inDungeon) inventorySystem.useItem('rift_shard');
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
    actorId: playerEntity.id,
    actorType: 'player',
    classId,
    area: 'seed_garden',
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

    // Auto-target nearest enemy ONLY for attack (don't move toward them)
    if (!playerEntity.attackTarget) {
      let nearest = null;
      let minDist = Infinity;
      for (const e of world.query('isEnemy', 'pos', 'stats')) {
        if (e.stats.hp <= 0) continue;
        const d = combatDistance(playerEntity, e);
        if (d < minDist) { minDist = d; nearest = e; }
      }
      // Only auto-target if enemy is RIGHT next to player (edge-to-edge)
      if (nearest && minDist < 1.5) {
        playerEntity.attackTarget = nearest;
      }
    }

    // Player attack target — only attack if in range, don't auto-walk
    if (playerEntity.attackTarget) {
      const target = playerEntity.attackTarget;
      if (target.stats.hp > 0) {
        const dist = combatDistance(playerEntity, target);
        const attackRange = getEffectiveAttackRange(playerEntity);
        if (dist <= attackRange) {
          playerEntity.targetPos = null;
          playerEntity.path = [];
          playerEntity.direction = getDirection(
            target.pos.x - playerEntity.pos.x,
            target.pos.y - playerEntity.pos.y,
          );
          const result = meleeAttack(playerEntity, target, emitEvent);
          if (result.hit) {
            triggerAttackAnimation(playerEntity);
            const screen = tileToScreen(target.pos.x, target.pos.y);
            const sx = screen.x + camera.container.x;
            const sy = screen.y + camera.container.y - 30;
            showDamageHit(sx, sy, result.damage, result.isCrit);
            if (result.isCrit) screenShake(4, 150);
            if (result.killed) {
              playerEntity.attackTarget = null;
              handleEnemyDefeated(target);
            }
          }
        }
        // If out of range, don't auto-walk — just clear target
        else if (dist > attackRange + 1) {
          playerEntity.attackTarget = null;
        }
      } else {
        playerEntity.attackTarget = null;
      }
    }

    // WASD movement — bounds from live grid + wall collision
    const { dx, dy } = getMovementInput();
    playerEntity.manualMovement = !playerEntity.isDying && (dx !== 0 || dy !== 0);
    if (!playerEntity.isDying && (dx !== 0 || dy !== 0)) {
      const speed = (playerEntity.stats.speed || 3) * 0.05;
      playerEntity.direction = getDirection(dx, dy);
      const cols = world.grid[0]?.length || 20;
      const rows = world.grid.length || 20;
      // Player center stays half a tile inside the perimeter wall so the
      // sprite never overlaps the map edge.
      const nx = Math.max(0.5, Math.min(cols - 1.5, playerEntity.pos.x + dx * speed));
      const ny = Math.max(0.5, Math.min(rows - 1.5, playerEntity.pos.y + dy * speed));
      // Wall collision: check the tile under the proposed feet position
      // independently for X and Y so the player can slide along a wall.
      const tileYSameX = Math.round(playerEntity.pos.y);
      const tileXNew   = Math.round(nx);
      if (!isBlocked(world.grid[tileYSameX]?.[tileXNew])) {
        playerEntity.pos.x = nx;
      }
      const tileXSameY = Math.round(playerEntity.pos.x);
      const tileYNew   = Math.round(ny);
      if (!isBlocked(world.grid[tileYNew]?.[tileXSameY])) {
        playerEntity.pos.y = ny;
      }
      playerEntity.isMoving = true;
      playerEntity.targetPos = null;
      playerEntity.path = null;
    }

    // Run systems
    movementSystem(world, dt, emitEvent);
    enemyAISystem(world, dt, emitEvent);
    animationSystem(world);
    spriteSyncSystem(world, dt);
    depthSortSystem(world, dt);
    playerCombatSystem(world, dt);

    // Camera follow
    const playerScreen = tileToScreen(playerEntity.pos.x, playerEntity.pos.y);
    camera.follow(playerScreen.x, playerScreen.y);
    camera.update();

    // Only the black drop shadow is drawn now; glow + class-tint overlays
    // were removed so the visible footprint matches the tile hitbox.
    playerShadow.style.left = `${playerScreen.x + camera.container.x - 20}px`;
    playerShadow.style.top = `${playerScreen.y + camera.container.y - 10}px`;

    // Update lighting
    lighting.update(playerScreen.x, playerScreen.y);

    // Telemetry tick
    telemetry.observePlayerState(playerEntity, {
      area: riftSystem.inDungeon ? `rift_tier_${riftSystem.dungeonTier}` : 'seed_garden',
      classId,
    });
    telemetry.tick();

    // Update enemy health bars
    updateEnemyHealthBars(world, camera);

    // HUD
    updateHUD();

    // Merchant proximity — garden only. Hide label + prompt + sprite while
    // inside the rift so the merchant can't be seen or interacted with
    // through the dungeon layer.
    if (riftSystem.inDungeon) {
      merchantLabel.style.display = 'none';
      merchantPrompt.style.display = 'none';
      merchantSprite.visible = false;
    } else {
      merchantSprite.visible = true;
      merchantLabel.style.display = '';
      const merchantScreen = tileToScreen(merchantPos.x, merchantPos.y);
      merchantLabel.style.left = `${merchantScreen.x + camera.container.x - 30}px`;
      merchantLabel.style.top = `${merchantScreen.y + camera.container.y - 60}px`;
      const merchantDist = tileDistance(playerEntity.pos, merchantPos);
      if (merchantDist < 2.5) {
        merchantPrompt.style.display = 'block';
        merchantPrompt.style.left = `${merchantScreen.x + camera.container.x - 70}px`;
        merchantPrompt.style.top = `${merchantScreen.y + camera.container.y - 80}px`;
      } else {
        merchantPrompt.style.display = 'none';
      }
    }

    // Portal proximity glow (CSS portal)
    if (!riftSystem.inDungeon) {
      const portalDist = tileDistance(playerEntity.pos, portalPos);
      const pScreen = tileToScreen(portalPos.x, portalPos.y);
      portalEl.style.left = `${pScreen.x + camera.container.x - 30}px`;
      portalEl.style.top = `${pScreen.y + camera.container.y - 40}px`;
      portalEl.style.opacity = portalDist < 2.5 ? '1' : '0.7';
    } else {
      portalEl.style.opacity = '0';
    }

    // Player death check
    if (playerEntity.stats.hp <= 0 && !playerEntity.isDying) {
      playerEntity.isDying = true;
      playerEntity.targetPos = null;
      playerEntity.path = [];
      playerEntity.attackTarget = null;
      playerEntity.isMoving = false;
      playerEntity.isAttacking = false;
      playerEntity.actionAnimationState = null;
      flashRed();
      showDefeat({ waves: riftSystem.currentWave, kills: progressionSystem.kills });
      setEntityAnimation(playerEntity, 'death', true);
      recordMatchToServer(); // persist the run so the dashboard analytics have data
      setTimeout(() => {
        playerEntity.stats.hp = playerEntity.stats.maxHp;
        playerEntity.isDying = false;
      }, 820);
    }
  });

  // Periodic flush + session stat sync (keeps the dashboard analytics live)
  let lastMatchSyncAt = Date.now();
  setInterval(() => {
    dataLog.flush();
    telemetry.flush();
    if (Date.now() - lastMatchSyncAt >= 30000) {
      lastMatchSyncAt = Date.now();
      recordMatchToServer();
    }
  }, 5000);

  // ---- Match recording (persists player usage to the server database) ----
  function buildMatchRecord() {
    const counters = telemetry.getSnapshot().counters || {};
    const skillsUsed = Object.entries(counters)
      .reduce((sum, [key, value]) => key.startsWith('skill_') && key.endsWith('_usage') ? sum + value : sum, 0);
    return {
      playerId: telemetry.playerId,
      sessionStart: new Date(telemetry.sessionStartedAt).toISOString(),
      sessionEnd: new Date().toISOString(),
      kills: telemetry.outcomes.kills,
      deaths: telemetry.outcomes.playerDeaths,
      goldEarned: inventorySystem.gold,
      xpEarned: progressionSystem?.xp ?? 0,
      levelReached: progressionSystem?.level ?? 1,
      rankReached: progressionSystem?.rank ?? 'D',
      wavesCleared: riftSystem.currentWave || 0,
      skillsUsed,
      damageDealt: Math.round(telemetry.damage.dealt.total),
      damageTaken: Math.round(telemetry.damage.received.total),
      durationSeconds: (Date.now() - telemetry.sessionStartedAt) / 1000,
      classType: classId,
    };
  }
  function recordMatchToServer({ beacon = false } = {}) {
    // The server upserts by (playerId, sessionStart), so repeated sends just
    // refresh this session's row. Skip only near-empty sessions.
    if (telemetry.totalRecorded < 10) return;
    const body = JSON.stringify(buildMatchRecord());
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(`${API_BASE}/api/matches`, body);
      return;
    }
    fetch(`${API_BASE}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }
  window.recordMatchToServer = recordMatchToServer;

  window.addEventListener('beforeunload', () => {
    emitEvent(createEvent(EventType.SESSION_END, playerEntity.id, {
      actorId: playerEntity.id,
      actorType: 'player',
      durationMs: Date.now() - telemetry.sessionStartedAt,
      kills: telemetry.outcomes.kills,
      deaths: telemetry.outcomes.playerDeaths,
    }));
    telemetry.flush();
    recordMatchToServer({ beacon: true });
  });

  // Deterministic hooks used by the web-game play-test client.
  window.render_game_to_text = () => JSON.stringify({
    coordinateSystem: 'tile grid; origin top-left; +x right; +y down',
    mode: riftSystem.inDungeon ? `rift_tier_${riftSystem.dungeonTier}` : 'seed_garden',
    player: {
      classId,
      x: Number(playerEntity.pos.x.toFixed(2)),
      y: Number(playerEntity.pos.y.toFixed(2)),
      hp: Number(playerEntity.stats.hp.toFixed(1)),
      maxHp: playerEntity.stats.maxHp,
      mp: Number(playerEntity.stats.mp.toFixed(1)),
      animation: playerEntity.animationState,
      moving: playerEntity.isMoving,
      attacking: Boolean(playerEntity.isAttacking),
      dying: Boolean(playerEntity.isDying),
      direction: playerEntity.direction,
      facing: playerEntity.sprite.scale.x < 0 ? 'left' : 'right',
      tint: `#${(playerEntity.baseTint || 0xffffff).toString(16).padStart(6, '0')}`,
      targetId: playerEntity.attackTarget?.id || null,
      classId,
      level: progressionSystem.level,
      equippedWeaponId: playerEntity.equippedWeaponId || null,
      basicAttackDamage: computeBaseDamage(playerEntity),
      effectiveAttackRange: Number(getEffectiveAttackRange(playerEntity).toFixed(2)),
    },
    enemies: world.query('isEnemy', 'pos', 'stats').filter(enemy => enemy.stats.hp > 0).map(enemy => ({
      id: enemy.id,
      type: enemy.enemyType,
      x: Number(enemy.pos.x.toFixed(2)),
      y: Number(enemy.pos.y.toFixed(2)),
      hp: Number(enemy.stats.hp.toFixed(1)),
      animation: enemy.animationState,
      ai: enemy.aiState,
    })),
    progression: {
      kills: progressionSystem.kills,
      level: progressionSystem.level,
      gold: inventorySystem.gold,
    },
    controls: 'WASD/arrows move; click enemy attacks; Q/E/R/T skills; F interact; Tab telemetry',
  });

  window.advanceTime = async (ms) => {
    const steps = Math.max(1, Math.ceil(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) {
      app.ticker.update(app.ticker.lastTime + 1000 / 60);
    }
  };

  console.log('[RiftSEED] Game initialized. WASD=move, click=move/attack, QWER=skills, F=interact, I=inventory, Tab=agents, P=shop');
}

async function loadRuntimeBalance() {
  try {
    const response = await fetch(`${API_BASE}/api/runtime-config`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    for (const [enemyId, values] of Object.entries(config.enemies || {})) {
      if (ENEMIES[enemyId]) Object.assign(ENEMIES[enemyId], values);
    }
    for (const [skillId, values] of Object.entries(config.skills || {})) {
      if (SKILLS[skillId]) Object.assign(SKILLS[skillId], values);
    }
    console.log('[Balance] Loaded approved server config');
    return { ...PLAYER_DEFAULTS, ...(config.player || {}) };
  } catch (error) {
    console.warn('[Balance] Using bundled defaults:', error.message);
    return { ...PLAYER_DEFAULTS };
  }
}
