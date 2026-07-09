// ============================================================
// Rift System — portal interaction, dungeon instances
// ============================================================
import { EventType, createEvent } from '@shared/events.js';
import { RIFT_WAVES, ENEMIES } from '@shared/config.js';
import { tileDistance, tileToScreen } from '../engine/isometric.js';
import { generateDungeonMap } from '../engine/tilemap.js';
import { createEntity } from '../engine/ecs.js';

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
    this.waveTimer = 0;
    this.dungeonCleared = false;

    this._originalGrid = null;
    this._promptEl = null;
  }

  update(dt) {
    if (this.inDungeon) {
      this._updateDungeon(dt);
      return;
    }

    // Check proximity to portal
    const dist = tileDistance(this.player.pos, this.portalPos);
    if (dist < 2) {
      this.showPrompt = true;
      if (!this._promptEl) {
        this._promptEl = document.createElement('div');
        this._promptEl.style.cssText = 'position:fixed;bottom:140px;left:50%;transform:translateX(-50%);background:rgba(10,6,18,0.9);border:2px solid #e8ff47;padding:8px 20px;color:#e8ff47;font-family:monospace;font-size:14px;border-radius:6px;z-index:200;';
        this._promptEl.textContent = 'Press F to Enter Rift';
        document.body.appendChild(this._promptEl);
      }
    } else {
      this.showPrompt = false;
      if (this._promptEl) {
        this._promptEl.remove();
        this._promptEl = null;
      }
    }
  }

  enterRift() {
    if (this.inDungeon || this.showPrompt === false) return;
    this.inDungeon = true;
    this.currentWave = 0;
    this.dungeonCleared = false;
    this.dungeonEnemies = [];

    // Remove portal prompt
    if (this._promptEl) { this._promptEl.remove(); this._promptEl = null; }

    // Generate dungeon grid
    const dungeon = generateDungeonMap(12, 12);
    this._originalGrid = this.world.grid;
    this.world.grid = dungeon.grid;

    // Clear existing enemies from world
    for (const e of this.world.query('isEnemy')) {
      if (e.sprite?.parent) e.sprite.parent.removeChild(e.sprite);
      this.world.removeEntity(e.id);
    }

    // Re-render tilemap
    this._rebuildTilemap(dungeon.grid);

    // Move player to dungeon start
    this.player.pos = { x: 2, y: 2 };
    this.player.targetPos = null;
    this.player.path = null;

    // Start first wave
    this._startWave(0);

    this.emitEvent(createEvent(EventType.RIFT_ENTER, this.player.id, { tier: this.dungeonTier }));
    this._showAnnouncement('RIFT ENTERED — Tier ' + this.dungeonTier);
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

    // Spawn enemies after delay
    setTimeout(() => {
      if (!this.inDungeon) return;
      for (let i = 0; i < wave.count; i++) {
        const x = 3 + Math.floor(Math.random() * 6);
        const y = 3 + Math.floor(Math.random() * 6);
        this._spawnEnemy(wave.type, x, y);
      }
    }, wave.delay * 1000);
  }

  _spawnEnemy(type, x, y) {
    const def = ENEMIES[type] || ENEMIES.shadowBeast;
    const sheetKey = type === 'shadowBeast' ? 'shadowBeast' : 'riftKnight';
    const sprite = this.assets.anim(sheetKey, 'frame_', 8, true);
    sprite.anchor.set(0.5, 0.8);
    sprite.scale.set(0.25);

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
      walkAnim: Object.values(this.assets.sheets[sheetKey].textures).sort(),
      idleAnim: Object.values(this.assets.sheets[sheetKey].textures).sort().slice(0, 4),
    });

    this.world.addEntity(entity);
    this.camera.container.addChild(sprite);
    this.dungeonEnemies.push(entity.id);
  }

  _updateDungeon(dt) {
    if (this.dungeonCleared) return;

    // Check if all enemies in current wave are dead
    if (this.waveActive) {
      const alive = this.dungeonEnemies.filter(id => {
        const e = this.world.getEntity(id);
        return e && e.stats.hp > 0;
      });

      if (alive.length === 0) {
        this.waveActive = false;
        this.dungeonEnemies = [];
        const waves = RIFT_WAVES[this.dungeonTier];
        this._startWave(this.currentWave + 1);
      }
    }
  }

  _dungeonComplete() {
    this.dungeonCleared = true;
    this.progression.addRiftClear();
    this.progression.addXP(150, 'rift_clear');
    this._showAnnouncement('RIFT CLEARED! +150 XP');

    this.emitEvent(createEvent(EventType.RIFT_EXIT, this.player.id, {
      tier: this.dungeonTier,
      result: 'cleared',
    }));

    // Return to garden after 3 seconds
    setTimeout(() => this.exitRift(), 3000);
  }

  exitRift() {
    this.inDungeon = false;

    // Clear dungeon enemies
    for (const id of this.dungeonEnemies) {
      const e = this.world.getEntity(id);
      if (e?.sprite?.parent) e.sprite.parent.removeChild(e.sprite);
      this.world.removeEntity(id);
    }
    this.dungeonEnemies = [];

    // Restore garden grid
    if (this._originalGrid) {
      this.world.grid = this._originalGrid;
      this._rebuildTilemap(this._originalGrid);
    }

    // Move player back to garden
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
    // Re-render
    const { renderTileMap } = require ? {} : {};
    // Simple: just import dynamically
    import('../engine/tilemap.js').then(mod => {
      mod.renderTileMap(this.assets, grid, this.camera.container);
    });
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
