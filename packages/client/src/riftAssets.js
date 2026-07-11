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
  // Anime chibi sprites (CC0, real manga style)
  ['chibiIdle',         'sheets/chibi/idle.png',          'atlases/chibi-idle.json'],
  ['chibiWalk',         'sheets/chibi/walk.png',          'atlases/chibi-walk.json'],
  ['chibiRun',          'sheets/chibi/run.png',           'atlases/chibi-run.json'],
  ['chibiAttack',       'sheets/chibi/attack.png',        'atlases/chibi-attack.json'],
  // Flare RPG sprites (pixel art enemies — CC-BY 3.0)
  ['hero',              'sheets/male_light.png',          'atlases/male_light.json'],
  ['heroHeavy',         'sheets/male_heavy.png',          'atlases/male_heavy.json'],
  ['skeleton',          'sheets/skeleton.png',            'atlases/skeleton.json'],
  ['goblin',            'sheets/goblin.png',              'atlases/goblin.json'],
  ['zombie',            'sheets/zombie.png',              'atlases/zombie.json'],
  ['werewolf',          'sheets/werewolf.png',            'atlases/werewolf.json'],
  ['ogre',              'sheets/ogre.png',                'atlases/ogre.json'],
  ['elemental',         'sheets/elemental.png',           'atlases/elemental.json'],
  ['magician',          'sheets/magician.png',            'atlases/magician.json'],
  ['slime',             'sheets/slime.png',               'atlases/slime.json'],
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
      const textures = this.textures(sheetKey, framePrefix);
      const sprite = new PIXI.AnimatedSprite(textures);
      sprite.animationSpeed = fps / 60;
      sprite.loop = loop;
      sprite.play();
      return sprite;
    },

    /** Get an ordered texture array, optionally sliced by zero-based frame range. */
    textures(sheetKey, framePrefix = 'frame_', start = 0, end = undefined) {
      const ss = sheets[sheetKey];
      if (!ss) throw new Error(`Unknown sprite sheet: ${sheetKey}`);
      const frameIds = Object.keys(ss.textures)
        .filter(k => k.startsWith(framePrefix))
        .sort();
      return frameIds.slice(start, end).map(id => ss.textures[id]);
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
