#!/usr/bin/env python3
"""
Slice sprite sheets into individual frames and generate pixi.js-compatible JSON atlases.

Each sprite sheet is cut into a configurable grid. Empty/near-empty frames are dropped.
Outputs:
  - download/game-assets/{category}/{name}/frame_001.png, frame_002.png, ...
  - download/game-assets/atlases/{name}.json   (pixi.js Spritesheet v1 format)

Also writes a master manifest at download/game-assets/atlases/manifest.json
that the game can iterate to preload everything.
"""

import json
import os
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path("/home/z/my-project/download/game-assets")
SHEETS_DIR = ROOT / "sheets"
ATLAS_DIR = ROOT / "atlases"
ATLAS_DIR.mkdir(parents=True, exist_ok=True)

# Sheet config: filename -> (category, name, cols, rows, frame_labels_or_None, description)
# cols/rows define how the sheet is sliced. The actual frame size is computed from sheet dimensions.
SHEET_CONFIG = {
    # Characters: 4x4 grid = 16 frames (intended: 4 directions x 4 walk frames)
    "seed-cadet-walk.png":      ("characters", "seed-cadet-walk",      4, 4, None,
                                 "SEED Cadet walk cycle, 4 isometric directions (S/SE/E/N implied) x 4 frames each"),
    "seed-cadet-attack.png":    ("characters", "seed-cadet-attack",    4, 4, None,
                                 "SEED Cadet attack/skill frames, 4 actions x 4 frames"),
    "rift-mage-walk.png":       ("characters", "rift-mage-walk",       4, 4, None,
                                 "Rift Mage walk + cast cycle, 4 directions x 4 frames"),
    # Enemies
    "shadow-beast.png":         ("enemies", "shadow-beast",            4, 4, None,
                                 "Shadow Beast idle/attack cycle, 4 directions x 4 frames"),
    "rift-knight.png":          ("enemies", "rift-knight",             4, 4, None,
                                 "Rift Knight boss animations, 4 actions x 4 frames"),
    "rift-portal.png":          ("enemies", "rift-portal",             4, 2, None,
                                 "Rift Portal 8-frame idle pulse animation"),
    # Terrain: 8x8 = 64 tiles
    "terrain-garden.png":       ("terrain", "terrain-garden",          8, 8, None,
                                 "Isometric garden floor + rift-cracked ground tiles"),
    "terrain-walls.png":        ("terrain", "terrain-walls",           8, 8, None,
                                 "Isometric wall, cliff, and corrupted wall tiles"),
    # VFX
    "vfx-slash.png":            ("vfx", "vfx-slash",                   6, 1,
                                 ["slash_1","slash_2","slash_3","slash_4","slash_5","slash_6"],
                                 "Sword slash arc VFX, 6 animation frames"),
    "vfx-projectiles.png":      ("vfx", "vfx-projectiles",             4, 2, None,
                                 "Rift energy projectile VFX, 8 frames (4x2)"),
    "vfx-aoe.png":              ("vfx", "vfx-aoe",                     6, 1,
                                 ["aoe_1","aoe_2","aoe_3","aoe_4","aoe_5","aoe_6"],
                                 "AoE rune circle VFX, 6 expansion/burst frames"),
    # Weapons & items: 5x1 / 4x2 strips
    "weapons-sheet.png":        ("weapons", "weapons",                 5, 1,
                                 ["gunblade","rift_staff","pistol","seed_rifle","rune_daggers"],
                                 "5 weapon icons"),
    "items-sheet.png":          ("items", "items",                     4, 2,
                                 ["health_potion","mana_potion","rift_shard","scroll",
                                  "key","gold_coins","ether_crystal","rune_stone"],
                                 "8 inventory item icons"),
    # UI
    "ui-sheet.png":             ("ui", "ui",                           4, 2,
                                 ["health_bar","mana_bar","skill_frame_1","skill_frame_2",
                                  "dialogue_box","minimap_frame","inventory_slot","skill_frame_3"],
                                 "8 UI element frames"),
    "skills-sheet.png":         ("ui", "skills",                       4, 2,
                                 ["skill_slash","skill_fireball","skill_heal","skill_shield",
                                  "skill_rift_teleport","skill_poison","skill_ice","skill_lightning"],
                                 "8 skill icons"),
}


