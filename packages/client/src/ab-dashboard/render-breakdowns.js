// Categorical breakdowns: defects / deaths / purchases / engagements
// rendered as side-by-side A/B horizontal bar charts.
import { fmt, esc } from './format.js';

/**
 * Filter aggregated rows down to one patch, split into A / B lookup tables
 * keyed by bucket.
 * @param {Array<{patch_id, variant, bucket, n, ...}>} rows
 * @param {number} patchId
 * @returns {{A: Map<string, object>, B: Map<string, object>, buckets: string[]}}
 */
function splitByVariant(rows, patchId) {
  const A = new Map(), B = new Map();
  const bucketOrder = [];
  const seen = new Set();
  for (const r of rows) {
    if (r.patch_id !== patchId) continue;
    const map = r.variant === 'A' ? A : B;
    map.set(r.bucket, r);
    if (!seen.has(r.bucket)) { seen.add(r.bucket); bucketOrder.push(r.bucket); }
  }
  return { A, B, buckets: bucketOrder };
}

function twinBar(aVal, bVal, maxVal) {
  const aPct = maxVal > 0 ? Math.max(2, (aVal / maxVal) * 100) : 0;
  const bPct = maxVal > 0 ? Math.max(2, (bVal / maxVal) * 100) : 0;
  return `
    <div class="twin-bars">
      <div class="twin-side twin-a">
        <span class="twin-num">${fmt(aVal)}</span>
        <div class="twin-track"><div class="twin-fill A" style="width:${aPct}%"></div></div>
      </div>
      <div class="twin-side twin-b">
        <div class="twin-track"><div class="twin-fill B" style="width:${bPct}%"></div></div>
        <span class="twin-num">${fmt(bVal)}</span>
      </div>
    </div>
  `;
}

/**
 * Generic side-by-side breakdown chart.
 * @param {string} title
 * @param {{buckets: string[], A: Map, B: Map}} split
 * @param {(row: object) => number} pick  extract the value from a row
 */
function renderBreakdown(title, split, pick, opts = {}) {
  const rows = split.buckets;
  if (!rows.length) {
    return `
      <div class="breakdown-card">
        <h3>${esc(title)}</h3>
        <div class="empty">no data</div>
      </div>
    `;
  }
  const maxVal = rows.reduce((mx, b) => {
    const a = split.A.get(b) ? pick(split.A.get(b)) : 0;
    const c = split.B.get(b) ? pick(split.B.get(b)) : 0;
    return Math.max(mx, a, c);
  }, 0);

  const body = rows.map((b) => {
    const aRow = split.A.get(b), bRow = split.B.get(b);
    const aVal = aRow ? pick(aRow) : 0;
    const bVal = bRow ? pick(bRow) : 0;
    const label = opts.labelFmt ? opts.labelFmt(b) : b;
    return `
      <div class="breakdown-row">
        <div class="breakdown-label">${esc(label)}</div>
        ${twinBar(aVal, bVal, maxVal)}
      </div>
    `;
  }).join('');

  return `
    <div class="breakdown-card">
      <h3>${esc(title)}</h3>
      <div class="breakdown-legend"><span class="dot A"></span>A vs <span class="dot B"></span>B</div>
      <div class="breakdown-body">${body}</div>
    </div>
  `;
}

/** Renders all four breakdown cards for one patch. */
export function renderBreakdownsGrid(breakdowns, patchId) {
  const defect  = splitByVariant(breakdowns.defectsByType,     patchId);
  const death   = splitByVariant(breakdowns.deathsByEnemy,     patchId);
  const buy     = splitByVariant(breakdowns.purchasesByItem,   patchId);
  const engage  = splitByVariant(breakdowns.engagementsByEnemy, patchId);
  const reason  = splitByVariant(breakdowns.endReasons,        patchId);

  return `
    <div class="breakdowns-grid">
      ${renderBreakdown('Defects by type',       defect, (r) => r.n)}
      ${renderBreakdown('Deaths by killer',      death,  (r) => r.n)}
      ${renderBreakdown('Purchases by item',     buy,    (r) => r.n)}
      ${renderBreakdown('Engagements by enemy',  engage, (r) => r.n)}
      ${renderBreakdown('Session end reasons',   reason, (r) => r.n)}
      ${renderBreakdown('Gold spent per item',   buy,    (r) => r.gold)}
    </div>
  `;
}
