// ============================================================
// Data Cleaning Agent — transforms raw game logs into
// structured robotics-ready data (behavioral cloning pipeline)
// ============================================================

/**
 * Takes raw game events and transforms them into clean,
 * structured data suitable for robotics applications:
 * - Decision path extraction
 * - Movement vector smoothing
 * - Action sequence categorization
 * - Spatial trajectory formatting
 */
export class DataCleaningAgent {
  constructor() {
    /** @type {Array<Object>} raw events */
    this.rawEvents = [];
    /** @type {Array<Object>} cleaned records */
    this.cleaned = [];
    /** @type {Array<Object>} trajectory segments */
    this.trajectories = [];
    /** @type {Map<string, Object>} entity sessions */
    this.sessions = new Map();
    this.totalIngested = 0;
  }

  /**
   * Ingest a batch of raw events.
   */
  ingest(events) {
    for (const event of events) {
      this.rawEvents.push(event);
      this.totalIngested++;
      this._processEvent(event);
    }
  }

  _processEvent(event) {
    const entityId = event.entityId || event.playerId || 'unknown';

    // Maintain per-entity session state
    if (!this.sessions.has(entityId)) {
      this.sessions.set(entityId, {
        entityId,
        events: [],
        trajectory: [],
        decisions: [],
        currentAction: 'IDLE',
      });
    }

    const session = this.sessions.get(entityId);
    session.events.push(event);

    // Extract spatial data
    const spatial = this._extractSpatial(event);
    if (spatial) {
      session.trajectory.push(spatial);
    }

    // Categorize decision
    const decision = this._categorizeDecision(event, session.currentAction);
    if (decision) {
      session.decisions.push(decision);
      session.currentAction = decision.action;
    }

    // Create cleaned record
    const cleaned = this._cleanRecord(event, session);
    if (cleaned) {
      this.cleaned.push(cleaned);
    }
  }

  _extractSpatial(event) {
    if (event.pos_x === undefined && event.fromX === undefined) return null;

    return {
      timestamp: event.timestamp,
      entityId: event.entityId || event.playerId,
      pos_x: event.pos_x ?? event.fromX ?? 0,
      pos_y: event.pos_y ?? event.fromY ?? 0,
      target_x: event.target_x ?? event.toX ?? null,
      target_y: event.target_y ?? event.toY ?? null,
      velocity: event.velocity ?? 0,
      direction: event.direction ?? null,
    };
  }

  _categorizeDecision(event, currentAction) {
    const type = event.type || event.eventType;

    const DECISION_MAP = {
      'move:start':        'NAVIGATE',
      'move:stop':         'ARRIVE',
      'attack':            'ENGAGE',
      'attack:hit':        'COMBAT',
      'skill:use':         'COMBAT',
      'skill:hit':         'COMBAT',
      'damage:taken':      'DEFEND',
      'death':             'ELIMINATED',
      'item:use':          'RESOURCE_MGMT',
      'item:pickup':       'COLLECT',
      'area:enter':        'EXPLORE',
      'rift:enter':        'ENTER_INSTANCE',
      'rift:exit':         'EXIT_INSTANCE',
      'teleport':          'REPOSITION',
    };

    const action = DECISION_MAP[type];
    if (!action) return null;

    return {
      timestamp: event.timestamp,
      action,
      previousAction: currentAction,
      context: this._inferContext(action, currentAction),
    };
  }

  _inferContext(action, previous) {
    // Context-aware decision categorization
    if (action === 'COMBAT' && previous === 'NAVIGATE') return 'COMBAT_INITIATION';
    if (action === 'NAVIGATE' && previous === 'COMBAT') return 'RETREAT';
    if (action === 'NAVIGATE' && previous === 'NAVIGATE') return 'PATHFINDING';
    if (action === 'RESOURCE_MGMT' && previous === 'COMBAT') return 'POST_COMBAT_RECOVERY';
    if (action === 'EXPLORE') return 'MAP_DISCOVERY';
    return action;
  }

