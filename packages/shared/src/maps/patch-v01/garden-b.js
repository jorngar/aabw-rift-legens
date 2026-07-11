// Patch v0.1 — Variant B (Chambered Corridors)
// Garden zone, 20x20. Walled chambers connected by narrow corridors
// force players to weave through the map. Shop tucked into a side
// pocket; portal at the north-east. Longer average path than A.
//
// Legend: # wall | * rift crack (blocked) | ~ dirt path | . grass floor
//         S spawn | P portal | $ shop | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('garden', `
####################
#S........#.......P#
#.........#........#
#.###.....#.....##.#
#.#..E....#........#
#.#.......###......#
#.#................#
#.#####.......E....#
#........~~~~......#
#........~..~......#
#.......E~$.~......#
#........~..~......#
#........~~~~......#
#..........#.......#
#..###.....#....E..#
#....*.....#####...#
#....*.............#
#....**............#
#..................#
####################
`);
