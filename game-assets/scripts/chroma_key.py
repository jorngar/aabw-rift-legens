#!/usr/bin/env python3
"""Chroma-key: remove dark AI-generated backgrounds from sprite sheets."""
import os
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path("/Volumes/Shinzo/Projects/aabw-hackathon/game-assets")
TARGETS = [
    ROOT / "sheets",
    ROOT / "characters",
    ROOT / "enemies",
    ROOT / "weapons",
    ROOT / "items",
    ROOT / "ui",
    ROOT / "vfx",
]

MAX_BRIGHTNESS = 20
PURGE_TINT = True


def clean_image(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.array(im).astype(np.int16)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]

    dark = (r <= MAX_BRIGHTNESS) & (g <= MAX_BRIGHTNESS) & (b <= MAX_BRIGHTNESS)

    if PURGE_TINT:
        purple = (r > g + 10) & (r > b + 5) & (r < 70) & (g < 50) & (b < 60)
        dark = dark | purple

    arr[dark, 3] = 0
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def main():
    processed = 0
    for target in TARGETS:
        if not target.exists():
            print(f"  [skip] {target}")
            continue
        for png in target.rglob("*.png"):
            # Skip already-cleaned files
            if png.name.endswith(".clean.png"):
                continue
            try:
                im = Image.open(png)
                cleaned = clean_image(im)
                # Overwrite original
                cleaned.save(png, optimize=True)
                processed += 1
                if processed % 25 == 0:
                    print(f"  ...{processed} files cleaned")
            except Exception as e:
                print(f"  [!] {png.name}: {e}")
    print(f"[+] Cleaned {processed} PNGs (overwritten in place)")


if __name__ == "__main__":
    main()
