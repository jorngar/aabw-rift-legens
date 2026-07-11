// ============================================================
// DefectDetector — passive observer that emits defect events
// (path:stuck, state:impossible, js:error, unhandledrejection).
// Consumers manually call reportPathfindFail() when A* returns [].
// ============================================================
import { EventType } from '@rift-seed/shared/events';

const STUCK_TIMEOUT_MS   = 30_000;
const ERROR_COOLDOWN_MS  = 5_000;
const MOVEMENT_EPSILON   = 0.05;
const POLL_INTERVAL_MS   = 1_000;

export class DefectDetector {
  /**
   * @param {{
   *   player: { pos: {x:number,y:number}, stats?: {hp:number}, gold?: number },
   *   emit:   (event: object) => void,
   *   playerId: string,
   * }} opts
   */
  constructor({ player, emit, playerId }) {
    this.player = player;
    this.emit = emit;
    this.playerId = playerId;
    this._lastMoveAt = performance.now();
    this._lastX = player?.pos?.x ?? 0;
    this._lastY = player?.pos?.y ?? 0;
    this._pollTimer = null;
    /** @type {Map<string, number>} fingerprint -> last emit at */
    this._errorFingerprints = new Map();
    /** @type {Set<string>} one-shot flags */
    this._impossibleReported = new Set();
    this._onError = this._onError.bind(this);
    this._onRejection = this._onRejection.bind(this);
  }

  start() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => this._pollStuckAndImpossible(), POLL_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('error', this._onError);
      window.addEventListener('unhandledrejection', this._onRejection);
    }
  }

  stop() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', this._onError);
      window.removeEventListener('unhandledrejection', this._onRejection);
    }
  }

  /** Called by pathfinding consumers when findPath returned []. */
  reportPathfindFail({ from, to } = {}) {
    this.emit({
      type: EventType.PATHFIND_FAIL,
      playerId: this.playerId,
      payload: { from: from || null, to: to || null, x: from?.x ?? null, y: from?.y ?? null },
    });
  }

  _pollStuckAndImpossible() {
    const pos = this.player?.pos;
    if (!pos) return;

    const dx = Math.abs(pos.x - this._lastX);
    const dy = Math.abs(pos.y - this._lastY);
    const now = performance.now();
    if (dx > MOVEMENT_EPSILON || dy > MOVEMENT_EPSILON) {
      this._lastX = pos.x; this._lastY = pos.y;
      this._lastMoveAt = now;
    } else if (now - this._lastMoveAt > STUCK_TIMEOUT_MS) {
      this.emit({
        type: EventType.PATH_STUCK,
        playerId: this.playerId,
        payload: { x: pos.x, y: pos.y, durationMs: Math.round(now - this._lastMoveAt) },
      });
      // Reset so we don't spam every second while still stuck.
      this._lastMoveAt = now;
    }

    // Impossible-state single-shots
    const hp = this.player?.stats?.hp;
    if (typeof hp === 'number' && hp < 0) this._reportOnce('hp_negative', { hp });
    const gold = this.player?.gold;
    if (typeof gold === 'number' && gold < 0) this._reportOnce('gold_negative', { gold });
  }

  _reportOnce(kind, extra) {
    if (this._impossibleReported.has(kind)) return;
    this._impossibleReported.add(kind);
    this.emit({
      type: EventType.IMPOSSIBLE_STATE,
      playerId: this.playerId,
      payload: { kind, ...extra, x: this.player?.pos?.x ?? null, y: this.player?.pos?.y ?? null },
    });
  }

  _onError(ev) {
    const fp = ev?.message || ev?.error?.stack?.split('\n')[0] || 'unknown';
    if (this._recentlyEmitted(fp)) return;
    this.emit({
      type: EventType.JS_ERROR,
      playerId: this.playerId,
      payload: {
        message: ev?.message || null,
        filename: ev?.filename || null,
        lineno: ev?.lineno ?? null,
        colno: ev?.colno ?? null,
        stack: ev?.error?.stack ? String(ev.error.stack).slice(0, 500) : null,
      },
    });
  }

  _onRejection(ev) {
    const reason = String(ev?.reason?.message || ev?.reason || 'unknown-rejection');
    if (this._recentlyEmitted(reason)) return;
    this.emit({
      type: EventType.JS_ERROR,
      playerId: this.playerId,
      payload: { kind: 'unhandledrejection', message: reason },
    });
  }

  _recentlyEmitted(fp) {
    const now = performance.now();
    const last = this._errorFingerprints.get(fp);
    if (last != null && now - last < ERROR_COOLDOWN_MS) return true;
    this._errorFingerprints.set(fp, now);
    // Cheap size cap so a runaway loop doesn't leak.
    if (this._errorFingerprints.size > 100) {
      const oldest = [...this._errorFingerprints.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
      if (oldest) this._errorFingerprints.delete(oldest);
    }
    return false;
  }
}
