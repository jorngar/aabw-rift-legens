// KPI card + composite hero + compare-bars rendering.
import { fmt, fmtMs, fmtPct, fmtRatio, esc } from './format.js';

const KPI_LABEL = {
  retention:  'Retention',
  revenue:    'Revenue',
  safety:     'Safety',
  completion: 'Completion',
  balance:    'Balance',
};

const REASON_LABEL = {
  winner:               'winner declared',
  tie_under_threshold:  'tie — delta below threshold',
  insufficient_samples: 'insufficient samples',
};

export function renderCompositeHero(scoring) {
  const { scores, delta, winner, reason, perKpi } = scoring;
  const pctA = Math.round(scores.A * 100);
  const pctB = Math.round(scores.B * 100);
  const winnerBadge = winner
    ? `<span class="winner-badge ${winner}">Winner: Variant ${winner} · +${(delta * 100).toFixed(1)}%</span>`
    : `<span class="winner-badge tie">${esc(REASON_LABEL[reason] || reason)}</span>`;

  const perKpiRow = Object.entries(perKpi).map(([k, w]) => `
    <span class="kpi-pill ${w || 'tie'}">
      ${esc(KPI_LABEL[k])} ${w ? '→ ' + w : '·'}
    </span>
  `).join('');

  return `
    <div class="composite-hero">
      <div class="hero-head">
        <span class="hero-title">Composite Score Preview</span>
        ${winnerBadge}
      </div>
      <div class="hero-bar">
        <div class="hero-bar-a" style="flex:${Math.max(scores.A, 0.001)}"><span>A · ${scores.A.toFixed(3)}</span></div>
        <div class="hero-bar-b" style="flex:${Math.max(scores.B, 0.001)}"><span>B · ${scores.B.toFixed(3)}</span></div>
      </div>
      <div class="hero-numbers">
        <span>A: <b>${pctA}%</b></span>
        <span>Δ: <b>${(delta * 100).toFixed(1)}%</b></span>
        <span>B: <b>${pctB}%</b></span>
      </div>
      <div class="hero-per-kpi">${perKpiRow}</div>
    </div>
  `;
}

export function renderVariantCard(v, extras) {
  const completed = extras.completed ?? 0;
  const total = extras.total ?? v.sessions ?? 0;
  const damageDealt = extras.damage_dealt ?? 0;
  const damageTaken = extras.damage_taken ?? 0;
  const avgLevel = extras.avg_level ?? 0;
  const avgGold  = extras.avg_gold ?? 0;
  return `
    <div class="card ${v.variant}">
      <h2>VARIANT ${v.variant} <span class="badge">${fmt(v.sessions)} sessions</span></h2>
      <div class="kpi-grid">
        <div class="kpi"><span class="label">Sessions</span>       <span class="value">${fmt(v.sessions)}</span></div>
        <div class="kpi"><span class="label">Avg Duration</span>   <span class="value">${fmtMs(v.avg_duration_ms)}</span></div>
        <div class="kpi"><span class="label">Completed Rift</span> <span class="value">${fmt(completed)}<span class="unit">${fmtPct(completed, total)}</span></span></div>
        <div class="kpi"><span class="label">Purchases</span>      <span class="value">${fmt(v.purchases)}<span class="unit">${fmt(v.gold_spent)}g</span></span></div>
        <div class="kpi"><span class="label">Defects</span>        <span class="value">${fmt(v.defects)}</span></div>
        <div class="kpi"><span class="label">Deaths</span>         <span class="value">${fmt(v.deaths)}</span></div>
        <div class="kpi"><span class="label">Dmg Dealt</span>      <span class="value">${fmt(damageDealt)}</span></div>
        <div class="kpi"><span class="label">Dmg Taken</span>      <span class="value">${fmt(damageTaken)}<span class="unit">ratio ${fmtRatio(damageDealt, damageTaken)}</span></span></div>
        <div class="kpi"><span class="label">Avg Level</span>      <span class="value">${fmt(avgLevel)}</span></div>
        <div class="kpi"><span class="label">Avg Gold</span>       <span class="value">${fmt(avgGold)}g</span></div>
      </div>
    </div>
  `;
}

function bar(variant, value, max) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return `
    <div class="bar-wrap">
      <div class="bar-fill ${variant}" style="width:${pct}%"></div>
      <span class="bar-value">${fmt(value)}</span>
    </div>
  `;
}

export function renderCompareRow(label, a, b, better = 'higher') {
  let winA = false, winB = false;
  if (a !== b) {
    const aWins = better === 'higher' ? a > b : a < b;
    if (aWins) winA = true; else winB = true;
  }
  const max = Math.max(a, b, 1);
  return `
    <div class="compare-row">
      <div class="metric">${esc(label)}</div>
      <div class="${winA ? 'winner' : ''}">${bar('A', a, max)}</div>
      <div class="${winB ? 'winner' : ''}">${bar('B', b, max)}</div>
    </div>
  `;
}

export function renderCompareGrid(a, b, extras) {
  const cA = extras.A ?? {}, cB = extras.B ?? {};
  return `
    <div class="compare">
      ${renderCompareRow('Sessions',       a.sessions,        b.sessions,        'higher')}
      ${renderCompareRow('Avg dur',        a.avg_duration_ms, b.avg_duration_ms, 'higher')}
      ${renderCompareRow('Completions',    cA.completed || 0, cB.completed || 0, 'higher')}
      ${renderCompareRow('Purchases',      a.purchases,       b.purchases,       'higher')}
      ${renderCompareRow('Gold spent',     a.gold_spent,      b.gold_spent,      'higher')}
      ${renderCompareRow('Dmg dealt',      cA.damage_dealt || 0, cB.damage_dealt || 0, 'higher')}
      ${renderCompareRow('Dmg taken',      cA.damage_taken || 0, cB.damage_taken || 0, 'lower')}
      ${renderCompareRow('Defects',        a.defects,         b.defects,         'lower')}
      ${renderCompareRow('Deaths',         a.deaths,          b.deaths,          'lower')}
    </div>
  `;
}
