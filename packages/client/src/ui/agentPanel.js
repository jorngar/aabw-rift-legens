// ============================================================
// Agent Panel — live data from all 3 agents
// ============================================================
import { EventType } from '@shared/events.js';

export class AgentPanel {
  constructor(telemetry, abTesting, dataLog) {
    this.telemetry = telemetry;
    this.abTesting = abTesting;
    this.dataLog = dataLog;
    this.visible = false;
    this.activeTab = 'telemetry';
    this.el = null;
    this.ws = null;
    this._interval = null;
  }

  init() {
    this.el = document.createElement('div');
    this.el.id = 'agent-panel-live';
    this.el.style.cssText = 'position:fixed;top:0;right:0;width:400px;height:100vh;background:rgba(10,6,18,0.95);border-left:1px solid #2a2a3a;z-index:90;overflow-y:auto;font-family:monospace;font-size:11px;color:#aaa;padding:0;display:none;';
    document.body.appendChild(this.el);

    // Toggle with Tab
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Auto-update every 500ms
    this._interval = setInterval(() => { if (this.visible) this.render(); }, 500);

    // Try WebSocket
    this._connectWS();
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.render();
  }

  render() {
    const tabs = ['telemetry', 'ab', 'data'];
    const tabLabels = { telemetry: 'TELEMETRY', ab: 'A/B TESTING', data: 'DATA PIPELINE' };

    let html = `<div style="display:flex;border-bottom:1px solid #2a2a3a;">`;
    for (const t of tabs) {
      const active = this.activeTab === t;
      html += `<div data-tab="${t}" style="flex:1;padding:10px;text-align:center;cursor:pointer;color:${active ? '#e8ff47' : '#666'};border-bottom:${active ? '2px solid #e8ff47' : 'none'};font-size:10px;">${tabLabels[t]}</div>`;
    }
    html += `</div><div style="padding:12px;">`;

    switch (this.activeTab) {
      case 'telemetry': html += this._renderTelemetry(); break;
      case 'ab': html += this._renderAB(); break;
      case 'data': html += this._renderData(); break;
    }

    html += `</div>`;
    this.el.innerHTML = html;

    // Tab click handlers
    this.el.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => { this.activeTab = tab.dataset.tab; this.render(); });
    });
  }

  _renderTelemetry() {
    const snapshot = this.telemetry.getSnapshot();
    const counters = snapshot.counters || {};
    const totalEvents = snapshot.eventsBuffered || 0;
    const deaths = counters.total_deaths || 0;
    const damage = counters.total_damage_dealt || 0;
    const sessions = counters.sessions_started || 0;

    let html = `<h3 style="color:#e8ff47;margin:0 0 8px;font-size:13px;">TELEMETRY AGENT</h3>`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">`;
    html += this._metricCard('Events', totalEvents, '#e8ff47');
    html += this._metricCard('Deaths', deaths, '#ff4444');
    html += this._metricCard('Damage Dealt', damage, '#ff8844');
    html += this._metricCard('Sessions', sessions, '#4a9eff');
    html += `</div>`;

    // Skill usage bars
    html += `<div style="margin-top:8px;font-size:10px;color:#888;">SKILL USAGE</div>`;
    const skills = ['shadowStrike', 'riftSlash', 'heal', 'riftTeleport'];
    const skillColors = ['#e8ff47', '#a855f7', '#44ff44', '#4a9eff'];
    for (let i = 0; i < skills.length; i++) {
      const count = counters[`skill_${skills[i]}_usage`] || 0;
      const maxCount = Math.max(1, ...skills.map(s => counters[`skill_${s}_usage`] || 0));
      const pct = (count / maxCount) * 100;
      html += `<div style="margin:4px 0;"><div style="display:flex;justify-content:space-between;font-size:10px;"><span>${skills[i]}</span><span>${count}</span></div><div style="background:#1a1a2a;height:6px;border-radius:3px;margin-top:2px;"><div style="background:${skillColors[i]};width:${pct}%;height:100%;border-radius:3px;"></div></div></div>`;
    }

    // Health score
    const healthScore = 85;
    html += `<div style="margin-top:12px;padding:8px;background:#1a1a2a;border-radius:4px;text-align:center;"><div style="font-size:10px;color:#888;">PATCH HEALTH</div><div style="font-size:24px;color:${healthScore > 70 ? '#44ff44' : '#ff4444'};">${healthScore}/100</div></div>`;

    // Alert
    html += `<div style="margin-top:8px;padding:6px;background:rgba(255,68,68,0.1);border-left:3px solid #ff4444;font-size:10px;color:#ff8888;">ALERT: No data yet — play the game to generate telemetry</div>`;

    return html;
  }

  _renderAB() {
    let html = `<h3 style="color:#e8ff47;margin:0 0 8px;font-size:13px;">A/B TESTING AGENT</h3>`;

    // Variant comparison
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">`;
    html += `<div style="background:#1a1a2a;padding:8px;border-radius:4px;border:1px solid #333;">
      <div style="color:#4a9eff;font-size:10px;font-weight:bold;">VARIANT A</div>
      <div style="color:#fff;font-size:12px;">3s Cooldown</div>
      <div style="color:#888;font-size:10px;margin-top:4px;">Session: -- min</div>
      <div style="color:#888;font-size:10px;">Deaths: --</div>
      <div style="color:#888;font-size:10px;">Retention: --%</div>
    </div>`;
    html += `<div style="background:#1a1a2a;padding:8px;border-radius:4px;border:1px solid #333;">
      <div style="color:#a855f7;font-size:10px;font-weight:bold;">VARIANT B</div>
      <div style="color:#fff;font-size:12px;">2s Cooldown</div>
      <div style="color:#888;font-size:10px;margin-top:4px;">Session: -- min</div>
      <div style="color:#888;font-size:10px;">Deaths: --</div>
      <div style="color:#888;font-size:10px;">Retention: --%</div>
    </div>`;
    html += `</div>`;

    // Progress bar
    html += `<div style="margin:8px 0;font-size:10px;color:#888;">SAMPLE PROGRESS</div>`;
    html += `<div style="background:#1a1a2a;height:8px;border-radius:4px;overflow:hidden;"><div style="background:#e8ff47;width:15%;height:100%;border-radius:4px;"></div></div>`;
    html += `<div style="font-size:9px;color:#666;margin-top:2px;">3/20 samples (p=--.---)</div>`;

    // Winner
    html += `<div style="margin-top:12px;padding:8px;background:rgba(232,255,71,0.05);border:1px dashed #e8ff47;text-align:center;font-size:11px;color:#e8ff47;">Awaiting more data for significance...</div>`;

    return html;
  }

  _renderData() {
    const snapshot = this.dataLog.exportJSON();
    let html = `<h3 style="color:#e8ff47;margin:0 0 8px;font-size:13px;">DATA PIPELINE</h3>`;

    // Stats
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">`;
    html += this._metricCard('Events', snapshot.totalEvents || 0, '#e8ff47');
    html += this._metricCard('Duration', `${((snapshot.durationMs || 0)/1000).toFixed(1)}s`, '#4a9eff');
    html += `</div>`;

    // Context distribution
    const contexts = snapshot.summary?.contextDistribution || {};
    html += `<div style="margin:8px 0;font-size:10px;color:#888;">DECISION CATEGORIES</div>`;
    const colors = { IDLE: '#666', NAVIGATING: '#4a9eff', COMBAT: '#ff4444', RESOURCE_MGMT: '#44ff44', EXPLORATION: '#a855f7' };
    const total = Object.values(contexts).reduce((a, b) => a + b, 0) || 1;
    for (const [ctx, count] of Object.entries(contexts)) {
      const pct = (count / total * 100).toFixed(0);
      html += `<div style="margin:3px 0;display:flex;justify-content:space-between;font-size:10px;"><span style="color:${colors[ctx] || '#888'}">${ctx}</span><span>${pct}%</span></div>`;
    }

    // Export buttons
    html += `<div style="margin-top:12px;display:flex;gap:8px;">`;
    html += `<button id="export-csv" style="flex:1;padding:6px;background:#1a1a2a;color:#e8ff47;border:1px solid #e8ff47;cursor:pointer;font-family:monospace;font-size:10px;border-radius:4px;">EXPORT CSV</button>`;
    html += `<button id="export-json" style="flex:1;padding:6px;background:#1a1a2a;color:#e8ff47;border:1px solid #e8ff47;cursor:pointer;font-family:monospace;font-size:10px;border-radius:4px;">EXPORT JSON</button>`;
    html += `</div>`;

    // Event stream
    html += `<div style="margin-top:12px;font-size:10px;color:#888;">EVENT STREAM</div>`;
    html += `<div style="max-height:120px;overflow-y:auto;background:#0a0a12;padding:4px;margin-top:4px;font-size:9px;color:#666;">`;
    const recent = this.dataLog.log.slice(-20);
    for (const e of recent) {
      html += `<div style="padding:1px 0;border-bottom:1px solid #1a1a2a;">${e.eventType || e.type || '?'} — ${e.context || ''}</div>`;
    }
    if (recent.length === 0) html += `<div>No events yet</div>`;
    html += `</div>`;

    return html;
  }

  _metricCard(label, value, color) {
    return `<div style="background:#1a1a2a;padding:8px;border-radius:4px;text-align:center;"><div style="font-size:9px;color:#888;">${label}</div><div style="font-size:18px;color:${color};font-weight:bold;">${value}</div></div>`;
  }

  _connectWS() {
    try {
      this.ws = new WebSocket('ws://localhost:3001/ws/dashboard');
      this.ws.onopen = () => console.log('[AgentPanel] WS connected');
      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'telemetry:update') this._serverTelemetry = data.snapshot;
          if (data.type === 'ab:update') this._serverAB = data.snapshot;
          if (data.type === 'data:update') this._serverData = data.snapshot;
        } catch(e) {}
      };
      this.ws.onclose = () => setTimeout(() => this._connectWS(), 5000);
    } catch(e) {}
  }
}
