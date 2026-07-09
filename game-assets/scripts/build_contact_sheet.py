#!/usr/bin/env python3
"""
Build a single contact-sheet PNG showing all 15 sprite sheets in a grid,
so the user can visually inspect every asset at a glance.

Output: /home/z/my-project/download/game-assets/contact-sheet.png
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import os

ROOT = Path("/home/z/my-project/download/game-assets")
SHEETS_DIR = ROOT / "sheets"

# Sort by category for visual grouping
ORDER = [
    "seed-cadet-walk", "seed-cadet-attack", "rift-mage-walk",
    "shadow-beast", "rift-knight", "rift-portal",
    "terrain-garden", "terrain-walls",
    "vfx-slash", "vfx-projectiles", "vfx-aoe",
    "weapons-sheet", "items-sheet",
    "ui-sheet", "skills-sheet",
]

CELL_W, CELL_H = 320, 320  # thumbnail cell size
COLS = 3
ROWS = (len(ORDER) + COLS - 1) // COLS
PADDING = 20
LABEL_H = 28

canvas_w = COLS * (CELL_W + PADDING) + PADDING
canvas_h = ROWS * (CELL_H + LABEL_H + PADDING) + PADDING + 80  # +80 for title

canvas = Image.new("RGB", (canvas_w, canvas_h), (10, 6, 18))
draw = ImageDraw.Draw(canvas)

# Title
try:
    title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
    label_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
except Exception:
    title_font = ImageFont.load_default()
    label_font = ImageFont.load_default()

draw.text((PADDING, 20), "Rift SEED - Hackathon Asset Pack (15 sheets, 263 frames)",
          fill=(220, 200, 255), font=title_font)

for i, name in enumerate(ORDER):
    path = SHEETS_DIR / f"{name}.png"
    if not path.exists():
        continue
    im = Image.open(path).convert("RGB")
    im.thumbnail((CELL_W, CELL_H))
    # Center within cell
    cw, ch = im.size
    col = i % COLS
    row = i // COLS
    x = PADDING + col * (CELL_W + PADDING) + (CELL_W - cw) // 2
    y = PADDING + 60 + row * (CELL_H + LABEL_H + PADDING) + (CELL_H - ch) // 2
    canvas.paste(im, (x, y))
    # Label
    label_x = PADDING + col * (CELL_W + PADDING)
    label_y = y + ch + 6
    draw.text((label_x, label_y), name, fill=(180, 160, 220), font=label_font)

out_path = ROOT / "contact-sheet.png"
canvas.save(out_path)
print(f"[+] Contact sheet saved: {out_path}  ({canvas_w}x{canvas_h})")
