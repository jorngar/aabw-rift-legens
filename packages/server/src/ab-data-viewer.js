// ============================================================
// A/B data viewer — one-shot read helpers for the /api/ab-tests/data
// dashboard/dump endpoint. Keeps ab-testing-agent.js focused on
// aggregate KPI rollups and server.js free of query soup.
// ============================================================
import { pool } from './db/pool.js';

/**
 * Return the whole collection state in one JSON blob. Rows are
 * capped so this remains cheap even after long play sessions.
 *
 * @param {{ limit?: number }} [opts]  latest-N cap per table (default 50)
 */
export async function fetchAllData({ limit = 50 } = {}) {
  const [
    patches,
    assignments,
    sessions,
    eventCounts,
    purchases,
    defects,
    deaths,
    paths,
    engagements,
    trajectoryStatus,
  ] = await Promise.all([
    pool.query(`SELECT id, name, description, status, created_at FROM patches ORDER BY id`),
    pool.query(`SELECT id, player_id, patch_id, variant, assigned_at
                  FROM assignments ORDER BY assigned_at DESC LIMIT $1`, [limit]),
    pool.query(`SELECT id, player_id, patch_id, variant, started_at, ended_at,
                       duration_ms, end_reason, completed_rift, final_gold, final_xp,
                       final_level, path_compressed
                  FROM sessions ORDER BY started_at DESC LIMIT $1`, [limit]),
    pool.query(`SELECT event_type, COUNT(*)::int AS n FROM events GROUP BY event_type ORDER BY n DESC`),
    pool.query(`SELECT id, session_id, patch_id, variant, item_id, price,
                       gold_before, gold_after, occurred_at
                  FROM purchases ORDER BY occurred_at DESC LIMIT $1`, [limit]),
    pool.query(`SELECT id, session_id, patch_id, variant, defect_type,
                       context, x, y, occurred_at
                  FROM defects ORDER BY occurred_at DESC LIMIT $1`, [limit]),
    pool.query(`SELECT id, session_id, patch_id, variant, killed_by, x, y,
                       map_zone, occurred_at
                  FROM deaths ORDER BY occurred_at DESC LIMIT $1`, [limit]),
    pool.query(`SELECT id, session_id, patch_id, variant, sample_count,
                       jsonb_array_length(waypoints) AS waypoint_count,
                       compression_ratio, waypoints, compressed_at
                  FROM paths ORDER BY compressed_at DESC LIMIT $1`, [limit]),
    pool.query(`SELECT id, session_id, patch_id, variant, enemy_type,
                       damage_dealt, damage_taken, killed, x, y, occurred_at
                  FROM engagements ORDER BY occurred_at DESC LIMIT $1`, [limit]),
    pool.query(`SELECT COUNT(*)::int AS n FROM trajectories`),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    limit,
    patches: patches.rows,
    assignments: assignments.rows,
    sessions: sessions.rows,
    eventCounts: eventCounts.rows,
    purchases: purchases.rows,
    defects: defects.rows,
    deaths: deaths.rows,
    paths: paths.rows,
    engagements: engagements.rows,
    trajectoriesInFlight: trajectoryStatus.rows[0].n,
  };
}

/**
 * Return a per-variant KPI summary shaped for a compact dashboard card.
 * Same numbers as the ABTestingAgent snapshot, but with extra roll-ups.
 */
export async function fetchSummary() {
  const { rows } = await pool.query(`
    SELECT p.id AS patch_id, p.name AS patch_name, v.variant,
           COUNT(DISTINCT s.id)::int AS sessions,
           COUNT(DISTINCT s.id) FILTER (WHERE s.ended_at IS NOT NULL)::int AS ended,
           COALESCE(ROUND(AVG(s.duration_ms) FILTER (WHERE s.ended_at IS NOT NULL))::int, 0) AS avg_duration_ms,
           (SELECT COUNT(*)::int FROM purchases   WHERE patch_id = p.id AND variant = v.variant) AS purchases,
           (SELECT COALESCE(SUM(price), 0)::int FROM purchases WHERE patch_id = p.id AND variant = v.variant) AS gold_spent,
           (SELECT COUNT(*)::int FROM defects     WHERE patch_id = p.id AND variant = v.variant) AS defects,
           (SELECT COUNT(*)::int FROM deaths      WHERE patch_id = p.id AND variant = v.variant) AS deaths,
           (SELECT COUNT(*)::int FROM engagements WHERE patch_id = p.id AND variant = v.variant) AS engagements,
           (SELECT COUNT(*)::int FROM paths       WHERE patch_id = p.id AND variant = v.variant) AS paths
      FROM patches p
      CROSS JOIN (VALUES ('A'), ('B')) AS v(variant)
      LEFT JOIN sessions s ON s.patch_id = p.id AND s.variant = v.variant
     GROUP BY p.id, p.name, v.variant
     ORDER BY p.id, v.variant
  `);
  return rows;
}
