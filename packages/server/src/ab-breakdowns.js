// ============================================================
// A/B breakdowns — server-side SQL aggregation for the dashboard's
// visualisations (bar-chart breakdowns, heatmap points, path traces,
// balance/completion extras). Kept separate from ab-data-viewer.js
// so the raw dump and the viz aggregations don't grow into one blob.
// ============================================================
import { pool } from './db/pool.js';

// Cap path traces per (patch, variant) so the payload stays bounded.
const PATH_TRACES_PER_VARIANT = 30;
// Round heatmap points to tile centres so identical tiles collapse into
// a single bucket that we render with intensity = count.
const HEATMAP_ROUND = 1;

/**
 * One-shot aggregation for the dashboard. Returns everything the
 * visual layer needs so the client can render without doing SQL-style
 * reductions in JS.
 */
export async function fetchBreakdowns() {
  const [
    defectsByType,
    deathsByEnemy,
    purchasesByItem,
    engagementsByEnemy,
    deathPoints,
    defectPoints,
    pathTraces,
    completion,
    balance,
    endReasons,
    progression,
  ] = await Promise.all([
    // ---- Categorical breakdowns ----------------------------------
    pool.query(`
      SELECT patch_id, variant, defect_type AS bucket, COUNT(*)::int AS n
        FROM defects
       GROUP BY patch_id, variant, defect_type
       ORDER BY n DESC`),
    pool.query(`
      SELECT patch_id, variant, COALESCE(killed_by, 'unknown') AS bucket, COUNT(*)::int AS n
        FROM deaths
       GROUP BY patch_id, variant, killed_by
       ORDER BY n DESC`),
    pool.query(`
      SELECT patch_id, variant, item_id AS bucket,
             COUNT(*)::int AS n,
             COALESCE(SUM(price), 0)::int AS gold
        FROM purchases
       GROUP BY patch_id, variant, item_id
       ORDER BY n DESC`),
    pool.query(`
      SELECT patch_id, variant, enemy_type AS bucket,
             COUNT(*)::int AS n,
             COALESCE(SUM(damage_dealt), 0)::int AS dmg_dealt,
             COALESCE(SUM(damage_taken), 0)::int AS dmg_taken,
             COUNT(*) FILTER (WHERE killed)::int AS kills
        FROM engagements
       GROUP BY patch_id, variant, enemy_type
       ORDER BY n DESC`),

    // ---- Spatial points (heatmaps) -------------------------------
    pool.query(`
      SELECT patch_id, variant,
             ROUND(x::numeric, ${HEATMAP_ROUND})::float AS x,
             ROUND(y::numeric, ${HEATMAP_ROUND})::float AS y,
             COUNT(*)::int AS n
        FROM deaths
       WHERE x IS NOT NULL AND y IS NOT NULL
       GROUP BY patch_id, variant, ROUND(x::numeric, ${HEATMAP_ROUND}), ROUND(y::numeric, ${HEATMAP_ROUND})`),
    pool.query(`
      SELECT patch_id, variant,
             ROUND(x::numeric, ${HEATMAP_ROUND})::float AS x,
             ROUND(y::numeric, ${HEATMAP_ROUND})::float AS y,
             COUNT(*)::int AS n, defect_type
        FROM defects
       WHERE x IS NOT NULL AND y IS NOT NULL
       GROUP BY patch_id, variant, ROUND(x::numeric, ${HEATMAP_ROUND}), ROUND(y::numeric, ${HEATMAP_ROUND}), defect_type`),

    // ---- Path traces (latest N per variant) ----------------------
    pool.query(`
      SELECT patch_id, variant, waypoints
        FROM (
          SELECT patch_id, variant, waypoints, compressed_at,
                 ROW_NUMBER() OVER (PARTITION BY patch_id, variant ORDER BY compressed_at DESC) AS rn
            FROM paths
        ) t
       WHERE rn <= $1`, [PATH_TRACES_PER_VARIANT]),

    // ---- Extras (completion + balance) ---------------------------
    pool.query(`
      SELECT patch_id, variant,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE completed_rift)::int AS completed
        FROM sessions
       GROUP BY patch_id, variant`),
    pool.query(`
      SELECT patch_id, variant,
             COALESCE(SUM(damage_dealt), 0)::int AS damage_dealt,
             COALESCE(SUM(damage_taken), 0)::int AS damage_taken
        FROM engagements
       GROUP BY patch_id, variant`),
    pool.query(`
      SELECT patch_id, variant, COALESCE(end_reason, 'unknown') AS bucket,
             COUNT(*)::int AS n
        FROM sessions
       WHERE ended_at IS NOT NULL
       GROUP BY patch_id, variant, end_reason
       ORDER BY n DESC`),
    pool.query(`
      SELECT patch_id, variant,
             COALESCE(ROUND(AVG(final_level))::int, 0) AS avg_level,
             COALESCE(ROUND(AVG(final_gold))::int, 0)  AS avg_gold,
             COALESCE(ROUND(AVG(final_xp))::int, 0)    AS avg_xp
        FROM sessions
       WHERE ended_at IS NOT NULL
       GROUP BY patch_id, variant`),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    breakdowns: {
      defectsByType: defectsByType.rows,
      deathsByEnemy: deathsByEnemy.rows,
      purchasesByItem: purchasesByItem.rows,
      engagementsByEnemy: engagementsByEnemy.rows,
      endReasons: endReasons.rows,
    },
    spatial: {
      deaths: deathPoints.rows,
      defects: defectPoints.rows,
      paths: pathTraces.rows,
    },
    extras: {
      completion: completion.rows,
      balance: balance.rows,
      progression: progression.rows,
    },
  };
}
