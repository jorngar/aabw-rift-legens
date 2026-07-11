// ============================================================
// A/B Testing Agent — DB-backed KPI aggregator over the Postgres
// collection tables. This is the read side of the pipeline; writes
// happen through session-manager + event-writers.
//
// The old in-memory Map + Welch's t-test lived here; that logic is
// deferred to the next phase (agent winner-detection + auto-
// propagation + loser-salvage LLM). For Phase 3 the agent is a
// snapshot/read facade only.
// ============================================================
import { pool } from '../db/pool.js';

export class ABTestingAgent {
  constructor() {}

  /**
   * Aggregate KPI snapshot keyed by patch id → variant → metrics.
   * Suitable for a live dashboard render.
   */
  async getSnapshot() {
    const { rows: patches } = await pool.query(
      `SELECT id, name, description FROM patches WHERE status = 'active' ORDER BY id`
    );
    const out = {};
    for (const p of patches) {
      const [variantA, variantB] = await Promise.all([
        this._variantKpis(p.id, 'A'),
        this._variantKpis(p.id, 'B'),
      ]);
      out[`patch-${p.id}`] = {
        name: p.name,
        description: p.description,
        variants: { A: variantA, B: variantB },
      };
    }
    return out;
  }

  async _variantKpis(patchId, variant) {
    // One query per KPI to keep this readable. Hackathon scale, so the
    // per-KPI cost is negligible. Roll up into one row per call.
    const [sess, purchase, defect, death, engage] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS sessions,
                COALESCE(AVG(duration_ms), 0)::int AS avg_ms,
                COUNT(*) FILTER (WHERE completed_rift)::int AS completions
           FROM sessions WHERE patch_id = $1 AND variant = $2 AND ended_at IS NOT NULL`,
        [patchId, variant]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(price), 0)::int AS gold_spent
           FROM purchases WHERE patch_id = $1 AND variant = $2`,
        [patchId, variant]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM defects WHERE patch_id = $1 AND variant = $2`,
        [patchId, variant]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM deaths WHERE patch_id = $1 AND variant = $2`,
        [patchId, variant]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n,
                COALESCE(SUM(damage_dealt), 0)::int AS damage_dealt,
                COALESCE(SUM(damage_taken), 0)::int AS damage_taken
           FROM engagements WHERE patch_id = $1 AND variant = $2`,
        [patchId, variant]
      ),
    ]);

    return {
      sampleSize:         sess.rows[0].sessions,
      avgSessionDuration: sess.rows[0].avg_ms,
      completions:        sess.rows[0].completions,
      purchases:          purchase.rows[0].n,
      goldSpent:          purchase.rows[0].gold_spent,
      defects:            defect.rows[0].n,
      deaths:             death.rows[0].n,
      engagements:        engage.rows[0].n,
      damageDealt:        engage.rows[0].damage_dealt,
      damageTaken:        engage.rows[0].damage_taken,
    };
  }

  async getStatus() {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'active')::int   AS active,
              COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
              COUNT(*)::int                                    AS total
         FROM patches`
    );
    return {
      name: 'A/B Testing Agent',
      status: 'active',
      activeTests: rows[0].active,
      completedTests: rows[0].completed,
      totalTests: rows[0].total,
    };
  }

  /**
   * Deprecated: legacy WS shims that used to route through this agent.
   * The new client uses session:hello + telemetry:batch, both handled
   * by session-manager.js. Kept only so the old messages don't crash
   * the server if a stale client is still connected.
   */
  assignPlayer() {
    return { error: 'deprecated: send { type: "session:hello", playerId } instead' };
  }
  recordEvent() { /* no-op */ }
}
