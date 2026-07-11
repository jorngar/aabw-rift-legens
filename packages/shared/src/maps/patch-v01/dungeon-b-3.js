// Patch v0.1 — Variant B, Layout 3 (Winding Approach)
// Dungeon zone, 20x20. Chain of three walled chambers connected by
// narrow gaps. Player must snake through — no straight line to
// portal, encouraging exploration and ambush combat.
//
// Legend: # wall | * rift crack (blocked) | ~ dirt path | . stone floor
//         S spawn | P portal (boss anchor) | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('dungeon', `
####################
#S..#..............#
#...#...E..........#
#...#..............#
#...##########.....#
#..................#
#..............E...#
#..############....#
#..#...........#...#
#..#....E......#...#
#..#...........#...#
#..############....#
#..............E...#
#..................#
#......#########...#
#......#.......#...#
#......#...E...#...#
#......#.......#...#
#......#...P...#...#
####################
`);
