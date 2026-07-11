// ============================================================
// Repository layer — parameterized inserts + a few reads.
// All writes go through here. Never string-interpolate user input.
// ============================================================
import { pool } from './pool.js';

// ---------- Patches ----------

export async function insertPatch({ name, description, variantA, variantB }) {
  const { rows } = await pool.query(
    `INSERT INTO patches (name, description, variant_a, variant_b)
     VALUES ($1, $2, $3::jsonb, $4::jsonb) RETURNING id`,
    [name, description ?? null, JSON.stringify(variantA), JSON.stringify(variantB)]
  );
  return rows[0].id;
}

export async function findActivePatch() {
  const { rows } = await pool.query(
    `SELECT id, name, variant_a, variant_b
       FROM patches
      WHERE status = 'active'
      ORDER BY id
      LIMIT 1`
  );
  return rows[0] || null;
}

export async function countPatches() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM patches`);
  return rows[0].n;
}

// ---------- Assignments ----------

// Last write wins on the assignments table. The immutable-audit story
// lives in `sessions.variant` (which records what actually happened for
// that play attempt). The assignments row is the CURRENT variant for
// this player — which may flip when the LB routes them to a different
// pool on a subsequent session.
export async function upsertAssignment({ playerId, patchId, variant }) {
  const { rows } = await pool.query(
    `INSERT INTO assignments (player_id, patch_id, variant)
     VALUES ($1, $2, $3)
     ON CONFLICT (player_id, patch_id) DO UPDATE
       SET variant = EXCLUDED.variant
     RETURNING id, variant`,
    [playerId, patchId, variant]
  );
  return rows[0];
}

// ---------- Sessions ----------

export async function createSession({ playerId, patchId, variant }) {
  const { rows } = await pool.query(
    `INSERT INTO sessions (player_id, patch_id, variant)
     VALUES ($1, $2, $3) RETURNING id`,
    [playerId, patchId, variant]
  );
  return rows[0].id;
}

export async function endSession({
  sessionId, endReason, finalGold, finalXp, finalLevel, completedRift,
}) {
  await pool.query(
    `UPDATE sessions
        SET ended_at    = NOW(),
            duration_ms = (EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int,
            end_reason  = $2,
            final_gold  = $3,
            final_xp    = $4,
            final_level = $5,
            completed_rift = COALESCE($6, completed_rift)
      WHERE id = $1 AND ended_at IS NULL`,
    [sessionId, endReason, finalGold ?? null, finalXp ?? null, finalLevel ?? null, completedRift ?? null]
  );
}

// ---------- Events (raw audit + batch) ----------

export async function insertEventBatch(events) {
  if (!events || events.length === 0) return;
  const values = [];
  const params = [];
  events.forEach((e, i) => {
    const b = i * 5;
    values.push(`($${b+1}, $${b+2}, $${b+3}::jsonb, $${b+4}, $${b+5})`);
    params.push(e.sessionId, e.eventType, JSON.stringify(e.payload || {}), e.x ?? null, e.y ?? null);
  });
  await pool.query(
    `INSERT INTO events (session_id, event_type, payload, x, y) VALUES ${values.join(',')}`,
    params
  );
}

// ---------- Denormalized per-KPI ----------

export async function insertPurchase({
  sessionId, patchId, variant, itemId, price, goldBefore, goldAfter,
}) {
  await pool.query(
    `INSERT INTO purchases (session_id, patch_id, variant, item_id, price, gold_before, gold_after)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, patchId, variant, itemId, price, goldBefore ?? null, goldAfter ?? null]
  );
}

export async function insertDefect({
  sessionId, patchId, variant, defectType, context, x, y,
}) {
  await pool.query(
    `INSERT INTO defects (session_id, patch_id, variant, defect_type, context, x, y)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [sessionId, patchId, variant, defectType, JSON.stringify(context || {}), x ?? null, y ?? null]
  );
}

export async function insertDeath({
  sessionId, patchId, variant, killedBy, x, y, mapZone,
}) {
  await pool.query(
    `INSERT INTO deaths (session_id, patch_id, variant, killed_by, x, y, map_zone)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, patchId, variant, killedBy ?? null, x, y, mapZone ?? null]
  );
}

export async function insertTrajectoryBatch(rows) {
  if (!rows || rows.length === 0) return;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * 6;
    values.push(`($${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5}, $${b+6})`);
    params.push(r.sessionId, r.x, r.y, r.vx ?? null, r.vy ?? null, r.mapZone);
  });
  await pool.query(
    `INSERT INTO trajectories (session_id, x, y, vx, vy, map_zone) VALUES ${values.join(',')}`,
    params
  );
}

export async function insertEngagement({
  sessionId, patchId, variant, enemyType, damageDealt, damageTaken, killed, x, y,
}) {
  await pool.query(
    `INSERT INTO engagements
      (session_id, patch_id, variant, enemy_type, damage_dealt, damage_taken, killed, x, y)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [sessionId, patchId, variant, enemyType,
     damageDealt ?? null, damageTaken ?? null, killed ?? null, x ?? null, y ?? null]
  );
}

// ---------- Paths / Trajectories cleanup ----------

export async function insertPath({
  sessionId, patchId, variant, waypoints, sampleCount, compressionRatio,
}) {
  await pool.query(
    `INSERT INTO paths (session_id, patch_id, variant, waypoints, sample_count, compression_ratio)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, patchId, variant, JSON.stringify(waypoints), sampleCount, compressionRatio ?? null]
  );
}

export async function deleteTrajectoriesBySession(sessionId) {
  await pool.query(`DELETE FROM trajectories WHERE session_id = $1`, [sessionId]);
}