def is_near_empty(im: Image.Image, threshold: int = 12) -> bool:
    """Return True if the frame is essentially background (low variance / mostly single color)."""
    if im.mode != "RGB":
        im = im.convert("RGB")
    # Sample by checking extremes + standard deviation
    extrema = im.getextrema()
    # extrema returns [(min,max), (min,max), (min,max)] for RGB
    ranges = [mx - mn for mn, mx in extrema]
    if max(ranges) < threshold:
        return True  # Single color
    # Quick pixel variance check via histogram
    histogram = im.histogram()
    total = sum(histogram)
    if total == 0:
        return True
    # If >95% of pixels are in the darkest 5 buckets, treat as empty
    dark_pixels = sum(histogram[:5])
    if dark_pixels / total > 0.95:
        return True
    return False


def slice_sheet(sheet_path: Path, category: str, name: str, cols: int, rows: int,
                labels, description: str):
    """Slice one sheet into individual frames + emit pixi.js atlas JSON."""
    im = Image.open(sheet_path).convert("RGBA")
    sw, sh = im.size
    fw, fh = sw // cols, sh // rows
    out_dir = ROOT / category / name
    out_dir.mkdir(parents=True, exist_ok=True)

    frames_meta = {}  # frame_name -> {frame, rotated, trimmed, spriteSourceSize, sourceSize}
    kept = 0
    skipped = 0

    for r in range(rows):
        for c in range(cols):
            idx = r * cols + c
            label = labels[idx] if labels else f"frame_{idx+1:03d}"
            left, top = c * fw, r * fh
            crop = im.crop((left, top, left + fw, top + fh))

            if is_near_empty(crop):
                skipped += 1
                continue

            out_path = out_dir / f"{label}.png"
            crop.save(out_path, optimize=True)
            kept += 1

            # pixi.js Spritesheet v1 frame format
            frames_meta[label] = {
                "frame": {"x": left, "y": top, "w": fw, "h": fh},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
                "sourceSize": {"w": fw, "h": fh},
            }

    # Emit pixi.js atlas JSON
    atlas = {
        "frames": frames_meta,
        "meta": {
            "app": "z-ai-sprite-slicer",
            "version": "1.0",
            "image": sheet_path.name,
            "format": "RGBA8888",
            "size": {"w": sw, "h": sh},
            "scale": 1,
            "description": description,
            "grid": {"cols": cols, "rows": rows, "frameWidth": fw, "frameHeight": fh},
            "framesKept": kept,
            "framesSkipped": skipped,
        },
    }
    atlas_path = ATLAS_DIR / f"{name}.json"
    with open(atlas_path, "w") as f:
        json.dump(atlas, f, indent=2)

    return {
        "category": category,
        "name": name,
        "sheet": str(sheet_path.relative_to(ROOT)),
        "atlas": str(atlas_path.relative_to(ROOT)),
        "framesDir": str(out_dir.relative_to(ROOT)),
        "grid": {"cols": cols, "rows": rows, "frameWidth": fw, "frameHeight": fh},
        "framesKept": kept,
        "framesSkipped": skipped,
        "frameLabels": list(frames_meta.keys()),
        "description": description,
    }


def main():
    manifest = {"sheets": [], "generatedAt": "2026-07-06", "engine": "pixi.js v7+"}
    for filename, cfg in SHEET_CONFIG.items():
        sheet_path = SHEETS_DIR / filename
        if not sheet_path.exists():
            print(f"[!] Missing: {filename}")
            continue
        info = slice_sheet(sheet_path, *cfg)
        manifest["sheets"].append(info)
        print(f"  [+] {filename:30s}  {cfg[2]}x{cfg[3]}  -> {info['framesKept']} frames kept, {info['framesSkipped']} skipped")

    with open(ATLAS_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\n[+] Master manifest: {ATLAS_DIR / 'manifest.json'}")
    print(f"[+] {len(manifest['sheets'])} sheets processed")


if __name__ == "__main__":
    main()
