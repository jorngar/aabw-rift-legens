// ============================================================
// Composite A/B score — single source of truth shared by the
// ab-dashboard preview and the /ab-testing skill's compute-score.js.
// Keeps both sides aligned so demoing them side-by-side never shows
// contradicting winners.
// ============================================================

export const WEIGHTS = {
  retention: 0.35,
  revenue:   0.25,
  safety:    0.20,
  completion: 0.10,
  balance:   0.10,
};
export const TIE_THRESHOLD = 0.05;
export const MIN_SESSIONS  = 10;

export function normalizePair(kA, kB, higherIsBetter = true) {
  const lo = Math.min(kA, kB), hi = Math.max(kA, kB);
  if (hi === lo) return { A: 0.5, B: 0.5 };
  const nA = (kA - lo) / (hi - lo);
  const nB = (kB - lo) / (hi - lo);
  return higherIsBetter ? { A: nA, B: nB } : { A: 1 - nA, B: 1 - nB };
}

/**
 * @param {object} a summary row + extras for variant A
 * @param {object} b summary row + extras for variant B
 * @returns {object} scores + per-KPI winners + verdict
 */
export function computeScore(a, b) {
  const ret = normalizePair(a.avg_duration_ms || 0, b.avg_duration_ms || 0, true);
  const revA = (a.purchases || 0) + 0.5 * (a.gold_spent || 0);
  const revB = (b.purchases || 0) + 0.5 * (b.gold_spent || 0);
  const rev = normalizePair(revA, revB, true);
  const safA = (a.defects || 0) + 0.5 * (a.deaths || 0);
  const safB = (b.defects || 0) + 0.5 * (b.deaths || 0);
  const saf = normalizePair(safA, safB, false);
  const cmpA = a.completed || 0;
  const cmpB = b.completed || 0;
  const cmp = normalizePair(cmpA, cmpB, true);
  const balA = Math.abs((a.damage_dealt || 0) - (a.damage_taken || 0));
  const balB = Math.abs((b.damage_dealt || 0) - (b.damage_taken || 0));
  const bal = normalizePair(balA, balB, false);

  const scoreOf = (side) =>
    WEIGHTS.retention  * ret[side] +
    WEIGHTS.revenue    * rev[side] +
    WEIGHTS.safety     * saf[side] +
    WEIGHTS.completion * cmp[side] +
    WEIGHTS.balance    * bal[side];

  const sA = scoreOf('A'), sB = scoreOf('B');
  const winner = sA === sB ? null : sA > sB ? 'A' : 'B';
  const delta  = Math.abs(sA - sB) / Math.max(sA, sB, 0.0001);
  const tie    = delta < TIE_THRESHOLD;
  const under  = (a.sessions || 0) < MIN_SESSIONS || (b.sessions || 0) < MIN_SESSIONS;

  const pickWinner = (pair) => pair.A > pair.B ? 'A' : pair.A < pair.B ? 'B' : null;
  return {
    scores: { A: +sA.toFixed(4), B: +sB.toFixed(4) },
    delta:  +delta.toFixed(4),
    winner: (tie || under) ? null : winner,
    reason: under ? 'insufficient_samples' : tie ? 'tie_under_threshold' : 'winner',
    perKpi: {
      retention:  pickWinner(ret),
      revenue:    pickWinner(rev),
      safety:     pickWinner(saf),
      completion: pickWinner(cmp),
      balance:    pickWinner(bal),
    },
    components: { ret, rev, saf, cmp, bal },
  };
}
