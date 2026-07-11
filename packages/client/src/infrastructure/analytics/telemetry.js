// ============================================================
// Telemetry System — hooks game events and sends to server
// ============================================================
import { EventType, TELEMETRY_SCHEMA_VERSION } from '@rift-seed/shared/events';

const MAX_BUFFER_SIZE = 2000;
const MAX_SERIES_SIZE = 240;
const PATH_SAMPLE_INTERVAL_MS = 250;
const STATE_SAMPLE_INTERVAL_MS = 1000;

function addToRecord(record, key, value) {
  record[key] = (record[key] || 0) + value;
}

function distanceBetween(a, b) {
  if (!a || !b) return 0;
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
}

function pushRolling(list, value) {
  list.push(value);
  if (list.length > MAX_SERIES_SIZE) list.splice(0, list.length - MAX_SERIES_SIZE);
}

/**
 * Collects game events and periodically flushes them to the server.
 * Also maintains local aggregates for the HUD dashboard.
 */
export class GameTelemetrySDK {
  constructor(options = {}) {
    /** @type {Array<Object>} raw event buffer */
    this.buffer = [];
    /** @type {Map<string, number>} per-metric counters */
    this.counters = new Map();
    /** @type {Map<string, number>} per-metric running averages */
    this.averages = new Map();
    /** Flush interval in ms */
    this.flushIntervalMs = options.flushIntervalMs || 2000;
    this._lastFlush = Date.now();
    /** @type {WebSocket|null} */
    this.ws = null;
    /** Patch ID for A/B baseline comparison */
    this.currentPatchId = options.patchId || 'v0.1.0';
    this.playerId = options.playerId || `anonymous_${Math.random().toString(36).slice(2, 8)}`;
    this.sessionId = options.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.gameVersion = options.gameVersion || '0.1.0';
    this.playerEntityId = null;
    this.sessionStartedAt = Date.now();
    this.totalRecorded = 0;
    this.droppedEvents = 0;
    this.connectionState = 'offline';
    this.damage = {
      dealt: { total: 0, weapon: 0, skill: 0, byWeapon: {}, bySkill: {} },
      received: { total: 0, byEnemy: {} },
    };
    this.outcomes = { kills: 0, playerDeaths: 0 };
    this.resources = {
      hp: { current: null, min: null, max: null, gained: 0, lost: 0, series: [] },
      mp: { current: null, min: null, max: null, gained: 0, spent: 0, series: [] },
    };
    this.path = { samples: [], distance: 0, directionChanges: 0, lastDirection: null };
    this._lastObservedState = null;
    this._lastPathSample = 0;
    this._lastStateSample = 0;
    this._eventSequence = 0;
    this._url = null;
    /** @type {Map<string, (msg:object)=>void>} */
    this._messageHandlers = new Map();
  }

