#!/usr/bin/env python3
"""Convert Chibi Swordman sprite sheets to PixiJS atlas format."""
import json
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHIBI = ROOT / "sheets" / "chibi"
ATLASES = ROOT / "atlases"

# Animation configs: filename, frame_count, frame_width, frame_height
ANIMS = {
    'chibi-idle':   ('idle.png',   10, 386, 594),
    'chibi-walk':   ('walk.png',   10, 393, 615),
    'chibi-run':    ('run.png',     8, 412, 619),
    'chibi-attack': ('attack.png',  5, 638, 643),
    'chibi-jump':   ('jump.png',   10, 412, 611),
}


def make_atlas(name, filename, frame_count, fw, fh):
    path = CHIBI / filename
    img = Image.open(path)
    cols = img.width // fw
    rows = img.height // fh
    
    frames = {}
    idx = 0
    for row in range(rows):
        for col in range(cols):
            if idx >= frame_count:
                break
            frame_name = f"frame_{idx + 1:03d}"
            frames[frame_name] = {
                "frame": {"x": col * fw, "y": row * fh, "w": fw, "h": fh},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
                "sourceSize": {"w": fw, "h": fh},
            }
            idx += 1
    
    atlas = {
        "frames": frames,
        "meta": {
            "app": "rift-seed-chibi-converter",
            "image": f"{filename}",
            "format": "RGBA8888",
            "size": {"w": img.width, "h": img.height},
            "scale": "1",
        },
    }
    
    atlas_path = ATLASES / f"{name}.json"
    with open(atlas_path, 'w') as f:
        json.dump(atlas, f, indent=2)
    print(f"  [+] {name}: {len(frames)} frames ({cols}x{rows} grid, {fw}x{fh})")


def main():
    print("Converting Chibi Swordman sprites to PixiJS format...")
    for name, (filename, count, fw, fh) in ANIMS.items():
        make_atlas(name, filename, count, fw, fh)
    print("\nDone! Anime-style chibi sprites ready.")


if __name__ == "__main__":
    main()
