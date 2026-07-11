---
phase: 5
name: Client Integration — Tilemap Loader + Assignment Flow
status: pending
priority: P1
depends_on: [2, 3]
blocks: [6]
estimate: 2-3h
---

# Phase 5 — Client Integration

## Context Links

- Brainstorm: `plans/reports/brainstorm-260711-1024-ab-testing-data-collection.md`
- Existing tilemap: `packages/client/src/engine/tilemap.js`
- Existing AB client: `packages/client/src/systems/ab-testing.js`
- Existing main: `packages/client/src/main.js`

## Overview

Client stops rolling its own variant + procedural map. Instead: WS-request a session → receive `{sessionId, variant, mapConfig}` from server → render the assigned variant's tilemap. This is where the pipeline becomes end-to-end.

## Key Insights

- **Server owns assignment.** Client sends `playerId`, server responds with variant + map JSON.
- **Tilemap becomes data-driven.** Current procedural generator stays for fallback; new code path renders from JSON array.
- **Zone switching (Garden ↔ Dungeon)** must swap map assets accordingly.
- Enemies spawn from `map.enemySpawns` array in JSON, not procedural.

## Requirements

**Functional:**
- Client connects WS with `?playerId=<id>`, sends `session:hello`
- On `session:init` message: store sessionId, apply mapConfig for current zone
- Tilemap renders from `mapConfig.tiles` (2D int array) + spawn/portal/shop positions
- Zone transition (garden → dungeon) swaps to the corresponding variant map
- Enemies spawn from `enemySpawns` array

**Non-functional:**
- Keep existing procedural code as fallback (guard: `if (mapConfig) renderFromJSON else renderProcedural`)
- Tilemap file stays under 200 lines (extract to `tilemap-json-renderer.js` if needed)

## Architecture

```
WS connect (?playerId=alice)
  → send { type: 'session:hello', playerId, patchId: 'patch-v01' }
  ← recv { type: 'session:init', sessionId, variant: 'A', patchDef, mapConfig: { garden, dungeon } }
  → telemetry.setSessionId(sessionId)
  → currentMap = mapConfig.garden
  → tilemap.renderFromJSON(currentMap)
  → spawn enemies from currentMap.enemySpawns
  → position player at currentMap.spawn

Zone transition (portal used):
  → currentMap = mapConfig.dungeon
  → tilemap.renderFromJSON(currentMap)
  → spawn enemies + boss
```

## Related Code Files

**Modify:**
- `packages/client/src/main.js` — WS init + session:init handler + zone switching
- `packages/client/src/systems/ab-testing.js` — becomes server-driven (or delete entirely; assignment now server-side)
- `packages/client/src/engine/tilemap.js` — add `renderFromJSON(mapAsset)` path
- `packages/client/src/systems/telemetry.js` — WS URL includes playerId query

**Create:**
- `packages/client/src/engine/tilemap-json-renderer.js` — split if tilemap.js exceeds 200 lines

## Implementation Steps

### 1. Delete or slim `ab-testing.js` client

Assignment is server-side now. Options:
- **Delete** `ab-testing.js` entirely, since server tells us the variant.
- **Keep** as a thin store: `currentAssignment = {sessionId, variant, patchDef}` with getter methods.

Recommend: keep as thin store (~40 lines) — main.js has one clean import.

```js
export class ABAssignment {
  constructor() { this.sessionId = null; this.variant = null; this.patchDef = null; this.mapConfig = null; }
  apply({ sessionId, variant, patchDef, mapConfig }) { Object.assign(this, { sessionId, variant, patchDef, mapConfig }); }
  getVariantMap(zone) { return this.mapConfig?.[zone] ?? null; }
}
```

### 2. `main.js` — WS + session flow

Existing WS init is inside `telemetry.js` today. Approach: keep telemetry's WS, add session handshake INSIDE the existing WS `onopen`:

