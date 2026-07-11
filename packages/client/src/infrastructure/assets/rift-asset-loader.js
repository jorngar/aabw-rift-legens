// =============================================================
// Runtime Pixi asset adapter. Source art and generation tools intentionally
// live outside public/ under tools/asset-pipeline.
// =============================================================

import * as PIXI from 'pixi.js';

const ASSET_BASE = '/assets/';

// Each entry: [key, sheetFilename, atlasFilename]
const SHEETS = [
  ['chibiIdle',    'sprites/chibi/idle.png',        'atlases/chibi/idle.json'],
  ['chibiWalk',    'sprites/chibi/walk.png',        'atlases/chibi/walk.json'],
  ['chibiAttack',  'sprites/chibi/attack.png',      'atlases/chibi/attack.json'],
  ['heroHeavy',    'sprites/flare/male-heavy.png',  'atlases/flare/male-heavy.json'],
  ['magician',     'sprites/flare/magician.png',    'atlases/flare/magician.json'],
];

// Free Characters Animations Asset Pack. These are transparent, horizontal
// 96x96 frame strips, so they can be sliced directly without generated atlases.
const FREE_CHARACTER_BASE = 'sprites/free-characters';
const STRIP_SHEETS = [
  ['soldierIdle',     `${FREE_CHARACTER_BASE}/soldier/idle.png`],
  ['soldierWalk',     `${FREE_CHARACTER_BASE}/soldier/walk.png`],
  ['soldierAttack',   `${FREE_CHARACTER_BASE}/soldier/attack.png`],
  ['soldierHurt',     `${FREE_CHARACTER_BASE}/soldier/hurt.png`],
  ['soldierDeath',    `${FREE_CHARACTER_BASE}/soldier/death.png`],
  ['packSlimeIdle',   `${FREE_CHARACTER_BASE}/slime/idle.png`],
  ['packSlimeWalk',   `${FREE_CHARACTER_BASE}/slime/walk.png`],
  ['packSlimeAttack', `${FREE_CHARACTER_BASE}/slime/attack.png`],
  ['packSlimeHurt',   `${FREE_CHARACTER_BASE}/slime/hurt.png`],
  ['packSlimeDeath',  `${FREE_CHARACTER_BASE}/slime/death.png`],
];

function sliceStrip(texture, frameWidth = 96, frameHeight = 96) {
  const textures = {};
  texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  const frameCount = Math.floor(texture.width / frameWidth);
  for (let index = 0; index < frameCount; index++) {
    const frameId = `frame_${String(index + 1).padStart(3, '0')}`;
    textures[frameId] = new PIXI.Texture(
      texture.baseTexture,
      new PIXI.Rectangle(index * frameWidth, 0, frameWidth, frameHeight),
    );
  }
  return { textures };
}

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

  for (const [key, sheetFile] of STRIP_SHEETS) {
    const texture = await PIXI.Assets.load(ASSET_BASE + sheetFile);
    sheets[key] = sliceStrip(texture);
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
