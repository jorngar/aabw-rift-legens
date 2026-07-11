// ============================================================
// Path compressor — runs after a session ends.
// Reads raw trajectory rows for the session, applies Douglas-Peucker
// simplification, writes one `paths` row (JSONB waypoints), then
// deletes the raw trajectories. All in a single transaction so a
// mid-flight failure leaves either the raw samples intact or the
// canonical path row committed — never both, never neither.
// ============================================================
import { pool } from './db/pool.js';
import { simplify } from './douglas-peucker.js';

/** ε in tile units — 0.5 keeps enough curvature for the robotics use case. */
const EPSILON = 0.5;

/**
 * Compress a single session's trajectory. Idempotent — returns early
 * if the session was already compressed or has no samples.
 *
 * @param {string} sessionId
 * @returns {Promise<{
 *   sessionId: string,
 *   sampleCount: number,
 *   waypointCount: number,
 *   compressionRatio: number,
 *   skipped?: string
 * } | null>}
 */
export async function compressSession(sessionId) {
  const client = await pool.connect();
  try {
    const { rows: sessRows } = await client.query(
      `SELECT id, patch_id, variant, path_compressed, started_at
         FROM sessions WHERE id = $1`,
      [sessionId]
    );
    const session = sessRows[0];
    if (!session) return null;
    if (session.path_compressed) {
      return { sessionId, sampleCount: 0, waypointCount: 0, compressionRatio: 1, skipped: 'already_compressed' };
    }

    const { rows: raw } = await client.query(
      `SELECT x, y, vx, vy, sampled_at
         FROM trajectories
        WHERE session_id = $1
        ORDER BY sampled_at`,
      [sessionId]
    );
    if (raw.length === 0) {
      // No samples — mark done and move on so we don't re-run forever.
      await client.query(`UPDATE sessions SET path_compressed = TRUE WHERE id = $1`, [sessionId]);
      return { sessionId, sampleCount: 0, waypointCount: 0, compressionRatio: 1, skipped: 'no_samples' };
    }

    // Convert sampled_at → millisecond offsets from session start.
    const startMs = new Date(session.started_at).getTime();
    const points = raw.map(r => ({
      x: Number(r.x), y: Number(r.y),
      vx: r.vx == null ? null : Number(r.vx),
      vy: r.vy == null ? null : Number(r.vy),
      t: new Date(r.sampled_at).getTime() - startMs,
    }));
    const simplified = simplify(points, EPSILON);
    const ratio = simplified.length / points.length;

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO paths (session_id, patch_id, variant, waypoints, sample_count, compression_ratio)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, session.patch_id, session.variant, JSON.stringify(simplified), points.length, ratio]
    );
    await client.query(`DELETE FROM trajectories WHERE session_id = $1`, [sessionId]);
    await client.query(`UPDATE sessions SET path_compressed = TRUE WHERE id = $1`, [sessionId]);
    await client.query('COMMIT');

    console.log(
      `[Compressor] session ${sessionId}: ${points.length} → ${simplified.length} waypoints (${(ratio*100).toFixed(1)}%)`
    );
    return { sessionId, sampleCount: points.length, waypointCount: simplified.length, compressionRatio: ratio };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {/* ignore */}
    console.error(`[Compressor] failed for session ${sessionId}:`, err.message);
    return null;
  } finally {
    client.release();
  }
}
