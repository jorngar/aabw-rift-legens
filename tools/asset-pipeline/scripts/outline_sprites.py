#!/usr/bin/env python3
"""Add white outlines to sprite sheets using only PIL."""
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / "sheets"


def add_outline(src_path, outline_width=2):
    """Add white outline to sprites."""
    img = Image.open(src_path).convert('RGBA')
    arr = np.array(img, dtype=np.int16)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    
    # Create outline mask by checking neighbors
    outline = np.zeros((h, w), dtype=bool)
    for dy in range(-outline_width, outline_width + 1):
        for dx in range(-outline_width, outline_width + 1):
            if dy == 0 and dx == 0:
                continue
            # Shift alpha channel
            shifted = np.zeros_like(alpha)
            y1 = max(0, dy)
            y2 = min(h, h + dy)
            x1 = max(0, dx)
            x2 = min(w, w + dx)
            sy1 = max(0, -dy)
            sy2 = min(h, h - dy)
            sx1 = max(0, -dx)
            sx2 = min(w, w - dx)
            shifted[sy1:sy2, sx1:sx2] = alpha[y1:y2, x1:x2]
            outline |= (shifted > 20) & (alpha <= 20)
    
    # Apply white outline where there's no existing sprite
    result = arr.copy()
    result[outline, 0] = 255  # R
    result[outline, 1] = 255  # G
    result[outline, 2] = 255  # B
    result[outline, 3] = 200  # A (mostly opaque white)
    
    Image.fromarray(result.astype(np.uint8)).save(src_path, optimize=True)
    print(f"  [+] Outlined: {src_path.name}")


def main():
    sprite_files = [
        'male_light.png', 'male_heavy.png',
        'skeleton.png', 'goblin.png', 'zombie.png',
        'werewolf.png', 'ogre.png', 'elemental.png',
        'magician.png', 'slime.png',
    ]
    for f in sprite_files:
        path = SHEETS / f
        if path.exists():
            add_outline(path)
    print("\nDone!")


if __name__ == "__main__":
    main()
