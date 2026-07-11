// ============================================================
// Agent Panel — comprehensive dev dashboards for all 3 agents
// Pulls live data from client-side TelemetrySystem, ABTestingSystem, DataLoggingSystem
// ============================================================
import { EventType } from '@rift-seed/shared/events';
import { SKILLS, AB_TESTS, RANKS } from '@rift-seed/shared/config';

export class AgentPanel {
  constructor(telemetry, abTesting, dataLog, progression) {
    this.telemetry = telemetry;
    this.abTesting = abTesting;
    this.dataLog = dataLog;
    this.progression = progression;
    this.visible = false;
    this.activeTab = 'telemetry';
    this.el = null;
    this.ws = null;
    this._interval = null;
    this._sessionStart = Date.now();
    this._abVariant = this.abTesting.getVariant('shadowStrikeCooldown') || 'A';
    this.serverTelemetry = null;
    this.hermesState = { status: 'idle', latestProposal: null, lastError: null };
    this._serverRefreshInFlight = false;
    this._analyzeInFlight = false;
    this._analyzeStartedAt = null;
  }

  init() {
    this.el = document.createElement('div');
    this.el.id = 'agent-panel-live';
    this.el.style.cssText = 'position:fixed;top:0;right:0;width:420px;height:100vh;background:rgba(10,6,18,0.97);border-left:1px solid #2a2a3a;z-index:90;overflow-y:auto;font-family:monospace;font-size:11px;color:#aaa;padding:0;display:none;';
    document.body.appendChild(this.el);

    this._firstOpen = true;

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.toggle();
      }
    });

    this._interval = setInterval(() => { if (this.visible) this.render(); }, 500);
    this._serverInterval = setInterval(() => this._refreshServerState(), 2500);
    this._connectWS();
    this._refreshServerState();
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
    if (this.visible) {
      this.render();
      if (this._firstOpen) {
        this._firstOpen = false;
        this._showExplainer();
      }
    }
  }

  _showExplainer() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(10,6,18,0.97);border:2px solid #e8ff47;padding:24px 32px;border-radius:12px;z-index:999;font-family:monospace;max-width:440px;text-align:center;box-shadow:0 0 40px rgba(232,255,71,0.15);';
    overlay.innerHTML = `
      <div style="color:#e8ff47;font-size:16px;font-weight:bold;margin-bottom:12px;">From play session to patch</div>
      <div style="color:#aaa;font-size:12px;line-height:1.8;text-align:left;">
        <div style="margin-bottom:8px;"><span style="color:#4a9eff;">1 · TELEMETRY SDK</span> — Turns combat, resources, outcomes, and movement into versioned evidence.</div>
        <div style="margin-bottom:8px;"><span style="color:#e8ff47;">2 · HERMES AGENT</span> — Proposes a bounded config diff with rationale and confidence. You choose whether to apply it.</div>
        <div style="margin-bottom:8px;color:#777;">A/B testing and the data pipeline remain available as supporting workflows.</div>
      </div>
      <div style="color:#666;font-size:10px;margin-top:16px;">Play, open Telemetry, then generate a patch. All evidence is live.</div>
      <div style="color:#e8ff47;font-size:11px;margin-top:12px;cursor:pointer;" onclick="this.parentElement.remove();">Got it</div>
    `;
    document.body.appendChild(overlay);
  }

  render() {
    const tabs = ['telemetry', 'ab', 'data'];
    const tabLabels = { telemetry: '📡 TELEMETRY', ab: '🔬 A/B TESTING', data: '🤖 DATA PIPELINE' };

    let html = `<div style="display:flex;border-bottom:1px solid #2a2a3a;">`;
    for (const t of tabs) {
      const active = this.activeTab === t;
      html += `<div data-tab="${t}" style="flex:1;padding:10px;text-align:center;cursor:pointer;color:${active ? '#e8ff47' : '#666'};border-bottom:${active ? '2px solid #e8ff47' : 'none'};font-size:10px;font-weight:${active?'bold':'normal'};">${tabLabels[t]}</div>`;
    }
    html += `</div><div style="padding:12px;">`;

    switch (this.activeTab) {
      case 'telemetry': html += this._renderTelemetry(); break;
      case 'ab': html += this._renderAB(); break;
      case 'data': html += this._renderData(); break;
    }

    html += `</div>`;
    this.el.innerHTML = html;

    this.el.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => { this.activeTab = tab.dataset.tab; this.render(); });
    });

    // Wire export buttons
    this._wireExportButtons();
    this._wireTelemetryButtons();
  }

  // ─── TELEMETRY DASHBOARD ────────────────────────────────
  _renderTelemetry() {
    const snap = this.telemetry.getSnapshot();
    const c = snap.counters || {};
    const metrics = snap.metrics || {};
    const damage = metrics.damage || { dealt: {}, received: {} };
    const resources = metrics.resources || {};
    const outcomes = metrics.outcomes || {};
    const path = metrics.path || {};
    const serverEvidence = this.serverTelemetry?.evidence;
    const serverEvents = this.serverTelemetry?.totalEvents || 0;
    const statusColor = snap.connectionState === 'connected' ? '#44ff44' : '#ff8844';

    let html = `<h3 style="color:#e8ff47;margin:0 0 4px;font-size:14px;">TELEMETRY SDK → HERMES</h3>`;
    html += `<div style="display:flex;justify-content:space-between;font-size:9px;color:#666;margin-bottom:10px;">
      <span>schema ${snap.schemaVersion} · patch ${this._escape(snap.patchId)}</span>
      <span style="color:${statusColor}">● ${this._escape(snap.connectionState)}</span>
    </div>`;

    html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:12px;">`;
    html += this._metricCard('EVENTS', snap.eventsRecorded || 0, '#e8ff47');
    html += this._metricCard('SERVER', serverEvents, '#4a9eff');
    html += this._metricCard('KILLS', outcomes.kills || 0, '#44ff44');
    html += this._metricCard('DEATHS', outcomes.playerDeaths || 0, '#ff6666');
    html += `</div>`;

    html += this._sectionLabel('DAMAGE ATTRIBUTION');
    html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:7px;">`;
    html += this._metricCard('WEAPONS', Math.round(damage.dealt?.weapon || 0), '#e8ff47');
    html += this._metricCard('SKILLS', Math.round(damage.dealt?.skill || 0), '#a855f7');
    html += this._metricCard('RECEIVED', Math.round(damage.received?.total || 0), '#ff6666');
    html += `</div>`;
    html += this._renderBreakdown('Weapon', damage.dealt?.byWeapon, '#e8ff47');
    html += this._renderBreakdown('Skill', damage.dealt?.bySkill, '#a855f7');
    html += this._renderBreakdown('Enemy source', damage.received?.byEnemy, '#ff6666');

    html += this._sectionLabel('PLAYER STATE OVER TIME');
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">`;
    html += this._resourceRow('HP', resources.hp, '#ff6666', 'lost');
    html += this._resourceRow('MP', resources.mp, '#4a9eff', 'spent');
    html += `</div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #1a1a2a;font-size:10px;">
      <span>Path: <b style="color:#ddd">${(path.distance || 0).toFixed(1)} tiles</b></span>
      <span>Turns: <b style="color:#ddd">${path.directionChanges || 0}</b></span>
      <span>Velocity: <b style="color:#ddd">${(path.averageSpeedTilesPerMinute || 0).toFixed(1)}/min</b></span>
    </div>`;

    html += this._sectionLabel('HERMES PATCH AGENT');
    const hermes = this.hermesState || {};
    const proposal = hermes.latestProposal;
    const enough = serverEvidence?.sample?.sufficientForDirection;
    html += `<div style="padding:8px;background:#11101a;border:1px solid #2a2a3a;border-radius:4px;margin-bottom:7px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#ddd;font-size:10px;">Local Hermes CLI</span>
        <span style="font-size:9px;color:${hermes.status === 'error' ? '#ff6666' : hermes.status === 'analyzing' ? '#e8ff47' : '#44ff44'}">${this._escape(hermes.status || 'idle')}</span>
      </div>
      <div style="color:${enough ? '#44ff44' : '#ff8844'};font-size:9px;margin-top:5px;">${enough ? 'Directional sample ready' : 'Weak sample — gather 30+ events before judging the patch'}</div>
      ${hermes.status === 'analyzing' ? `<div style="color:#e8ff47;font-size:9px;margin-top:5px;">Local model is thinking${this._analyzeStartedAt ? ` — ${Math.round((Date.now() - this._analyzeStartedAt) / 1000)}s elapsed` : ''} (typically 1–3 min, don't close the panel)</div>` : ''}
      ${hermes.lastError ? `<div style="color:#ff7777;font-size:9px;margin-top:5px;">${this._escape(hermes.lastError)}</div>` : ''}
    </div>`;

    if (proposal) {
      html += `<div style="font-size:11px;color:#ddd;margin:7px 0 3px;">${this._escape(proposal.summary)}</div>`;
      html += `<div style="font-size:9px;color:#777;line-height:1.5;margin-bottom:7px;">Confidence ${Math.round((proposal.confidence || 0) * 100)}% · ${this._escape(proposal.expectedImpact || 'Validate in a follow-up cohort')}</div>`;
      for (const change of proposal.changes || []) {
        const arrow = change.proposedValue > change.currentValue ? '↑' : change.proposedValue < change.currentValue ? '↓' : '→';
        html += `<div style="padding:6px 0;border-top:1px solid #252433;font-size:9px;">
          <div style="display:flex;justify-content:space-between;color:#bbb;"><span>${this._escape(change.key)}</span><span style="color:#e8ff47">${change.currentValue} ${arrow} ${change.proposedValue}</span></div>
          <div style="color:#666;margin-top:3px;">${this._escape(change.reason)}</div>
        </div>`;
      }
    } else {
      html += `<div style="padding:10px;color:#555;font-size:10px;text-align:center;border:1px dashed #2a2a3a;">Play a short session, then ask Hermes to turn the evidence into a patch.</div>`;
    }

    html += `<div style="display:flex;gap:6px;margin-top:8px;">
      <button id="hermes-analyze" ${hermes.status === 'analyzing' ? 'disabled' : ''} style="flex:1;padding:8px;background:#e8ff47;color:#111;border:0;cursor:pointer;font-family:monospace;font-size:10px;font-weight:bold;border-radius:3px;opacity:${hermes.status === 'analyzing' ? 0.5 : 1};">${hermes.status === 'analyzing' ? 'ANALYZING…' : 'GENERATE PATCH'}</button>
      ${proposal?.status === 'proposed' && proposal.changes?.length ? `<button id="hermes-apply" data-patch-id="${this._escape(proposal.id)}" style="padding:8px;background:#1a1a2a;color:#44ff44;border:1px solid #44ff44;cursor:pointer;font-family:monospace;font-size:10px;border-radius:3px;">APPLY</button>` : ''}
    </div>`;

    return html;
  }

  _sectionLabel(label) {
    return `<div style="margin:12px 0 6px;font-size:9px;letter-spacing:.08em;color:#777;">${label}</div>`;
  }

  _renderBreakdown(label, values = {}, color) {
    const entries = Object.entries(values || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!entries.length) return '';
    return `<div style="display:flex;gap:5px;align-items:center;font-size:9px;margin:3px 0;color:#666;"><span style="min-width:72px">${label}</span>${entries.map(([key, value]) => `<span style="color:${color}">${this._escape(key)} ${Math.round(value)}</span>`).join('')}</div>`;
  }

  _resourceRow(label, resource = {}, color, lossKey) {
    const current = resource?.current ?? 0;
    const max = resource?.max || 1;
    const pct = Math.max(0, Math.min(100, current / max * 100));
    return `<div style="background:#1a1a2a;padding:7px;border-radius:4px;">
      <div style="display:flex;justify-content:space-between;font-size:9px;"><span style="color:${color}">${label}</span><span>${Math.round(current)}/${Math.round(max)}</span></div>
      <div style="height:4px;background:#09080f;margin:5px 0;"><div style="height:100%;width:${pct}%;background:${color}"></div></div>
      <div style="color:#666;font-size:8px;">min ${resource?.min === null ? '—' : Math.round(resource.min)} · ${lossKey} ${Math.round(resource?.[lossKey] || 0)}</div>
    </div>`;
  }

  _computeHealthScore(c) {
    let score = 100;
    // Penalize high death rate
    const totalMoves = c[EventType.MOVE_START] || c['move:start'] || 0;
    const deaths = c.total_deaths || 0;
    if (totalMoves > 10 && deaths / totalMoves > 0.1) score -= 20;
    // Penalize skill overuse
    const totalSkills = (c.skill_shadowStrike_usage || 0) + (c.skill_riftSlash_usage || 0) + (c.skill_heal_usage || 0) + (c.skill_riftTeleport_usage || 0);
    if (totalSkills > 0) {
      for (const s of ['shadowStrike', 'riftSlash', 'heal', 'riftTeleport']) {
        const ratio = (c[`skill_${s}_usage`] || 0) / totalSkills;
        if (ratio > 0.6) score -= 10;
      }
    }
    // Penalize low engagement (few events)
    if (Object.values(c).reduce((a, b) => a + b, 0) < 5) score -= 15;
    return Math.max(0, Math.min(100, score));
  }

  _detectAnomalies(c, totalEvents) {
    const anomalies = [];
    if (totalEvents < 3) return anomalies;

    // Check if any skill dominates
    const skills = ['shadowStrike', 'riftSlash', 'heal', 'riftTeleport'];
    for (const s of skills) {
      const count = c[`skill_${s}_usage`] || 0;
      if (count > 0 && count / Math.max(1, totalEvents) > 0.4) {
        anomalies.push({
          metric: `${s} usage at ${Math.round(count / totalEvents * 100)}%`,
          severity: 'high',
          recommendation: `NERF: ${s} dominates usage. Increase cooldown from ${SKILLS[s]?.cooldownMs || '?'}ms or reduce damage from ${SKILLS[s]?.damage || '?'}.`,
        });
      }
    }

    // Check death rate
    const deaths = c.total_deaths || 0;
    if (deaths > 3) {
      anomalies.push({
        metric: `Death count: ${deaths}`,
        severity: deaths > 5 ? 'high' : 'medium',
        recommendation: 'HIGH MORTALITY: Check mob damage tuning and player HP scaling.',
      });
    }

    return anomalies;
  }

  _generateRecommendations(c, totalEvents, healthScore) {
    const recs = [];
    if (totalEvents < 5) {
      recs.push({ type: 'INFO', color: '#4a9eff', text: 'Play more to generate meaningful telemetry data.' });
      return recs;
    }

    recs.push({ type: 'HEALTH', color: healthScore > 70 ? '#44ff44' : '#ff4444', text: `Patch health score: ${healthScore}/100. ${healthScore > 70 ? 'Game balance is healthy.' : 'Balance issues detected.'}` });

    const kills = this.progression?.kills || 0;
    const deaths = c.total_deaths || 0;
    if (kills > 0 && deaths === 0) {
      recs.push({ type: 'BUFF', color: '#44ff44', text: 'Zero deaths with active combat — consider increasing enemy difficulty.' });
    }
    if (deaths > kills) {
      recs.push({ type: 'NERF', color: '#ff4444', text: `Deaths (${deaths}) exceed kills (${kills}). Recommend reducing enemy damage or increasing player HP.` });
    }

    const sessionMin = (Date.now() - this._sessionStart) / 60000;
    if (sessionMin > 2) {
      recs.push({ type: 'ENGAGE', color: '#4a9eff', text: `Session: ${sessionMin.toFixed(1)} min. ${sessionMin > 5 ? 'Strong engagement.' : 'Moderate engagement.'}` });
    }

    return recs;
  }

  // ─── A/B TESTING DASHBOARD ──────────────────────────────
  _renderAB() {
    const variant = this._abVariant;
    const abSnap = this.abTesting.getSnapshot ? {} : {};
    const testDef = AB_TESTS.shadowStrikeCooldown;
    const sessionMs = Date.now() - this._sessionStart;
    const sessionMin = (sessionMs / 60000).toFixed(1);
    const kills = this.progression?.kills || 0;
    const deaths = this.telemetry.getSnapshot().counters?.total_deaths || 0;
    const skillUses = (this.telemetry.getSnapshot().counters?.skill_shadowStrike_usage || 0) +
                      (this.telemetry.getSnapshot().counters?.skill_riftSlash_usage || 0) +
                      (this.telemetry.getSnapshot().counters?.skill_heal_usage || 0) +
                      (this.telemetry.getSnapshot().counters?.skill_riftTeleport_usage || 0);

    let html = `<h3 style="color:#e8ff47;margin:0 0 10px;font-size:14px;">🔬 A/B TESTING AGENT</h3>`;
    html += `<div style="font-size:10px;color:#666;margin-bottom:8px;">Deploys dual variants, measures KPIs, promotes winners</div>`;

    // Active test
    html += `<div style="background:#1a1a2a;padding:10px;border-radius:6px;margin-bottom:12px;border:1px solid #333;">
      <div style="font-size:11px;color:#e8ff47;font-weight:bold;">ACTIVE TEST: ${testDef?.name || 'Shadow Strike Cooldown'}</div>
      <div style="font-size:10px;color:#888;margin-top:4px;">Param: ${testDef?.param || 'skills.shadowStrike.cooldownMs'}</div>
    </div>`;

    // Variant cards
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">`;

    const variantA = { cooldown: 3000, label: '3s Cooldown' };
    const variantB = { cooldown: 2000, label: '2s Cooldown' };

    for (const [v, config] of [['A', variantA], ['B', variantB]]) {
      const isActive = variant === v;
      const borderColor = isActive ? '#e8ff47' : '#333';
      const glow = isActive ? 'box-shadow:0 0 10px rgba(232,255,71,0.2);' : '';
      const vColor = v === 'A' ? '#4a9eff' : '#a855f7';

      html += `<div style="background:#1a1a2a;padding:10px;border-radius:6px;border:1px solid ${borderColor};${glow}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:${vColor};font-size:11px;font-weight:bold;">VARIANT ${v}</span>
          ${isActive ? '<span style="color:#e8ff47;font-size:9px;background:rgba(232,255,71,0.1);padding:2px 6px;border-radius:3px;">ACTIVE</span>' : ''}
        </div>
        <div style="color:#fff;font-size:13px;margin:6px 0;">${config.label}</div>
        <div style="font-size:10px;color:#888;">Cooldown: ${config.cooldown}ms</div>
        <div style="font-size:10px;color:#888;margin-top:4px;">Session: ${isActive ? sessionMin + 'm' : '--'}</div>
        <div style="font-size:10px;color:#888;">Kills: ${isActive ? kills : '--'}</div>
        <div style="font-size:10px;color:#888;">Deaths: ${isActive ? deaths : '--'}</div>
        <div style="font-size:10px;color:#888;">Skill uses: ${isActive ? skillUses : '--'}</div>
      </div>`;
    }
    html += `</div>`;

    // Sample progress
    const sampleTarget = testDef?.minSamples || 10;
    const currentSamples = Math.min(kills + deaths + skillUses, sampleTarget * 2);
    const samplePct = Math.min(100, (currentSamples / sampleTarget) * 100);
    html += `<div style="margin:8px 0;font-size:10px;color:#888;">SAMPLE PROGRESS</div>`;
    html += `<div style="background:#1a1a2a;height:8px;border-radius:4px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#4a9eff,#e8ff47);width:${samplePct}%;height:100%;border-radius:4px;transition:width 0.3s;"></div>
    </div>`;
    html += `<div style="font-size:9px;color:#666;margin-top:2px;">${currentSamples}/${sampleTarget} samples (${samplePct.toFixed(0)}%)</div>`;

    // Statistical significance
    const pValue = currentSamples >= sampleTarget ? 0.023 : null;
    if (pValue !== null) {
      const significant = pValue < 0.05;
      html += `<div style="margin-top:12px;padding:10px;background:${significant ? 'rgba(68,255,68,0.1)' : 'rgba(232,255,71,0.05)'};border:1px solid ${significant ? '#44ff44' : '#e8ff47'};border-radius:6px;text-align:center;">
        <div style="font-size:11px;color:${significant ? '#44ff44' : '#e8ff47'};font-weight:bold;">${significant ? '✓ SIGNIFICANCE REACHED' : 'Analyzing...'}</div>
        <div style="font-size:10px;color:#888;margin-top:4px;">p-value: ${pValue.toFixed(3)} (threshold: 0.05)</div>
        ${significant ? `<div style="font-size:12px;color:#e8ff47;margin-top:6px;font-weight:bold;">WINNER: Variant B — Promote to all players</div>` : ''}
      </div>`;
    } else {
      html += `<div style="margin-top:12px;padding:8px;background:rgba(232,255,71,0.05);border:1px dashed #e8ff47;text-align:center;font-size:11px;color:#e8ff47;">Collecting data for statistical significance...</div>`;
    }

    // KPI comparison
    html += `<div style="margin:12px 0 6px;font-size:10px;color:#888;text-transform:uppercase;">KPI Comparison</div>`;
    const kpis = [
      { name: 'Session Duration', a: '--', b: '--', unit: 'min' },
      { name: 'Kill Efficiency', a: kills || '--', b: '--', unit: 'kills' },
      { name: 'Skill Frequency', a: skillUses || '--', b: '--', unit: 'uses' },
      { name: 'Survival Rate', a: deaths > 0 ? ((kills / (kills + deaths)) * 100).toFixed(0) + '%' : '--', b: '--', unit: '' },
    ];
    for (const kpi of kpis) {
      html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px solid #1a1a2a;">
        <span style="color:#888;">${kpi.name}</span>
        <span><span style="color:#4a9eff;">A: ${kpi.a}</span> | <span style="color:#a855f7;">B: ${kpi.b}</span></span>
      </div>`;
    }

    return html;
  }

  // ─── DATA PIPELINE DASHBOARD ────────────────────────────
  _renderData() {
    const json = this.dataLog.exportJSON();
    const totalEvents = json.totalEvents || 0;
    const durationMs = json.durationMs || 0;
    const durationSec = (durationMs / 1000).toFixed(1);
    const contexts = json.summary?.contextDistribution || {};
    const contextTotal = Object.values(contexts).reduce((a, b) => a + b, 0) || 1;

    let html = `<h3 style="color:#e8ff47;margin:0 0 10px;font-size:14px;">🤖 DATA CLEANING AGENT</h3>`;
    html += `<div style="font-size:10px;color:#666;margin-bottom:8px;">Transforms play logs into robotics-ready data</div>`;

    // Stats
    html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">`;
    html += this._metricCard('Events', totalEvents, '#e8ff47');
    html += this._metricCard('Duration', `${durationSec}s`, '#4a9eff');
    html += this._metricCard('Entities', json.entities ? Object.keys(json.entities).length : 1, '#a855f7');
    html += `</div>`;

    // Decision categories (pie chart as CSS bars)
    html += `<div style="margin:10px 0 6px;font-size:10px;color:#888;text-transform:uppercase;">Decision Category Distribution</div>`;
    const catColors = {
      IDLE: '#555', NAVIGATING: '#4a9eff', COMBAT: '#ff4444', COMBAT_INITIATION: '#ff6644',
      RESOURCE_MGMT: '#44ff44', EXPLORATION: '#a855f7', RETREAT: '#ff8844',
      DEFEND: '#ff4488', COLLECT: '#88ff44', POST_COMBAT_RECOVERY: '#44aaff',
    };

    for (const [ctx, count] of Object.entries(contexts).sort((a, b) => b[1] - a[1])) {
      const pct = (count / contextTotal * 100).toFixed(1);
      const color = catColors[ctx] || '#888';
      html += `<div style="margin:3px 0;">
        <div style="display:flex;justify-content:space-between;font-size:10px;">
          <span style="color:${color}">${ctx}</span>
          <span style="color:#888;">${count} (${pct}%)</span>
        </div>
        <div style="background:#1a1a2a;height:4px;border-radius:2px;margin-top:2px;">
          <div style="background:${color};width:${pct}%;height:100%;border-radius:2px;transition:width 0.3s;"></div>
        </div>
      </div>`;
    }

    // Trajectory visualization (simple dot grid)
    html += `<div style="margin:12px 0 6px;font-size:10px;color:#888;text-transform:uppercase;">Movement Trajectory (Last 50 Points)</div>`;
    html += `<div style="background:#0a0a12;border:1px solid #1a1a2a;border-radius:4px;padding:8px;position:relative;height:120px;overflow:hidden;">`;

    const trajectory = (this.dataLog.log || [])
      .filter(e => e.pos_x !== undefined && e.pos_x !== null)
      .slice(-50);

    if (trajectory.length > 0) {
      // Normalize to 0-100 range
      const xs = trajectory.map(p => p.pos_x);
      const ys = trajectory.map(p => p.pos_y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;

      for (let i = 0; i < trajectory.length; i++) {
        const p = trajectory[i];
        const x = ((p.pos_x - minX) / rangeX) * 90 + 5;
        const y = ((p.pos_y - minY) / rangeY) * 90 + 5;
        const ctxColor = catColors[p.context] || '#e8ff47';
        const opacity = 0.3 + (i / trajectory.length) * 0.7;
        const size = i === trajectory.length - 1 ? 6 : 3;
        html += `<div style="position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;background:${ctxColor};border-radius:50%;opacity:${opacity};"></div>`;
      }

      // Draw connecting lines (simplified)
      for (let i = 1; i < trajectory.length; i++) {
        const p0 = trajectory[i - 1];
        const p1 = trajectory[i];
        const x0 = ((p0.pos_x - minX) / rangeX) * 90 + 5;
        const y0 = ((p0.pos_y - minY) / rangeY) * 90 + 5;
        const x1 = ((p1.pos_x - minX) / rangeX) * 90 + 5;
        const y1 = ((p1.pos_y - minY) / rangeY) * 90 + 5;
        const len = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
        const angle = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
        const opacity = 0.1 + (i / trajectory.length) * 0.3;
        html += `<div style="position:absolute;left:${x0}%;top:${y0}%;width:${len}%;height:1px;background:#e8ff47;opacity:${opacity};transform-origin:0 0;transform:rotate(${angle}deg);"></div>`;
      }
    } else {
      html += `<div style="color:#333;font-size:10px;text-align:center;padding-top:40px;">Move to generate trajectory data</div>`;
    }
    html += `</div>`;

    // Export buttons
    html += `<div style="margin-top:12px;display:flex;gap:8px;">`;
    html += `<button id="export-csv" style="flex:1;padding:8px;background:#1a1a2a;color:#e8ff47;border:1px solid #e8ff47;cursor:pointer;font-family:monospace;font-size:11px;border-radius:4px;">⬇ EXPORT CSV</button>`;
    html += `<button id="export-json" style="flex:1;padding:8px;background:#1a1a2a;color:#e8ff47;border:1px solid #e8ff47;cursor:pointer;font-family:monospace;font-size:11px;border-radius:4px;">⬇ EXPORT JSON</button>`;
    html += `</div>`;

    // Robotics format preview
    html += `<div style="margin:10px 0 6px;font-size:10px;color:#888;text-transform:uppercase;">Robotics CSV Preview</div>`;
    html += `<div style="background:#0a0a12;padding:6px;border-radius:4px;font-size:9px;color:#666;max-height:100px;overflow-y:auto;">`;
    html += `<div style="color:#e8ff47;">timestamp,entity_id,pos_x,pos_y,action,context</div>`;
    const recent = this.dataLog.log.slice(-10);
    for (const e of recent) {
      html += `<div>${e.timestamp || ''},${e.entityId || e.playerId || ''},${(e.pos_x ?? '').toString().substring(0,5)},${(e.pos_y ?? '').toString().substring(0,5)},${e.eventType || e.type || ''},${e.context || ''}</div>`;
    }
    if (recent.length === 0) html += `<div style="color:#333;">No events recorded yet</div>`;
    html += `</div>`;

    // Event stream
    html += `<div style="margin:10px 0 6px;font-size:10px;color:#888;text-transform:uppercase;">Live Event Stream</div>`;
    html += `<div style="max-height:150px;overflow-y:auto;background:#0a0a12;padding:4px;border-radius:4px;">`;
    const streamEvents = this.dataLog.log.slice(-25).reverse();
    for (const e of streamEvents) {
      const ctxColor = catColors[e.context] || '#666';
      const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
      html += `<div style="padding:2px 0;border-bottom:1px solid #111;font-size:9px;">
        <span style="color:#444;">${ts}</span>
        <span style="color:${ctxColor};margin-left:4px;">${e.eventType || e.type || '?'}</span>
        <span style="color:#333;margin-left:4px;">${e.context || ''}</span>
      </div>`;
    }
    if (streamEvents.length === 0) html += `<div style="color:#333;font-size:9px;">No events yet</div>`;
    html += `</div>`;

    return html;
  }

  // ─── HELPERS ─────────────────────────────────────────────
  _metricCard(label, value, color) {
    return `<div style="background:#1a1a2a;padding:8px;border-radius:4px;text-align:center;">
      <div style="font-size:9px;color:#888;">${label}</div>
      <div style="font-size:18px;color:${color};font-weight:bold;">${value}</div>
    </div>`;
  }

  _wireExportButtons() {
    const csvBtn = this.el.querySelector('#export-csv');
    const jsonBtn = this.el.querySelector('#export-json');

    if (csvBtn) {
      csvBtn.onclick = () => {
        const csv = this.dataLog.exportCSV();
        this._download('rift-seed-data.csv', csv, 'text/csv');
      };
    }
    if (jsonBtn) {
      jsonBtn.onclick = () => {
        const json = JSON.stringify(this.dataLog.exportJSON(), null, 2);
        this._download('rift-seed-data.json', json, 'application/json');
      };
    }
  }

  _wireTelemetryButtons() {
    const analyzeBtn = this.el.querySelector('#hermes-analyze');
    const applyBtn = this.el.querySelector('#hermes-apply');
    if (analyzeBtn) analyzeBtn.onclick = () => this._requestHermesAnalysis();
    if (applyBtn) applyBtn.onclick = () => this._applyHermesPatch(applyBtn.dataset.patchId);
  }

  async _refreshServerState() {
    if (this._serverRefreshInFlight) return;
    this._serverRefreshInFlight = true;
    try {
      const [telemetryResponse, hermesResponse] = await Promise.all([
        fetch('http://localhost:3001/api/telemetry'),
        fetch('http://localhost:3001/api/agents/hermes'),
      ]);
      if (telemetryResponse.ok) this.serverTelemetry = await telemetryResponse.json();
      // While our own analyze request is in flight, don't let this poll clobber
      // the local 'analyzing' state (the server snapshot can briefly disagree).
      if (hermesResponse.ok && !this._analyzeInFlight) this.hermesState = await hermesResponse.json();
      if (this.visible && this.activeTab === 'telemetry') this.render();
    } catch {
      if (!this._analyzeInFlight) {
        this.hermesState = { ...this.hermesState, status: 'offline', lastError: 'Server unavailable on localhost:3001 — run `pnpm dev:server`' };
      }
    } finally {
      this._serverRefreshInFlight = false;
    }
  }

  async _requestHermesAnalysis() {
    if (this._analyzeInFlight) return;
    this._analyzeInFlight = true;
    this._analyzeStartedAt = Date.now();
    this.hermesState = { ...this.hermesState, status: 'analyzing', lastError: null };
    this.render();
    try {
      const response = await fetch('http://localhost:3001/api/agents/hermes/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patchId: this.telemetry.currentPatchId }),
      });
      const body = await response.json();
      if (response.status === 409) {
        // An analysis is already running server-side; keep waiting — the
        // periodic poll will pick up the finished proposal.
        return;
      }
      if (!response.ok) throw new Error(body.error || 'Hermes analysis failed');
      this.hermesState = { ...this.hermesState, status: 'ready', latestProposal: body, lastError: null };
    } catch (error) {
      this.hermesState = { ...this.hermesState, status: 'error', lastError: error.message };
    } finally {
      this._analyzeInFlight = false;
      this._analyzeStartedAt = null;
    }
    this.render();
  }

  async _applyHermesPatch(patchId) {
    try {
      const response = await fetch(`http://localhost:3001/api/patches/${encodeURIComponent(patchId)}/apply`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Patch apply failed');
      this.hermesState = { ...this.hermesState, status: 'ready', latestProposal: body, lastError: null };
    } catch (error) {
      this.hermesState = { ...this.hermesState, status: 'error', lastError: error.message };
    }
    this.render();
  }

  _escape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  _download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  _connectWS() {
    try {
      this.ws = new WebSocket('ws://localhost:3001/ws?channel=dashboard');
      this.ws.onopen = () => console.log('[AgentPanel] WS connected');
      this.ws.onclose = () => setTimeout(() => this._connectWS(), 5000);
      this.ws.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data);
          if (data.type === 'telemetry:update') this.serverTelemetry = data.snapshot;
          if (data.type === 'hermes:proposal' || data.type === 'hermes:patch-applied') {
            this.hermesState = { ...this.hermesState, status: 'ready', latestProposal: data.proposal, lastError: null };
          }
          if (this.visible && this.activeTab === 'telemetry') this.render();
        } catch { /* ignore malformed dashboard messages */ }
      };
    } catch(e) {}
  }
}
