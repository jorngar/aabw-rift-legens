// Thin re-export — composite score formula now lives in @rift-seed/shared
// so the dashboard preview and the /ab-testing skill always agree on the
// winner. Keep this file so main.js's `./score.js` import stays untouched.
export { WEIGHTS, TIE_THRESHOLD, MIN_SESSIONS, normalizePair, computeScore } from '@rift-seed/shared/scoring.js';
