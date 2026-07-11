// Patch v0.1 — Variant A, Layout 3 (Cross Pockets)
// Dungeon zone, 20x20. Four corner pocket chambers surrounding a
// central plaza. Player traverses N→S across the plaza while ranged
// mobs kite from the corner pockets. Sight lines stay long.
//
// Legend: # wall | * rift crack (blocked) | ~ dirt path | . stone floor
//         S spawn | P portal (boss anchor) | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('dungeon', `
####################
#........S.........#
#..................#
#..####......####..#
#..#..#......#..#..#
#..#E.#......#.E#..#
#..####......####..#
#..................#
#........~~........#
#....E...~~...E....#
#........~~........#
#..................#
#..####......####..#
#..#..#......#..#..#
#..#E.#......#.E#..#
#..####......####..#
#..................#
#..................#
#.........P........#
####################
`);
