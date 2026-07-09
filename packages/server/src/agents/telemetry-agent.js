// ============================================================
// Telemetry Agent — measures patch impact on live-service games
// ============================================================
import { EventType } from '@rift-seed/shared/events';

/**
 * Ingests game events, aggregates per-patch metrics,
 * detects anomalies, and generates balance recommendations.
 */
export class TelemetryAgent {
  constructor() {
    /** @type {Array<Object>} */
    this.events = [];
    /** @type {Map<string, Object>} patchId -> metrics */
    this.patchBaselines = new Map();
    /** @type {Array<Object>} generated reports */
    this.reports = [];
    this.totalIngested = 0;
  }

  /**
   * Ingest a batch of telemetry events.
   * @param {Array<Object>} events
   */
  ingest(events) {
    for (const event of events) {
      this.events.push(event);
      this.totalIngested++;
      this._updateBaseline(event);
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
        patchId,
        events: 0,
        deaths: 0,
        kills: 0,
        skillUsage: {},
        damageDealt: 0,
        damageTaken: 0,
        sessionDurations: [],
        areaTransitions: {},
        itemPurchases: 0,
        bugReports: 0,
      });
    }

    const baseline = this.patchBaselines.get(patchId);
    baseline.events++;

    switch (event.type) {
      case EventType.DEATH:
        baseline.deaths++;
        break;
      case EventType.ATTACK_HIT:
        baseline.kills++;
        baseline.damageDealt += event.damage || 0;
        break;
      case EventType.DAMAGE_TAKEN:
        baseline.damageTaken += event.damage || 0;
        break;
      case EventType.SKILL_USE: {
        const skill = event.skillId || 'unknown';
        baseline.skillUsage[skill] = (baseline.skillUsage[skill] || 0) + 1;
        break;
      }
      case EventType.ITEM_PURCHASE:
        baseline.itemPurchases++;
        break;
      case EventType.AREA_ENTER: {
        const area = event.areaId || 'unknown';
        baseline.areaTransitions[area] = (baseline.areaTransitions[area] || 0) + 1;
        break;
      }
      case EventType.BUG_REPORT:
        baseline.bugReports++;
        break;
      case EventType.SESSION_END:
        if (event.durationMs) {
          baseline.sessionDurations.push(event.durationMs);
        }
        break;
    }
  }

  /**
   * Run analysis and generate a report.
   * @returns {Object}
   */
  analyze() {
    const findings = [];

    for (const [patchId, baseline] of this.patchBaselines) {
      if (baseline.events < 10) continue;

      // Find skill usage anomalies
      const totalSkillUses = Object.values(baseline.skillUsage).reduce((a, b) => a + b, 0);
      for (const [skill, count] of Object.entries(baseline.skillUsage)) {
        const pct = totalSkillUses > 0 ? count / totalSkillUses : 0;
        if (pct > 0.5) {
          findings.push({
            metric: `skill_${skill}_usage`,
            change: `+${Math.round((pct - 0.25) / 0.25 * 100)}%`,
            value: count,
            percentage: Math.round(pct * 100),
            recommendation: `NERF: ${skill} dominates at ${Math.round(pct * 100)}% usage. Consider increasing cooldown or reducing damage.`,
            confidence: Math.min(0.95, 0.6 + pct * 0.4),
            patchId,
          });
        }
      }

      // Death rate analysis
      const deathRate = baseline.deaths / Math.max(1, baseline.events) * 1000;
      if (deathRate > 5) {
        findings.push({
          metric: 'death_rate_per_1000_events',
          change: `${deathRate.toFixed(1)}/1000`,
          value: baseline.deaths,
          recommendation: 'HIGH MORTALITY: Check mob density and damage tuning in affected areas.',
          confidence: 0.8,
          patchId,
        });
      }

      // Session duration
      if (baseline.sessionDurations.length > 0) {
        const avgDuration = baseline.sessionDurations.reduce((a, b) => a + b, 0) / baseline.sessionDurations.length;
        const avgMin = avgDuration / 60000;
        if (avgMin < 5) {
          findings.push({
            metric: 'avg_session_duration_min',
            change: `${avgMin.toFixed(1)} min`,
            value: avgDuration,
            recommendation: 'LOW ENGAGEMENT: Sessions under 5 min suggest early frustration or content gaps.',
            confidence: 0.75,
            patchId,
          });
        }
      }
    }

    const report = {
      timestamp: Date.now(),
      totalEvents: this.totalIngested,
      patchesAnalyzed: this.patchBaselines.size,
      findings,
      overallHealthScore: this._calculateHealthScore(findings),
    };

    this.reports.push(report);
    return report;
  }

  _calculateHealthScore(findings) {
    if (findings.length === 0) return 95;
    const criticalFindings = findings.filter(f => f.confidence > 0.8).length;
    return Math.max(20, 100 - criticalFindings * 15 - findings.length * 5);
  }

  /**
   * Get current snapshot for dashboard display.
   */
  getSnapshot() {
    const latest = this.reports.length > 0 ? this.reports[this.reports.length - 1] : null;
    return {
      totalEvents: this.totalIngested,
      patches: [...this.patchBaselines.keys()],
      latestReport: latest,
      reportsGenerated: this.reports.length,
    };
  }

  getStatus() {
    return {
      name: 'Telemetry Agent',
      status: 'active',
      eventsProcessed: this.totalIngested,
      reportsGenerated: this.reports.length,
    };
  }
}
