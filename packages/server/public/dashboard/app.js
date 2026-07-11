'use strict';

const API = {
  hermes: '/api/agents/hermes',
  analyze: '/api/agents/hermes/analyze',
  apply: id => `/api/patches/${id}/apply`,
  data: '/api/dashboard/data',
  telemetry: '/api/telemetry',
  sop: '/api/agents/telemetry/sop',
  sopRun: '/api/agents/telemetry/sop/run',
};

const state = {
  hermes: null,
  data: null,
  telemetry: null,
  sop: null,
};

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('#tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'analytics') renderAnalytics();
    if (btn.dataset.tab === 'sop') refreshSOP();
  });
});

// ---------- Status pills ----------
function renderStatus() {
  const t = state.telemetry;
  const d = state.data;
  $('#pill-health').innerHTML = `health: <b>${t?.latestReport?.overallHealthScore ?? '—'}</b>`;
  $('#pill-events').innerHTML = `events: <b>${t?.totalEvents ?? 0}</b>`;
  $('#pill-matches').innerHTML = `matches: <b>${d?.matchCount ?? 0}</b>`;
}

// ---------- Patch tab ----------
function renderPatch() {
  const h = state.hermes;
  const list = $('#patch-list');
  list.innerHTML = '';

  const proposals = h?.proposals || (h?.latestProposal ? [h.latestProposal] : []);
  if (!proposals.length) {
    list.appendChild(el('div', 'empty', 'No patches yet. Click <b>Generate Patch</b> to run the Hermes balance agent on current telemetry.'));
    return;
  }

  proposals.forEach(p => list.appendChild(patchCard(p)));

  // Deployed history
  const adj = state.data?.adjustments || [];
  const aList = $('#adjustments-list');
  aList.innerHTML = '';
  if (!adj.length) {
    aList.appendChild(el('div', 'empty', 'No balance changes have been deployed yet.'));
  } else {
    adj.forEach(a => {
      const row = el('div', 'adj-row');
      row.innerHTML = `
        <div><div class="key">${esc(a.metric)}</div><div class="who ${esc(a.agent)}">${esc(a.agent)}</div></div>
        <div class="adj-val"><span class="old">${fmt(a.old_value)}</span> → <span class="new">${fmt(a.new_value)}</span></div>
        <div class="who">${esc(shortTime(a.timestamp))}</div>`;
      aList.appendChild(row);
    });
  }
}

function patchCard(p) {
  const card = el('div', 'patch-card' + (p.status === 'applied' ? ' applied' : ''));
  const changes = (p.changes || []).map(c => {
    const dir = c.operation === 'increase' ? 'up' : c.operation === 'decrease' ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
    const pct = c.percentChange != null ? ` (${c.percentChange > 0 ? '+' : ''}${c.percentChange}%)` : '';
    const ev = (c.evidence || []).map(e => `<span class="ev-tag">${esc(e)}</span>`).join('');
    return `
      <div class="change">
        <div class="key">${esc(c.key)}</div>
        <div class="diff ${dir}">${fmt(c.currentValue)} ${arrow} ${fmt(c.proposedValue)}${pct}${c.clamped ? ' ⚠' : ''}</div>
        <div></div>
        <div class="why">${esc(c.reason)}</div>
        <div class="evidence">${ev}</div>
      </div>`;
  }).join('');

  const rejected = (p.rejectedChanges || []).length
    ? `<div class="why" style="margin-top:10px;color:var(--bad)">Rejected: ${p.rejectedChanges.map(r => esc(r.key)).join(', ')}</div>`
    : '';

  card.innerHTML = `
    <div class="patch-head">
      <div>
        <h3 class="patch-title">${esc(p.summary)}</h3>
        <div class="patch-meta">${esc(p.id)} · patch ${esc(p.patchId || '—')} · ${shortTime(p.createdAt || p.appliedAt)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="conf">conf ${Number(p.confidence || 0).toFixed(2)}</span>
        <span class="status-tag ${esc(p.status)}">${esc(p.status)}</span>
      </div>
    </div>
    <div class="reasoning">
      <p><span class="label">Rationale</span><br>${esc(p.rationale || '—')}</p>
      <p><span class="label">Expected impact</span><br>${esc(p.expectedImpact || '—')}</p>
    </div>
    ${changes}
    ${rejected}
    ${p.status === 'proposed' ? `<div class="actions" style="margin-top:14px"><button class="btn primary" data-apply="${esc(p.id)}">Deploy Patch</button></div>` : ''}
  `;

  const applyBtn = card.querySelector('[data-apply]');
  if (applyBtn) applyBtn.addEventListener('click', () => applyPatch(applyBtn.dataset.apply));
  return card;
}

