// ============================================================
// Rift System — portal interaction, dungeon instances
// ============================================================
import { EventType, createEvent } from '@rift-seed/shared/events';
import { RIFT_WAVES, ENEMIES } from '@rift-seed/shared/config';
import { tileDistance, tileToScreen } from '../core/isometric.js';
import { generateDungeonMap, renderTileMap } from '../core/tilemap.js';
import { createEntity } from '../core/ecs.js';
import { createStatefulSprite, enemyAnimationProfile, SLIME_ANIMATION_PROFILE } from './animation-system.js';

export class RiftSystem {
  constructor(player, world, assets, camera, emitEvent, progression) {
    this.player = player;
    this.world = world;
    this.assets = assets;
    this.camera = camera;
    this.emitEvent = emitEvent;
    this.progression = progression;

    this.portalPos = { x: 8, y: 3 };
    this.inDungeon = false;
    this.dungeonTier = 1;
    this.showPrompt = false;
    this.dungeonEnemies = [];
    this.currentWave = 0;
    this.waveActive = false;
    this.dungeonCleared = false;

    this._originalGrid = null;
    this._promptEl = null;
    this._tileContainer = null;
  }

  /** Store reference to the tile container for rebuilding */
  setTileContainer(container) {
    this._tileContainer = container;
  }

  update(dt) {
    if (this.inDungeon) {
      this._updateDungeon(dt);
      return;
    }

    const dist = tileDistance(this.player.pos, this.portalPos);
    if (dist < 2.5 && !this.showPrompt) {
      this.showPrompt = true;
      this._promptEl = document.createElement('div');
      this._promptEl.style.cssText = 'position:fixed;bottom:140px;left:50%;transform:translateX(-50%);background:rgba(10,6,18,0.9);border:2px solid #e8ff47;padding:8px 20px;color:#e8ff47;font-family:monospace;font-size:14px;border-radius:6px;z-index:200;pointer-events:none;';
      this._promptEl.textContent = 'Press F to Enter Rift';
      document.body.appendChild(this._promptEl);
    } else if (dist >= 2.5 && this.showPrompt) {
      this.showPrompt = false;
      if (this._promptEl) { this._promptEl.remove(); this._promptEl = null; }
    }
  }

  enterRift() {
    if (this.inDungeon) return;
    this.inDungeon = true;
    this.currentWave = 0;
    this.dungeonCleared = false;
    this.dungeonEnemies = [];

    if (this._promptEl) { this._promptEl.remove(); this._promptEl = null; }
    this.showPrompt = false;

    // Generate dungeon
    const dungeon = generateDungeonMap(12, 12);
    this._originalGrid = this.world.grid;
    this.world.grid = dungeon.grid;

    // Clear enemies
    for (const e of this.world.query('isEnemy')) {
      if (e.sprite?.parent) e.sprite.parent.removeChild(e.sprite);
      this.world.removeEntity(e.id);
    }

    // Rebuild tilemap
    this._rebuildTilemap(dungeon.grid);

    // Move player
    this.player.pos = { x: 2, y: 2 };
    this.player.targetPos = null;
    this.player.path = null;
    this.player.attackTarget = null;

    this._showAnnouncement('RIFT ENTERED — Tier ' + this.dungeonTier);
    this.emitEvent(createEvent(EventType.RIFT_ENTER, this.player.id, { tier: this.dungeonTier }));

    // Start first wave after delay
    setTimeout(() => this._startWave(0), 2000);
  }

  _startWave(waveIndex) {
    const waves = RIFT_WAVES[this.dungeonTier];
    if (!waves || waveIndex >= waves.length) {
      this._dungeonComplete();
      return;
    }

    this.currentWave = waveIndex;
    const wave = waves[waveIndex];
    this.waveActive = true;

    this._showAnnouncement(`WAVE ${waveIndex + 1}/${waves.length}`);

    setTimeout(() => {
      if (!this.inDungeon) return;
      for (let i = 0; i < wave.count; i++) {
        const x = 3 + Math.floor(Math.random() * 6);
        const y = 3 + Math.floor(Math.random() * 6);
        this._spawnEnemy(wave.type, x, y);
      }
    }, (wave.delay || 2) * 1000);
  }

  _spawnEnemy(type, x, y) {
    const def = ENEMIES[type] || ENEMIES.shadowBeast;
    const isShadowSlime = type === 'shadowBeast';
    const visual = createStatefulSprite(this.assets, isShadowSlime ? SLIME_ANIMATION_PROFILE : enemyAnimationProfile('heroHeavy'), {
      scale: isShadowSlime ? 2 : 1.05,
      anchorY: 0.82,
    });
    const sprite = visual.sprite;
    const entity = createEntity({
      isEnemy: true, enemyType: type, name: def.name,
      pos: { x, y }, spawnPos: { x, y }, targetPos: null, path: null,
      direction: 'S', isMoving: false, aiState: 'idle',
      patrolTimer: Math.random() * 3, lastAttack: 0,
      attackCooldownMs: def.attackCooldownMs, attackRange: def.attackRange,
      stats: { hp: def.hp, maxHp: def.hp, damage: def.damage, speed: def.speed },
      sprite,
      animations: visual.animations,
      animationState: 'idle',
    });

    this.world.addEntity(entity);
    this.camera.container.addChild(sprite);
    this.dungeonEnemies.push(entity.id);
  }

  _updateDungeon(dt) {
    if (this.dungeonCleared || !this.waveActive) return;

    const alive = this.dungeonEnemies.filter(id => {
      const e = this.world.getEntity(id);
      return e && e.stats.hp > 0;
    });

    if (alive.length === 0) {
      this.waveActive = false;
      this.dungeonEnemies = [];
      const waves = RIFT_WAVES[this.dungeonTier];
      setTimeout(() => this._startWave(this.currentWave + 1), 1500);
    }
  }

  _dungeonComplete() {
    this.dungeonCleared = true;
    this.progression.addRiftClear();
    this.progression.addXP(150, 'rift_clear');
    this._showAnnouncement('RIFT CLEARED! +150 XP');
    this.emitEvent(createEvent(EventType.RIFT_EXIT, this.player.id, { tier: this.dungeonTier, result: 'cleared' }));
    setTimeout(() => this.exitRift(), 3000);
  }

  exitRift() {
    this.inDungeon = false;
    for (const id of this.dungeonEnemies) {
      const e = this.world.getEntity(id);
      if (e?.sprite?.parent) e.sprite.parent.removeChild(e.sprite);
      this.world.removeEntity(id);
    }
    this.dungeonEnemies = [];

    if (this._originalGrid) {
      this.world.grid = this._originalGrid;
      this._rebuildTilemap(this._originalGrid);
    }

    this.player.pos = { x: 8, y: 8 };
    this.player.targetPos = null;
    this.player.path = null;
    this.player.stats.hp = this.player.stats.maxHp;
    this.player.stats.mp = this.player.stats.maxMp;
  }

  _rebuildTilemap(grid) {
    // Remove old tiles
    const toRemove = this.camera.container.children.filter(c => c.tileType !== undefined);
    toRemove.forEach(c => this.camera.container.removeChild(c));
    // Render new tiles
    renderTileMap(this.assets, grid, this.camera.container);
  }

  _showAnnouncement(text) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#e8ff47;font-family:monospace;font-size:28px;font-weight:bold;text-shadow:0 0 20px #e8ff47;z-index:300;pointer-events:none;opacity:1;transition:opacity 1s;';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 1500);
    setTimeout(() => el.remove(), 2500);
  }
}
