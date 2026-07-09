#!/usr/bin/env python3
"""
Brighten tile sheets and add contrast for dark-fantasy-but-visible style.
Also creates sprite outline versions for better visibility.
"""
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from pathlib import Path

SHEETS = Path("/Volumes/Shinzo/Projects/aabw-hackathon/game-assets/sheets")


def brighten_tile(src_path, brightness=1.8, contrast=1.3, saturation=1.2):
    """Brighten a tile sheet significantly."""
    img = Image.open(src_path).convert('RGBA')
    
    # Split channels
    r, g, b, a = img.split()
    rgb = Image.merge('RGB', (r, g, b))
    
    # Brighten
    enhancer = ImageEnhance.Brightness(rgb)
    rgb = enhancer.enhance(brightness)
    
    # Increase contrast
    enhancer = ImageEnhance.Contrast(rgb)
    rgb = enhancer.enhance(contrast)
    
    # Increase saturation
    enhancer = ImageEnhance.Color(rgb)
    rgb = enhancer.enhance(saturation)
    
    # Recombine with alpha
    r2, g2, b2 = rgb.split()
    result = Image.merge('RGBA', (r2, g2, b2, a))
    
    # Overwrite original
    result.save(src_path, optimize=True)
    print(f"  [+] Brightened: {src_path.name}")


def add_sprite_outline(src_path, outline_color=(255, 255, 255, 128), outline_width=2):
    """Add white outline to sprite sheet for visibility."""
    img = Image.open(src_path).convert('RGBA')
    arr = np.array(img)
    
    # Create outline mask from alpha channel
    alpha = arr[:, :, 3]
    
    # Dilate alpha to create outline
    from scipy.ndimage import binary_dilation
    struct = np.ones((outline_width*2+1, outline_width*2+1))
    dilated = binary_dilation(alpha > 10, structure=struct)
    outline_mask = dilated & (alpha <= 10)
    
    # Add white outline pixels
    result = arr.copy()
    result[outline_mask] = outline_color
    
    result_img = Image.fromarray(result)
    result_img.save(src_path, optimize=True)
    print(f"  [+] Outlined: {src_path.name}")


def main():
    # Brighten tile sheets
    tile_files = ['terrain-garden.png', 'terrain-walls.png']
    for f in tile_files:
        path = SHEETS / f
        if path.exists():
            brighten_tile(path, brightness=2.0, contrast=1.4, saturation=1.3)
    
    # Add outlines to character sprites (Flare RPG)
    sprite_files = [
        'male_light.png', 'male_heavy.png',
        'skeleton.png', 'goblin.png', 'zombie.png',
        'werewolf.png', 'ogre.png', 'elemental.png',
        'magician.png', 'slime.png',
    ]
    for f in sprite_files:
        path = SHEETS / f
        if path.exists():
            try:
                add_sprite_outline(path)
            except ImportError:
                print(f"  [!] scipy not available, skipping outline for {f}")
    
    print("\nDone! Tiles brightened, sprites outlined.")


if __name__ == "__main__":
    main()
