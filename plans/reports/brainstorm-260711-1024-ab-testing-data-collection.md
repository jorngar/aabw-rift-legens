---
type: brainstorm
scope: data-collection-only
project: SimForge Rift Legends
date: 2026-07-11
status: agreed
next_phase: agent (winner detection + auto-propagate + loser-insight LLM)
---

# Brainstorm — A/B Testing Data Collection Layer

## Problem Statement

Current codebase has A/B testing scaffolding (deterministic hash cohorts + Welch's t-test on in-memory Maps) but:
- Only tests SINGLE-PARAM changes (skill cooldown, enemy count) — not true "game patches"
- No persistence — server restart = data loss
- No purchase event wiring
- No defect/bug event source (counter exists, nothing produces events)
- Session concept absent server-side

**User goal:** Ship a real A/B test — TWO game versions (different maps + paths) — collect rich telemetry per variant into Postgres, so a follow-up agent phase can pick the winner and generate loser-salvage recommendations.

**Explicitly OUT OF SCOPE for this phase:** winner determination, auto-propagation, LLM recommendations. Data collection only.

---

## Requirements

### Functional
- Define a "patch" = a bundle representing an entire game version (Garden map + Rift Dungeon map + spawns + shop layout)
- Two hand-designed variants per patch (A: linear/corridor, B: branching/maze)
- Deterministic player-to-variant assignment persisted to DB
- Server-owned sessions (created on WS connect, closed on WS close or 60s idle)
- Collect: session duration, shop purchases, defects (stuck / pathfind-fail / JS error / impossible state), death locations, completion time, movement trajectories, enemy engagement stats
- Trajectories stored raw temporarily → compressed to canonical `path` per session at session end
- Postgres via Docker (docker-compose)

### Non-functional
- Never lose events → raw `events` table alongside denormalized per-KPI tables
- Fast agent-side queries later → denormalized tables (`deaths`, `purchases`, etc.) hit indexes, not JSONB scans
- ≤ ~1000 trajectory rows/session (2s tick × 30min) — Postgres handles trivially
- After path-compression, raw trajectory rows can be purged (storage + robotics-artifact alignment)

---

## Approaches Evaluated

### Q1 — Patch shape

| Option | Verdict |
|---|---|
| Single-param tests (current) | Rejected — doesn't match "game version" framing |
| Named bundle = whole game version A vs B | **Chosen** — matches user vision, unlocks map A/B |
| Patch→Tests→Variants (3-tier) | Rejected — overkill for hackathon |

### Q2 — Map variation depth

| Option | Verdict |
|---|---|
| Seeded procedural (same generator, different seed) | Not chosen — variation is random, not designed |
| **Hand-designed tilemaps with intentional path differences** | **Chosen** — clearer story ("corridor vs maze"). Cost: 4-8h level work |
| Same map, different spawn positions | Rejected — too weak a variation |

**Risk flag:** Hand-designed = biggest time sink. Recommend Ship-Small strategy: minimum-viable maps first (10x10), expand only after DB pipeline proves out.

### Q3 — Map scope

| Option | Verdict |
|---|---|
| Rift Dungeon only | Rejected — user wants full-game framing |
| Garden only | Rejected — weaker combat signal |
| **Both Garden AND Rift** | **Chosen** — full "game version" story |

**Trade-off accepted:** Doubled variation surface = harder to attribute KPI shifts to specific changes. Acceptable for demo narrative. Attribution problem is agent-phase concern anyway.

### Q4 — DB choice

| Option | Verdict |
|---|---|
| SQLite | Rejected — weak for enterprise pitch |
| **Postgres via Docker** | **Chosen** — matches AWS/enterprise story |
| Postgres native install | Rejected — assumes host-installed Postgres |

### Q5 — KPI bundle

| Option | Verdict |
|---|---|
| CORE (5 KPIs) | Not chosen — misses spatial signals |
| CORE + trajectories | Not chosen — misses combat engagement |
| **CORE + trajectories + engagement (MAX)** | **Chosen** — full dataset |
| MINIMAL | Rejected — too weak for a map A/B |

### Q6 — Session boundary

| Option | Verdict |
|---|---|
| **Server-generated on WS connect** | **Chosen** — server owns truth, spoof-resistant |
| Client-UUID upsert | Rejected — client can fake |
| Session-spans-multiple-browser-sessions | Rejected — hard to define endpoint |

### Q7 — Defect sources

| Source | Include? |
|---|---|
| Auto: stuck (30s no move), impossible state, pathfind-fail | **Yes** |
| Client-side error hook (window.onerror + Pixi errors) | **Yes** |
| In-game "Report Bug" button | No |
| Simulated bugs on variant B | No |

### Q8 — Purchase source

**Clarified:** IAP (crystals) is PREMIUM feature (not A/B relevant). In-game **shop** (F-key opens shopUI) buying items with gold IS the A/B-relevant purchase behavior. Wire `SHOP_PURCHASE` event from shopUI transaction handler.

### Q9 — Demo traffic (both variants populated)

**Deferred to agent phase** — user explicit choice. Data-collection phase does not need synthetic traffic. Real single-player sessions accumulate over time; agent-phase will address the "how do we see both sides in one demo" problem separately (options logged: URL param `?player=alpha/beta`, seed script, or admin API).

### Q10 — Trajectory storage strategy

**Chosen:** Store all raw samples at 2s tick temporarily. On session end, run path-compression (Douglas-Peucker or similar) to produce ONE canonical `path` per session. Delete raw trajectory rows after compression.

**Why this rocks:**
- Storage bounded (paths, not raw samples, accumulate)
- Robotics-pitch alignment perfect (session → one imitation-learning trajectory artifact)
- Path table is the natural input for the Data Forge Agent later

---

## Final Recommended Solution

### Postgres Schema (8 tables)

```sql
-- Registered patches (game version definitions)
CREATE TABLE patches (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,               -- "Patch v0.2 — Corridor vs Maze"
  description   TEXT,
  variant_a     JSONB NOT NULL,              -- { garden_map, dungeon_map, spawns, shop_pos }
  variant_b     JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | completed | archived
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Player→variant assignments (deterministic hash, persisted for audit)
CREATE TABLE assignments (
  id            SERIAL PRIMARY KEY,
  player_id     TEXT NOT NULL,
  patch_id      INT NOT NULL REFERENCES patches(id),
  variant       CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, patch_id)
);

-- Server-owned session (one WS-connect → one row)
CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         TEXT NOT NULL,
  patch_id          INT NOT NULL REFERENCES patches(id),
  variant           CHAR(1) NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  duration_ms       INT,
  end_reason        TEXT,                     -- disconnect | idle | quit
  completed_rift    BOOLEAN DEFAULT FALSE,
  final_gold        INT,
  final_xp          INT,
  final_level       INT,
  path_compressed   BOOLEAN DEFAULT FALSE     -- flag: trajectory→path done
);

-- Raw audit log (never lose)
CREATE TABLE events (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  x             REAL,
  y             REAL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_session_type ON events(session_id, event_type);

-- Denormalized: purchases
CREATE TABLE purchases (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  patch_id      INT NOT NULL,
  variant       CHAR(1) NOT NULL,
  item_id       TEXT NOT NULL,
  price         INT NOT NULL,
  gold_before   INT,
  gold_after    INT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Denormalized: defects
CREATE TABLE defects (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  patch_id      INT NOT NULL,
  variant       CHAR(1) NOT NULL,
  defect_type   TEXT NOT NULL,              -- stuck | pathfinding_fail | js_error | impossible_state
  context       JSONB,
  x             REAL,
  y             REAL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Denormalized: deaths (heatmap source)
CREATE TABLE deaths (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  patch_id      INT NOT NULL,
  variant       CHAR(1) NOT NULL,
  killed_by     TEXT,
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  map_zone      TEXT,                        -- garden | dungeon
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw trajectory samples (temporary buffer)
CREATE TABLE trajectories (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  vx            REAL,
  vy            REAL,
  map_zone      TEXT NOT NULL,
  sampled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_traj_session ON trajectories(session_id, sampled_at);

-- Compressed canonical path per session (robotics artifact)
CREATE TABLE paths (
  id             BIGSERIAL PRIMARY KEY,
  session_id     UUID NOT NULL REFERENCES sessions(id) UNIQUE,
  patch_id       INT NOT NULL,
  variant        CHAR(1) NOT NULL,
  waypoints      JSONB NOT NULL,              -- [{x,y,t,vx,vy}, ...] simplified
  sample_count   INT NOT NULL,                -- raw samples compressed
  compression_ratio REAL,
  compressed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Denormalized: enemy engagement
CREATE TABLE engagements (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  patch_id      INT NOT NULL,
  variant       CHAR(1) NOT NULL,
  enemy_type    TEXT NOT NULL,
  damage_dealt  INT,
  damage_taken  INT,
  killed        BOOLEAN,
  x             REAL,
  y             REAL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Session Lifecycle (Server)

```
WS connect
  → assignPlayer(playerId, activePatchId) → variant
  → INSERT sessions (returns session_id)
  → send { session_id, variant, map_config } to client
  → start 60s idle timer

event batch received (every 2s from client)
  → INSERT events (raw) as batch
  → fan out to denormalized tables based on event_type
  → reset idle timer

WS close OR 60s idle
  → UPDATE sessions SET ended_at, duration_ms, end_reason, final_*
  → run path-compression job (async): trajectories[session_id] → paths
  → DELETE FROM trajectories WHERE session_id = ?
```

### New Event Types (shared/events.js)

```
SESSION_STARTED         (server-emitted)
SESSION_ENDED           (server-emitted)
SHOP_PURCHASE           (client, on F-shop transaction)
PATH_STUCK              (client, 30s no movement)
PATHFIND_FAIL           (client, A* returns null)
IMPOSSIBLE_STATE        (client, HP<0 or gold<0 detected)
JS_ERROR                (client, window.onerror hook)
TRAJECTORY_SAMPLE       (client, 2s tick)
ENEMY_ENGAGED           (client, on damage exchange, both directions)
```

### File Inventory

**Create:**
- `docker-compose.yml` — Postgres 16-alpine, single service, volume mount
- `packages/server/src/db/pool.js` — pg pool config
- `packages/server/src/db/schema.sql` — DDL above
- `packages/server/src/db/migrate.js` — idempotent schema apply
- `packages/server/src/db/repositories.js` — insert helpers per table
- `packages/server/src/session-manager.js` — WS→session tracking + idle timer + close hook
- `packages/server/src/path-compressor.js` — Douglas-Peucker + trajectory→paths job
- `packages/client/src/systems/defect-detector.js` — stuck/error/pathfind hooks
- `packages/client/src/systems/trajectory-sampler.js` — 2s position tick
- `packages/shared/src/patch.js` — patch/variant JSON schema types
- Map assets: `packages/shared/src/maps/patch-v01/{garden_a,garden_b,dungeon_a,dungeon_b}.json`

**Modify:**
- `packages/shared/src/events.js` — add 9 new event types
- `packages/shared/src/config.js` — replace `AB_TESTS` with `PATCHES` seed data
- `packages/server/src/server.js` — wire session manager, batch DB writes, session-end hooks
- `packages/server/src/agents/ab-testing-agent.js` — READ from DB (in-memory Map becomes cache layer only)
- `packages/client/src/main.js` — receive session_id + map_config from server; boot samplers
- `packages/client/src/systems/ab-testing.js` — request assignment from server (not local hash); use returned map
- `packages/client/src/engine/tilemap.js` — accept map JSON instead of pure procedural
- `packages/client/src/systems/telemetry.js` — attach session_id to every batched event

---

## Implementation Considerations & Risks

| Risk | Mitigation |
|---|---|
| **4 hand-designed maps = biggest time sink** | Ship-Small: 10x10 maps first, one afternoon each. Iterate on layout AFTER DB pipeline proves out |
| Docker not on demo machine | Fallback: env-flag `DB=sqlite` swaps pg for better-sqlite3. Same SQL |
| Session-end on browser close = unreliable | Add server-side 60s idle timeout as backstop. Test tab-switch (Page Visibility API) |
| Trajectory table growth mid-session | Bounded — auto-compressed and purged on session-end. Worst case: 1 orphaned session's samples (~900 rows) |
| Path compression algorithm choice | Douglas-Peucker with ε≈0.5 tile — 60-80% reduction typical. Simple, deterministic |
| PostgreSQL schema drift on restart | `migrate.js` uses `CREATE TABLE IF NOT EXISTS` — idempotent. Add `schema_version` row for future migrations |
| Solo demo = only one variant visible | **Deferred by user** to agent phase |
| Denormalized+raw = 2x write cost | Negligible at hackathon scale (single player, <100 events/s peak). Batch INSERTs per WS message |
| Trajectory sampler and defect detector = new client systems | Keep each under 200-line rule from CLAUDE.md. Independent, easy to unit test |
| Client-side patch config could be spoofed | For hackathon: not a threat. Production would validate server-side |

---

## Success Metrics & Validation

Data collection phase considered DONE when:

1. `docker-compose up` boots Postgres + migration runs cleanly
2. Playing one full session (garden→rift→boss→death or completion) results in:
   - 1 `sessions` row with populated `ended_at`, `duration_ms`, `end_reason`
   - N `events` rows (raw)
   - ≥1 row each in `deaths`, `engagements` (assuming combat happened)
   - `purchases` row for each shop transaction
   - `defects` rows for any auto-detected issues
   - `trajectories` rows count = ~ session_duration_sec/2
   - After session close: 1 `paths` row with waypoints, `trajectories` for that session deleted, session.path_compressed = true
3. Two browser sessions with different playerIds → hit both variants (assignment table shows one A, one B)
4. Query example works: `SELECT variant, COUNT(*), AVG(duration_ms) FROM sessions GROUP BY variant;`
5. Full map JSON present in `patches.variant_a` / `variant_b` and clientside tilemap renders from it

---

## Next Steps & Dependencies

### Immediate (this phase — data collection)
1. Postgres + docker-compose scaffold
2. Schema + migration script
3. Session manager + WS lifecycle
4. New event types + client emitters (defect, trajectory, purchase, engagement)
5. Path compression job on session-end
6. Patches seed data with two minimal hand-designed maps
7. Client tilemap loader accepting variant JSON
8. Validation queries + smoke test

### Follow-up (agent phase — after collection ships)
- Winner detection: multi-KPI composite scoring (weighted or hierarchical)
- Auto-propagation strategy (persist winner + live-broadcast to active clients)
- Loser-insight LLM prompt (real Bedrock/Claude call using KPI deltas)
- Solo-demo traffic strategy (URL param, seed script, or both)
- Dashboard visualization: variant comparison cards, death heatmap, path overlay
- Feed `paths` table into Data Forge Agent (robotics dataset export to S3)

### Explicitly deferred / dropped
- Real-time bot/synthetic sessions during data-collection phase
- IAP (crystal packs) A/B tracking — user clarified this is premium/separate
- Multi-armed bandit traffic reweighting — not needed until agent phase
- LLM recommendations — agent phase concern

---

## Unresolved Questions

1. **Path compression algorithm** — Douglas-Peucker is my recommendation; alternatives exist (Ramer-Douglas-Peucker variants, Visvalingam-Whyatt). Any preference? Otherwise default to standard DP with ε≈0.5 tile-units.
2. **Patch activation model** — with `status='active'` on multiple patches, how does the server pick WHICH patch to assign a new player to? Assume "single active patch at a time" for hackathon simplicity. If wrong, need patch-selection logic.
3. **Map data authoring workflow** — hand-drawing 4 JSON tile grids by hand is painful. Do you want a tiny CLI tool or Python helper to generate/edit map JSON from ASCII art? (Adds an hour but saves headaches during map iteration.)
4. **JS error dedup** — window.onerror can fire hundreds of times per stuck loop. Should we dedupe by error message+stack fingerprint client-side before shipping? (Recommend: yes, min 5s cooldown per unique error.)
