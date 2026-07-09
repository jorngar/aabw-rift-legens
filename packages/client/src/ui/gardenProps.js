// ============================================================
// Garden Environment — decorative props and ambient effects
// ============================================================
import * as PIXI from 'pixi.js';
import { tileToScreen } from '../engine/isometric.js';

/**
 * Add decorative props to the garden map.
 * Creates torches, trees, crystals as simple PIXI.Graphics shapes.
 */
export function addGardenProps(container, grid) {
  const rows = grid.length;
  const cols = grid[0].length;

  // Seeded random for deterministic placement
  const rand = (x, y, s = 0) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + s * 43758.5453) * 43758.5453;
    return n - Math.floor(n);
  };

  const props = new PIXI.Container();
  props.sortableChildren = true;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileType = grid[y][x];
      const r = rand(x, y, 7);

      // Torches on wall tiles
      if (tileType === 5 && r > 0.6) {
        const torch = createTorch();
        const pos = tileToScreen(x, y);
        torch.x = pos.x;
        torch.y = pos.y - 20;
        torch.zIndex = pos.y + 10;
        props.addChild(torch);
      }

      // Trees on grass tiles (sparse)
      if (tileType === 0 && r > 0.92) {
        const tree = createTree();
        const pos = tileToScreen(x, y);
        tree.x = pos.x;
        tree.y = pos.y - 30;
        tree.zIndex = pos.y + 10;
        props.addChild(tree);
      }

      // Crystals on rift tiles
      if (tileType === 3 && r > 0.5) {
        const crystal = createCrystal();
        const pos = tileToScreen(x, y);
        crystal.x = pos.x;
        crystal.y = pos.y - 10;
        crystal.zIndex = pos.y + 10;
        props.addChild(crystal);
      }

      // Flowers on grass
      if (tileType === 0 && r > 0.85 && r < 0.92) {
        const flower = createFlower(x, y);
        const pos = tileToScreen(x, y);
        flower.x = pos.x + (rand(x, y, 3) - 0.5) * 30;
        flower.y = pos.y + (rand(x, y, 4) - 0.5) * 10;
        flower.zIndex = pos.y + 5;
        props.addChild(flower);
      }
    }
  }

  container.addChild(props);
  return props;
}

function createTorch() {
  const g = new PIXI.Graphics();
  // Torch pole
  g.lineStyle(2, 0x8B4513);
  g.moveTo(0, 0);
  g.lineTo(0, -20);
  // Flame
  g.lineStyle(0);
  g.beginFill(0xff6600, 0.8);
  g.drawCircle(0, -22, 4);
  g.endFill();
  g.beginFill(0xffcc00, 0.6);
  g.drawCircle(0, -24, 3);
  g.endFill();
  // Glow
  g.beginFill(0xff8800, 0.15);
  g.drawCircle(0, -20, 15);
  g.endFill();
  return g;
}

function createTree() {
  const g = new PIXI.Graphics();
  // Trunk
  g.lineStyle(3, 0x5a3a1a);
  g.moveTo(0, 0);
  g.lineTo(0, -25);
  // Canopy layers
  g.lineStyle(0);
  g.beginFill(0x2d5a1e, 0.9);
  g.drawCircle(0, -30, 18);
  g.endFill();
  g.beginFill(0x3a6b2a, 0.8);
  g.drawCircle(-5, -35, 12);
  g.endFill();
  g.beginFill(0x4a8b3a, 0.7);
  g.drawCircle(5, -33, 10);
  g.endFill();
  return g;
}

function createCrystal() {
  const g = new PIXI.Graphics();
  // Crystal shape (diamond)
  g.beginFill(0xaa77dd, 0.7);
  g.moveTo(0, -12);
  g.lineTo(6, 0);
  g.lineTo(0, 12);
  g.lineTo(-6, 0);
  g.closePath();
  g.endFill();
  // Inner glow
  g.beginFill(0xdd99ff, 0.4);
  g.moveTo(0, -8);
  g.lineTo(4, 0);
  g.lineTo(0, 8);
  g.lineTo(-4, 0);
  g.closePath();
  g.endFill();
  // Glow
  g.beginFill(0xaa77dd, 0.1);
  g.drawCircle(0, 0, 15);
  g.endFill();
  return g;
}

function createFlower(x, y) {
  const g = new PIXI.Graphics();
  const colors = [0xff6b9d, 0xffd93d, 0x6bcb77, 0x4d96ff];
  const color = colors[(x * 3 + y * 7) % colors.length];
  // Stem
  g.lineStyle(1, 0x3a6b2a);
  g.moveTo(0, 0);
  g.lineTo(0, -6);
  // Petals
  g.lineStyle(0);
  g.beginFill(color, 0.7);
  g.drawCircle(0, -8, 2.5);
  g.endFill();
  g.beginFill(0xffdd00, 0.8);
  g.drawCircle(0, -8, 1);
  g.endFill();
  return g;
}
