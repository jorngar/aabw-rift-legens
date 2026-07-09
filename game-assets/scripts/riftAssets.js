// =============================================================
// pixi.js asset loader for the Rift SEED hackathon asset pack.
// Drop this file + the atlases/ + sheets/ + sliced frames into
// your pixi.js project's public/ folder, then call:
//
//   import { loadRiftAssets } from './riftAssets.js';
//   const assets = await loadRiftAssets(app);
//
// Then assets.sprites.seedCadetWalk gives you an AnimatedSprite,
// assets.tiles.terrainGarden[0] gives you the first ground tile, etc.
// =============================================================

import * as PIXI from 'pixi.js';

const ASSET_BASE = ''; // Vite serves publicDir contents at root

// Each entry: [key, sheetFilename, atlasFilename]
const SHEETS = [
  ['seedCadetWalk',     'sheets/seed-cadet-walk.png',     'atlases/seed-cadet-walk.json'],
  ['seedCadetAttack',   'sheets/seed-cadet-attack.png',   'atlases/seed-cadet-attack.json'],
  ['riftMageWalk',      'sheets/rift-mage-walk.png',      'atlases/rift-mage-walk.json'],
  ['shadowBeast',       'sheets/shadow-beast.png',        'atlases/shadow-beast.json'],
  ['riftKnight',        'sheets/rift-knight.png',         'atlases/rift-knight.json'],
  ['riftPortal',        'sheets/rift-portal.png',         'atlases/rift-portal.json'],
  ['terrainGarden',     'sheets/terrain-garden.png',      'atlases/terrain-garden.json'],
  ['terrainWalls',      'sheets/terrain-walls.png',       'atlases/terrain-walls.json'],
  ['vfxSlash',          'sheets/vfx-slash.png',           'atlases/vfx-slash.json'],
  ['vfxProjectiles',    'sheets/vfx-projectiles.png',     'atlases/vfx-projectiles.json'],
  ['vfxAoe',            'sheets/vfx-aoe.png',             'atlases/vfx-aoe.json'],
  ['weapons',           'sheets/weapons-sheet.png',       'atlases/weapons.json'],
  ['items',             'sheets/items-sheet.png',         'atlases/items.json'],
  ['ui',                'sheets/ui-sheet.png',            'atlases/ui.json'],
  ['skills',            'sheets/skills-sheet.png',        'atlases/skills.json'],
];

/**
 * Load all sprite sheets. Returns an object with helpers to build AnimatedSprites.
 */
export async function loadRiftAssets() {
  const sheets = {};

  for (const [key, sheetFile, atlasFile] of SHEETS) {
    const atlas = await fetch(ASSET_BASE + atlasFile).then(r => r.json());
    const texture = await PIXI.Assets.load(ASSET_BASE + sheetFile);
    const spritesheet = new PIXI.Spritesheet(texture, atlas);
    await spritesheet.parse();
    sheets[key] = spritesheet;
  }

  return {
    sheets,

    /** Build an animated sprite from a sheet's frames, in order. */
    anim(sheetKey, framePrefix = 'frame_', fps = 12, loop = true) {
      const ss = sheets[sheetKey];
      const frameIds = Object.keys(ss.textures)
        .filter(k => k.startsWith(framePrefix))
        .sort();
      const textures = frameIds.map(id => ss.textures[id]);
      const sprite = new PIXI.AnimatedSprite(textures);
      sprite.animationSpeed = fps / 60;
      sprite.loop = loop;
      sprite.play();
      return sprite;
    },

    /** Get a single named frame (for static icons, UI, etc.). */
    frame(sheetKey, frameName) {
      return new PIXI.Sprite(sheets[sheetKey].textures[frameName]);
    },

    /** List all frame names in a sheet (useful for picking animation ranges). */
    frames(sheetKey) {
      return Object.keys(sheets[sheetKey].textures).sort();
    },
  };
}

// ---- Example: spin up a basic isometric scene -----------------
export async function demo(container) {
  const app = new PIXI.Application({
    background: '#0a0612',
    antialias: true,
    resizeTo: container,
  });
  container.appendChild(app.view);

  const A = await loadRiftAssets(app);

  // Place a 4x4 grid of garden tiles
  const tileW = 256, tileH = 128; // adjust to your iso projection
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const tile = A.frame('terrainGarden', `frame_${String(y * 8 + x + 1).padStart(3, '0')}`);
      tile.anchor.set(0.5, 0.5);
      tile.x = app.screen.width / 2 + (x - y) * tileW / 2;
      tile.y = app.screen.height / 2 + (x + y) * tileH / 2;
      tile.scale.set(0.5);
      app.stage.addChild(tile);
    }
  }

  // Drop the SEED Cadet in the center with idle walk animation
  const cadet = A.anim('seedCadetWalk', 'frame_', 10, true);
  cadet.anchor.set(0.5, 0.8);
  cadet.scale.set(0.5);
  cadet.x = app.screen.width / 2;
  cadet.y = app.screen.height / 2;
  app.stage.addChild(cadet);

  // Add a portal nearby
  const portal = A.anim('riftPortal', 'frame_', 8, true);
  portal.anchor.set(0.5, 0.5);
  portal.scale.set(0.4);
  portal.x = app.screen.width / 2 + 200;
  portal.y = app.screen.height / 2 + 100;
  app.stage.addChild(portal);
}
