---
phase: 2
name: Shared Layer — Events + Patches + Map Assets
status: pending
priority: P0
depends_on: [1]
blocks: [3, 5]
estimate: 3-4h
---

# Phase 2 — Shared Layer

## Context Links

- Brainstorm: `plans/reports/brainstorm-260711-1024-ab-testing-data-collection.md`
- Current events: `packages/shared/src/events.js`
- Current config: `packages/shared/src/config.js` (`AB_TESTS` — to be replaced)

## Overview

Add 9 new event types, replace `AB_TESTS` with a `PATCHES` seed structure, define patch JSON schema, and ship 4 minimal hand-designed tilemaps (Garden A/B, Rift Dungeon A/B).

## Key Insights

- **Ship-Small on maps**: start with 10x10 grids (not full 16x16/12x12). Even 6x6 proves the pipeline. Iterate later.
- Maps stored as JSON arrays of tile-type ints + metadata (spawn points, portal, shop, exits).
- Two maps per zone with intentional path differences: **A = linear corridor**, **B = branching maze**.
- `PATCHES` seed data lives in shared config; server upserts to `patches` table on boot if empty.

## Requirements

**Functional:**
- 9 new EventType enum entries
- `PATCHES` config with named patch containing variantA/variantB map bundles
- Patch JSON schema (map layout + spawns + portal/shop positions)
- 4 tilemap JSON assets

**Non-functional:**
- Maps human-editable (ASCII-friendly format acceptable — array of strings or int grid)
- Schema kept in shared package so client + server agree

## Architecture

```
packages/shared/src/
├── events.js               # MODIFY — add 9 event types
├── config.js               # MODIFY — replace AB_TESTS with PATCHES
├── patch.js                # NEW — patch schema helpers + validators
└── maps/
    └── patch-v01/          # NEW
        ├── garden-a.json
        ├── garden-b.json
        ├── dungeon-a.json
        └── dungeon-b.json
```

## Related Code Files

**Create:**
- `packages/shared/src/patch.js`
- `packages/shared/src/maps/patch-v01/garden-a.json`
- `packages/shared/src/maps/patch-v01/garden-b.json`
- `packages/shared/src/maps/patch-v01/dungeon-a.json`
- `packages/shared/src/maps/patch-v01/dungeon-b.json`

**Modify:**
- `packages/shared/src/events.js` — 9 new types + createEvent factories where needed
- `packages/shared/src/config.js` — replace `AB_TESTS` with `PATCHES` (keep old export commented for one commit if needed by agent code)
- `packages/shared/src/index.js` — barrel export patch.js + maps

## Implementation Steps

### 1. `events.js` — add 9 event types

```js
export const EventType = Object.freeze({
  // ... existing ...
  SESSION_STARTED:    'session_started',
  SESSION_ENDED:      'session_ended',
  SHOP_PURCHASE:      'shop_purchase',
  PATH_STUCK:         'path_stuck',
  PATHFIND_FAIL:      'pathfind_fail',
  IMPOSSIBLE_STATE:   'impossible_state',
  JS_ERROR:           'js_error',
  TRAJECTORY_SAMPLE:  'trajectory_sample',
  ENEMY_ENGAGED:      'enemy_engaged',
});
```

### 2. `patch.js` (~80 lines)

```js
// Types (JSDoc for JS project)

/**
 * @typedef {Object} MapAsset
 * @property {number} width
 * @property {number} height
 * @property {number[][]} tiles         // [row][col] = tile-type int
 * @property {{x:number,y:number}} spawn
 * @property {{x:number,y:number}} portal   // rift entry (Garden) or exit (Dungeon)
 * @property {{x:number,y:number}} [shop]   // Garden only
 * @property {Array<{x:number,y:number,type:string}>} enemySpawns
 * @property {string} zone              // 'garden' | 'dungeon'
 */

/**
 * @typedef {Object} PatchVariant
 * @property {MapAsset} garden
 * @property {MapAsset} dungeon
 * @property {string} label
 */

/**
 * @typedef {Object} PatchDef
 * @property {string} name
 * @property {string} description
 * @property {PatchVariant} variantA
 * @property {PatchVariant} variantB
 */

export function validatePatch(patch) { /* asserts shape, throws on invalid */ }
export function hashPlayerToVariant(playerId, patchId) {
  let h = 0;
  const s = `${playerId}::${patchId}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2 === 0 ? 'A' : 'B';
}
```

### 3. `config.js` — replace AB_TESTS with PATCHES

```js
import gardenA from './maps/patch-v01/garden-a.json' with { type: 'json' };
import gardenB from './maps/patch-v01/garden-b.json' with { type: 'json' };
import dungeonA from './maps/patch-v01/dungeon-a.json' with { type: 'json' };
import dungeonB from './maps/patch-v01/dungeon-b.json' with { type: 'json' };

