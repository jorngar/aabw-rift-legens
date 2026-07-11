// Patch v0.1 — Variant A (Open Plaza with Rift Ruins)
// Garden zone, 20x20. Broad open ground broken up by four rift-scarred
// obelisk clusters. Shop sits inside the plaza; portal at the far
// south-east corner. Wide sightlines, few chokepoints.
//
// Legend: # wall | * rift crack (blocked) | ~ dirt path | . grass floor
//         S spawn | P portal | $ shop | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('garden', `
####################
#S.................#
#..................#
#..***......***....#
#..*.*......*.*....#
#..***......***....#
#.............E....#
#...~~~~~~~~~~.....#
#...~.........~....#
#...~....$....~....#
#...~.........~....#
#...~~~~~~~~~~.....#
#...E..............#
#..***......***....#
#..*.*..E...*.*....#
#..***......***....#
#..................#
#..................#
#.................P#
####################
`);
