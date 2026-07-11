-- ============================================================
-- Rift SEED A/B Collection — validation queries.
-- Run with: docker exec -i rift-seed-postgres \
--   psql -U rift -d rift_seed -f - < packages/server/scripts/validate-collection.sql
-- ============================================================

\echo '--- sessions per variant ---'
SELECT patch_id, variant,
       COUNT(*)::int AS sessions,
       COUNT(*) FILTER (WHERE ended_at IS NOT NULL)::int AS ended,
       ROUND(AVG(duration_ms) FILTER (WHERE ended_at IS NOT NULL))::int AS avg_ms,
       COUNT(*) FILTER (WHERE completed_rift)::int AS completions
  FROM sessions GROUP BY patch_id, variant ORDER BY patch_id, variant;

\echo '--- defect rate per variant ---'
SELECT variant, defect_type, COUNT(*)::int AS n
  FROM defects GROUP BY variant, defect_type ORDER BY variant, defect_type;

\echo '--- shop purchases per variant ---'
SELECT variant, COUNT(*)::int AS purchases,
       COALESCE(AVG(price), 0)::int AS avg_price,
       COALESCE(SUM(price), 0)::int AS total_gold_spent
  FROM purchases GROUP BY variant ORDER BY variant;

\echo '--- death heatmap (top 20 hotspots) ---'
SELECT variant, ROUND(x::numeric, 0) AS gx, ROUND(y::numeric, 0) AS gy, COUNT(*)::int AS deaths
  FROM deaths GROUP BY variant, ROUND(x::numeric, 0), ROUND(y::numeric, 0)
  ORDER BY deaths DESC LIMIT 20;

\echo '--- path compression stats ---'
SELECT variant,
       COUNT(*)::int AS paths,
       ROUND(AVG(sample_count))::int AS avg_raw_samples,
       ROUND(AVG(jsonb_array_length(waypoints)))::int AS avg_waypoints,
       ROUND(AVG(compression_ratio)::numeric, 3) AS avg_ratio
  FROM paths GROUP BY variant ORDER BY variant;

\echo '--- orphaned raw trajectories (expected 0 for compressed sessions) ---'
SELECT COUNT(*)::int AS orphaned
  FROM trajectories t
  JOIN sessions s ON s.id = t.session_id
 WHERE s.ended_at IS NOT NULL AND s.path_compressed = TRUE;

\echo '--- engagement stats per variant ---'
SELECT variant, COUNT(*)::int AS engagements,
       COALESCE(SUM(damage_dealt), 0)::int AS damage_dealt,
       COALESCE(SUM(damage_taken), 0)::int AS damage_taken,
       COUNT(*) FILTER (WHERE killed)::int AS kills
  FROM engagements GROUP BY variant ORDER BY variant;
