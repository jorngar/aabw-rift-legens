#!/usr/bin/env python3
"""
Convert Flare RPG sprite sheets to PixiJS-compatible atlas format.
Flare sheets are organized as: rows = directions (8), cols = frames per animation.
Each frame is 256x256 (or 128x128 for hero).
"""
import json
import os
from pathlib import Path
from PIL import Image

SRC = Path("/Volumes/Shinzo/Projects/aabw-hackathon/game-assets/new-sprites/flare-characters")
DST_SHEETS = Path("/Volumes/Shinzo/Projects/aabw-hackathon/game-assets/sheets")
DST_ATLASES = Path("/Volumes/Shinzo/Projects/aabw-hackathon/game-assets/atlases")

# Flare sprite sheet configs
# Each entry: filename, frame_width, frame_height, rows (directions), cols (frames)
SPRITES = {
    'skeleton': ('skeleton.png', 256, 256, 8, 8),
    'goblin': ('goblin.png', 256, 256, 8, 8),
    'zombie': ('zombie.png', 256, 256, 8, 8),
    'werewolf': ('werewolf.png', 256, 256, 8, 8),
    'ogre': ('ogre.png', 256, 256, 8, 8),
    'elemental': ('elemental.png', 256, 256, 8, 8),
    'magician': ('magician.png', 256, 256, 8, 8),
    'slime': ('slime.png', 256, 256, 8, 8),
    'male_light': ('male_light.png', 256, 256, 8, 8),
    'male_heavy': ('male_heavy.png', 256, 256, 8, 8),
}


def process_sprite(name, filename, fw, fh, rows, cols):
    """Process a Flare sprite sheet into PixiJS atlas format."""
    src_path = SRC / filename
    if not src_path.exists():
        print(f"  [!] Missing: {src_path}")
        return

    img = Image.open(src_path).convert('RGBA')
    sheet_w = img.width
    sheet_h = img.height

    # Calculate actual grid
    actual_cols = sheet_w // fw
    actual_rows = sheet_h // fh
    
    frames = {}
    frame_idx = 0
    
    for row in range(actual_rows):
        for col in range(actual_cols):
            x = col * fw
            y = row * fh
            frame_name = f"frame_{frame_idx + 1:03d}"
            frames[frame_name] = {
                "frame": {"x": x, "y": y, "w": fw, "h": fh},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
                "sourceSize": {"w": fw, "h": fh},
            }
            frame_idx += 1

    # Create atlas JSON
    atlas = {
        "frames": frames,
        "meta": {
            "app": "rift-seed-converter",
            "version": "1.0",
            "image": f"{name}.png",
            "format": "RGBA8888",
            "size": {"w": sheet_w, "h": sheet_h},
            "scale": "1",
            "grid": {
                "cols": actual_cols,
                "rows": actual_rows,
                "frameWidth": fw,
                "frameHeight": fh,
            },
        },
    }

    # Save atlas JSON
    atlas_path = DST_ATLASES / f"{name}.json"
    with open(atlas_path, 'w') as f:
        json.dump(atlas, f, indent=2)

    # Copy sheet (already has transparency)
    sheet_path = DST_SHEETS / f"{name}.png"
    img.save(sheet_path, optimize=True)

    print(f"  [+] {name}: {actual_cols}x{actual_rows} grid, {frame_idx} frames")


def main():
    DST_SHEETS.mkdir(parents=True, exist_ok=True)
    DST_ATLASES.mkdir(parents=True, exist_ok=True)

    print("Converting Flare RPG sprites to PixiJS format...")
    for name, config in SPRITES.items():
        process_sprite(name, *config)

    print("\nDone! New sprites have proper pixel art with transparent backgrounds.")


if __name__ == "__main__":
    main()
