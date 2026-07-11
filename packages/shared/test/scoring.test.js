import test from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, WEIGHTS } from '../src/scoring.js';

// Baseline row shared by every test — override only the fields under test.
const base = {
  avg_duration_ms: 100000, purchases: 3, gold_spent: 200,
  defects: 2, deaths: 1, completed: 5,
  damage_dealt: 500, damage_taken: 300, sessions: 20,
};

test('A dominates every KPI -> winner is A', () => {
  const a = { ...base, avg_duration_ms: 200000, purchases: 5, gold_spent: 500, defects: 1, deaths: 2, completed: 8, damage_dealt: 1000, damage_taken: 900 };
  const b = { ...base, avg_duration_ms: 100000, purchases: 2, gold_spent: 100, defects: 5, deaths: 10, completed: 3, damage_dealt: 1000, damage_taken: 200 };
  const result = computeScore(a, b);
  assert.equal(result.winner, 'A');
  assert.equal(result.reason, 'winner');
});

test('equal inputs -> tie under threshold', () => {
  const result = computeScore({ ...base }, { ...base });
  assert.equal(result.winner, null);
  assert.equal(result.reason, 'tie_under_threshold');
});

test('sessions below MIN_SESSIONS on either side -> insufficient samples', () => {
  const a = { ...base, avg_duration_ms: 200000, purchases: 5, gold_spent: 500, defects: 1, deaths: 2, completed: 8, damage_dealt: 1000, damage_taken: 900 };
  const b = { ...base, avg_duration_ms: 100000, purchases: 2, gold_spent: 100, defects: 5, deaths: 10, completed: 3, damage_dealt: 1000, damage_taken: 200, sessions: 5 };
  const result = computeScore(a, b);
  assert.equal(result.winner, null);
  assert.equal(result.reason, 'insufficient_samples');
});

test('only safety differs (A better) -> A still wins, weights sum to 1', () => {
  const a = { ...base, defects: 0, deaths: 0 };
  const b = { ...base, defects: 10, deaths: 0 };
  const result = computeScore(a, b);
  assert.equal(result.perKpi.safety, 'A');
  assert.equal(result.perKpi.retention, null);
  assert.equal(result.perKpi.revenue, null);
  assert.equal(result.perKpi.completion, null);
  assert.equal(result.perKpi.balance, null);
  assert.equal(result.winner, 'A');
  assert.ok(Math.abs(result.scores.A + result.scores.B - 1) < 1e-6);
  assert.ok(Math.abs(result.scores.A - result.scores.B - WEIGHTS.safety) < 1e-6);
});

test('zero damage dealt/taken on both sides -> no NaN, no throw', () => {
  const a = { ...base, damage_dealt: 0, damage_taken: 0, sessions: 15 };
  const b = { ...base, damage_dealt: 0, damage_taken: 0, sessions: 15, purchases: 1 };
  const result = computeScore(a, b);
  assert.ok(Number.isFinite(result.scores.A));
  assert.ok(Number.isFinite(result.scores.B));
  assert.ok(Number.isFinite(result.delta));
});
