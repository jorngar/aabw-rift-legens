// =============================================================
// Runtime Pixi asset adapter. Source art and generation tools intentionally
// live outside public/ under tools/asset-pipeline.
// =============================================================

import * as PIXI from 'pixi.js';

const ASSET_BASE = '/assets/';

// Each entry: [key, sheetFilename, atlasFilename]
const SHEETS = [
  ['magician',     'sprites/flare/magician.png',    'atlases/flare/magician.json'],
];

// Tiny Heroes 96x96 pack (SpriteSheets(96x96)). Same art family and cell
// geometry as the old free-characters extracts, but with a full roster and a
// complete animation set per character. Horizontal strips, 96x96 frames, so
// they slice directly without generated atlases. With_Shadows variants match
// the baked ground shadow the old sheets had.
const PACK_BASE = 'sprites/SpriteSheets(96x96)';
const PACK_VARIANT = 'With_Shadows';

// keyPrefix -> pack folder. Gameplay mapping:
//   soldier   = warrior class          mage      = mage class
//   rogue     = rogue class (polearm)  ranger    = ranger class (bow)
//   packSlime = shadowBeast enemy      orc       = riftKnight enemy (axe)
// The remaining sets are loaded so encounters can be reskinned without code.
const PACK_SETS = [
  ['soldier',   'Human_Soldier_Sword_Shield'],
  ['mage',      'Human_Mage'],
  ['rogue',     'Human_Soldier_Polearm'],
  ['ranger',    'Human_Bow'],
  ['mace',      'Human_Soldier_Mace_Shield'],
  ['packSlime', 'Monster_Slime'],
  ['orc',       'Monster_Orc_Axe'],
  ['orcShield', 'Monster_Orc_Shield'],
  ['orcFist',   'Monster_Orc_Fist'],
  ['goblin',    'Monster_Goblin_Bow'],
];

// keySuffix -> pack sheet name
const PACK_ANIMS = [
  ['Idle', 'Idle'],
  ['Walk', 'Walk'],
  ['Attack', 'Attack1'],
  ['Attack2', 'Attack2'],
  ['Block', 'Block'],
  ['Jump', 'Jump_Fall'],
  ['Hurt', 'Hurt'],
  ['Death', 'Death'],
];

const STRIP_SHEETS = PACK_SETS.flatMap(([prefix, folder]) =>
  PACK_ANIMS.map(([suffix, sheet]) => [
    `${prefix}${suffix}`,
    `${PACK_BASE}/${folder}/${PACK_VARIANT}/${folder}_${sheet}-Sheet.png`,
  ]),
);

// The ranger's third attack (arrowShot skill) reuses the bow's alternate
// attack sheet — the pack has no dedicated Attack3.
STRIP_SHEETS.push(['rangerAttack3', `${PACK_BASE}/Human_Bow/${PACK_VARIANT}/Human_Bow_Attack2-Sheet.png`]);

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

  for (const [key, sheetFile, frameWidth = 96, frameHeight = frameWidth] of STRIP_SHEETS) {
    const texture = await PIXI.Assets.load(ASSET_BASE + sheetFile);
    sheets[key] = sliceStrip(texture, frameWidth, frameHeight);
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
