// ============================================================
// Demo Runner — generates meaningful data for all 3 agents
// Shift+P to start. Each step produces telemetry events,
// A/B test exposures, and trajectory data.
// ============================================================

export class DemoRunner {
  constructor(player, world, progression, inventory, riftSystem, shopUI, purchaseUI, agentPanel) {
    this.player = player;
    this.world = world;
    this.progression = progression;
    this.inventory = inventory;
    this.riftSystem = riftSystem;
    this.shopUI = shopUI;
    this.purchaseUI = purchaseUI;
    this.agentPanel = agentPanel;
    this.running = false;
    this._overlay = null;
    this._moveInterval = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._runSteps();
  }

  stop() {
    this.running = false;
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    if (this._moveInterval) { clearInterval(this._moveInterval); this._moveInterval = null; }
  }

  _show(title, desc, ms = 3000) {
    if (this._overlay) this._overlay.remove();
    this._overlay = document.createElement('div');
    this._overlay.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);background:rgba(10,6,18,0.97);border:2px solid #e8ff47;padding:16px 28px;border-radius:10px;z-index:400;font-family:monospace;text-align:center;pointer-events:none;max-width:520px;box-shadow:0 0 30px rgba(232,255,71,0.1);';
    this._overlay.innerHTML = `<div style="color:#e8ff47;font-size:18px;font-weight:bold;margin-bottom:8px;">${title}</div><div style="color:#bbb;font-size:12px;line-height:1.5;">${desc}</div>`;
    document.body.appendChild(this._overlay);
    return new Promise(r => setTimeout(r, ms));
  }

  _moveTo(tx, ty, maxMs = 4000) {
    return new Promise(resolve => {
      const start = Date.now();
      this._moveInterval = setInterval(() => {
        if (!this.running || Date.now() - start > maxMs) {
          clearInterval(this._moveInterval);
          this._moveInterval = null;
          resolve();
          return;
        }
        const dx = tx - this.player.pos.x;
        const dy = ty - this.player.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) {
          clearInterval(this._moveInterval);
          this._moveInterval = null;
          resolve();
          return;
        }
        this.player.pos.x += (dx / dist) * 0.12;
        this.player.pos.y += (dy / dist) * 0.12;
        this.player.isMoving = true;
      }, 16);
    });
  }

  _press(key) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, bubbles: true }));
    return new Promise(r => setTimeout(r, 300));
  }

  async _runSteps() {
    // ─── PHASE 1: COMBAT DATA (generates telemetry + trajectory) ───
    await this._show('🎮 DEMO: COMBAT SYSTEM', 'Walking toward enemies. Auto-target engages at range.', 3000);
    await this._moveTo(6, 5, 4000);
    await this._show('⚔️ AUTO-TARGET', 'Player acquired nearest enemy. Combat begins automatically.', 2000);

    // Use multiple skills for telemetry variety
    await this._press('q'); // Shadow Strike
    await this._show('💥 SKILL: Shadow Strike', 'High damage single target. Telemetry tracks usage frequency.', 2000);
    await this._press('w'); // Rift Slash
    await this._show('🌀 SKILL: Rift Slash', 'AoE cone attack. A/B test compares cooldown variants.', 2000);
    await this._press('e'); // Heal
    await this._show('💚 SKILL: Seed Heal', 'Self-heal. Data pipeline categorizes as RESOURCE_MGMT.', 2000);
    await this._press('q'); // Another attack
    await this._press('w'); // Another attack

    // Wait for combat to play out
    await this._show('⚔️ COMBAT IN PROGRESS', 'Watch the kill counter and gold update. Data flows to all 3 agents.', 5000);

    // ─── PHASE 2: MOVEMENT DATA (generates trajectory for data pipeline) ───
    await this._show('🏃 MOVEMENT DATA', 'Walking to different locations generates trajectory data for the robotics pipeline.', 2000);
    await this._moveTo(12, 8, 4000);
    await this._moveTo(10, 4, 4000);
    await this._moveTo(6, 10, 4000);

    // More combat
    await this._show('⚔️ MORE COMBAT', 'Engaging additional enemies for telemetry data.', 2000);
    await this._press('q');
    await this._press('q');
    await this._press('w');
    await this._press('e');
    await new Promise(r => setTimeout(r, 5000));

    // ─── PHASE 3: TELEMETRY DASHBOARD ───
    await this._show('📡 AGENT: TELEMETRY', 'Opening the Telemetry Agent dashboard. Shows live metrics, skill distribution, anomaly detection.', 3000);
    if (!this.agentPanel.visible) this.agentPanel.toggle();
    this.agentPanel.activeTab = 'telemetry';
    this.agentPanel.render();
    await this._show('📡 TELEMETRY DASHBOARD', 'Real-time: events, kills, deaths, skill usage bars, health score, anomaly alerts, recommendations.', 5000);

    // ─── PHASE 4: A/B TESTING DASHBOARD ───
    await this._show('🔬 AGENT: A/B TESTING', 'Switching to A/B Testing dashboard. Shows variant comparison with live KPIs.', 3000);
    this.agentPanel.activeTab = 'ab';
    this.agentPanel.render();
    await this._show('🔬 A/B DASHBOARD', 'Active test: Shadow Strike Cooldown (3s vs 2s). Your session data feeds Variant A or B. Sample progress and p-value update live.', 5000);

    // ─── PHASE 5: DATA PIPELINE DASHBOARD ───
    await this._show('🤖 AGENT: DATA PIPELINE', 'Switching to Data Cleaning dashboard. Shows trajectory visualization and decision categories.', 3000);
    this.agentPanel.activeTab = 'data';
    this.agentPanel.render();
    await this._show('🤖 DATA DASHBOARD', 'Movement trajectory plotted on grid. Decision categories as bars. CSV/JSON export buttons. Robotics-ready format preview.', 5000);

    // Close panel
    this.agentPanel.toggle();

    // ─── PHASE 6: PROGRESSION ───
    await this._show('📈 SEED RANK SYSTEM', `Current: ${this.progression.rank} Rank, Level ${this.progression.level}. XP from kills, gold from drops. Missions track objectives.`, 4000);

    // ─── PHASE 7: SHOP ───
    await this._show('🏪 IN-GAME SHOP', 'Walking to merchant. Press F to open shop.', 2000);
    await this._moveTo(4, 6, 3000);
    this.shopUI.open();
    await this._show('🛒 SHOP INTERFACE', 'Buy items (potions, rift shards), weapons (5 types with stat mods), sell for gold. All purchases tracked by telemetry.', 4000);
    this.shopUI.close();

    // ─── PHASE 8: SIMULATED IAP ───
    await this._show('💎 SIMULATED IAP', 'Opening Rift Crystal purchase UI. Premium currency packs for demo.', 2000);
    this.purchaseUI.toggle();
    await this._show('💰 PREMIUM PURCHASE', 'Starter ($0.99/100cr), Hunter ($4.99/500cr), Shadow Lord ($9.99/1200cr). All crystal purchases tracked by telemetry agent.', 4000);
    this.purchaseUI.toggle();

    // ─── PHASE 9: SUMMARY ───
    await this._show('✅ DEMO COMPLETE', `Rift SEED captured the run for the Telemetry SDK and Hermes patch agent. ${this.progression.kills} kills, ${this.progression.gold}g earned, Rank ${this.progression.rank}. Evidence is ready.`, 5000);

    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    this.running = false;
  }
}
