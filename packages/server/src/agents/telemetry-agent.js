// ============================================================
// Telemetry Agent — reads game data, adjusts balance live
// ============================================================
import { EventType } from '@rift-seed/shared/events';
import { getBalance, setBalance, getAllBalance, getAggregateStats, recordMatch, getMatchHistory, getAdjustments } from '../database.js';

/**
 * Telemetry Agent: ingests game events, detects anomalies,
 * reads historical data from SQLite, and auto-adjusts balance.
 */
export class TelemetryAgent {
  constructor() {
    /** @type {Array<Object>} */
    this.events = [];
    /** @type {Map<string, Object>} per-patch baselines */
    this.patchBaselines = new Map();
    /** @type {Array<Object>} generated reports */
    this.reports = [];
    this.totalIngested = 0;
    this.sessionStart = new Date().toISOString();
    this.playerId = null;
    this.lastAdjustment = 0;
  }

  /**
   * Ingest a batch of telemetry events.
   */
  ingest(events) {
    for (const event of events) {
      this.events.push(event);
      this.totalIngested++;
      this._updateBaseline(event);

      if (event.playerId) this.playerId = event.playerId;
    }

    // Auto-analyze every 50 events
    if (this.events.length % 50 === 0) {
      this.analyze();
    }
  }

  _updateBaseline(event) {
    const patchId = event.patchId || 'unknown';
    if (!this.patchBaselines.has(patchId)) {
      this.patchBaselines.set(patchId, {
        patchId, events: 0, deaths: 0, kills: 0,
        skillUsage: {}, damageDealt: 0, damageTaken: 0,
        sessionDurations: [], goldEarned: 0, xpEarned: 0,
      });
    }

    const b = this.patchBaselines.get(patchId);
    b.events++;

    switch (event.type) {
      case EventType.DEATH: b.deaths++; break;
      case EventType.ATTACK_HIT:
        b.kills++;
        b.damageDealt += event.damage || 0;
        break;
      case EventType.DAMAGE_TAKEN:
        b.damageTaken += event.damage || 0;
        break;
      case EventType.SKILL_USE: {
        const skill = event.skillId || 'unknown';
        b.skillUsage[skill] = (b.skillUsage[skill] || 0) + 1;
        break;
      }
      case EventType.SESSION_END:
        if (event.durationMs) b.sessionDurations.push(event.durationMs);
        break;
    }
  }

  /**
   * Run analysis: detect anomalies, compare to DB history, auto-adjust balance.
   */
  analyze() {
    const findings = [];

    for (const [patchId, baseline] of this.patchBaselines) {
      if (baseline.events < 10) continue;

      // Compare to historical averages from DB
      const history = getAggregateStats();
      if (history && history.total_matches > 0) {
        // Check if death rate is too high vs historical
        const currentDeathRate = baseline.deaths / Math.max(1, baseline.events);
        const historicalDeathRate = (history.avg_deaths || 0) / Math.max(1, history.avg_kills || 1);

        if (currentDeathRate > historicalDeathRate * 1.5 && currentDeathRate > 0.1) {
          findings.push({
            metric: 'death_rate',
            current: currentDeathRate.toFixed(3),
            historical: historicalDeathRate.toFixed(3),
            recommendation: 'AUTO-NERF: Reducing enemy damage by 15%',
            confidence: 0.85,
          });

          // Auto-adjust: reduce enemy damage
          const now = Date.now();
          if (now - this.lastAdjustment > 30000) { // max once per 30s
            this._autoNerfEnemies(0.85);
            this.lastAdjustment = now;
          }
        }

        // Check if skill usage is too concentrated
        const totalSkills = Object.values(baseline.skillUsage).reduce((a, b) => a + b, 0);
        for (const [skill, count] of Object.entries(baseline.skillUsage)) {
          const pct = totalSkills > 0 ? count / totalSkills : 0;
          if (pct > 0.6) {
            findings.push({
              metric: `skill_${skill}_dominance`,
              current: `${(pct * 100).toFixed(0)}%`,
              recommendation: `NERF: ${skill} dominates usage. Consider increasing cooldown.`,
              confidence: 0.8,
            });

            // Auto-adjust: increase cooldown
            const cooldownKey = `skill.${skill.replace(/([A-Z])/g, '_$1').toLowerCase()}.cooldown`;
            const currentCooldown = getBalance(cooldownKey, 3000);
            if (currentCooldown < 8000) {
              setBalance(cooldownKey, currentCooldown * 1.2, `Auto-nerf: ${skill} dominates at ${(pct * 100).toFixed(0)}%`, 'telemetry');
            }
          }
        }
      }

      // Check kill rate — if too easy, buff enemies
      const killRate = baseline.kills / Math.max(1, baseline.events);
      if (killRate > 0.3 && baseline.deaths === 0) {
        findings.push({
          metric: 'too_easy',
          current: `kill_rate=${killRate.toFixed(2)}, deaths=0`,
          recommendation: 'AUTO-BUFF: Increasing enemy HP by 10%',
          confidence: 0.7,
        });
        this._autoBuffEnemies(1.1);
      }
    }

    const report = {
      timestamp: Date.now(),
      totalEvents: this.totalIngested,
      patchesAnalyzed: this.patchBaselines.size,
      findings,
      adjustments: getAdjustments(5),
      historicalStats: getAggregateStats(),
      overallHealthScore: this._calculateHealthScore(findings),
    };

    this.reports.push(report);
    return report;
  }

  _autoNerfEnemies(factor) {
    const keys = ['enemy.shadow_beast.damage', 'enemy.rift_knight.damage'];
    for (const key of keys) {
      const current = getBalance(key);
      const new_val = Math.max(1, Math.round(current * factor));
      setBalance(key, new_val, `Auto-nerf: death rate too high`, 'telemetry');
    }
  }

  _autoBuffEnemies(factor) {
    const keys = ['enemy.shadow_beast.hp', 'enemy.rift_knight.hp'];
    for (const key of keys) {
      const current = getBalance(key);
      setBalance(key, Math.round(current * factor), `Auto-buff: game too easy`, 'telemetry');
    }
  }

  _calculateHealthScore(findings) {
    if (findings.length === 0) return 95;
    const critical = findings.filter(f => f.confidence > 0.8).length;
    return Math.max(20, 100 - critical * 15 - findings.length * 5);
  }

  /**
   * Record a completed match to the database.
   */
  recordMatchToDB(matchData) {
    recordMatch(matchData);
  }

  getSnapshot() {
    const latest = this.reports.length > 0 ? this.reports[this.reports.length - 1] : null;
    return {
      totalEvents: this.totalIngested,
      patches: [...this.patchBaselines.keys()],
      latestReport: latest,
      reportsGenerated: this.reports.length,
      balanceValues: getAllBalanceQuick(),
      matchHistory: getMatchHistory(10),
      adjustments: getAdjustments(10),
    };
  }

  getStatus() {
    return {
      name: 'Telemetry Agent',
      status: 'active',
      eventsProcessed: this.totalIngested,
      reportsGenerated: this.reports.length,
      autoAdjustments: getAdjustments(10).length,
    };
  }
}

// Quick helper to get all balance values
function getAllBalanceQuick() {
  try {
    return getAllBalance();
  } catch {
    return {};
  }
}
