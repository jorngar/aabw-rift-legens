---
phase: 6
name: Path Compression + Validation
status: pending
priority: P1
depends_on: [1, 3, 4, 5]
blocks: []
estimate: 2h
---

# Phase 6 — Path Compression + End-to-End Validation

## Context Links

- Brainstorm: `plans/reports/brainstorm-260711-1024-ab-testing-data-collection.md`
- Session lifecycle: Phase 3 (`onSessionEnded` callback hook)
- Trajectory ingest: Phase 4

## Overview

On session-end: read all raw `trajectories` rows for that session, run Douglas-Peucker simplification, write ONE row to `paths` with waypoints, delete raw samples. Then validate the whole pipeline with a real playthrough + SQL queries.

## Key Insights

- Path compression is the artifact that matters for the robotics-pitch angle: **one session = one canonical trajectory**.
- Douglas-Peucker with ε ≈ 0.5 tile-units gives 60-80% reduction typical.
- Runs async after session ends (non-blocking for the WS handler).
- Deleting raw trajectory rows keeps the table bounded; only paths accumulate.
- If we skip this phase, agent-phase still works — just queries raw trajectories directly. Cheap safety net.

## Requirements

**Functional:**
- `path-compressor.js` exposes `compressSession(sessionId)` async function
- Uses Douglas-Peucker (ε configurable, default 0.5)
- Writes to `paths` table with `waypoints` JSONB + `sample_count` + `compression_ratio`
- Deletes trajectory rows for that session on success
- Marks `sessions.path_compressed = true`
- Errors caught + logged; never crash the session-end handler

**Non-functional:**
- Runs off-thread of WS handler (fire-and-forget async)
- Idempotent (safe if called twice)

## Architecture

```
Phase 3's sessionManager
  └─ onSessionEnded(sessionId) callback
       └─ enqueue: pathCompressor.compressSession(sessionId)
            ├─ SELECT * FROM trajectories WHERE session_id = ? ORDER BY sampled_at
            ├─ dp = simplify(points, ε=0.5)
            ├─ INSERT INTO paths (session_id, patch_id, variant, waypoints, sample_count, compression_ratio)
            ├─ DELETE FROM trajectories WHERE session_id = ?
            └─ UPDATE sessions SET path_compressed = true WHERE id = ?
```

## Related Code Files

**Create:**
- `packages/server/src/path-compressor.js` (~120 lines)
- `packages/server/src/douglas-peucker.js` (~50 lines) — pure geometry, no DB

**Modify:**
- `packages/server/src/session-manager.js` — invoke compressor in `onSessionEnded` callback (wired in Phase 3, activated here)

## Implementation Steps

### 1. `douglas-peucker.js` (~50 lines)

Standard Douglas-Peucker algorithm on `[{x, y, t, vx, vy}]` points:
```js
export function simplify(points, epsilon) {
  if (points.length < 3) return points;
  const [first, last] = [points[0], points[points.length - 1]];
  let maxDist = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > epsilon) {
    const left = simplify(points.slice(0, index + 1), epsilon);
    const right = simplify(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}
```

Convert `sampled_at` timestamps to millisecond-offsets from session start before passing in.

### 2. `path-compressor.js` (~120 lines)

```js
import { pool } from './db/pool.js';
import { simplify } from './douglas-peucker.js';
import { insertPath, deleteTrajectoriesBySession } from './db/repositories.js';

const EPSILON = 0.5;

export async function compressSession(sessionId) {
  try {
    const { rows: session } = await pool.query(
      `SELECT id, patch_id, variant, path_compressed, started_at FROM sessions WHERE id = $1`, [sessionId]
    );
    if (!session[0] || session[0].path_compressed) return;

    const { rows: raw } = await pool.query(
      `SELECT x, y, vx, vy, sampled_at FROM trajectories WHERE session_id = $1 ORDER BY sampled_at`, [sessionId]
    );
    if (raw.length === 0) return;

    const startMs = new Date(session[0].started_at).getTime();
    const points = raw.map(r => ({
      x: r.x, y: r.y, vx: r.vx, vy: r.vy,
      t: new Date(r.sampled_at).getTime() - startMs,
    }));

    const simplified = simplify(points, EPSILON);
    const compressionRatio = simplified.length / points.length;

    await insertPath({
      sessionId,
      patchId: session[0].patch_id,
      variant: session[0].variant,
      waypoints: simplified,
      sampleCount: points.length,
      compressionRatio,
    });
    await deleteTrajectoriesBySession(sessionId);
    await pool.query(`UPDATE sessions SET path_compressed = true WHERE id = $1`, [sessionId]);
    console.log(`[Compressor] session ${sessionId}: ${points.length} → ${simplified.length} waypoints (${(compressionRatio*100).toFixed(1)}%)`);
  } catch (err) {
    console.error(`[Compressor] failed for session ${sessionId}:`, err.message);
  }
}
```

