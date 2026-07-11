// A/B Testing Dashboard — entry.
// Fetches summary + breakdowns + latest-N raw dump every REFRESH_MS,
// stitches per-patch cards / breakdowns / spatials, and re-renders.
import { computeScore } from './score.js';
import { esc } from './format.js';
import { renderCompositeHero, renderVariantCard, renderCompareGrid } from './render-cards.js';
import { renderBreakdownsGrid } from './render-breakdowns.js';
import { renderSpatialGrid } from './render-spatial.js';
import { API_BASE } from '../infrastructure/runtime-endpoints.js';

const REFRESH_MS = 3000;
const ROOT = document.getElementById('root');
const EVENTS_TAGS = document.getElementById('events-tags');
const LAST_UPDATED = document.getElementById('last-updated');
const LB_WEIGHTS = document.getElementById('lb-weights');

/** "12s ago" / "3m ago" / "1h ago" style relative time since an ISO timestamp. */
function relativeTime(iso) {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function findExtras(list, patchId, variant) {
  return list.find((r) => r.patch_id === patchId && r.variant === variant) || {};
}

function renderPatchBlock(patchId, patchName, summary, extras) {
  const a = summary.A, b = summary.B;
  const aC = { ...a, ...extras.completion.A, ...extras.balance.A, ...extras.progression.A };
  const bC = { ...b, ...extras.completion.B, ...extras.balance.B, ...extras.progression.B };
  const scoring = computeScore(aC, bC);

  return `
    <div class="patch-block">
      <div class="patch-title">
        <span>${esc(patchName)}</span>
        <small>${a.sessions + b.sessions} total sessions · patch id ${patchId}</small>
      </div>
      ${renderCompositeHero(scoring)}
      <div class="variants">
        ${renderVariantCard(a, aC)}
        ${renderVariantCard(b, bC)}
      </div>
      ${renderCompareGrid(a, b, { A: aC, B: bC })}
      <h4 class="section-title">Categorical breakdowns</h4>
      ${renderBreakdownsGrid(extras.breakdowns, patchId)}
      <h4 class="section-title">Spatial signals</h4>
      ${renderSpatialGrid(extras.spatial, patchId)}
    </div>
  `;
}

function extrasFor(patchId, br) {
  const bucket = (rows) => ({
    A: rows.find((r) => r.patch_id === patchId && r.variant === 'A') || {},
    B: rows.find((r) => r.patch_id === patchId && r.variant === 'B') || {},
  });
  return {
    completion:  bucket(br.extras.completion),
    balance:     bucket(br.extras.balance),
    progression: bucket(br.extras.progression),
    breakdowns:  br.breakdowns,
    spatial:     br.spatial,
  };
}

async function refresh() {
  try {
    const [summary, dump, breakdowns, lbWeights] = await Promise.all([
      fetch(`${API_BASE}/api/ab-tests/summary`).then((r) => r.json()),
      fetch(`${API_BASE}/api/ab-tests/data?limit=1`).then((r) => r.json()),
      fetch(`${API_BASE}/api/ab-tests/breakdowns`).then((r) => r.json()),
      fetch(`${API_BASE}/api/lb/weights`).then((r) => r.json()),
    ]);

    if (!summary || !summary.length) {
      ROOT.innerHTML = '<div class="empty">No patch data yet — connect a player or run the seeder.</div>';
    } else {
      const byPatch = new Map();
      for (const row of summary) {
        if (!byPatch.has(row.patch_id)) byPatch.set(row.patch_id, { name: row.patch_name, A: null, B: null });
        byPatch.get(row.patch_id)[row.variant] = row;
      }
      const parts = [];
      for (const [pid, group] of byPatch) {
        if (!group.A || !group.B) continue;
        parts.push(renderPatchBlock(pid, group.name, group, extrasFor(pid, breakdowns)));
      }
      ROOT.innerHTML = parts.join('') || '<div class="empty">No patches have both variants yet.</div>';
    }

    const tags = (dump.eventCounts || [])
      .map((e) => `<span class="event-tag">${esc(e.event_type)} <span class="n">${e.n}</span></span>`)
      .join('');
    EVENTS_TAGS.innerHTML = tags || '<span class="empty">no events yet</span>';

    const shifted = lbWeights.lastChangeAt ? ` · shifted ${relativeTime(lbWeights.lastChangeAt)}` : '';
    LB_WEIGHTS.innerHTML = `LB: A=<span style="color:var(--A)">${lbWeights.A}%</span> B=<span style="color:var(--B)">${lbWeights.B}%</span>${shifted}`;

    LAST_UPDATED.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    ROOT.innerHTML = `<div class="error">Failed to fetch: ${esc(err.message)}</div>`;
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
