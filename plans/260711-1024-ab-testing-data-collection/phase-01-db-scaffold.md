---
phase: 1
name: DB Scaffold — Docker + Schema + Repositories
status: completed
completed_at: 2026-07-11
priority: P0
blocks: [2, 3, 4, 5, 6]
estimate: 2-3h
---

# Phase 1 — DB Scaffold

## Context Links

- Brainstorm: `plans/reports/brainstorm-260711-1024-ab-testing-data-collection.md` (full DDL)
- Existing server: `packages/server/src/server.js`
- Existing agent: `packages/server/src/agents/ab-testing-agent.js` (currently in-memory Map)

## Overview

Stand up Postgres in Docker, apply schema, wire pg pool + repositories layer. All downstream phases depend on this. Zero client changes here.

## Key Insights

- 8 tables total: `patches`, `assignments`, `sessions`, `events` (raw), + denormalized: `purchases`, `defects`, `deaths`, `trajectories`, `paths`, `engagements`
- `events` = never-lose audit trail. Denormalized tables = fast agent queries later.
- Idempotent migration via `CREATE TABLE IF NOT EXISTS`
- `pg` npm package (not `postgres.js`) — well-supported, boring, reliable

## Requirements

**Functional:**
- `docker-compose up -d` boots Postgres 16-alpine with named volume
- `pnpm --filter server migrate` applies schema idempotently
- Repository functions for INSERT ops on each table

**Non-functional:**
- Migration script safe to re-run on live DB
- pg pool sized reasonably (max 10 for hackathon)
- Env-driven config: `DATABASE_URL` in `.env` (default localhost)

## Architecture

```
packages/server/
├── docker-compose.yml         # NEW — Postgres 16-alpine
├── .env.example               # NEW — DATABASE_URL sample
└── src/
    └── db/                    # NEW dir
        ├── pool.js            # NEW — pg Pool singleton
        ├── schema.sql         # NEW — DDL (from brainstorm)
        ├── migrate.js         # NEW — apply schema.sql idempotently
        └── repositories.js    # NEW — insert helpers per table
```

## Related Code Files

**Create:**
- `docker-compose.yml` (project root)
- `packages/server/.env.example`
- `packages/server/src/db/pool.js`
- `packages/server/src/db/schema.sql`
- `packages/server/src/db/migrate.js`
- `packages/server/src/db/repositories.js`

**Modify:**
- `packages/server/package.json` — add `pg` dep + `migrate` script
- `.gitignore` — add `.env`

## Implementation Steps

### 1. docker-compose.yml (project root)
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: rift-seed-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: rift
      POSTGRES_PASSWORD: rift_dev_only
      POSTGRES_DB: rift_seed
    ports: ["5432:5432"]
    volumes:
      - rift-pgdata:/var/lib/postgresql/data
volumes:
  rift-pgdata:
```

### 2. `packages/server/package.json`
- Add: `"pg": "^8.13.0"`
- Add script: `"migrate": "node src/db/migrate.js"`

### 3. `packages/server/.env.example`
```
DATABASE_URL=postgresql://rift:rift_dev_only@localhost:5432/rift_seed
```

### 4. `packages/server/src/db/pool.js` (~30 lines)
- Read `DATABASE_URL` from env, fallback to compose defaults
- Export `pool` (pg Pool instance, max: 10)
- Export `query(text, params)` convenience wrapper
- Handle graceful shutdown (SIGTERM/SIGINT → pool.end())

### 5. `packages/server/src/db/schema.sql`
Copy DDL verbatim from brainstorm report (§Postgres Schema, 8 tables). Prepend:
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()
```
Every CREATE uses `IF NOT EXISTS`. Indexes too.

### 6. `packages/server/src/db/migrate.js` (~40 lines)
- Read `schema.sql` from disk
- Split on `;` (naive but sufficient — no procedural blocks)
- Execute each statement via pool.query
- Log progress (`✓ table patches`, `✓ index idx_events_session_type`, ...)
- Exit 0 on success, non-zero on error

### 7. `packages/server/src/db/repositories.js` (~150 lines, split later if it grows)
Named exports, one per table:
```js
export async function insertPatch({ name, description, variantA, variantB }) {...}
export async function upsertAssignment({ playerId, patchId, variant }) {...}
export async function createSession({ playerId, patchId, variant }) {...}
export async function endSession({ sessionId, endReason, finalGold, finalXp, finalLevel, completedRift }) {...}
export async function insertEvent({ sessionId, eventType, payload, x, y }) {...}
export async function insertEventBatch(rows) {...}   // batched multi-VALUES
export async function insertPurchase({...}) {...}
export async function insertDefect({...}) {...}
export async function insertDeath({...}) {...}
export async function insertTrajectory({...}) {...}
export async function insertTrajectoryBatch(rows) {...}
export async function insertEngagement({...}) {...}
export async function insertPath({ sessionId, patchId, variant, waypoints, sampleCount, compressionRatio }) {...}
export async function deleteTrajectoriesBySession(sessionId) {...}
```
Use parameterized queries only. No string concat.

### 8. Wire pool startup in server.js (minimal)
- Import pool from `./db/pool.js` at server boot
- Log `[DB] connected to ${DATABASE_URL host}` (mask password)
- No behavioral change yet — just prove connection works

## Todo List

- [ ] Add pg to server/package.json + pnpm install
- [ ] Create docker-compose.yml (project root)
- [ ] Create .env.example + add .env to gitignore
- [ ] Write pool.js
- [ ] Write schema.sql (from brainstorm DDL)
- [ ] Write migrate.js
- [ ] Write repositories.js
- [ ] docker-compose up + pnpm --filter server migrate
- [ ] Import pool in server.js, verify boot log

## Success Criteria

1. `docker-compose up -d` → healthy Postgres
2. `pnpm --filter server migrate` → all tables + indexes created; re-run is no-op
3. `psql $DATABASE_URL -c "\dt"` shows 10 tables (8 + spatial_ref if pgcrypto adds any)
4. `pnpm dev:server` boots without errors, logs "[DB] connected"
5. Manual test: `INSERT INTO patches (name, variant_a, variant_b) VALUES ('test', '{}'::jsonb, '{}'::jsonb) RETURNING id;` returns 1

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Docker not installed on demo machine | Document `brew install docker` in README |
| Port 5432 already in use | Change compose port to `15432:5432` |
| Schema drift on future changes | Add `schema_version` numeric constant, log at startup |
| Naive SQL split fails on `;` in strings | None expected in DDL; if needed, use `pg-migrate` |

## Security Considerations

- Password in compose = dev-only, plaintext. Add prominent comment.
- `.env` in `.gitignore` (must verify)
- Parameterized queries only — never string-interpolate user input

## Next Steps

- Phase 2 depends on this: shared/events.js needs event types + patches seeded via repository