### 3. Wire into session-manager

In Phase 3's `SessionManager` constructor:
```js
new SessionManager({
  idleTimeoutMs: 60_000,
  onSessionEnded: (sessionId) => {
    // fire and forget
    compressSession(sessionId).catch(err => console.error('[Compressor]', err));
  },
});
```

### 4. End-to-end validation script

Create `packages/server/scripts/validate-collection.sql`:
```sql
-- Sessions summary per variant
SELECT patch_id, variant, COUNT(*) sessions,
       AVG(duration_ms)/1000 avg_seconds,
       AVG(final_gold) avg_gold,
       COUNT(*) FILTER (WHERE completed_rift) completions
FROM sessions
WHERE ended_at IS NOT NULL
GROUP BY patch_id, variant;

-- Defect rate per variant
SELECT variant, defect_type, COUNT(*)
FROM defects GROUP BY variant, defect_type ORDER BY variant;

-- Purchases per variant
SELECT variant, COUNT(*), AVG(price), SUM(price)
FROM purchases GROUP BY variant;

-- Death heatmap sample
SELECT variant, ROUND(x::numeric,0), ROUND(y::numeric,0), COUNT(*)
FROM deaths GROUP BY variant, ROUND(x::numeric,0), ROUND(y::numeric,0)
ORDER BY variant, COUNT(*) DESC LIMIT 20;

-- Path compression stats
SELECT variant, AVG(sample_count) avg_raw,
       AVG(jsonb_array_length(waypoints)) avg_wp,
       AVG(compression_ratio) avg_ratio
FROM paths GROUP BY variant;

-- Orphaned raw trajectories (should be zero for ended sessions)
SELECT COUNT(*) orphaned
FROM trajectories t JOIN sessions s ON s.id = t.session_id
WHERE s.ended_at IS NOT NULL AND s.path_compressed = true;
```

Run via: `psql $DATABASE_URL -f packages/server/scripts/validate-collection.sql`

## Todo List

- [ ] Write douglas-peucker.js
- [ ] Write path-compressor.js
- [ ] Wire onSessionEnded → compressSession in session-manager
- [ ] Write validate-collection.sql
- [ ] Full playthrough: open two tabs (alice, bob), each plays 2 min, closes tab
- [ ] Run validation SQL, confirm expected shape
- [ ] Verify: paths table populated, trajectories table empty for ended sessions

## Success Criteria

1. Session end triggers compressor within 5s (log line appears)
2. Every ended session has a `paths` row within 30s of end
3. `trajectories` table has zero rows for sessions with `path_compressed = true`
4. Waypoints JSONB is a valid array with monotonic `t` values
5. Compression ratio typical range 0.15–0.40 (60-85% reduction)
6. Full validation SQL returns sensible numbers for two-tab test playthroughs
7. No orphaned trajectory rows for ended sessions

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Compressor crashes on weird session (e.g., 0 samples) | Guard: early-return if raw.length === 0 |
| Race: two compressions fire for same session | Idempotent check on `path_compressed` |
| ε too aggressive → loses meaningful path curvature | Tune ε; 0.5 tile-units is conservative. Log ratio to observe |
| DELETE fails after INSERT → orphan trajectories | Wrap in transaction: `BEGIN; INSERT paths; DELETE trajectories; UPDATE sessions; COMMIT;` |
| Very long sessions produce huge waypoint arrays | Add hard cap: if simplified > 500 pts, run DP again with 2ε |

## Security Considerations

- Compressor runs server-side only, reads/writes trusted DB rows
- No user input in this phase

## Next Steps — Agent Phase (deferred)

Once data collection ships and is validated, the agent phase can:
1. Query denormalized tables for winner detection (composite scoring across variant)
2. Auto-propagate: mark losing variant sessions completed, update `patches.status`
3. Live-broadcast winner via WS to active clients
4. Send KPI deltas to Bedrock/Claude for loser-salvage recommendation
5. Add dashboard visualization (variant comparison cards, death heatmap using `deaths.x/y`, path overlay using `paths.waypoints`)
6. Feed `paths` into Data Forge Agent for S3 export (robotics dataset)

## Definition of Done — Whole Plan

- `docker-compose up -d && pnpm --filter server migrate && pnpm dev:all` boots clean
- Two browser tabs (`?playerId=alice`, `?playerId=bob`) play 2-min sessions
- Postgres shows: 2 sessions, 2 assignments (1 A + 1 B), tens of events per type, 2 paths compressed
- validate-collection.sql returns per-variant KPI aggregates
- Zero raw trajectories left for ended sessions
- Ready to build the A/B agent on top