```js
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'session:hello', playerId, patchId: 'patch-v01' }));
};
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.type === 'session:init') {
    assignment.apply(data);
    telemetry.setSessionId(data.sessionId);
    onAssignmentReady();  // resolves a promise that main.js awaits before spawning world
  }
};
```

`main.js` bootstrap becomes:
```js
await assignmentReady;   // wait for session:init
const gardenMap = assignment.getVariantMap('garden');
tilemap.renderFromJSON(gardenMap);
spawnPlayerAt(gardenMap.spawn);
spawnEnemies(gardenMap.enemySpawns);
startTrajectorySampler();
startDefectDetector();
```

### 3. `tilemap.js` — add JSON renderer

Current `tilemap.js` uses seeded procedural. Add a branch:

```js
export function renderTilemap(container, options) {
  if (options.mapAsset) return _renderFromJSON(container, options.mapAsset);
  return _renderProcedural(container, options);  // existing path
}

function _renderFromJSON(container, mapAsset) {
  const { width, height, tiles } = mapAsset;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y][x];
      // Reuse existing diamond shape logic; pick color by tile type
      _drawDiamondTile(container, x, y, colorForType(t));
    }
  }
  // Draw markers for portal, shop, spawn (for debugging)
}
```

Keep the file under 200 lines. If it grows, extract `tilemap-json-renderer.js`.

### 4. Zone transition

Wherever the existing code changes zone (portal handler in `riftSystem.js`):
```js
const dungeonMap = assignment.getVariantMap('dungeon');
tilemap.renderFromJSON(dungeonMap);
spawnEnemies(dungeonMap.enemySpawns);
```

### 5. `telemetry.js` — WS URL with playerId

```js
const wsUrl = `ws://localhost:3001/ws?playerId=${encodeURIComponent(playerId)}`;
this.ws = new WebSocket(wsUrl);
```

### 6. Cleanup

- Delete unused `AB_TESTS` references (they were removed in Phase 2; clean any lingering imports)
- Remove any client-side deterministic-hash code (assignment is server-side)

## Todo List

- [ ] Slim ab-testing.js to ABAssignment store (or delete)
- [ ] Wire session:hello / session:init WS handshake in main.js
- [ ] Add renderFromJSON path in tilemap.js
- [ ] Update player + enemy spawn to use map JSON positions
- [ ] Update zone transition in riftSystem.js
- [ ] Update telemetry.js WS URL to include playerId
- [ ] Remove dead ab-testing legacy code
- [ ] Manual test: two browser tabs with different ?playerId → observe different maps rendered

## Success Criteria

1. Open browser → different `?playerId` yields different variant (assign in DB confirms)
2. Assigned map JSON renders correctly (walls, floor, spawn point matches)
3. Player spawns at `map.spawn` coordinates
4. Enemies appear at `map.enemySpawns` positions (not procedural)
5. Enter portal → dungeon variant map renders
6. Two browser tabs with different playerIds → BOTH `sessions` rows exist in DB, one variant A + one variant B
7. All telemetry events reach DB with correct `session_id`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Game boot depends on WS reply (network race) | Show loading screen until `session:init` resolves; timeout after 5s → fallback to procedural + local hash (dev-only) |
| Tile-type constants mismatch (client colors vs. JSON ints) | Freeze constants in `shared/patch.js` `TILE_TYPES` |
| Existing procedural code path breaks | Keep it as fallback branch — don't delete yet |
| Server not running → client can't play | Explicit error UI: "Server unreachable — start pnpm dev:server" |
| Zone transition mid-session doesn't refresh trajectory sampler's zone | Sampler reads zone via callback ref — no reset needed |

## Security Considerations

- `playerId` in URL query = not authenticated. Fine for hackathon.
- Map JSON is trusted (bundled with client via shared)
- Server validates `patchId` against known keys before creating session

## Next Steps

- Phase 6 processes trajectories collected during play into canonical paths on session-end
- After Phase 6: full end-to-end pipeline demonstrable; ready for agent phase
