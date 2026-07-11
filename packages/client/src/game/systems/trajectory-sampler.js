// ============================================================
// TrajectorySampler — emits TRAJECTORY_SAMPLE events at a fixed
// cadence so the server can rebuild the player's canonical path.
// Fed downstream to path-compression in Phase 6.
// ============================================================
import { EventType } from '@rift-seed/shared/events';

const DEFAULT_INTERVAL_MS = 2000;

export class TrajectorySampler {
  /**
   * @param {{
   *   player: { pos: {x:number,y:number}, stats?: {hp?:number} },
   *   emit:   (event: object) => void,
   *   playerId: string,
   *   getZone?: () => 'garden' | 'dungeon',
   *   isPaused?: () => boolean,
   *   intervalMs?: number,
   * }} opts
   */
  constructor({ player, emit, playerId, getZone, isPaused, intervalMs = DEFAULT_INTERVAL_MS }) {
    this.player = player;
    this.emit = emit;
    this.playerId = playerId;
    this.getZone = getZone || (() => 'garden');
    this.isPaused = isPaused || (() => false);
    this.intervalMs = intervalMs;
    this._prevX = null; this._prevY = null; this._prevT = null;
    this._timer = null;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._sample(), this.intervalMs);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _sample() {
    if (this.isPaused()) return;
    const pos = this.player?.pos;
    if (!pos) return;
    // Consider a dead player as inactive.
    if (this.player.stats && Number(this.player.stats.hp) <= 0) return;

    const now = performance.now();
    let vx = null, vy = null;
    if (this._prevT != null) {
      const dt = (now - this._prevT) / 1000;
      if (dt > 0) {
        vx = (pos.x - this._prevX) / dt;
        vy = (pos.y - this._prevY) / dt;
      }
    }
    this.emit({
      type: EventType.TRAJECTORY_SAMPLE,
      playerId: this.playerId,
      payload: { x: pos.x, y: pos.y, vx, vy, mapZone: this.getZone() },
    });
    this._prevX = pos.x; this._prevY = pos.y; this._prevT = now;
  }
}
