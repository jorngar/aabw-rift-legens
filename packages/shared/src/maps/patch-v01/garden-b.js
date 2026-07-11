// Patch v0.1 — Variant B (Branching)
// Garden zone: wall bisector forces a detour. Shop upper-right,
// portal lower-right. Enemies guard both branches.
//
// Legend: # wall | . floor | S spawn | P portal | $ shop | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('garden', `
##########
#.......$#
#.###....#
#S.#E....#
#..#.....#
#..#####.#
#.....E..#
#........#
#.......P#
##########
`);
