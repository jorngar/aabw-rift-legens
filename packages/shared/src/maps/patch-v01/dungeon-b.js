// Patch v0.1 — Variant B (Maze)
// Dungeon zone: multiple dead-ends before reaching the boss portal.
// Same enemy count as variant A (4) but forced traversal is longer.
// Boss (riftKnight) is spawned by the client runtime at the portal position,
// not by this map file.
//
// Legend: # wall | . floor | S spawn | P portal (boss/exit anchor) | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('dungeon', `
##########
#S.......#
#.####.#.#
#.#...E#.#
#.#.####.#
#.#E.#...#
#.####.#.#
#....E.#E#
#.####..P#
##########
`);
