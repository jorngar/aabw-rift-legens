// ============================================================
// Data Logging System — raw event capture for robotics pipeline
// ============================================================
import { EventType } from '@shared/events.js';

/**
 * Captures structured gameplay data for the Data Cleaning Agent.
 * Maintains a rolling window of player decisions, movement vectors,
 * and action sequences that can be exported as robotics-ready CSV.
 */
export class DataLoggingSystem {
  constructor() {
    /** @type {Array<Object>} */
    this.log = [];
    /** Current decision context */
    this.currentContext = 'IDLE';
    /** Movement tracking */
    this._lastPos = null;
    this._lastTimestamp = null;
    /** @type {WebSocket|null} */
    this.ws = null;
  }

  connect(url) {
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => console.log('[DataLog] Connected');
      this.ws.onclose = () => setTimeout(() => this.connect(url), 3000);
    } catch (e) { /* silent */ }
  }

  /**
   * Record a game event for the data pipeline.
   * @param {Object} event
   */
  record(event) {
    const entry = {
      timestamp: event.timestamp,
      entityId: event.playerId,
      eventType: event.type,
      context: this._inferContext(event),
      ...this._extractSpatialData(event),
    };
    this.log.push(entry);
  }

  _inferContext(event) {
    switch (event.type) {
      case EventType.MOVE_START:
      case EventType.MOVE_STOP:
        return this.currentContext === 'COMBAT' ? 'REPOSITIONING' : 'NAVIGATING';
      case EventType.ATTACK_HIT:
      case EventType.SKILL_USE:
      case EventType.SKILL_HIT:
        this.currentContext = 'COMBAT';
        return 'COMBAT';
      case EventType.ITEM_USE:
        return 'RESOURCE_MGMT';
      case EventType.RIFT_ENTER:
        return 'EXPLORATION';
      case EventType.DEATH:
        this.currentContext = 'DEAD';
        return 'ELIMINATED';
      case EventType.RESPAWN:
        this.currentContext = 'IDLE';
        return 'RESPAWNED';
      default:
        return this.currentContext;
    }
  }

  _extractSpatialData(event) {
    const data = {};
    if (event.fromX !== undefined) {
      data.pos_x = event.fromX;
      data.pos_y = event.fromY;
    }
    if (event.toX !== undefined) {
      data.target_x = event.toX;
      data.target_y = event.toY;
    }
    if (event.velocity !== undefined) {
      data.velocity = event.velocity;
    }
    if (event.direction !== undefined) {
      data.direction = event.direction;
    }
    return data;
  }

  /**
   * Export the log as robotics-ready CSV.
   * @returns {string}
   */
  exportCSV() {
    const headers = ['timestamp', 'entity_id', 'event_type', 'pos_x', 'pos_y', 'target_x', 'target_y', 'velocity', 'direction', 'context'];
    const rows = this.log.map(e => headers.map(h => e[h] ?? '').join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Export as JSON for the Data Cleaning Agent.
   * @returns {Object}
   */
  exportJSON() {
    return {
      totalEvents: this.log.length,
      durationMs: this.log.length > 0
        ? this.log[this.log.length - 1].timestamp - this.log[0].timestamp
        : 0,
      events: this.log,
      summary: this._summarize(),
    };
  }

  _summarize() {
    const contexts = {};
    for (const e of this.log) {
      contexts[e.context] = (contexts[e.context] || 0) + 1;
    }
    return { contextDistribution: contexts };
  }

  /**
   * Flush to server.
   */
  flush() {
    if (this.ws?.readyState === WebSocket.OPEN && this.log.length > 0) {
      this.ws.send(JSON.stringify({
        type: 'data:batch',
        events: this.log.slice(-100), // last 100
      }));
    }
  }
}
