// Patch v0.1 bundle — full-game-version A/B test (map layouts differ).
// Each variant ships a POOL of dungeon layouts. RiftSystem rotates
// through the pool per rift entry (run 0 → dungeons[0], run 1 → [1], …),
// so a returning player sees a different map each descent while the
// A/B thematic split (open vs. cramped) stays intact.
//
// Auto-registered by patches-loader.js because this folder matches
// the /^patch-v\d+$/ naming convention.
import garden      from './garden-a.js';
import gardenB     from './garden-b.js';
import dungeonA1   from './dungeon-a-1.js';
import dungeonA2   from './dungeon-a-2.js';
import dungeonA3   from './dungeon-a-3.js';
import dungeonB1   from './dungeon-b-1.js';
import dungeonB2   from './dungeon-b-2.js';
import dungeonB3   from './dungeon-b-3.js';
import { validatePatch } from '../../patch.js';

const patch = {
  id: 'patch-v01',
  name: 'Patch v0.1 — Corridor vs Maze',
  description: 'Full game-version A/B: linear corridor (A) vs branching maze (B). Each variant rotates through 3 dungeon layouts.',
  variantA: {
    label: 'A — Linear Corridor',
    garden,
    dungeons: [dungeonA1, dungeonA2, dungeonA3],
  },
  variantB: {
    label: 'B — Branching Maze',
    garden: gardenB,
    dungeons: [dungeonB1, dungeonB2, dungeonB3],
  },
};
validatePatch(patch);
export default patch;