  _cleanRecord(event, session) {
    const type = event.type || event.eventType;
    if (!type) return null;

    return {
      timestamp: event.timestamp,
      entity_id: event.entityId || event.playerId || session.entityId,
      event_type: type,
      pos_x: event.pos_x ?? event.fromX ?? null,
      pos_y: event.pos_y ?? event.fromY ?? null,
      target_x: event.target_x ?? event.toX ?? null,
      target_y: event.target_y ?? event.toY ?? null,
      velocity: event.velocity ?? null,
      direction: event.direction ?? null,
      action: session.currentAction,
      damage: event.damage ?? null,
      skill_id: event.skillId ?? null,
      item_id: event.itemId ?? null,
      context: session.decisions.length > 0
        ? session.decisions[session.decisions.length - 1].context
        : 'INITIAL',
    };
  }

  /**
   * Generate smoothed trajectory for a specific entity.
   * Converts raw movement data into waypoint sequences with velocity vectors.
   */
  getTrajectory(entityId) {
    const session = this.sessions.get(entityId);
    if (!session) return [];

    const trajectory = [];
    let lastPoint = null;

    for (const point of session.trajectory) {
      if (!lastPoint) {
        lastPoint = point;
        trajectory.push({ ...point, segment_type: 'START' });
        continue;
      }

      const dx = point.pos_x - lastPoint.pos_x;
      const dy = point.pos_y - lastPoint.pos_y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0.1) { // Only include actual movement
        const dt = (point.timestamp - lastPoint.timestamp) / 1000; // seconds
        const velocity = dt > 0 ? dist / dt : 0;

        trajectory.push({
          ...point,
          delta_x: dx,
          delta_y: dy,
          distance: dist,
          velocity_computed: velocity,
          segment_type: velocity > 2 ? 'FAST' : velocity > 0.5 ? 'WALK' : 'IDLE',
        });

        lastPoint = point;
      }
    }

    return trajectory;
  }

  /**
   * Export all data as robotics-ready CSV.
   * Format: timestamp, entity_id, pos_x, pos_y, vel_x, vel_y, action, target_id, context
   */
  exportCSV() {
    const headers = [
      'timestamp', 'entity_id', 'pos_x', 'pos_y',
      'vel_x', 'vel_y', 'action', 'target_id', 'context',
    ];

    const rows = this.cleaned.map(r => [
      r.timestamp,
      r.entity_id,
      r.pos_x ?? '',
      r.pos_y ?? '',
      r.velocity ?? '',
      '',
      r.action ?? r.event_type,
      r.skill_id ?? r.item_id ?? '',
      r.context,
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Export as structured JSON for agent consumption.
   */
  exportJSON() {
    const entitySummaries = {};
    for (const [entityId, session] of this.sessions) {
      const trajectory = this.getTrajectory(entityId);
      const decisionCounts = {};
      for (const d of session.decisions) {
        decisionCounts[d.action] = (decisionCounts[d.action] || 0) + 1;
      }

      entitySummaries[entityId] = {
        totalEvents: session.events.length,
        trajectoryPoints: trajectory.length,
        decisionCounts,
        trajectory: trajectory.slice(0, 100), // Limit for API response
      };
    }

    return {
      totalRawEvents: this.rawEvents.length,
      totalCleanedRecords: this.cleaned.length,
      entities: entitySummaries,
      exportedAt: Date.now(),
    };
  }

  getSnapshot() {
    return {
      totalIngested: this.totalIngested,
      totalCleaned: this.cleaned.length,
      entitiesTracked: this.sessions.size,
      trajectories: [...this.sessions.keys()].map(id => ({
        entityId: id,
        points: this.getTrajectory(id).length,
      })),
    };
  }

  getStatus() {
    return {
      name: 'Data Cleaning Agent',
      status: 'active',
      eventsProcessed: this.totalIngested,
      cleanedRecords: this.cleaned.length,
      entitiesTracked: this.sessions.size,
    };
  }
}
