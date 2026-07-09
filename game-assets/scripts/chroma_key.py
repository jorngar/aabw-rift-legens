#!/usr/bin/env python3
"""
Chroma-key helper: turn the dark AI-generated backgrounds into transparency.

Many AI image generators produce sheets with a dark (near-black or near-purple)
background instead of true alpha. This script replaces near-black pixels with
alpha=0, and writes the cleaned PNGs next to the originals with a .clean.png
suffix. Re-run after each regeneration.

Tunable:
  - MAX_BRIGHTNESS: pixels with all RGB channels <= this value become transparent.
  - PURGE_TINT: if True, also strips residual purple tint (R > B+G).
"""

import os
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path("/home/z/my-project/download/game-assets")
TARGETS = [
    ROOT / "sheets",
    ROOT / "vfx",
    ROOT / "characters",
    ROOT / "enemies",
    ROOT / "weapons",
    ROOT / "items",
    ROOT / "ui",
]

MAX_BRIGHTNESS = 18       # 0-255; pixels darker than this become transparent
PURGE_TINT = True         # also kill dark purple-tinted pixels (typical rift bg)


def clean_image(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.array(im).astype(np.int16)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]

    dark = (r <= MAX_BRIGHTNESS) & (g <= MAX_BRIGHTNESS) & (b <= MAX_BRIGHTNESS)

    if PURGE_TINT:
        # Dark purple wash: R noticeably higher than G+B, all under 60
        purple = (r > g + 10) & (r > b + 5) & (r < 70) & (g < 50) & (b < 60)
        dark = dark | purple

    arr[dark, 3] = 0  # set alpha to 0
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def main():
    processed = 0
    for target in TARGETS:
        if not target.exists():
            continue
        for png in target.rglob("*.png"):
            if png.name.endswith(".clean.png"):
                continue
            try:
                im = Image.open(png)
                cleaned = clean_image(im)
                out_path = png.with_suffix(".clean.png")
                cleaned.save(out_path, optimize=True)
                processed += 1
                if processed % 25 == 0:
                    print(f"  ...{processed} files cleaned")
            except Exception as e:
                print(f"  [!] {png.name}: {e}")
    print(f"[+] Cleaned {processed} PNGs. .clean.png variants written alongside originals.")


if __name__ == "__main__":
    main()
