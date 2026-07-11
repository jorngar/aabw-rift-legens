---
phase: 3
name: Server Pipeline — Session Manager + WS + DB Writes
status: pending
priority: P0
depends_on: [1, 2]
blocks: [5]
estimate: 2-3h
---

# Phase 3 — Server Pipeline

## Context Links

- Brainstorm: `plans/reports/brainstorm-260711-1024-ab-testing-data-collection.md`
- Current server: `packages/server/src/server.js`
- Current AB agent: `packages/server/src/agents/ab-testing-agent.js`

## Overview

Add server-side session lifecycle (WS connect → create session, WS close/60s idle → end session) and wire WS event ingest to write to Postgres. Rewire A/B agent to persist assignments in DB (not in-memory Map).

## Key Insights

- Sessions are the JOIN key for every KPI query. Every event MUST carry `session_id`.
- Server owns session boundaries (spoof-resistant).
- WS lifecycle events (connect / close) + inactivity timer drive session end.
- Fan-out: incoming `events` batch → raw `events` table + denormalized table based on `event_type`.
- Path compression is async and lives in Phase 6, but hook the trigger here (event: session-ended → enqueue compression job).

## Requirements

**Functional:**
- On WS connect (game client): server creates `sessions` row, replies `{ type: 'session:init', sessionId, patchId, variant, mapConfig }`
- On `telemetry:batch` receive: fan out to correct tables using `session_id` attached to each event
- On WS close OR 60s no telemetry: end session (populate `ended_at`, `duration_ms`, `end_reason`)
- On session end: emit internal 'session:ended' event that Phase 6 subscribes to
- On server boot: seed `PATCHES` into `patches` table if empty

**Non-functional:**
- Session end idempotent (safe to call twice)
- DB writes batched per WS message (single transaction per batch)
- Errors logged, never crash the WS handler

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    server.js                           │
│  ┌──────────────────────────────────────────────┐      │
│  │  WS handler                                  │      │
│  │  ├─ connect → sessionManager.startSession()  │      │
│  │  │            → send session:init            │      │
│  │  ├─ telemetry:batch → sessionManager.ingest()│      │
│  │  │                 → writers.fanOut()        │      │
│  │  └─ close → sessionManager.endSession()      │      │
│  └──────────────────────────────────────────────┘      │
│                                                        │
│  ┌──────────────────────────────────────────────┐      │
│  │  session-manager.js                          │      │
│  │  - Map<ws, {sessionId, patchId, variant,     │      │
│  │              idleTimer, lastActivityAt}>     │      │
│  │  - startSession, endSession, ingest,         │      │
│  │    onIdleTimeout, subscribeOnEnd             │      │
│  └──────────────────────────────────────────────┘      │
│                                                        │
│  ┌──────────────────────────────────────────────┐      │
│  │  event-writers.js                            │      │
│  │  - fanOut(sessionId, events[]) →             │      │
│  │      insertEventBatch + per-type dispatch    │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────┘
```

## Related Code Files

**Create:**
- `packages/server/src/session-manager.js`
- `packages/server/src/event-writers.js`
- `packages/server/src/patch-seeder.js`

**Modify:**
- `packages/server/src/server.js` — wire session lifecycle + rewire message handlers
- `packages/server/src/agents/ab-testing-agent.js` — rewrite to use DB (assignments + query snapshot from tables)

## Implementation Steps

### 1. `patch-seeder.js` (~30 lines)

```js
import { PATCHES } from '@rift-seed/shared';
import { query } from './db/pool.js';
import { insertPatch } from './db/repositories.js';

