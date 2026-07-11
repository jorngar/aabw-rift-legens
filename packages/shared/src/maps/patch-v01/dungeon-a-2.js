// Patch v0.1 — Variant A, Layout 2 (Twin Chambers)
// Dungeon zone, 20x20. Two large walled chambers linked by a central
// dirt corridor. Wider open combat than L1, but still favors ranged
// engagement inside the chambers.
//
// Legend: # wall | * rift crack (blocked) | ~ dirt path | . stone floor
//         S spawn | P portal (boss anchor) | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('dungeon', `
####################
#........S.........#
#..................#
#..................#
#..##############..#
#..#............#..#
#..#..E......E..#..#
#..#............#..#
#..#.....E......#..#
#..###........###..#
#....~~~~~~~~~~....#
#..###........###..#
#..#.....E......#..#
#..#............#..#
#..#..E......E..#..#
#..#............#..#
#..##############..#
#..................#
#.........P........#
####################
`);
