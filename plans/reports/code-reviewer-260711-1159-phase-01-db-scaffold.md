# Code Review — Phase 1 DB Scaffold

**Scope:** 8 files (7 new + 2 modified). Postgres A/B collection layer alongside existing SQLite.
**Overall score: 8.5 / 10** — clean, tight, hackathon-appropriate. A few robustness holes worth patching now because they’re cheap.

---

## Critical
_None._ No SQL-injection surface (all writes parameterized), password is masked in logs (`pool.js:26-28,33`), `.env` is gitignored with `.env.example` whitelisted, dev creds clearly labelled `rift_dev_only` and commented in compose.

## Major

1. **`sessions.variant` / `paths.variant` / denorm tables lack CHECK constraint** — `schema.sql:34,63,76,89,115,127`. Only `assignments.variant` has `CHECK (variant IN ('A','B'))`. Nothing prevents a Phase-2 bug from writing `'X'`. Add `CHECK (variant IN ('A','B'))` to every `variant CHAR(1)` column. Cheap, immediate safety.
2. **No FK on `patch_id` in denorm tables** — `schema.sql:62,75,88,114,126`. `assignments`/`sessions` reference `patches(id)` but `purchases`, `defects`, `deaths`, `paths`, `engagements` do not. Silent orphan risk if a patch is ever deleted. Add `REFERENCES patches(id)`.
3. **Shutdown handlers call `process.exit(0)` unconditionally** — `pool.js:36-42`. Any code that imports `pool.js` (including `migrate.js` and `server.js`) hijacks SIGINT/SIGTERM. If the HTTP server wants to drain connections on SIGTERM, it can’t — the pool handler exits first. Recommend removing `process.exit` and letting the app owner orchestrate shutdown, or gating with `if (process.env.NODE_ENV !== 'test')`. Not critical for hackathon but a footgun.
4. **`insertEventBatch` / `insertTrajectoryBatch` will fail at ~13k rows** — `repositories.js:77-90,124-137`. Postgres bind-parameter cap is 65535. `65535 / 5 ≈ 13106` events per call, `/ 6 ≈ 10922` trajectories. Batches above that error out. YAGNI says fine for MVP, but add a one-line comment or a chunk-in-caller note so Phase 2/3 knows.

## Minor

5. **Naive SQL splitter is safe today but fragile** — `migrate.js:20-32`. Splits on `;\s*\n`. Works because current DDL has no dollar-quoted functions, no `;` inside string literals, no `DO $$ ... $$` blocks. If schema.sql ever grows a trigger/function this silently breaks. Add a header comment in `schema.sql` noting the constraint (“no dollar-quoting, no `;` inside strings”), or one line in `migrate.js`.
6. **`schema.sql` header claims “10 tables” but code says 8** — phase spec line 25 vs actual count. Actual `CREATE TABLE`: `patches, assignments, sessions, events, purchases, defects, deaths, trajectories, paths, engagements` = **10**. Success criteria (line 160) is correct; brainstorm ref (line 25) is stale. Purely doc.
7. **`insertEventBatch` accepts unbounded input** — `repositories.js:78`. Caller responsibility today, but a `if (events.length > 10_000) throw` guard prevents surprise 65535-param errors. Optional.
8. **`endSession` uses `NOW() - started_at`** — `repositories.js:64`. If a session row is manually adjusted or clock-skewed, `duration_ms` could be negative or huge. Fine, just be aware.
9. **`sessions.duration_ms` is `INT`** — `schema.sql:37`. Max ~24.8 days. Fine for game sessions; noting for completeness.
10. **`.env.example` in `packages/server/`** but `docker-compose.yml` at repo root — small ergonomic mismatch. `pnpm --filter server run migrate` reads env from `packages/server/.env` (dotenv not loaded — relies on shell env). Not a bug; just worth documenting in a README that users must `export DATABASE_URL` or use `direnv`, since nothing here loads `.env` files at runtime.

## Edge Cases Scouted

- **`verifyPostgresConnection` is non-fatal in `server.js:228-232`** — good call; server still boots. But no retry/backoff, so a container that becomes ready 2s after node starts stays "disabled" for the whole process lifetime. Acceptable for hackathon.
- **`upsertAssignment` overwrites variant on conflict** — `repositories.js:40`. If a player is ever reassigned mid-experiment, prior assignment audit is lost. If audit matters, change to `DO NOTHING` and return existing row. If reassignment is desired, current behavior is right — worth an explicit decision comment.
- **`insertPath` uses `ON CONFLICT (session_id) DO NOTHING`** — silent no-op. Fine, but caller has no way to detect “already compressed”. Return `rowCount` if that matters later.
- **No index on `sessions(patch_id, variant)` or `events(occurred_at)`** — will bite the analytics agent in Phase 4+. YAGNI-defer, but flag in phase 4 plan.

## Positive

- Excellent password masking regex and `[DB] connected …` log line.
- `pool.on('error', …)` handler present — many pg users forget this.
- Batch inserts use single multi-VALUES statement (correct, fast).
- Empty-array guard in both batch inserts (`repositories.js:78,125`).
- `path_compressed` boolean on sessions + `paths.session_id UNIQUE` + `ON CONFLICT DO NOTHING` = idempotent compression pipeline. Well thought out.
- File sizes: `pool.js` 42, `migrate.js` 59, `repositories.js` 166, `schema.sql` 135. All under 200 ✓.
- Comment quality high; ESM correct; parameterized everywhere.

## YAGNI Check

Nothing unnecessary. `countPatches()` and `findActivePatch()` are the only non-insert helpers; both are needed by phase 2 seeding. Keep.

## Recommended Actions (priority order)

1. Add `CHECK (variant IN ('A','B'))` to all `variant CHAR(1)` columns in `schema.sql` (2 min, high value).
2. Add `REFERENCES patches(id)` to `patch_id` in denorm tables (2 min).
3. Remove `process.exit(0)` from `pool.js` shutdown handlers, or gate with env check (5 min).
4. One-line comment in `migrate.js` and/or `schema.sql` about the naive splitter’s constraints (1 min).
5. (Defer) Batch-size guards + composite indexes when Phase 4 lands.

## Metrics

- Files reviewed: 8 (~470 LOC net-new)
- Parameterized-query coverage: 100%
- Files over 200 lines: 0 (in-scope). `server.js` = 245, pre-existing.
- Lint / typecheck: not run (no configs added this phase).

## Unresolved Questions

- Should `upsertAssignment` preserve original variant on conflict (audit) or overwrite (reassignment)? Decide before Phase 3.
- Do we want a `schema_version` sentinel row now (see phase risk table) or after Phase 6?
- Will Phase 2 seed patches via SQL file or via `insertPatch()` from a script? Affects whether we need CLI helpers.
