#!/usr/bin/env python3
"""Remove white backgrounds from Flare RPG sprites and make them transparent."""
import numpy as np
from PIL import Image
from pathlib import Path

SHEETS = Path("/Volumes/Shinzo/Projects/aabw-hackathon/game-assets/sheets")


def remove_white_bg(src_path, threshold=240):
    """Remove near-white pixels (make transparent)."""
    img = Image.open(src_path).convert('RGBA')
    arr = np.array(img, dtype=np.int16)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    
    # White or near-white pixels
    white = (r > threshold) & (g > threshold) & (b > threshold)
    
    # Set white pixels to transparent
    arr[white, 3] = 0
    
    # Also remove light grey backgrounds
    light_grey = (r > 200) & (g > 200) & (b > 200) & (np.abs(r - g) < 20) & (np.abs(g - b) < 20)
    arr[light_grey, 3] = 0
    
    result = Image.fromarray(arr.astype(np.uint8))
    result.save(src_path, optimize=True)
    print(f"  [+] Removed white bg: {src_path.name}")


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
            remove_white_bg(path)
    print("\nDone! White backgrounds removed.")


if __name__ == "__main__":
    main()
