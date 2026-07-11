// Patch v0.1 bundle — full-game-version A/B test (map layouts differ).
// Auto-registered by patches-loader.js because this folder matches
// the /^patch-v\d+$/ naming convention.
import garden   from './garden-a.js';
import gardenB  from './garden-b.js';
import dungeon  from './dungeon-a.js';
import dungeonB from './dungeon-b.js';
import { validatePatch } from '../../patch.js';

const patch = {
  id: 'patch-v01',
  name: 'Patch v0.1 — Corridor vs Maze',
  description: 'Full game-version A/B: linear corridor (A) vs branching maze (B).',
  variantA: { label: 'A — Linear Corridor', garden, dungeon },
  variantB: { label: 'B — Branching Maze', garden: gardenB, dungeon: dungeonB },
};
validatePatch(patch);
export default patch;
