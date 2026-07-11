# Rift SEED Asset Pipeline

This directory is the editable asset workshop, not a web public directory. It contains generated libraries, source frames, previews, conversion scripts, and vendor files.

The production allowlist lives in `packages/client/public/assets`. Promote only the frames and atlases the running game needs, then register their `/assets/...` URLs in `packages/client/src/infrastructure/assets/rift-asset-loader.js`.

A 2.5D isometric sprite pack for pixi.js, themed as **Final Fantasy VIII SEED Garden meets Solo Leveling rift world** in a manhwa art style inspired by Ragnarok Online.

Generated: 2026-07-06  
Engine target: pixi.js v7+  
License: AI-generated assets are yours to use for the hackathon (verify with your hackathon's AI-policy rules before commercial use). Reference images under `references/` are from third-party sources — keep them as inspiration only, do not redistribute.

---

## What's inside

| Category | Sheets | Frames | Notable contents |
|---|---|---|---|
| Characters | 3 | 48 | SEED Cadet walk + attack, Rift Mage walk+cast |
| Enemies | 3 | 40 | Shadow Beast, Rift Knight (boss), Rift Portal |
| Terrain | 2 | 126 | Garden floor tiles, walls (8×8 grids, 2 empty culled) |
| VFX | 3 | 20 | Slash arcs, projectiles, AoE rune circle |
| Weapons | 1 | 5 | Gunblade, rift staff, pistol, SEED rifle, rune daggers |
| Items | 1 | 8 | HP/MP potions, rift shard, scroll, key, coins, ether, rune |
| UI | 2 | 16 | HP/MP bars, dialogue box, minimap, skill icons, inventory slots |
| **Total** | **15** | **263** | |

## Directory layout

```
tools/asset-pipeline/
├── sheets/                  # Full sprite-sheet PNGs (1024x1024 or 1344x768)
├── atlases/                 # pixi.js Spritesheet JSON for each sheet
│   └── manifest.json        # Master manifest with grid info + frame labels
├── characters/              # Sliced individual frame PNGs (per character)
├── enemies/                 # Sliced individual frame PNGs (per enemy)
├── terrain/                 # Sliced individual tile PNGs
├── vfx/                     # Sliced VFX frame PNGs
├── weapons/                 # Sliced weapon icon PNGs
├── items/                   # Sliced item icon PNGs
├── ui/                      # Sliced UI element PNGs
├── references/              # Web-found reference images (inspiration only)
└── scripts/
    ├── slice_sprites.py     # Re-slice sheets with different grid configs
    ├── generate_characters.sh  # Re-generate sprite sheets via z-ai CLI
    ├── download_references.py  # Re-run web image search for references
    └── legacy-rift-assets.js # Pipeline preview loader (not used by the game)
```

## Quick start in pixi.js

1. Export the required files into `packages/client/public/assets/`.
2. Import the loader:

```js
import { loadRiftAssets } from './infrastructure/assets/rift-asset-loader.js';

const A = await loadRiftAssets();

// Walk animation
const cadet = A.anim('seedCadetWalk', 'frame_', 12, true);
cadet.x = 400; cadet.y = 300;
app.stage.addChild(cadet);

// Static weapon icon
const gunblade = A.frame('weapons', 'gunblade');
app.stage.addChild(gunblade);

// Spawn a portal
const portal = A.anim('riftPortal', 'frame_', 8, true);
app.stage.addChild(portal);
```

See `scripts/legacy-rift-assets.js` for the legacy pipeline demo scene.

## Frame layout cheat sheet

Each sheet is sliced into a uniform grid. The grid config is in the matching atlas JSON under `meta.grid`. Useful defaults:

| Sheet | Grid | Frame size | Suggested use |
|---|---|---|---|
| `seed-cadet-walk` | 4×4 | 256×256 | Rows = directions (S, SE, E, N), Cols = walk frames 1-4 |
| `seed-cadet-attack` | 4×4 | 256×256 | Rows = action (idle, slash, skill, hurt), Cols = frames |
| `rift-mage-walk` | 4×4 | 256×256 | Same as cadet |
| `shadow-beast` | 4×4 | 256×256 | Rows = direction, Cols = prowling frames |
| `rift-knight` | 4×4 | 256×256 | Rows = action (idle/walk/attack/death) |
| `rift-portal` | 4×2 | 256×512 | 8-frame idle pulse |
| `terrain-garden` | 8×8 | 128×128 | Isometric diamond tiles |
| `terrain-walls` | 8×8 | 128×128 | Wall + cliff tiles |
| `vfx-slash` | 6×1 | 224×768 | Slash arc 6-frame animation |
| `vfx-projectiles` | 4×2 | 256×512 | Projectile travel + impact |
| `vfx-aoe` | 6×1 | 170×1024 | Rune circle grow + burst |
| `weapons` | 5×1 | 268×768 | Gunblade, staff, pistol, rifle, daggers |
| `items` | 4×2 | 256×512 | 8 inventory icons |
| `ui` | 4×2 | 256×512 | HP bar, mana bar, skill frame, dialogue box, minimap, slot |
| `skills` | 4×2 | 256×512 | 8 skill icons |

## Notes for the hackathon

- **Transparency**: AI-generated sheets have dark backgrounds, not transparent. Before final integration, run a chroma-key pass (see `scripts/` for an upcoming helper) or use blend modes in pixi.js. The slicer already filters near-empty frames.
- **Cohesion**: All sheets share the same prompt style anchor (manhwa cel-shading, deep purple + teal rift palette, SEED garden uniform motifs), so they read as one art direction.
- **Iso projection**: Tiles are drawn as 2D top-down 45° frames. For a true iso look, apply `tile.scale.x = 1, tile.scale.y = 0.5` or use an iso transform matrix in your renderer.
- **Performance**: Pixi.js can hold all 15 sheets in VRAM simultaneously (~2.2 MB total). Use `Spritesheet.parse()` once at boot.

## Regenerating / iterating

- **Change grid slicing**: Edit `SHEET_CONFIG` in `scripts/slice_sprites.py` and re-run. No need to regenerate images.
- **Regenerate a single sheet**: Use the prompt embedded in `scripts/generate_characters.sh` (or read it from the source script) and run `z-ai image -p "<prompt>" -o sheets/<name>.png -s <size>`.
- **Add a new character**: Add an entry to `SHEET_CONFIG`, regenerate, re-slice. The atlas JSON updates automatically.