export async function seedPatches() {
  const { rowCount } = await query('SELECT id FROM patches LIMIT 1');
  if (rowCount > 0) return;
  for (const [key, patch] of Object.entries(PATCHES)) {
    await insertPatch({
      name: patch.name,
      description: patch.description,
      variantA: patch.variantA,
      variantB: patch.variantB,
    });
    console.log(`[Seed] patch ${key}`);
  }
}
```

Call from server boot after migration.

### 2. `session-manager.js` (~150 lines)

Interface:
```js
export class SessionManager {
  constructor({ idleTimeoutMs = 60_000, onSessionEnded }) {}
  async startSession(ws, playerId, patchId) { /* returns { sessionId, variant, patch } */ }
  async ingest(ws, events) { /* resets idle timer, calls event-writers.fanOut */ }
  async endSession(ws, reason) { /* idempotent, emits onSessionEnded */ }
  getSession(ws) { /* returns entry or null */ }
}
```

Internals:
- `Map<WebSocket, Entry>` where Entry = `{ sessionId, playerId, patchId, variant, idleTimerId, lastActivityAt }`
- `startSession`: read active patch from DB → hash player → upsert assignment → create session → set idle timer → return init payload
- `ingest`: reset idle timer, delegate to writers
- `endSession`: clear timer, update DB row, emit callback with sessionId (Phase 6 listens)
- Idle callback → `endSession(ws, 'idle')` then `ws.terminate()` gracefully

### 3. `event-writers.js` (~120 lines)

```js
export async function fanOut(sessionId, patchId, variant, events) {
  // 1. Always insert raw
  await insertEventBatch(events.map(e => ({
    sessionId,
    eventType: e.type,
    payload: e.payload || {},
    x: e.payload?.x ?? null,
    y: e.payload?.y ?? null,
  })));

  // 2. Fan out per type
  const traj = [], purchases = [], defects = [], deaths = [], engagements = [];
  for (const e of events) {
    switch (e.type) {
      case 'trajectory_sample':
        traj.push({ sessionId, ...e.payload });
        break;
      case 'shop_purchase':
        purchases.push({ sessionId, patchId, variant, ...e.payload });
        break;
      case 'path_stuck':
      case 'pathfind_fail':
      case 'js_error':
      case 'impossible_state':
        defects.push({ sessionId, patchId, variant, defectType: e.type, context: e.payload, x: e.payload?.x, y: e.payload?.y });
        break;
      case 'death':
        deaths.push({ sessionId, patchId, variant, killedBy: e.payload?.killedBy, x: e.payload?.x, y: e.payload?.y, mapZone: e.payload?.mapZone });
        break;
      case 'enemy_engaged':
        engagements.push({ sessionId, patchId, variant, ...e.payload });
        break;
    }
  }
  await Promise.all([
    traj.length && insertTrajectoryBatch(traj),
    purchases.length && Promise.all(purchases.map(insertPurchase)),
    defects.length && Promise.all(defects.map(insertDefect)),
    deaths.length && Promise.all(deaths.map(insertDeath)),
    engagements.length && Promise.all(engagements.map(insertEngagement)),
  ].filter(Boolean));
}
```

### 4. `server.js` modifications

- Call `migrate()` (optional — allow separate script) then `seedPatches()` on boot
- Instantiate `SessionManager` with an `onSessionEnded` callback (Phase 6 wires compression here)
- WS `connection` handler: extract `playerId` from URL query (`?playerId=xyz`) or generate one
- WS `message` handler cases:
  - `session:hello` (client → server): call `startSession`, reply with `session:init`
  - `telemetry:batch`: call `sessionManager.ingest(ws, msg.events)`
  - Keep old `ab:*` handlers deprecated / delete
- WS `close`: `sessionManager.endSession(ws, 'disconnect')`

### 5. Rewrite `ab-testing-agent.js` (~100 lines)

Turn it into a **DB query facade**, not an in-memory Map:
```js
export class ABTestingAgent {
  constructor({ pool }) { this.pool = pool; }
  async getSnapshot() {
    // SQL: SELECT patch_id, variant, COUNT(*) as sessions, AVG(duration_ms), ...
    return {...};
  }
  async getStatus() { /* SELECT COUNT(*) FROM patches WHERE status='active' */ }
}
```

Agent-phase (next scope) will add winner detection here.

## Todo List

- [ ] Write patch-seeder.js
- [ ] Write session-manager.js
- [ ] Write event-writers.js
- [ ] Rewire server.js (WS handlers, boot sequence)
- [ ] Rewrite ab-testing-agent.js as DB facade
- [ ] Manually test: connect WS, verify session row created; disconnect, verify ended_at populated
- [ ] Test idle timeout by waiting 60s+ with no messages

## Success Criteria

1. `pnpm dev:server` boots: `[DB] connected`, `[Seed] patch patch-v01`, `[WS] ready`
2. Open WS to `ws://localhost:3001/ws?playerId=alice` → receive `session:init` message with `sessionId`, `variant`, `mapConfig`
3. `SELECT * FROM sessions` shows row with `ended_at IS NULL`
4. Close WS → `ended_at` populated, `end_reason = 'disconnect'`
5. Idle 60s+ → session auto-ends with `end_reason = 'idle'`, WS terminated
6. Send `telemetry:batch` with a fake `shop_purchase` event → row appears in `events` AND `purchases` tables

## Risk Assessment

| Risk | Mitigation |
|---|---|
| WS handler crash on bad message → silent session leak | Wrap in try/catch, log + endSession('error') |
| Race condition: close fires while ingest in-flight | Idempotent endSession + await pending writes |
| pg pool exhaustion at high event rates | Batch inserts (already planned); max pool 10 fine for demo |
| Client sends events without session_id | Server derives from `ws` connection map — client never sends session_id |
| Existing dashboard clients break (old ws message types) | Keep dashboard broadcast for `ab:update` working from DB snapshots |

## Security Considerations

- `playerId` from URL query is client-controlled — treat as opaque string, hash before storing
- Session IDs are server-generated UUIDs, unguessable
- No auth for hackathon; document as known gap for production

## Next Steps

- Phase 4 adds client-side samplers that emit the new event types
- Phase 5 wires client to consume `session:init` payload and use `mapConfig`
- Phase 6 subscribes to `onSessionEnded` for path compression