async function generatePatch() {
  const btn = $('#btn-analyze');
  btn.disabled = true; btn.textContent = 'Analyzing…';
  try {
    const res = await fetch(API.analyze, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!res.ok) throw new Error((await res.json()).error || 'analyze failed');
    await refreshAll();
  } catch (e) {
    alert('Patch generation failed: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Generate Patch';
  }
}

async function applyPatch(id) {
  try {
    const res = await fetch(API.apply(id), { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || 'apply failed');
    await refreshAll();
  } catch (e) {
    alert('Apply failed: ' + e.message);
  }
}

// ---------- Analytics tab ----------
function renderAnalytics() {
  const d = state.data;
  if (!d) return;
  $('#gen-time').textContent = new Date(d.generatedAt).toLocaleString();

  renderStatCards(d);
  renderClassCharts(d.playerUsage || []);
  renderItemCharts(d.deployedItems || []);
  renderRecommendations(d);
}

function renderStatCards(d) {
  const s = d.summary || {};
  const cards = [
    ['Matches', d.matchCount || 0],
    ['Avg K/D', s.avg_kills != null ? (s.avg_kills / (s.avg_deaths || 1)).toFixed(2) : '—'],
    ['Avg Kills', s.avg_kills != null ? s.avg_kills.toFixed(1) : '—'],
    ['Avg Deaths', s.avg_deaths != null ? s.avg_deaths.toFixed(1) : '—'],
    ['Avg Damage Dealt', s.avg_damage_dealt != null ? Math.round(s.avg_damage_dealt) : '—'],
    ['Avg Duration (min)', s.avg_duration != null ? (s.avg_duration / 60).toFixed(1) : '—'],
  ];
  const wrap = $('#stat-cards');
  wrap.innerHTML = '';
  cards.forEach(([l, v]) => {
    const c = el('div', 'stat');
    c.innerHTML = `<div class="v">${esc(v)}</div><div class="l">${esc(l)}</div>`;
    wrap.appendChild(c);
  });
}

// --- SVG bar chart helpers ---
function barChart(mount, items, { valueFn, labelFn, colorFn, max, unit = '' }) {
  mount.innerHTML = '';
  if (!items.length) { mount.appendChild(el('div', 'empty', 'No data yet.')); return; }
  const w = 560, rowH = 34, padL = 110, padR = 60, padT = 6, padB = 6;
  const h = padT + padB + items.length * rowH;
  const top = max != null ? max : Math.max(...items.map(valueFn), 1) * 1.1;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  items.forEach((it, i) => {
    const v = valueFn(it);
    const y = padT + i * rowH + 4;
    const bw = Math.max(2, (v / top) * (w - padL - padR));
    const color = colorFn ? colorFn(it, v) : 'var(--accent)';
    // label
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', padL - 8); lbl.setAttribute('y', y + 14);
    lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('class', 'bar-label');
    lbl.textContent = labelFn(it);
    svg.appendChild(lbl);
    // bar
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', padL); rect.setAttribute('y', y);
    rect.setAttribute('width', bw); rect.setAttribute('height', rowH - 12);
    rect.setAttribute('rx', 4); rect.setAttribute('fill', color);
    svg.appendChild(rect);
    // value
    const val = document.createElementNS(svgNS, 'text');
    val.setAttribute('x', padL + bw + 8); val.setAttribute('y', y + 14);
    val.setAttribute('class', 'bar-value'); val.textContent = fmt(v) + unit;
    svg.appendChild(val);
  });
  mount.appendChild(svg);
}

function renderClassCharts(usage) {
  barChart($('#chart-volume'), usage, {
    valueFn: u => u.matches || 0,
    labelFn: u => u.class,
    colorFn: () => 'var(--accent)',
  });

  barChart($('#chart-kd'), usage, {
    valueFn: u => Number(u.killDeathRatio) || 0,
    labelFn: u => u.class,
    colorFn: (u, v) => v >= 1.5 ? 'var(--good)' : v >= 1 ? 'var(--warn)' : 'var(--bad)',
    max: Math.max(2, ...usage.map(u => Number(u.killDeathRatio) || 0)),
  });

  // grouped damage dealt vs taken
  const mount = $('#chart-damage');
  mount.innerHTML = '';
  if (!usage.length) { mount.appendChild(el('div', 'empty', 'No data yet.')); return; }
  const w = 560, rowH = 40, padL = 110, padR = 60, padT = 6;
  const h = padT + usage.length * rowH;
  const top = Math.max(...usage.flatMap(u => [u.avgDamageDealt, u.avgDamageTaken]), 1) * 1.1;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  usage.forEach((u, i) => {
    const y = padT + i * rowH + 4;
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', padL - 8); lbl.setAttribute('y', y + 13);
    lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('class', 'bar-label');
    lbl.textContent = u.class; svg.appendChild(lbl);
    const dw = Math.max(2, (u.avgDamageDealt / top) * (w - padL - padR));
    const tw = Math.max(2, (u.avgDamageTaken / top) * (w - padL - padR));
    [['var(--accent)', u.avgDamageDealt, dw, y], ['var(--bad)', u.avgDamageTaken, tw, y + 16]].forEach(([c, v, bw, yy]) => {
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', padL); r.setAttribute('y', yy);
      r.setAttribute('width', bw); r.setAttribute('height', 11);
      r.setAttribute('rx', 3); r.setAttribute('fill', c); svg.appendChild(r);
    });
    const vt = document.createElementNS(svgNS, 'text');
    vt.setAttribute('x', padL + Math.max(dw, tw) + 8); vt.setAttribute('y', y + 13);
    vt.setAttribute('class', 'bar-value'); vt.textContent = `${Math.round(u.avgDamageDealt)} / ${Math.round(u.avgDamageTaken)}`;
    svg.appendChild(vt);
  });
  mount.appendChild(svg);
}

function renderItemCharts(items) {
  const max = Math.max(...items.map(i => i.estimatedImpact), 1);
  barChart($('#chart-items'), items, {
    valueFn: i => i.estimatedImpact,
    labelFn: i => `${i.name}`,
    colorFn: i => i.kind === 'weapon' ? 'var(--accent-2)' : 'var(--accent)',
    max,
  });

  const table = $('#item-table');
  table.innerHTML = '';
  items.forEach(it => {
    const row = el('div', 'item-row');
    row.innerHTML = `
      <div><div class="name">${esc(it.name)}</div><div class="tag">${esc(it.kind)} · ${esc(it.id)}</div></div>
      <div class="who">${it.liveBalance != null ? 'live: ' + fmt(it.liveBalance) : 'static'}</div>
      <div class="who">impact ${fmt(it.estimatedImpact)}</div>
      <div class="impact-track"><div class="impact-bar" style="width:${Math.round((it.estimatedImpact / max) * 100)}%"></div></div>`;
    table.appendChild(row);
  });
}

function renderRecommendations(d) {
  const wrap = $('#recommendations');
  wrap.innerHTML = '';
  const recs = [];

  const usage = d.playerUsage || [];
  usage.forEach(u => {
    if (u.killDeathRatio < 1) {
      recs.push({ sev: 'high', metric: 'survivability', text: `Class <b>${esc(u.class)}</b> has K/D ${u.killDeathRatio} (avg ${u.avgDeaths} deaths/match). Consider raising effective HP or lowering enemy damage for this class.` });
    } else if (u.avgDamageTaken > u.avgDamageDealt * 1.5) {
      recs.push({ sev: 'medium', metric: 'damage_taken', text: `<b>${esc(u.class)}</b> takes ${Math.round(u.avgDamageTaken)} dmg/match vs ${Math.round(u.avgDamageDealt)} dealt — high attrition. Add sustain or dodge options.` });
    }
  });

  const items = d.deployedItems || [];
  const top = items[0], bottom = items[items.length - 1];
  if (top && bottom && bottom.estimatedImpact > 0 && top.estimatedImpact / bottom.estimatedImpact > 4) {
    recs.push({ sev: 'medium', metric: 'item_balance', text: `Largest gear gap: <b>${esc(top.name)}</b> (impact ${fmt(top.estimatedImpact)}) is ${Math.round(top.estimatedImpact / bottom.estimatedImpact)}× <b>${esc(bottom.name)}</b> (${fmt(bottom.estimatedImpact)}). Rebalance low-tier items or buff weak gear.` });
  }

  const s = d.summary || {};
  if (s.avg_kills != null && s.avg_deaths != null && s.avg_deaths > s.avg_kills) {
    recs.push({ sev: 'high', metric: 'global', text: `Global K/D is <span class="metric">${(s.avg_kills / s.avg_deaths).toFixed(2)}</span> — players are dying faster than killing. Prioritize survivability patches.` });
  }

  if (!recs.length) {
    recs.push({ sev: 'info', metric: 'ok', text: 'No critical imbalances detected from current sample. Keep collecting telemetry before treating signals as directional.' });
  }

  recs.forEach(r => {
    const card = el('div', 'rec sev-' + r.sev);
    card.innerHTML = `<span class="sev ${r.sev}">${esc(r.sev)}</span><div class="body">${r.text}</div>`;
    wrap.appendChild(card);
  });
}

// ---------- utils ----------
function fmt(n) {
  if (n == null) return '—';
  if (Number.isInteger(n)) return String(n);
  return Number(n).toFixed(1);
}
function shortTime(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  if (isNaN(d)) return String(ts);
  return d.toLocaleString();
}

// ---------- data load ----------
async function refreshAll() {
  const [hermes, data, tele] = await Promise.all([
    fetch(API.hermes).then(r => r.json()).catch(() => null),
    fetch(API.data).then(r => r.json()).catch(() => null),
    fetch(API.telemetry).then(r => r.json()).catch(() => null),
  ]);
  state.hermes = hermes;
  state.data = data;
  state.telemetry = tele;
  renderStatus();
  renderPatch();
  if ($('#tab-analytics').classList.contains('active')) renderAnalytics();
}

// ---------- Telemetry Agent SOP tab ----------
let sopPollTimer = null;

async function refreshSOP() {
  try {
    state.sop = await fetch(API.sop).then(r => r.json());
  } catch {
    state.sop = null;
  }
  renderSOP();
  const run = activeSOPRun();
  if (run?.status === 'running' && !sopPollTimer) {
    sopPollTimer = setInterval(refreshSOP, 3000);
  } else if (run?.status !== 'running' && sopPollTimer) {
    clearInterval(sopPollTimer);
    sopPollTimer = null;
  }
}

function activeSOPRun() {
  const s = state.sop;
  if (!s) return null;
  return s.currentRun || s.history?.[0] || s.persistedRuns?.[0] || null;
}

async function runSOP() {
  const btn = $('#btn-sop-run');
  btn.disabled = true;
  try {
    const res = await fetch(API.sopRun, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: $('#sop-source').value || 'sdk', autoDeploy: $('#sop-autodeploy').checked }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'SOP start failed');
    await refreshSOP();
  } catch (e) {
    alert('SOP failed to start: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function phaseOutput(run, key) {
  return run?.phases?.find(p => p.key === key && p.status === 'done')?.output || null;
}

function renderSOPSources() {
  const sel = $('#sop-source');
  const sources = state.sop?.availableSources || [];
  if (!sources.length) return;
  const previous = sel.value;
  sel.innerHTML = '';
  sources.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.id} — ${s.detail}`;
    opt.title = s.description;
    opt.disabled = !s.ready;
    sel.appendChild(opt);
  });
  const canKeep = previous && [...sel.options].some(o => o.value === previous && !o.disabled);
  if (canKeep) sel.value = previous;
  else {
    const firstReady = [...sel.options].find(o => !o.disabled);
    if (firstReady) sel.value = firstReady.value;
  }
}

function renderSOP() {
  renderSOPSources();
  const run = activeSOPRun();
  const status = $('#sop-status');
  const stepper = $('#sop-phases');
  stepper.innerHTML = '';

  if (!run) {
    status.innerHTML = '<div class="empty">No SOP runs yet. Click <b>Run SOP</b> to execute the full workflow on current telemetry.</div>';
    return;
  }

  const elapsed = Math.round(((run.finishedAt || Date.now()) - run.startedAt) / 1000);
  const statusCls = run.status === 'completed' ? 'good' : run.status === 'failed' ? 'bad' : 'warn';
  status.innerHTML = `
    <span class="sop-run-id">${esc(run.id)}</span>
    <span class="sop-run-status ${statusCls}">${esc(run.status)}</span>
    <span class="muted">source: ${esc(run.source)}${run.sourceLabel && run.sourceLabel !== run.source ? ` (“${esc(run.sourceLabel)}”)` : ''} · patch ${esc(run.patchId || '—')} · ${elapsed}s${run.autoDeploy === false ? ' · deploy: manual' : ''}</span>
    ${run.error ? `<div class="sop-error">${esc(run.error)}</div>` : ''}`;

  run.phases.forEach((p, i) => {
    const icon = p.status === 'done' ? '✓' : p.status === 'running' ? '◐' : p.status === 'failed' ? '✗' : '○';
    const row = el('div', `sop-phase ${p.status}`);
    row.innerHTML = `
      <span class="idx">${i + 1}</span>
      <span class="icon">${icon}</span>
      <span class="title">${esc(p.title)}</span>
      <span class="muted">${p.durationMs != null ? (p.durationMs / 1000).toFixed(1) + 's' : p.status === 'running' ? 'running…' : ''}</span>
      ${p.error ? `<span class="sop-error">${esc(p.error)}</span>` : ''}`;
    stepper.appendChild(row);
  });

  renderSOPExperience(phaseOutput(run, 'measure'));
  renderSOPRecommendations(phaseOutput(run, 'recommend'));
  renderSOPProposal(phaseOutput(run, 'propose'));
  renderSOPDataSources(phaseOutput(run, 'datasources'));
  renderSOPDeploy(phaseOutput(run, 'deploy'));
}

function renderSOPExperience(exp) {
  $('#sop-experience-wrap').style.display = exp ? '' : 'none';
  if (!exp) return;
  barChart($('#sop-experience'), [{ name: 'OVERALL', score: exp.overallScore }, ...(exp.dimensions || [])], {
    valueFn: d => d.score,
    labelFn: d => d.name,
    colorFn: (d, v) => v >= 70 ? 'var(--good)' : v >= 40 ? 'var(--warn)' : 'var(--bad)',
    max: 100,
  });
  const detail = $('#sop-experience-detail');
  detail.innerHTML = '';
  detail.appendChild(el('div', 'rec sev-info', `<span class="sev info">summary</span><div class="body">${esc(exp.summary)} <span class="muted">(confidence ${Math.round(exp.confidence * 100)}%)</span></div>`));
  (exp.dimensions || []).forEach(d => {
    const ev = (d.evidence || []).map(e => `<span class="ev-tag">${esc(e)}</span>`).join('');
    const sev = d.score >= 70 ? 'info' : d.score >= 40 ? 'medium' : 'high';
    detail.appendChild(el('div', `rec sev-${sev}`, `<span class="sev ${sev}">${d.score}</span><div class="body"><b>${esc(d.name)}</b> — ${esc(d.reasoning)}<div class="evidence">${ev}</div></div>`));
  });
}

function renderSOPRecommendations(out) {
  $('#sop-recs-wrap').style.display = out ? '' : 'none';
  if (!out) return;
  const wrap = $('#sop-recommendations');
  wrap.innerHTML = '';
  (out.recommendations || []).forEach(r => {
    const ev = (r.evidence || []).map(e => `<span class="ev-tag">${esc(e)}</span>`).join('');
    const keys = (r.relatedKeys || []).map(k => `<span class="metric">${esc(k)}</span>`).join(' ');
    wrap.appendChild(el('div', `rec sev-${esc(r.severity)}`,
      `<span class="sev ${esc(r.severity)}">${esc(r.severity)}</span><div class="body"><b>${esc(r.title)}</b> — ${esc(r.rationale)}<div class="evidence">${ev}</div>${keys ? `<div style="margin-top:4px">${keys}</div>` : ''}</div>`));
  });
  if (!wrap.children.length) wrap.appendChild(el('div', 'empty', 'No recommendations produced.'));
}

function renderSOPProposal(out) {
  $('#sop-proposal-wrap').style.display = out ? '' : 'none';
  if (!out) return;
  const list = $('#sop-proposal');
  list.innerHTML = '';
  // Reuse the patch tab card renderer; the live status comes from the hermes
  // snapshot when available (the SOP may have deployed it since).
  const live = (state.hermes?.proposals || []).find(p => p.id === out.proposal.id);
  list.appendChild(patchCard(live || out.proposal));

  const kpis = $('#sop-kpis');
  kpis.innerHTML = '';
  (out.expectedKPIs || []).forEach(k => {
    const arrow = k.direction === 'decrease' ? '▼' : '▲';
    const row = el('div', 'item-row');
    row.innerHTML = `
      <div><div class="name">${esc(k.kpi)}</div><div class="tag">${esc(k.rationale)}</div></div>
      <div class="who">${fmt(k.current)} ${arrow} ${fmt(k.target)}</div>
      <div class="who">${esc(k.direction)}</div>
      <div></div>`;
    kpis.appendChild(row);
  });
  if (!kpis.children.length) kpis.appendChild(el('div', 'empty', 'No KPI targets produced.'));
}

function renderSOPDataSources(out) {
  $('#sop-sources-wrap').style.display = out ? '' : 'none';
  if (!out) return;
  const wrap = $('#sop-datasources');
  wrap.innerHTML = '';
  (out.dataSources || []).forEach(s => {
    const fields = s.exampleEvent?.fields?.length ? `<div class="evidence">${s.exampleEvent.fields.map(f => `<span class="ev-tag">${esc(f)}</span>`).join('')}</div>` : '';
    wrap.appendChild(el('div', 'rec sev-info',
      `<span class="sev info">${esc(s.id)}</span><div class="body"><b>${esc(s.name)}</b> — ${esc(s.description)}<div class="muted" style="margin-top:4px">Why: ${esc(s.rationale)} · KPI: ${esc(s.kpiSupported)}</div>${fields}</div>`));
  });
  if (!wrap.children.length) wrap.appendChild(el('div', 'empty', 'No new data sources proposed.'));
}

function renderSOPDeploy(out) {
  $('#sop-deploy-wrap').style.display = out ? '' : 'none';
  if (!out) return;
  const wrap = $('#sop-deploy');
  wrap.innerHTML = '';
  if (out.skipped) {
    wrap.appendChild(el('div', 'empty', esc(out.note)));
    return;
  }
  (out.appliedChanges || []).forEach(c => {
    const row = el('div', 'adj-row');
    row.innerHTML = `
      <div><div class="key">${esc(c.key)}</div><div class="who hermes">telemetry-sop</div></div>
      <div class="adj-val"><span class="old">${fmt(c.from)}</span> → <span class="new">${fmt(c.to)}</span></div>
      <div class="who">${c.percentChange != null ? (c.percentChange > 0 ? '+' : '') + c.percentChange + '%' : ''}</div>`;
    wrap.appendChild(row);
  });
  const srcRow = el('div', 'adj-row');
  srcRow.innerHTML = `
    <div><div class="key">new data inputs deployed</div><div class="who">runtime-config</div></div>
    <div class="adj-val"><span class="new">${(out.deployedDataSources || []).map(esc).join(', ') || 'none'}</span></div>
    <div class="who"></div>`;
  wrap.appendChild(srcRow);
}

$('#btn-analyze').addEventListener('click', generatePatch);
$('#btn-refresh').addEventListener('click', refreshAll);
$('#btn-refresh-2').addEventListener('click', refreshAll);
$('#btn-sop-run').addEventListener('click', runSOP);
$('#btn-sop-refresh').addEventListener('click', refreshSOP);

refreshAll();
refreshSOP();
