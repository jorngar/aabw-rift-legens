// SVG heatmaps + path-trace overlays over a stylised 20x20 grid.
// Renders one A vs B pair per spatial signal (deaths, defects, paths).
import { fmt, esc } from './format.js';

const GRID = 20;                    // map dimensions from packages/shared/src/maps/patch-v01
const CELL = 14;                    // px per tile in the SVG
const PADDING = 4;
const SIZE = GRID * CELL + PADDING * 2;

function svgOpen(w = SIZE, h = SIZE) {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" class="spatial-svg">`;
}
function svgClose() { return `</svg>`; }

function gridBackdrop() {
  const bg = `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="rgba(255,255,255,0.02)"/>`;
  const lines = [];
  for (let i = 0; i <= GRID; i++) {
    const x = PADDING + i * CELL;
    lines.push(`<line x1="${x}" y1="${PADDING}" x2="${x}" y2="${PADDING + GRID * CELL}" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`);
    lines.push(`<line x1="${PADDING}" y1="${x}" x2="${PADDING + GRID * CELL}" y2="${x}" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`);
  }
  return bg + lines.join('');
}

function heatCells(points, colour) {
  if (!points.length) return '';
  const maxN = points.reduce((m, p) => Math.max(m, p.n), 1);
  return points.map((p) => {
    const cx = PADDING + Math.max(0, Math.min(GRID - 1, Math.floor(p.x))) * CELL;
    const cy = PADDING + Math.max(0, Math.min(GRID - 1, Math.floor(p.y))) * CELL;
    const alpha = 0.15 + 0.85 * (p.n / maxN);
    return `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" fill="${colour}" opacity="${alpha.toFixed(2)}"><title>(${p.x}, ${p.y}) · ${p.n}</title></rect>`;
  }).join('');
}

function pathTraces(paths, colour) {
  if (!paths.length) return '';
  return paths.map((row) => {
    const wp = Array.isArray(row.waypoints) ? row.waypoints : [];
    if (wp.length < 2) return '';
    const pts = wp.map((p) => {
      const x = PADDING + (p.x ?? 0) * CELL + CELL / 2;
      const y = PADDING + (p.y ?? 0) * CELL + CELL / 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="1" opacity="0.35" stroke-linejoin="round"/>`;
  }).join('');
}

function renderPair(title, aPts, bPts, aCount, bCount, renderFn) {
  return `
    <div class="spatial-card">
      <h3>${esc(title)}
        <small><span class="dot A"></span>A: ${fmt(aCount)}   <span class="dot B"></span>B: ${fmt(bCount)}</small>
      </h3>
      <div class="spatial-pair">
        <div class="spatial-side">
          <div class="spatial-label A">Variant A</div>
          ${svgOpen()}${gridBackdrop()}${renderFn(aPts, 'var(--A)')}${svgClose()}
        </div>
        <div class="spatial-side">
          <div class="spatial-label B">Variant B</div>
          ${svgOpen()}${gridBackdrop()}${renderFn(bPts, 'var(--B)')}${svgClose()}
        </div>
      </div>
    </div>
  `;
}

function partition(rows, patchId) {
  const A = [], B = [];
  for (const r of rows) {
    if (r.patch_id !== patchId) continue;
    (r.variant === 'A' ? A : B).push(r);
  }
  return { A, B };
}

function totalN(rows) {
  return rows.reduce((s, r) => s + (r.n || 0), 0);
}

export function renderSpatialGrid(spatial, patchId) {
  const deaths  = partition(spatial.deaths,  patchId);
  const defects = partition(spatial.defects, patchId);
  const paths   = partition(spatial.paths,   patchId);

  return `
    <div class="spatial-grid">
      ${renderPair('Death heatmap',   deaths.A,  deaths.B,  totalN(deaths.A),  totalN(deaths.B),  heatCells)}
      ${renderPair('Defect heatmap',  defects.A, defects.B, totalN(defects.A), totalN(defects.B), heatCells)}
      ${renderPair('Path traces',     paths.A,   paths.B,   paths.A.length,    paths.B.length,    pathTraces)}
    </div>
  `;
}
