// ============================================================
// Event writer — fans out a telemetry batch into the raw events
// table PLUS the per-KPI denormalized tables. All writes go via
// repositories.js (parameterized) and are safe to call from a
// hot WS handler.
// ============================================================
import {
  insertEventBatch, insertPurchase, insertDefect, insertDeath,
  insertTrajectoryBatch, insertEngagement, insertGameplayEventBatch,
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
    const metrics = e.metrics || {};
    const context = e.context || {};
    const source = e.source || {};
    const target = e.target || {};
    const actor = e.actor || {};
    const x = p.x ?? e.x ?? e.position?.x ?? null;
    const y = p.y ?? e.y ?? e.position?.y ?? null;

    raw.push({ sessionId, eventType: e.type, payload: e, x, y });

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
        {
          const itemId = p.itemId ?? source.id;
          if (!itemId) break;
          purchases.push({
            sessionId, patchId, variant,
            itemId,
            price: p.price ?? p.unitPrice ?? metrics.unitPrice ?? 0,
            goldBefore: p.goldBefore ?? metrics.goldBefore ?? null,
            goldAfter: p.goldAfter ?? metrics.goldAfter ?? null,
          });
        }
        break;
      case 'death':
        deaths.push({
          sessionId, patchId, variant,
          killedBy: p.killedBy || p.attackerId || source.id || actor.id || null,
          x: x ?? 0, y: y ?? 0,
          mapZone: p.mapZone || context.mapZone || context.area || null,
        });
        break;
      case 'combat:engaged':
        engagements.push({
          sessionId, patchId, variant,
          enemyType: p.enemyType || target.enemyType || 'unknown',
          damageDealt: p.damageDealt ?? metrics.damageDealt ?? null,
          damageTaken: p.damageTaken ?? metrics.damageTaken ?? null,
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

  const tasks = [
    insertEventBatch(raw),
    insertGameplayEventBatch(events, { sessionId, patchId }),
  ];
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
