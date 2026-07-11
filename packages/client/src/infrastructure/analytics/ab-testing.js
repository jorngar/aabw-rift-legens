// ============================================================
// A/B Testing System — feature flag client
// ============================================================
import { AB_TESTS } from '@rift-seed/shared/config';
import { EventType, createEvent } from '@rift-seed/shared/events';

/**
 * Client-side A/B test manager.
 * Assigns the player to cohorts and overrides config values.
 */
export class ABTestingSystem {
  constructor(playerId) {
    this.playerId = playerId;
    /** @type {Map<string, string>} testId -> variant letter */
    this.assignments = new Map();
    /** @type {Map<string, Object>} testId -> overridden params */
    this.overrides = new Map();
    /** @type {Function|null} */
    this.emitEvent = null;
  }

  /**
   * Assign this player to all defined A/B tests.
   * Deterministic: same playerId always gets same variant.
   */
  assignAll(emitEvent) {
    this.emitEvent = emitEvent;
    for (const [testId, test] of Object.entries(AB_TESTS)) {
      const hash = this._hash(this.playerId + testId);
      const variant = hash % 2 === 0 ? 'A' : 'B';
      this.assignments.set(testId, variant);
      this.overrides.set(test.param, test.variants[variant].value);

      emitEvent(createEvent(EventType.AB_ASSIGNED, this.playerId, {
        testId,
        variant,
        param: test.param,
        value: test.variants[variant].value,
      }));
    }
  }

  /**
   * Get the overridden value for a config parameter.
   * @param {string} paramPath - e.g., 'skills.shadowStrike.cooldownMs'
   * @param {*} defaultValue
   * @returns {*}
   */
  getOverride(paramPath, defaultValue) {
    return this.overrides.get(paramPath) ?? defaultValue;
  }

  /**
   * Get the assigned variant for a test.
   * @param {string} testId
   * @returns {string|null}
   */
  getVariant(testId) {
    return this.assignments.get(testId) || null;
  }

  /**
   * Record an exposure event (when the player actually uses the variant).
   * @param {string} testId
   */
  recordExposure(testId) {
    if (this.emitEvent) {
      this.emitEvent(createEvent(EventType.AB_EXPOSURE, this.playerId, {
        testId,
        variant: this.assignments.get(testId),
      }));
    }
  }

  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
}
