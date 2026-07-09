// ============================================================
// Telemetry System — hooks game events and sends to server
// ============================================================
import { EventType } from '@shared/events.js';

/**
 * Collects game events and periodically flushes them to the server.
 * Also maintains local aggregates for the HUD dashboard.
 */
export class TelemetrySystem {
  constructor() {
    /** @type {Array<Object>} raw event buffer */
    this.buffer = [];
    /** @type {Map<string, number>} per-metric counters */
    this.counters = new Map();
    /** @type {Map<string, number>} per-metric running averages */
    this.averages = new Map();
    /** Flush interval in ms */
    this.flushIntervalMs = 2000;
    this._lastFlush = Date.now();
    /** @type {WebSocket|null} */
    this.ws = null;
    /** Patch ID for A/B baseline comparison */
    this.currentPatchId = 'v0.1.0';
  }

  connect(url) {
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => console.log('[Telemetry] Connected to', url);
      this.ws.onclose = () => {
        console.log('[Telemetry] Disconnected, reconnecting in 3s...');
        setTimeout(() => this.connect(url), 3000);
      };
    } catch (e) {
      console.warn('[Telemetry] WebSocket failed:', e);
    }
  }

  /**
   * Record a game event.
   * @param {Object} event
   */
  record(event) {
    this.buffer.push({ ...event, patchId: this.currentPatchId });
    this._updateCounters(event);
  }

  _updateCounters(event) {
    const type = event.type;
    this.counters.set(type, (this.counters.get(type) || 0) + 1);

    // Track specific metrics
    switch (type) {
      case EventType.DEATH:
        this.counters.set('total_deaths', (this.counters.get('total_deaths') || 0) + 1);
        break;
      case EventType.SKILL_USE:
        const skillKey = `skill_${event.skillId || 'unknown'}_usage`;
        this.counters.set(skillKey, (this.counters.get(skillKey) || 0) + 1);
        break;
      case EventType.ATTACK_HIT:
        const totalDmg = this.counters.get('total_damage_dealt') || 0;
        this.counters.set('total_damage_dealt', totalDmg + (event.damage || 0));
        break;
      case EventType.SESSION_START:
        this.counters.set('sessions_started', (this.counters.get('sessions_started') || 0) + 1);
        break;
    }
  }

  /**
   * Flush buffered events to the server.
   */
  flush() {
    if (this.buffer.length === 0) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'telemetry:batch',
        events: this.buffer,
      }));
    }
    this.buffer = [];
    this._lastFlush = Date.now();
  }

  /**
   * Get a snapshot of current metrics for the dashboard.
   * @returns {Object}
   */
  getSnapshot() {
    return {
      patchId: this.currentPatchId,
      eventsBuffered: this.buffer.length,
      counters: Object.fromEntries(this.counters),
      timestamp: Date.now(),
    };
  }

  /**
   * Call each frame; auto-flushes on interval.
   */
  tick() {
    const now = Date.now();
    if (now - this._lastFlush >= this.flushIntervalMs) {
      this.flush();
    }
  }
}
