---
name: A/B Testing Data Collection Layer
slug: ab-testing-data-collection
status: pending
created: 2026-07-11
scope: data-collection-only
next_phase: agent (winner + auto-propagate + LLM salvage) — deferred
---

# Plan — A/B Testing Data Collection Layer

## Purpose

Ship real A/B testing infrastructure for SimForge: Rift Legends. Two full game versions (different Garden + Rift maps) served to cohorted players. Rich telemetry (retention, purchases, defects, deaths, trajectories, engagement) persisted to Postgres. Agent-side winner detection deferred to next phase.

## Source of Truth

Brainstorm agreement: `/Users/maikyle/Documents/VisualStudio/hackathon/aabw-rift-legens/plans/reports/brainstorm-260711-1024-ab-testing-data-collection.md`

**Read this before starting any phase.** It has full schema DDL, file inventory, risks, success criteria.

## Phases

| # | Phase | Status | Priority | Est. |
|---|---|---|---|---|
| 1 | [DB scaffold — Docker + schema + repositories](./phase-01-db-scaffold.md) | ✅ completed | P0 (blocker) | 2-3h |
| 2 | [Shared layer — events + patches + map assets](./phase-02-shared-layer.md) | pending | P0 | 3-4h |
| 3 | [Server pipeline — session-manager + WS + DB writes](./phase-03-server-pipeline.md) | pending | P0 | 2-3h |
| 4 | [Client samplers — defect-detector + trajectory-sampler](./phase-04-client-samplers.md) | pending | P1 | 2h |
| 5 | [Client integration — tilemap loader + assignment flow](./phase-05-client-integration.md) | pending | P1 | 2-3h |
| 6 | [Path compression + validation](./phase-06-path-compression-validation.md) | pending | P1 | 2h |

Total: 13-17h. Ship-Small principle — minimum-viable 10x10 maps first, expand only after pipeline proves out.

## Key Dependencies

- Phase 1 → blocks 2,3,4,5,6 (DB must exist)
- Phase 2 → blocks 3,5 (server needs event types, client needs patches/maps)
- Phase 3 → blocks 5 (client needs server session_id + patch config)
- Phase 4 → blocks 6 (samplers produce data for compression)
- Phase 5 → blocks 6 (client integration produces end-to-end session)

## Ship-Small Reality Check

If tight on time, DROP THESE from v1:
- Enemy engagement events (Phase 4) — nice-to-have
- Path compression (Phase 6) — raw trajectories in DB is fine for phase 1
- Full 10x10 maps — 6x6 handcrafted proves the concept

## Deferred to Agent Phase

- Winner detection (composite scoring)
- Auto-propagate (live-broadcast + persist)
- LLM loser-salvage recommendations
- Solo-demo traffic strategy (URL param / seed script)
- Dashboard visualization (variant comparison, heatmap, path overlay)
