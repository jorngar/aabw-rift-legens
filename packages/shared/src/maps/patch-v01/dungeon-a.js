// Patch v0.1 — Variant A (Boss Arena)
// Dungeon zone, 20x20. Long approach corridor opens into a large boss
// arena. Pillars in the arena give some cover; portal marks the boss
// anchor. Cleaner sightlines than variant B — favours ranged tactics.
//
// Legend: # wall | * rift crack (blocked) | ~ dirt path | . stone floor
//         S spawn | P portal (boss anchor) | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('dungeon', `
####################
#........S.........#
#..................#
#........~.........#
#........~.........#
#....E...~...E.....#
#........~.........#
#........~.........#
#..................#
#..####......####..#
#..#............#..#
#..#..*......*..#..#
#..#....E..E....#..#
#..#............#..#
#..####......####..#
#..................#
#..................#
#.......E..E.......#
#.........P........#
####################
`);
