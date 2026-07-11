// ============================================================
// Session Manager — server-owned WS session lifecycle.
//
// One WebSocket connection == one session.
// - startSession(ws, playerId): assigns variant, creates DB row,
//   returns entry with { sessionId, variant, patchDef } for session:init
// - ingest(ws, events): resets idle timer, dispatches to event-writers.fanOut
// - endSession(ws, reason): idempotent; UPDATE sessions row + fire
//   onSessionEnded callback (Phase 6 hooks path compression here)
// - 60s of no telemetry → auto endSession('idle') and terminate ws
// ============================================================
import { hashPlayerToVariant } from '@rift-seed/shared';
import {
  findActivePatch, upsertAssignment, createSession, endSession as endSessionRow,
} from './db/repositories.js';
import { fanOut } from './event-writers.js';

const IDLE_TIMEOUT_MS = 60_000;

export class SessionManager {
  /**
   * @param {{
   *   onSessionEnded?: (sessionId: string, entry: object) => void,
   *   hardcodedVariant?: 'A' | 'B' | null
   * }} [opts]
   */
  constructor({ onSessionEnded, hardcodedVariant } = {}) {
    /** @type {Map<any, object>} ws -> entry */
    this.sessions = new Map();
    /** @type {Map<string, any>} playerId -> ws (active connection tracker) */
    this.playerToWs = new Map();
    this.onSessionEnded = onSessionEnded || null;
    // When set (via SERVER_VARIANT env), this pool serves ONLY this variant
    // regardless of the deterministic playerId hash. The LB in front decides
    // routing; this pool just does what it's told.
    this.hardcodedVariant = hardcodedVariant || null;
  }

  /**
   * Create a session row for this ws + player. Idempotent — reusing
   * the same ws twice returns the existing entry. If the same player
   * opens a NEW ws while their old one is still tracked, we end the
   * prior session first so aggregates aren't double-counted.
   */
  async startSession(ws, playerId) {
    const existing = this.sessions.get(ws);
    if (existing) return existing;

    // Evict prior connection for this player, if any.
    const priorWs = this.playerToWs.get(playerId);
    if (priorWs && priorWs !== ws) {
      console.log(`[Session] evicting prior connection for player=${playerId}`);
      await this.endSession(priorWs, 'reconnect').catch(err => {
        console.error(`[Session] prior evict failed:`, err.message);
      });
    }

    const patchRow = await findActivePatch();
    if (!patchRow) throw new Error('no active patch — has the seeder run?');

    const patchId = patchRow.id;
    // patches.variant_a is JSONB; pg returns it already parsed
    const patchDef = {
      id: patchId,
      name: patchRow.name,
      variantA: patchRow.variant_a,
      variantB: patchRow.variant_b,
    };

    // If this pool is variant-pinned (LB mode), use that. Otherwise fall
    // back to the deterministic playerId hash so single-server dev still works.
    const chosenVariant = this.hardcodedVariant || hashPlayerToVariant(playerId, String(patchId));
    const { variant } = await upsertAssignment({ playerId, patchId, variant: chosenVariant });
    const sessionId = await createSession({ playerId, patchId, variant });

    const entry = {
      sessionId, playerId, patchId, variant, patchDef,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      idleTimer: null,
      ended: false,
      // Filled in by client-reported session:progress messages
      finalGold: null, finalXp: null, finalLevel: null, completedRift: null,
    };
    this._armIdle(ws, entry);
    this.sessions.set(ws, entry);
    this.playerToWs.set(playerId, ws);

    console.log(`[Session] start ${sessionId} player=${playerId} patch=${patchId} variant=${variant}`);
    return entry;
  }

  /**
   * Ingest a client telemetry batch. Resets the idle timer.
   */
  async ingest(ws, events) {
    const entry = this.sessions.get(ws);
    if (!entry || entry.ended) return;
    entry.lastActivityAt = Date.now();
    this._armIdle(ws, entry);
    await fanOut({
      sessionId: entry.sessionId,
      patchId: entry.patchId,
      variant: entry.variant,
      events,
    });
  }

  /**
   * Optional per-session final-stat updater — called by clients that
   * report end-of-session stats before the socket closes.
   */
  updateFinals(ws, { finalGold, finalXp, finalLevel, completedRift } = {}) {
    const entry = this.sessions.get(ws);
    if (!entry) return;
    if (finalGold != null)      entry.finalGold      = finalGold;
    if (finalXp != null)        entry.finalXp        = finalXp;
    if (finalLevel != null)     entry.finalLevel     = finalLevel;
    if (completedRift != null)  entry.completedRift  = completedRift;
  }

  async endSession(ws, reason) {
    const entry = this.sessions.get(ws);
    if (!entry || entry.ended) return;
    entry.ended = true;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);

    try {
      await endSessionRow({
        sessionId: entry.sessionId,
        endReason: reason,
        finalGold: entry.finalGold,
        finalXp: entry.finalXp,
        finalLevel: entry.finalLevel,
        completedRift: entry.completedRift,
      });
    } catch (err) {
      console.error(`[Session] endSession failed for ${entry.sessionId}:`, err.message);
    }

    console.log(`[Session] end ${entry.sessionId} reason=${reason}`);
    this.sessions.delete(ws);
    // Only drop the playerId→ws mapping if this ws is still the tracked one.
    if (this.playerToWs.get(entry.playerId) === ws) {
      this.playerToWs.delete(entry.playerId);
    }

    if (this.onSessionEnded) {
      // Fire-and-forget so a slow subscriber (e.g. path compressor) never blocks close.
      Promise.resolve()
        .then(() => this.onSessionEnded(entry.sessionId, entry))
        .catch(err => console.error('[Session] onSessionEnded callback failed:', err.message));
    }
  }

  getSession(ws) { return this.sessions.get(ws) || null; }
  size()         { return this.sessions.size; }

  _armIdle(ws, entry) {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      console.log(`[Session] idle timeout ${entry.sessionId}`);
      this.endSession(ws, 'idle')
        .then(() => {
          // 3 = CLOSED
          if (ws && typeof ws.terminate === 'function' && ws.readyState !== 3) ws.terminate();
        })
        .catch(err => console.error(`[Session] idle-close failed:`, err.message));
    }, IDLE_TIMEOUT_MS);
  }
}
