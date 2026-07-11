// Patch v0.1 — Variant A (Linear Corridor)
// Garden zone: straight north→south path with shop in the middle
// and portal in the bottom-right corner.
//
// Legend: # wall | . floor | S spawn | P portal | $ shop | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('garden', `
##########
#S.......#
#........#
#..E.....#
#........#
#....$...#
#........#
#.....E..#
#.......P#
##########
`);
