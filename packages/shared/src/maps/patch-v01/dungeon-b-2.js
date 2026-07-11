// Patch v0.1 — Variant B, Layout 2 (Grid Chambers)
// Dungeon zone, 20x20. Six small tightly-walled chambers arranged
// 3-across at top and bottom, with a walled central room between.
// Enemies packed into rooms — melee kiting is punishing.
//
// Legend: # wall | * rift crack (blocked) | ~ dirt path | . stone floor
//         S spawn | P portal (boss anchor) | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('dungeon', `
####################
#S.................#
#..................#
#.####..####..####.#
#.#..#..#..#..#..#.#
#.#E.#..#E.#..#E.#.#
#.####..####..####.#
#..................#
#....##########....#
#....#........#....#
#....#....E...#....#
#....#........#....#
#....##########....#
#..................#
#.####..####..####.#
#.#..#..#..#..#..#.#
#.#E.#..#E.#..#E.#.#
#.####..####..####.#
#........P.........#
####################
`);
