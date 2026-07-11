#!/bin/bash
# Generate character sprite sheets via z-ai image CLI.
# Output: large 1024x1024 grid images that we later slice into individual frames.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$SCRIPT_DIR/../sheets"
mkdir -p "$OUT"

# Style anchor (prepended to every prompt for cohesion)
STYLE="manhwa art style, Ragnarok Online inspired cel-shading, deep purple and teal rift palette, SEED garden military academy uniform details, glowing violet rift energy accents, dark fantasy, isometric 2.5D game sprite, clean outlines, transparent flat background"

# 1. SEED Cadet - Sword idle + walk (4-direction isometric, 8 frames each direction)
echo "[1/6] SEED Cadet sword animation sheet..."
z-ai image -p "$STYLE, isometric character sprite sheet, young male SEED garden cadet with gunblade sword, dark navy military coat with silver trim, idle pose and walking animation frames arranged in 4x8 grid, top-down 45-degree isometric view, 8 frames per direction, four cardinal directions, full body sprite" -o "$OUT/seed-cadet-walk.png" -s 1024x1024

# 2. SEED Cadet - Attack + skill animation
echo "[2/6] SEED Cadet attack/skill sheet..."
z-ai image -p "$STYLE, isometric character sprite sheet, young male SEED garden cadet with gunblade sword, attack slash animation frames and skill cast animation, 6 frames per action, dramatic action poses, motion blur on blade, glowing rift energy on critical hits, arranged in horizontal grid" -o "$OUT/seed-cadet-attack.png" -s 1024x1024

# 3. Rift Mage - staff casting animation
echo "[3/6] Rift Mage animation sheet..."
z-ai image -p "$STYLE, isometric character sprite sheet, female rift mage in dark purple hooded robe with glowing violet rune markings, holding jagged rift staff, idle and casting animation frames, 8 frames walk cycle and 6 frames spellcast, four isometric directions in grid layout, full body" -o "$OUT/rift-mage-walk.png" -s 1024x1024

# 4. Shadow Beast enemy
echo "[4/6] Shadow Beast enemy sheet..."
z-ai image -p "$STYLE, isometric enemy sprite sheet, corrupted shadow wolf beast with glowing purple rift cracks across body, four legs, sharp claws, idle prowling and lunge attack animation, 8 frames per action, top-down 45-degree isometric view, dark silhouette with neon violet edges" -o "$OUT/shadow-beast.png" -s 1024x1024

# 5. Rift Knight mini-boss
echo "[5/6] Rift Knight boss sheet..."
z-ai image -p "$STYLE, isometric boss sprite sheet, tall armored corrupted SEED knight in black plate armor with glowing purple rift cracks, holding massive corrupted greatsword, idle breathing, walk, heavy attack, death animation frames, 6 frames per action, larger than player, dramatic silhouette" -o "$OUT/rift-knight.png" -s 1024x1024

# 6. Rift Portal object
echo "[6/6] Rift Portal animation sheet..."
z-ai image -p "$STYLE, isometric object sprite sheet, swirling purple rift portal with cracks of violet energy, floating runes around rim, 8 frame idle animation showing portal pulsing and rotating, dark center void, neon purple glow, square frame grid layout" -o "$OUT/rift-portal.png" -s 1024x1024

echo ""
echo "Done. Files in $OUT:"
ls -la "$OUT"
