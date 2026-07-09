// ============================================================
// A/B Testing Agent — dual-variant testing with auto-promotion
// ============================================================
import { AB_TESTS } from '@rift-seed/shared/config';

/**
 * Manages A/B test cohorts, tracks KPIs per variant,
 * runs statistical significance tests, and promotes winners.
 */
export class ABTestingAgent {
  constructor() {
    /** @type {Map<string, Object>} testId -> test state */
    this.tests = new Map();
    this._initTests();
  }

  _initTests() {
    for (const [testId, def] of Object.entries(AB_TESTS)) {
      this.tests.set(testId, {
        ...def,
        testId,
        variants: {
          A: { players: new Set(), kpis: this._emptyKpis() },
          B: { players: new Set(), kpis: this._emptyKpis() },
        },
        winner: null,
        pValue: null,
        startedAt: Date.now(),
      });
    }
  }

  _emptyKpis() {
    return {
      sessionDurations: [],
      deathCounts: [],
      skillUsageCounts: [],
      completionRates: [],
      bugReports: 0,
      xpPerMinute: [],
    };
  }

  /**
   * Assign a player to a test variant.
   * Deterministic: same playerId + testId always yields same variant.
   */
  assignPlayer(playerId, testId) {
    const test = this.tests.get(testId);
    if (!test) return { error: 'unknown_test' };

    const hash = this._hash(playerId + testId);
    const variant = hash % 2 === 0 ? 'A' : 'B';
    test.variants[variant].players.add(playerId);

    return { testId, variant, param: test.param, value: test.variants_data?.[variant]?.value };
  }

  /**
   * Record an event for a specific test variant.
   */
  recordEvent(testId, variant, event) {
    const test = this.tests.get(testId);
    if (!test || !test.variants[variant]) return;

    const kpis = test.variants[variant].kpis;

    switch (event.type) {
      case 'session_end':
        if (event.durationMs) kpis.sessionDurations.push(event.durationMs);
        break;
      case 'death':
        kpis.deathCounts.push(event.count || 1);
        break;
      case 'skill_use':
        kpis.skillUsageCounts.push(event.count || 1);
        break;
      case 'completion':
        kpis.completionRates.push(event.completed ? 1 : 0);
        break;
      case 'bug_report':
        kpis.bugReports++;
        break;
      case 'xp_gain':
        if (event.xpPerMinute) kpis.xpPerMinute.push(event.xpPerMinute);
        break;
    }

    // Auto-check for winner when enough samples
    this._checkSignificance(testId);
  }

  /**
   * Run statistical significance test on the primary KPI.
   */
  _checkSignificance(testId) {
    const test = this.tests.get(testId);
    if (!test || test.winner) return;

    const kpiA = test.variants.A.kpis;
    const kpiB = test.variants.B.kpis;

    // Use session duration as primary KPI
    const samplesA = kpiA.sessionDurations;
    const samplesB = kpiB.sessionDurations;

    if (samplesA.length < test.minSamples || samplesB.length < test.minSamples) return;

    // Welch's t-test
    const result = this._welchTTest(samplesA, samplesB);
    test.pValue = result.pValue;

    if (result.pValue < test.significanceLevel) {
      const meanA = this._mean(samplesA);
      const meanB = this._mean(samplesB);
      test.winner = meanB > meanA ? 'B' : 'A';
      test.winnerMean = Math.max(meanA, meanB);
      test.loserMean = Math.min(meanA, meanB);
      test.promotedAt = Date.now();
    }
  }

  /**
   * Welch's t-test for unequal variances.
   */
  _welchTTest(a, b) {
    const n1 = a.length, n2 = b.length;
    const m1 = this._mean(a), m2 = this._mean(b);
    const v1 = this._variance(a), v2 = this._variance(b);

    const se = Math.sqrt(v1 / n1 + v2 / n2);
    if (se === 0) return { tStat: 0, pValue: 1 };

    const t = (m1 - m2) / se;

    // Welch-Satterthwaite degrees of freedom
    const df = Math.pow(v1/n1 + v2/n2, 2) /
      (Math.pow(v1/n1, 2)/(n1-1) + Math.pow(v2/n2, 2)/(n2-1));

    // Approximate p-value (two-tailed)
    const p = this._tDistPValue(Math.abs(t), df);

    return { tStat: t, pValue: p, df };
  }

  _mean(arr) {
    return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  _variance(arr) {
    if (arr.length < 2) return 0;
    const m = this._mean(arr);
    return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  }

  /**
   * Approximate two-tailed p-value from t-distribution.
   * Uses a simple approximation for hackathon speed.
   */
  _tDistPValue(t, df) {
    // Hill's approximation for the incomplete beta function
    const x = df / (df + t * t);
    const a = df / 2;
    const b = 0.5;
    // Simple approximation: use normal for large df
    if (df > 30) {
      return 2 * (1 - this._normalCDF(Math.abs(t)));
    }
    // Rough approximation for small df
    return Math.max(0.001, 2 * Math.exp(-0.5 * t * t) / Math.sqrt(2 * Math.PI));
  }

  _normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Get snapshot of all test states.
   */
  getSnapshot() {
    const tests = {};
    for (const [testId, test] of this.tests) {
      tests[testId] = {
        name: test.name,
        param: test.param,
        variants: {
          A: {
            sampleSize: test.variants.A.players.size,
            avgSessionDuration: this._mean(test.variants.A.kpis.sessionDurations),
            totalDeaths: test.variants.A.kpis.deathCounts.length,
            avgSkillUsage: this._mean(test.variants.A.kpis.skillUsageCounts),
            bugReports: test.variants.A.kpis.bugReports,
          },
          B: {
            sampleSize: test.variants.B.players.size,
            avgSessionDuration: this._mean(test.variants.B.kpis.sessionDurations),
            totalDeaths: test.variants.B.kpis.deathCounts.length,
            avgSkillUsage: this._mean(test.variants.B.kpis.skillUsageCounts),
            bugReports: test.variants.B.kpis.bugReports,
          },
        },
        winner: test.winner,
        pValue: test.pValue,
        runningFor: Date.now() - test.startedAt,
      };
    }
    return tests;
  }

  getStatus() {
    let activeTests = 0;
    let completedTests = 0;
    for (const test of this.tests.values()) {
      if (test.winner) completedTests++;
      else activeTests++;
    }
    return {
      name: 'A/B Testing Agent',
      status: 'active',
      activeTests,
      completedTests,
      totalTests: this.tests.size,
    };
  }

  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
}
