// ============================================================
// Demo Scenario Runner — P key auto-play walkthrough
// ============================================================

/**
 * Auto-demo mode: scripted sequence of actions that showcases
 * all game features for hackathon judges.
 * 
 * Press P to start. Each step shows an overlay explaining what's happening.
 */
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
    this._step = 0;
    this._overlay = null;
    this._moveInterval = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._step = 0;
    this._runStep();
  }

  stop() {
    this.running = false;
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    if (this._moveInterval) { clearInterval(this._moveInterval); this._moveInterval = null; }
  }

  _showOverlay(title, desc, duration = 3000) {
    if (this._overlay) this._overlay.remove();
    this._overlay = document.createElement('div');
    this._overlay.style.cssText = 'position:fixed;bottom:140px;left:50%;transform:translateX(-50%);background:rgba(10,6,18,0.95);border:2px solid #e8ff47;padding:12px 24px;border-radius:8px;z-index:400;font-family:monospace;text-align:center;pointer-events:none;max-width:500px;';
    this._overlay.innerHTML = `<div style="color:#e8ff47;font-size:16px;font-weight:bold;margin-bottom:6px;">${title}</div><div style="color:#aaa;font-size:12px;">${desc}</div>`;
    document.body.appendChild(this._overlay);
    return new Promise(r => setTimeout(r, duration));
  }

  _moveTo(tx, ty, duration = 3000) {
    return new Promise(resolve => {
      this._moveInterval = setInterval(() => {
        const dx = tx - this.player.pos.x;
        const dy = ty - this.player.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) {
          clearInterval(this._moveInterval);
          this._moveInterval = null;
          resolve();
          return;
        }
        const speed = 0.15;
        this.player.pos.x += (dx / dist) * speed;
        this.player.pos.y += (dy / dist) * speed;
        this.player.isMoving = true;
      }, 16);

      // Timeout safety
      setTimeout(() => {
        if (this._moveInterval) { clearInterval(this._moveInterval); this._moveInterval = null; }
        resolve();
      }, duration);
    });
  }

  async _runStep() {
    const steps = [
      // Step 1: Welcome
      async () => {
        await this._showOverlay('RIFT SEED', 'SEED Garden x Solo Leveling — AI-Powered Game Analytics', 4000);
      },

      // Step 2: Move to enemy
      async () => {
        await this._showOverlay('COMBAT SYSTEM', 'Moving toward Shadow Beast... Auto-attack engages at range.', 2000);
        await this._moveTo(7, 6, 3000);
        await this._showOverlay('AUTO-TARGET', 'Player acquired nearest enemy. Watch the damage numbers!', 3000);
      },

      // Step 3: Use skills
      async () => {
        await this._showOverlay('SKILL SYSTEM', 'Q: Shadow Strike — W: Rift Slash — E: Heal — R: Teleport', 2000);
        // Simulate Q press
        window.dispatchEvent(new KeyboardEvent('keydown', {key:'q', bubbles:true}));
        await new Promise(r => setTimeout(r, 1000));
        window.dispatchEvent(new KeyboardEvent('keydown', {key:'w', bubbles:true}));
        await new Promise(r => setTimeout(r, 1000));
        window.dispatchEvent(new KeyboardEvent('keydown', {key:'e', bubbles:true}));
        await new Promise(r => setTimeout(r, 1000));
      },

      // Step 4: Show progression
      async () => {
        await this._showOverlay('SEED RANK SYSTEM', `Current Rank: ${this.progression.rank} | Level: ${this.progression.level} | Gold: ${this.progression.gold}g`, 3000);
      },

      // Step 5: Show agent panel
      async () => {
        await this._showOverlay('AI AGENT PANEL', 'Tab key opens the live agent dashboard. Three AI agents analyze gameplay in real-time.', 3000);
        if (!this.agentPanel.visible) this.agentPanel.toggle();
        await new Promise(r => setTimeout(r, 3000));
      },

      // Step 6: Telemetry tab
      async () => {
        await this._showOverlay('TELEMETRY AGENT', 'Measures patch impact. Tracks skill usage, death rates, session metrics. Recommends balance changes.', 4000);
      },

      // Step 7: A/B Testing tab
      async () => {
        this.agentPanel.activeTab = 'ab';
        this.agentPanel.render();
        await this._showOverlay('A/B TESTING AGENT', 'Deploys dual variants. Measures KPIs. Auto-promotes winners with statistical significance.', 4000);
      },

      // Step 8: Data Pipeline tab
      async () => {
        this.agentPanel.activeTab = 'data';
        this.agentPanel.render();
        await this._showOverlay('DATA CLEANING AGENT', 'Transforms play logs into robotics-ready CSV. Decision paths, trajectories, action sequences.', 4000);
      },

      // Step 9: Close panel, show shop
      async () => {
        this.agentPanel.toggle();
        await this._showOverlay('IN-GAME SHOP', 'Walk to merchant, press F to shop. Items, weapons, and simulated IAP.', 3000);
        await this._moveTo(4, 6, 3000);
        this.shopUI.open();
        await new Promise(r => setTimeout(r, 3000));
        this.shopUI.close();
      },

      // Step 10: Show purchase UI
      async () => {
        await this._showOverlay('SIMULATED IAP', 'P key opens the Rift Crystal purchase UI. Premium currency packs for the demo.', 3000);
        this.purchaseUI.toggle();
        await new Promise(r => setTimeout(r, 3000));
        this.purchaseUI.toggle();
      },

      // Step 11: End
      async () => {
        await this._showOverlay('DEMO COMPLETE', 'Rift SEED — 2.5D Isometric Action RPG with 3 AI Agents. Built for hackathon.', 4000);
        if (this._overlay) { this._overlay.remove(); this._overlay = null; }
        this.running = false;
      },
    ];

    for (let i = 0; i < steps.length; i++) {
      if (!this.running) break;
      this._step = i;
      await steps[i]();
    }
  }
}
