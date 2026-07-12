// ============================================================
// Telemetry Aggregation Agent — SDK evidence for Hermes
// ============================================================
import { EventType } from '@rift-seed/shared/events';
import { getAllBalance, getMatchHistory, getAdjustments, recordMatch } from '../database.js';

function increment(record, key, value = 1) {
  record[key] = (record[key] || 0) + value;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createBaseline(patchId) {
  return {
    patchId,
    events: 0,
    sessions: new Set(),
    startedAt: Date.now(),
    kills: 0,
    playerDeaths: 0,
    damage: {
      weapon: 0,
      skill: 0,
      received: 0,
      byWeapon: {},
      bySkill: {},
      byEnemy: {},
    },
    skills: { uses: {}, hits: {} },
    resources: {
      hp: { gained: 0, lost: 0, samples: [] },
      mp: { gained: 0, spent: 0, samples: [] },
    },
    path: { distance: 0, samples: 0 },
    sessionDurations: [],
    sessionBounds: new Map(),
  };
}

/** Aggregates normalized SDK events into compact, explainable evidence. */
export class TelemetryAgent {
  constructor({ matchHistoryReader = getMatchHistory } = {}) {
    this.events = [];
    this.patchBaselines = new Map();
    this.reports = [];
    this.totalIngested = 0;
    this.sessionStart = new Date().toISOString();
    this.matchHistoryReader = matchHistoryReader;
  }

  ingest(events) {
    for (const event of events) {
      if (!event || typeof event.type !== 'string') continue;
      this.events.push(event);
      if (this.events.length > 10000) this.events.splice(0, this.events.length - 10000);
      this.totalIngested++;
      this._updateBaseline(event);
    }

    if (this.totalIngested > 0 && this.totalIngested % 50 === 0) this.analyze();
  }

  _updateBaseline(event) {
    const patchId = event.patchId || 'unknown';
    if (!this.patchBaselines.has(patchId)) this.patchBaselines.set(patchId, createBaseline(patchId));
    const baseline = this.patchBaselines.get(patchId);
    baseline.events++;
    if (event.sessionId) {
      baseline.sessions.add(event.sessionId);
      const timestamp = Number(event.timestamp) || Date.now();
      const bounds = baseline.sessionBounds.get(event.sessionId) || {
        firstAt: timestamp,
        lastAt: timestamp,
        reportedDurationMs: null,
      };
      bounds.firstAt = Math.min(bounds.firstAt, timestamp);
      bounds.lastAt = Math.max(bounds.lastAt, timestamp);
      baseline.sessionBounds.set(event.sessionId, bounds);
    }

    const actorType = event.actor?.type || event.actorType;
    const targetType = event.target?.type || event.targetType || event.victimType;
    const sourceType = event.source?.type || event.sourceType;
    const sourceId = event.source?.id || event.sourceId || event.skillId || 'unknown';
    const enemyType = event.target?.enemyType || event.enemyType || sourceId;
    const damage = Number(event.metrics?.damage ?? event.damage) || 0;

    switch (event.type) {
      case EventType.ATTACK_HIT:
      case EventType.SKILL_HIT:
        if (actorType === 'player') {
          if (sourceType === 'skill' || event.type === EventType.SKILL_HIT) {
            baseline.damage.skill += damage;
            increment(baseline.damage.bySkill, sourceId, damage);
            increment(baseline.skills.hits, sourceId);
          } else {
            baseline.damage.weapon += damage;
            increment(baseline.damage.byWeapon, sourceId, damage);
          }
        }
        break;
      case EventType.DAMAGE_TAKEN:
        baseline.damage.received += damage;
        baseline.resources.hp.lost += damage;
        increment(baseline.damage.byEnemy, enemyType || 'unknown', damage);
        break;
      case EventType.SKILL_USE:
        if (actorType === 'player') increment(baseline.skills.uses, sourceId);
        break;
      case EventType.KILL:
        baseline.kills++;
        break;
      case EventType.DEATH:
        if (targetType === 'player') baseline.playerDeaths++;
        break;
      case EventType.RESOURCE_CHANGE: {
        const resource = event.context?.resource || event.resource;
        const delta = Number(event.metrics?.delta ?? event.delta) || 0;
        if (resource === 'hp') delta >= 0 ? baseline.resources.hp.gained += delta : baseline.resources.hp.lost += Math.abs(delta);
        if (resource === 'mp') delta >= 0 ? baseline.resources.mp.gained += delta : baseline.resources.mp.spent += Math.abs(delta);
        break;
      }
      case EventType.STATE_SAMPLE: {
        const hp = Number(event.metrics?.hpAfter ?? event.hpAfter);
        const mp = Number(event.metrics?.mpAfter ?? event.mpAfter);
        if (Number.isFinite(hp)) baseline.resources.hp.samples.push(hp);
        if (Number.isFinite(mp)) baseline.resources.mp.samples.push(mp);
        if (baseline.resources.hp.samples.length > 500) baseline.resources.hp.samples.shift();
        if (baseline.resources.mp.samples.length > 500) baseline.resources.mp.samples.shift();
        break;
      }
      case EventType.PATH_SAMPLE:
        baseline.path.samples++;
        baseline.path.distance += Number(event.metrics?.distance ?? event.distance) || 0;
        break;
      case EventType.SESSION_END:
        {
          const durationMs = Number(event.durationMs ?? event.metrics?.durationMs) || 0;
          baseline.sessionDurations.push(durationMs);
          const bounds = event.sessionId ? baseline.sessionBounds.get(event.sessionId) : null;
          if (bounds && durationMs > 0) bounds.reportedDurationMs = durationMs;
        }
        break;
    }
  }

  getEvidence(patchId = null) {
    // When no patchId is requested, use the baseline with the MOST events,
    // not the most recently created one. A single stray event carrying a
    // different patchId (test injection, A/B patch name, version bump) used
    // to create a fresh near-empty baseline that "won" the newest-first sort
    // and starved Hermes of all real evidence — especially after Postgres
    // rehydration, where replay order made the last patchId seen win.
    const baseline = patchId
      ? this.patchBaselines.get(patchId)
      : [...this.patchBaselines.values()].sort((a, b) => (b.events - a.events) || (b.startedAt - a.startedAt))[0];
    if (!baseline) return null;
    const observedDurationMs = [...baseline.sessionBounds.values()].reduce((total, bounds) => {
      const measured = Math.max(0, bounds.lastAt - bounds.firstAt);
      return total + Math.max(measured, bounds.reportedDurationMs || 0);
    }, 0);
    const durationMinutes = Math.max(observedDurationMs / 60000, 1 / 60);
    const totalDamage = baseline.damage.weapon + baseline.damage.skill;
    const skillUses = Object.values(baseline.skills.uses).reduce((sum, count) => sum + count, 0);
    return {
      patchId: baseline.patchId,
      sample: {
        events: baseline.events,
        sessions: baseline.sessions.size,
        observedMinutes: Number(durationMinutes.toFixed(2)),
        sufficientForDirection: baseline.events >= 30,
      },
      outcomes: {
        kills: baseline.kills,
        playerDeaths: baseline.playerDeaths,
        killsPerMinute: Number((baseline.kills / durationMinutes).toFixed(2)),
        deathsPerMinute: Number((baseline.playerDeaths / durationMinutes).toFixed(2)),
        killDeathRatio: baseline.playerDeaths > 0 ? Number((baseline.kills / baseline.playerDeaths).toFixed(2)) : baseline.kills,
      },
      damage: {
        totalDealt: totalDamage,
        weapon: baseline.damage.weapon,
        skill: baseline.damage.skill,
        received: baseline.damage.received,
        skillShare: totalDamage > 0 ? Number((baseline.damage.skill / totalDamage).toFixed(3)) : 0,
        byWeapon: baseline.damage.byWeapon,
        bySkill: baseline.damage.bySkill,
        byEnemy: baseline.damage.byEnemy,
      },
      skills: {
        uses: baseline.skills.uses,
        hits: baseline.skills.hits,
        totalUses: skillUses,
      },
      resources: {
        hp: {
          gained: Number(baseline.resources.hp.gained.toFixed(1)),
          lost: Number(baseline.resources.hp.lost.toFixed(1)),
          average: Number(average(baseline.resources.hp.samples).toFixed(1)),
          minimum: baseline.resources.hp.samples.length ? Math.min(...baseline.resources.hp.samples) : null,
        },
        mp: {
          gained: Number(baseline.resources.mp.gained.toFixed(1)),
          spent: Number(baseline.resources.mp.spent.toFixed(1)),
          average: Number(average(baseline.resources.mp.samples).toFixed(1)),
          minimum: baseline.resources.mp.samples.length ? Math.min(...baseline.resources.mp.samples) : null,
        },
      },
      movement: {
        distanceTiles: Number(baseline.path.distance.toFixed(2)),
        samples: baseline.path.samples,
        tilesPerMinute: Number((baseline.path.distance / durationMinutes).toFixed(2)),
      },
      session: {
        completedSessions: baseline.sessionDurations.length,
        averageDurationMs: Math.round(average(baseline.sessionDurations)),
      },
    };
  }

  /** Lower-resolution fallback for server restarts or pre-Postgres sessions. */
  getHistoricalEvidence(patchId = null) {
    const matches = this.matchHistoryReader(100) || [];
    if (!matches.length) return null;
    const sum = key => matches.reduce((total, row) => total + (Number(row[key]) || 0), 0);
    const kills = sum('kills');
    const playerDeaths = sum('deaths');
    const observedMinutes = Math.max(sum('duration_seconds') / 60, 1 / 60);
    const damageWeapon = sum('damage_dealt');
    const damageReceived = sum('damage_taken');
    const skillUses = sum('skills_used');
    return {
      patchId: patchId || 'match-history',
      source: 'match_history',
      sample: {
        events: 0,
        sessions: matches.length,
        matches: matches.length,
        observedMinutes: Number(observedMinutes.toFixed(2)),
        sufficientForDirection: matches.length >= 3,
        source: 'match_history',
      },
      outcomes: {
        kills,
        playerDeaths,
        killsPerMinute: Number((kills / observedMinutes).toFixed(2)),
        deathsPerMinute: Number((playerDeaths / observedMinutes).toFixed(2)),
        killDeathRatio: playerDeaths > 0 ? Number((kills / playerDeaths).toFixed(2)) : kills,
      },
      damage: {
        totalDealt: damageWeapon,
        weapon: damageWeapon,
        skill: 0,
        received: damageReceived,
        skillShare: 0,
        byWeapon: {},
        bySkill: {},
        byEnemy: {},
      },
      skills: { uses: {}, hits: {}, totalUses: skillUses },
      resources: {
        hp: { gained: 0, lost: damageReceived, average: 0, minimum: null },
        mp: { gained: 0, spent: 0, average: 0, minimum: null },
      },
      movement: { distanceTiles: 0, samples: 0 },
      session: { averageDurationMs: Number((observedMinutes * 60_000 / matches.length).toFixed(0)) },
    };
  }

  analyze() {
    const evidence = this.getEvidence();
    if (!evidence) return null;
    const findings = [];
    if (!evidence.sample.sufficientForDirection) {
      findings.push({ severity: 'info', metric: 'sample_size', message: 'Collect at least 30 events before treating balance signals as directional.' });
    }
    if (evidence.outcomes.playerDeaths >= 2 && evidence.outcomes.killDeathRatio < 1) {
      findings.push({ severity: 'high', metric: 'survivability', message: 'Player deaths exceed kills; inspect enemy damage and player effective HP.' });
    }
    if (evidence.damage.skillShare > 0.8 && evidence.skills.totalUses >= 5) {
      findings.push({ severity: 'medium', metric: 'skill_damage_share', message: 'Skills contribute over 80% of dealt damage; basic weapons may lack agency.' });
    }
    const report = {
      timestamp: Date.now(),
      evidence,
      findings,
      overallHealthScore: Math.max(20, 100 - findings.filter(f => f.severity === 'high').length * 25 - findings.filter(f => f.severity === 'medium').length * 10),
    };
    this.reports.push(report);
    if (this.reports.length > 100) this.reports.shift();
    return report;
  }

  recordMatchToDB(matchData) {
    recordMatch(matchData);
  }

  getSnapshot() {
    const latestReport = this.reports.at(-1) || this.analyze();
    return {
      totalEvents: this.totalIngested,
      patches: [...this.patchBaselines.keys()],
      evidence: this.getEvidence(),
      latestReport,
      reportsGenerated: this.reports.length,
      balanceValues: getAllBalance(),
      matchHistory: getMatchHistory(10),
      adjustments: getAdjustments(10),
    };
  }

  getStatus() {
    return {
      name: 'Telemetry SDK Aggregator',
      status: 'active',
      eventsProcessed: this.totalIngested,
      patchesObserved: this.patchBaselines.size,
      reportsGenerated: this.reports.length,
    };
  }
}
