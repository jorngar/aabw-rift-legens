// Patch v0.1 — Variant A (Linear Boss Run)
// Dungeon zone: open arena, two waves of enemies. The portal marks the
// exit/boss anchor position — the boss (riftKnight) is spawned by the
// game runtime (client) when the normal wave is cleared, not by this file.
//
// Legend: # wall | . floor | S spawn | P portal (boss/exit anchor) | E enemy
import { parseLayout } from '../../patch.js';

export default parseLayout('dungeon', `
##########
#.S......#
#........#
#..E.E...#
#........#
#........#
#..E.E...#
#........#
#....P...#
##########
`);
