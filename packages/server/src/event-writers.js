// ============================================================
// Event writer — fans out a telemetry batch into the raw events
// table PLUS the per-KPI denormalized tables. All writes go via
// repositories.js (parameterized) and are safe to call from a
// hot WS handler.
// ============================================================
import {
  insertEventBatch, insertPurchase, insertDefect, insertDeath,
  insertTrajectoryBatch, insertEngagement,
} from './db/repositories.js';

// Events routed into the `defects` table with defect_type = event.type.
const DEFECT_EVENT_TYPES = new Set([
  'path:stuck',
  'pathfind:fail',
  'js:error',
  'state:impossible',
]);

/**
 * Extract the payload of an event. Some clients spread the payload
 * onto the event root (createEvent(...) does exactly that); others
 * nest it under `.payload`. Support both.
 */
function payloadOf(e) {
  return e.payload && typeof e.payload === 'object' ? e.payload : e;
}

/**
 * Route a batch of events into the correct tables.
 * Never throws — logs and swallows so a bad row cannot kill the WS handler.
 */
export async function fanOut({ sessionId, patchId, variant, events }) {
  if (!events || events.length === 0) return;

  const raw = [];
  const trajRows = [];
  const purchases = [], defects = [], deaths = [], engagements = [];

  for (const e of events) {
    // Skip null/non-object entries — a malformed batch element must not
    // take down the whole ingest.
    if (!e || typeof e !== 'object' || !e.type) continue;
    const p = payloadOf(e);
    const x = p.x ?? e.x ?? null;
    const y = p.y ?? e.y ?? null;

    raw.push({ sessionId, eventType: e.type, payload: p, x, y });

    switch (e.type) {
      case 'trajectory:sample':
        trajRows.push({
          sessionId,
          x: p.x ?? 0,
          y: p.y ?? 0,
          vx: p.vx ?? null,
          vy: p.vy ?? null,
          mapZone: p.mapZone || 'unknown',
        });
        break;
      case 'item:purchase':
        if (p.itemId) {
          purchases.push({
            sessionId, patchId, variant,
            itemId: p.itemId,
            price: p.price ?? 0,
            goldBefore: p.goldBefore ?? null,
            goldAfter: p.goldAfter ?? null,
          });
        }
        break;
      case 'death':
        deaths.push({
          sessionId, patchId, variant,
          killedBy: p.killedBy || p.attackerId || null,
          x: x ?? 0, y: y ?? 0,
          mapZone: p.mapZone || null,
        });
        break;
      case 'combat:engaged':
        engagements.push({
          sessionId, patchId, variant,
          enemyType: p.enemyType || 'unknown',
          damageDealt: p.damageDealt ?? null,
          damageTaken: p.damageTaken ?? null,
          killed: p.killed ?? null,
          x, y,
        });
        break;
      default:
        if (DEFECT_EVENT_TYPES.has(e.type)) {
          defects.push({
            sessionId, patchId, variant,
            defectType: e.type,
            context: p,
            x, y,
          });
        }
    }
  }

  const tasks = [insertEventBatch(raw)];
  if (trajRows.length) tasks.push(insertTrajectoryBatch(trajRows));
  for (const row of purchases)   tasks.push(insertPurchase(row));
  for (const row of defects)     tasks.push(insertDefect(row));
  for (const row of deaths)      tasks.push(insertDeath(row));
  for (const row of engagements) tasks.push(insertEngagement(row));

  try {
    await Promise.all(tasks);
  } catch (err) {
    console.error(`[Writer] fanOut failed for session ${sessionId}:`, err.message);
  }
}