  connect(url) {
    this._url = url;
    try {
      this.ws = new WebSocket(url);
      this.connectionState = 'connecting';
      this.ws.onopen = () => {
        this.connectionState = 'connected';
        console.log('[Telemetry SDK] Connected to', url);
        this.flush();
      };
      this.ws.onclose = () => {
        this.connectionState = 'offline';
        console.log('[Telemetry SDK] Disconnected, reconnecting in 3s...');
        setTimeout(() => this.connect(this._url), 3000);
      };
      this.ws.onerror = () => { this.connectionState = 'error'; };
      // Route incoming server messages to any registered listeners.
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        const handler = this._messageHandlers.get(msg.type);
        if (handler) handler(msg);
      };
    } catch (e) {
      this.connectionState = 'error';
      console.warn('[Telemetry SDK] WebSocket failed:', e);
    }
  }

  /** Register a handler for a specific server-sent message type. */
  onServerMessage(type, handler) {
    this._messageHandlers.set(type, handler);
  }

  /**
   * Send `session:hello` and resolve with the server's `session:init`
   * payload ({ sessionId, patchId, patchName, variant, mapConfig }).
   * Waits for the WS to open. Rejects on session:error or timeout.
   */
  handshake(playerId, { timeoutMs = 5000 } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._messageHandlers.delete('session:init');
        this._messageHandlers.delete('session:error');
        reject(new Error('session handshake timed out'));
      }, timeoutMs);

      this.onServerMessage('session:init', (msg) => {
        clearTimeout(timer);
        this._messageHandlers.delete('session:init');
        this._messageHandlers.delete('session:error');
        this.setSessionId(msg.sessionId);
        resolve(msg);
      });
      this.onServerMessage('session:error', (msg) => {
        clearTimeout(timer);
        this._messageHandlers.delete('session:init');
        this._messageHandlers.delete('session:error');
        reject(new Error(msg.reason || 'session:error'));
      });

      const send = () => this.ws.send(JSON.stringify({ type: 'session:hello', playerId }));
      if (this.ws?.readyState === WebSocket.OPEN) send();
      else this.ws.addEventListener('open', send, { once: true });
    });
  }

  /**
   * Record a game event.
   * @param {Object} event
   */
  record(event) {
    const normalized = this._normalize(event);
    this._enqueue(normalized);
    this.totalRecorded++;
    this._updateCounters(event);
    this._updateMetrics(event);
    this._reconcileObservedState(event);
    return normalized;
  }

  bindPlayer(player) {
    this.playerEntityId = player?.id ?? this.playerEntityId;
  }

  /**
   * Override the internal sessionId with the server-generated UUID
   * from a session:init handshake. Call once, right after the handshake.
   */
  setSessionId(sessionId) {
    if (!sessionId) return;
    this.sessionId = sessionId;
  }

  _normalize(event) {
    const timestamp = Number(event.timestamp) || Date.now();
    const actorId = event.actorId ?? event.attackerId ?? event.playerId ?? null;
    const actorType = event.actorType || (actorId === this.playerEntityId ? 'player' : 'unknown');
    return {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      eventId: `${this.sessionId}:${++this._eventSequence}`,
      type: event.type,
      timestamp,
      sessionId: this.sessionId,
      playerId: this.playerId,
      entityId: event.playerId ?? null,
      patchId: event.patchId || this.currentPatchId,
      gameVersion: this.gameVersion,
      actor: { id: actorId, type: actorType },
      target: {
        id: event.targetId ?? event.victimId ?? null,
        type: event.targetType || event.victimType || 'unknown',
        enemyType: event.targetEnemyType || event.enemyType || null,
      },
      source: {
        type: event.sourceType || (event.skillId ? 'skill' : 'system'),
        id: event.sourceId || event.skillId || event.itemId || null,
      },
      metrics: {
        damage: event.damage ?? null,
        hpBefore: event.hpBefore ?? null,
        hpAfter: event.hpAfter ?? event.targetHpRemaining ?? null,
        mpBefore: event.mpBefore ?? null,
        mpAfter: event.mpAfter ?? null,
        hpMax: event.hpMax ?? null,
        mpMax: event.mpMax ?? null,
        delta: event.delta ?? null,
        distance: event.distance ?? null,
        durationMs: event.durationMs ?? null,
        manaCost: event.manaCost ?? null,
        cooldownMs: event.cooldownMs ?? null,
        quantity: event.quantity ?? null,
        goldSpent: event.goldSpent ?? null,
        unitPrice: event.unitPrice ?? null,
        goldBefore: event.goldBefore ?? null,
        goldAfter: event.goldAfter ?? null,
        xpBefore: event.xpBefore ?? null,
        xpAfter: event.xpAfter ?? null,
        weaponDamage: event.weaponDamage ?? null,
        weaponSkillPower: event.weaponSkillPower ?? null,
        weaponAffinity: event.weaponAffinity ?? null,
      },
      position: event.position || (event.toX !== undefined ? { x: event.toX, y: event.toY } : null),
      context: {
        area: event.area || null,
        classId: event.classId || null,
        resource: event.resource || null,
        isCritical: Boolean(event.isCritical),
        testId: event.testId || null,
        variant: event.variant || null,
        tier: event.tier ?? null,
        result: event.result || null,
        playerLevel: event.playerLevel ?? event.level ?? null,
        previousLevel: event.previousLevel ?? null,
        rank: event.rank || null,
        wave: event.wave ?? null,
        enemyLevel: event.enemyLevel ?? null,
        weaponClass: event.weaponClass || null,
        itemType: event.itemType || null,
        reason: event.reason || null,
      },
      // Passthrough bucket so new event types (trajectory:sample,
      // path:stuck, item:purchase, combat:engaged, ...) can carry
      // arbitrary fields to server-side fanOut without teaching the
      // normalizer about every payload shape.
      payload: event.payload || null,
    };
  }

  _enqueue(event) {
    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      const overflow = this.buffer.length - MAX_BUFFER_SIZE;
      this.buffer.splice(0, overflow);
      this.droppedEvents += overflow;
    }
  }

  _updateCounters(event) {
    const type = event.type;
    this.counters.set(type, (this.counters.get(type) || 0) + 1);

    // Track specific metrics
    switch (type) {
      case EventType.DEATH:
        if (event.victimType === 'player' || event.targetType === 'player') {
          this.counters.set('total_deaths', (this.counters.get('total_deaths') || 0) + 1);
        }
        break;
      case EventType.KILL:
        this.counters.set('total_kills', (this.counters.get('total_kills') || 0) + 1);
        break;
      case EventType.SKILL_USE:
        const skillKey = `skill_${event.skillId || 'unknown'}_usage`;
        this.counters.set(skillKey, (this.counters.get(skillKey) || 0) + 1);
        break;
      case EventType.ATTACK_HIT:
      case EventType.SKILL_HIT:
        if (event.actorType === 'player') {
          const totalDmg = this.counters.get('total_damage_dealt') || 0;
          this.counters.set('total_damage_dealt', totalDmg + (event.damage || 0));
        }
        break;
      case EventType.DAMAGE_TAKEN:
        this.counters.set('total_damage_taken', (this.counters.get('total_damage_taken') || 0) + (event.damage || 0));
        break;
      case EventType.SESSION_START:
        this.counters.set('sessions_started', (this.counters.get('sessions_started') || 0) + 1);
        break;
    }
  }

  _updateMetrics(event) {
    const damage = Number(event.damage) || 0;
    if ((event.type === EventType.ATTACK_HIT || event.type === EventType.SKILL_HIT) && event.actorType === 'player') {
      this.damage.dealt.total += damage;
      if (event.sourceType === 'skill' || event.type === EventType.SKILL_HIT) {
        this.damage.dealt.skill += damage;
        addToRecord(this.damage.dealt.bySkill, event.sourceId || event.skillId || 'unknown', damage);
      } else {
        this.damage.dealt.weapon += damage;
        addToRecord(this.damage.dealt.byWeapon, event.sourceId || 'basic_attack', damage);
      }
    }
    if (event.type === EventType.DAMAGE_TAKEN) {
      this.damage.received.total += damage;
      addToRecord(this.damage.received.byEnemy, event.enemyType || event.sourceId || 'unknown', damage);
      this.resources.hp.lost += damage;
    }
    if (event.type === EventType.KILL) this.outcomes.kills++;
    if (event.type === EventType.DEATH && (event.victimType === 'player' || event.targetType === 'player')) {
      this.outcomes.playerDeaths++;
    }
    if (event.type === EventType.RESOURCE_CHANGE) {
      const resource = event.resource;
      const delta = Number(event.delta) || 0;
      const bucket = this.resources[resource];
      if (bucket) {
        if (resource === 'hp') delta >= 0 ? bucket.gained += delta : bucket.lost += Math.abs(delta);
        if (resource === 'mp') delta >= 0 ? bucket.gained += delta : bucket.spent += Math.abs(delta);
        const after = Number(event[`${resource}After`]);
        if (Number.isFinite(after)) {
          bucket.current = after;
          bucket.min = bucket.min === null ? after : Math.min(bucket.min, after);
        }
      }
    }
  }

  _reconcileObservedState(event) {
    if (!this._lastObservedState) return;
    if (event.type === EventType.DAMAGE_TAKEN && Number.isFinite(Number(event.hpAfter))) {
      this._lastObservedState.hp = Number(event.hpAfter);
    }
    if (event.type === EventType.RESOURCE_CHANGE) {
      const resource = event.resource;
      const after = Number(event[`${resource}After`]);
      if ((resource === 'hp' || resource === 'mp') && Number.isFinite(after)) {
        this._lastObservedState[resource] = after;
      }
    }
  }

  /** Sample player resources and movement without coupling the SDK to the game loop. */
  observePlayerState(player, context = {}) {
    if (!player?.stats || !player?.pos) return;
    this.bindPlayer(player);
    const now = Date.now();
    const current = {
      timestamp: now,
      hp: Number(player.stats.hp) || 0,
      maxHp: Number(player.stats.maxHp) || 0,
      mp: Number(player.stats.mp) || 0,
      maxMp: Number(player.stats.maxMp) || 0,
      position: { x: Number(player.pos.x) || 0, y: Number(player.pos.y) || 0 },
    };

    if (this._lastObservedState) {
      this._trackResourceDelta('hp', this._lastObservedState.hp, current.hp, now);
      this._trackResourceDelta('mp', this._lastObservedState.mp, current.mp, now);
    }

    if (!this._lastObservedState || now - this._lastPathSample >= PATH_SAMPLE_INTERVAL_MS) {
      const segment = this._lastObservedState ? distanceBetween(this._lastObservedState.position, current.position) : 0;
      if (!this._lastObservedState || segment >= 0.03) {
        const dx = this._lastObservedState ? current.position.x - this._lastObservedState.position.x : 0;
        const dy = this._lastObservedState ? current.position.y - this._lastObservedState.position.y : 0;
        const direction = `${Math.sign(dx)},${Math.sign(dy)}`;
        if (this.path.lastDirection && direction !== '0,0' && direction !== this.path.lastDirection) this.path.directionChanges++;
        if (direction !== '0,0') this.path.lastDirection = direction;
        this.path.distance += segment;
        const sample = { timestamp: now, x: current.position.x, y: current.position.y, distance: segment };
        pushRolling(this.path.samples, sample);
        this.record({
          type: EventType.PATH_SAMPLE, timestamp: now, playerId: player.id,
          actorId: player.id, actorType: 'player', sourceType: 'movement', sourceId: 'player_path',
          position: current.position, distance: segment, ...context,
        });
      }
      this._lastPathSample = now;
    }

    if (!this._lastObservedState || now - this._lastStateSample >= STATE_SAMPLE_INTERVAL_MS) {
      this._updateResource('hp', current.hp, current.maxHp, now);
      this._updateResource('mp', current.mp, current.maxMp, now);
      this.record({
        type: EventType.STATE_SAMPLE, timestamp: now, playerId: player.id,
        actorId: player.id, actorType: 'player', sourceType: 'observation', sourceId: 'player_state',
        hpAfter: current.hp, hpMax: current.maxHp, mpAfter: current.mp, mpMax: current.maxMp,
        position: current.position, ...context,
      });
      this._lastStateSample = now;
    }
    this._lastObservedState = current;
  }

  _trackResourceDelta(resource, before, after, timestamp) {
    const delta = after - before;
    if (Math.abs(delta) < 0.01) return;
    this.record({
      type: EventType.RESOURCE_CHANGE, timestamp, playerId: this.playerEntityId,
      actorId: this.playerEntityId, actorType: 'player', sourceType: 'observation', sourceId: `${resource}_delta`,
      resource, delta, [`${resource}Before`]: before, [`${resource}After`]: after,
    });
  }

  _updateResource(resource, value, max, timestamp) {
    const bucket = this.resources[resource];
    bucket.current = value;
    bucket.max = max;
    bucket.min = bucket.min === null ? value : Math.min(bucket.min, value);
    pushRolling(bucket.series, { timestamp, value, max });
  }

  /**
   * Flush buffered events to the server.
   */
  flush() {
    if (this.buffer.length === 0) return true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      const events = this.buffer.slice();
      this.ws.send(JSON.stringify({
        type: 'telemetry:batch',
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        sessionId: this.sessionId,
        events,
      }));
      this.buffer.splice(0, events.length);
      this._lastFlush = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Get a snapshot of current metrics for the dashboard.
   * @returns {Object}
   */
  getSnapshot() {
    const durationMinutes = Math.max((Date.now() - this.sessionStartedAt) / 60000, 1 / 60);
    return {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      sessionId: this.sessionId,
      playerId: this.playerId,
      patchId: this.currentPatchId,
      eventsBuffered: this.buffer.length,
      eventsRecorded: this.totalRecorded,
      droppedEvents: this.droppedEvents,
      connectionState: this.connectionState,
      counters: Object.fromEntries(this.counters),
      metrics: {
        damage: this.damage,
        resources: this.resources,
        path: {
          ...this.path,
          averageSpeedTilesPerMinute: this.path.distance / durationMinutes,
        },
        outcomes: {
          ...this.outcomes,
          killsPerMinute: this.outcomes.kills / durationMinutes,
          deathsPerMinute: this.outcomes.playerDeaths / durationMinutes,
        },
        session: { durationMs: Date.now() - this.sessionStartedAt },
      },
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

/** Backwards-compatible name used by the current game. */
export class TelemetrySystem extends GameTelemetrySDK {}
