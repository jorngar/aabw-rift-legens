// Patch v0.1 — Variant B (Maze of Chambers)
// Dungeon zone, 20x20. Corridors twist through walled chambers.
// Multiple dead-ends. Boss anchor deep in the north-west corner —
// requires exploration. Same enemy count as A but distributed to
// punish rushed paths.
//
// Legend: # wall | * rift crack (blocked) | ~ dirt path | . stone floor
//         S spawn | P portal (boss anchor) | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('dungeon', `
####################
#P.......#.........#
#........#..#####..#
#..####..#..#....#.#
#..#..E..#..#.**.#.#
#..#.....#..#.**.#.#
#..#.###.#..#....#.#
#..#.....#.......#.#
#..#####.#########.#
#........#.......E.#
####.....#.####....#
#........#.#..#....#
#..###...#.#..#....#
#..#.E...#.#..#....#
#..#.....#.#..#....#
#..#######.####....#
#..................#
#........E.....E...#
#.................S#
####################
`);