export const PATCHES = Object.freeze({
  'patch-v01': {
    name: 'Patch v0.1 — Corridor vs Maze',
    description: 'A/B test of two rift-portal layouts',
    variantA: { label: 'A — Linear Corridor', garden: gardenA, dungeon: dungeonA },
    variantB: { label: 'B — Branching Maze',  garden: gardenB, dungeon: dungeonB },
  },
});
```

Keep AB_TESTS deleted (not commented) — old code fails loudly, we update those callsites in phase 5.

### 4. Map JSON schema (per file)

```json
{
  "zone": "garden",
  "width": 10,
  "height": 10,
  "tiles": [
    [0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    ...
  ],
  "spawn":  { "x": 1, "y": 1 },
  "portal": { "x": 8, "y": 8 },
  "shop":   { "x": 5, "y": 1 },
  "enemySpawns": [
    { "x": 3, "y": 5, "type": "shadowBeast" },
    { "x": 6, "y": 7, "type": "shadowBeast" }
  ]
}
```

Tile-type convention (agree once, document):
- `0` = grass/floor walkable
- `1` = wall/obstacle
- `2` = path highlight

### 5. Design the 4 maps (Ship-Small: 10x10 each)

**garden-a.json** — Linear corridor: straight vertical path spawn→shop→portal
**garden-b.json** — Branching: forked path, shop on left branch, portal on right
**dungeon-a.json** — Linear: straight run to boss room
**dungeon-b.json** — Maze: 2-3 dead-end branches before reaching boss

Author with ASCII art in comments (or a `.ascii` sibling file) to keep the map editable:
```
##########      # = wall (1)
#S.......#      S = spawn
#.####.#.#      P = portal
#.#..#.#.#      $ = shop
#.####.#.#      E = enemy
#.....E#.#
#.####.#.#
#.#$...#.#
#.####...#
#.......P#
##########
```

Optional: tiny `scripts/ascii-to-map.js` (30 lines) converts a text file to JSON. Worth an hour if you'll iterate maps.

### 6. Barrel export

`packages/shared/src/index.js`:
```js
export * from './config.js';
export * from './events.js';
export * from './patch.js';
```

## Todo List

- [ ] Add 9 event types to events.js
- [ ] Create patch.js with validators + hashPlayerToVariant
- [ ] Replace AB_TESTS with PATCHES in config.js
- [ ] Author garden-a.json (linear, 10x10)
- [ ] Author garden-b.json (branching, 10x10)
- [ ] Author dungeon-a.json (linear, 10x10)
- [ ] Author dungeon-b.json (maze, 10x10)
- [ ] Update index.js barrel export
- [ ] (Optional) ascii-to-map.js helper

## Success Criteria

1. `import { PATCHES, EventType } from '@rift-seed/shared'` works from both client + server
2. `PATCHES['patch-v01'].variantA.garden.tiles` is a 10x10 array
3. `hashPlayerToVariant('alice', 'patch-v01')` returns `'A'` or `'B'` deterministically
4. `EventType.SHOP_PURCHASE === 'shop_purchase'`
5. All 4 maps validate against `validatePatch()`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Hand-drawn maps take longer than budget | Ship-Small: 6x6 is fine for v1. Iterate later |
| Tile-type constants drift between client/server | Freeze in shared/patch.js as `TILE_TYPES` |
| JSON import syntax `with { type: 'json' }` needs Node 22+ | Verify pnpm dev:server node version. Fallback: readFileSync + JSON.parse |
| Existing code imports AB_TESTS and breaks | Phase 5 fixes callsites. Server code (ab-testing-agent.js) breaks first — expected |

## Security Considerations

- Map JSON is trusted static data (bundled). No injection risk.
- Patch id used in DB queries — validate against known keys before persisting.

## Next Steps

- Phase 3 uses `PATCHES` seed + event types to wire session-manager + WS handlers
- Phase 5 uses maps to render tilemap on client
