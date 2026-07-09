# RIFT SEED — Production Spec for Hackathon Demo
# Deadline: 4 days. Goal: WIN.

## Current State (what works)
- PixiJS canvas renders isometric tile map (16x16 garden)
- SEED Cadet walks (WASD + click), attacks enemies
- Shadow Beasts + Rift Knight have patrol/chase/attack AI
- Combat: melee hits, damage, crits, death
- Skills: Q/W/E/R with cooldowns and mana
- HUD: HP/MP/XP bars, skill bar
- Server: Express + WebSocket, 3 agent stubs running
- Assets: 263 frames, 15 sprite sheets, manhwa style

## What's MISSING (demo-blocking)

### 1. GAMEPLAY LOOP (Priority: CRITICAL)
- No rift portal interaction (portal exists but does nothing)
- No dungeon instance system (enter rift → fight waves → boss → exit)
- No wave spawning (enemies just sit there)
- No death/respawn flow
- No XP/leveling system
- No SEED rank progression (D→C→B→A→S like FFVIII SEED)
- No mission structure ("Clear Rift Tier 1", "Defeat Rift Knight", etc.)
- No victory/defeat screens

### 2. SHOP & ECONOMY (Priority: HIGH)
- No gold currency system
- No shopkeeper NPC
- No inventory system (items exist as sprites but can't be collected/equipped)
- No equipment system (weapons exist as sprites but don't affect stats)
- No simulated in-app purchase interface (this is a KEY hackathon demo feature)
- Health/Mana potions don't work

### 3. AGENT DEMO SCENARIOS (Priority: CRITICAL — this is what wins)
- Telemetry Agent: No live dashboard showing real-time metrics
- A/B Testing Agent: No side-by-side comparison view
- Data Cleaning Agent: No visualization of trajectory data
- No demo flow that walks judges through each agent's value
- No "play one run, see agents analyze it in real-time" experience

### 4. UI/UX POLISH (Priority: MEDIUM)
- Agent panel (Tab) exists but empty — needs live data
- No minimap rendering
- No damage numbers floating
- No screen shake on hits
- No death animation
- No loading screen
- No title/menu screen

## Subagent Task Assignments

### SUBAGENT 1: Gameplay Systems
Files to create/modify:
- `packages/client/src/systems/riftSystem.js` — Rift portal logic, dungeon instances
- `packages/client/src/systems/waveSpawner.js` — Enemy wave spawning
- `packages/client/src/systems/progression.js` — XP, leveling, SEED rank
- `packages/client/src/systems/missionSystem.js` — Mission tracking
- `packages/client/src/engine/combat.js` — Add death handling, respawn
- `packages/client/src/main.js` — Wire rift system, wave spawner, progression
- `packages/shared/src/config.js` — Add RIFT_WAVES, RANKS, MISSIONS configs

### SUBAGENT 2: Shop, Inventory & Purchase UI
Files to create/modify:
- `packages/client/src/systems/inventorySystem.js` — Inventory management
- `packages/client/src/systems/shopSystem.js` — Shopkeeper, buy/sell
- `packages/client/src/systems/equipmentSystem.js` — Weapon equip, stat mods
- `packages/client/src/systems/purchaseSimulator.js` — IAP mock UI
- `packages/client/src/ui/shopUI.js` — Shop overlay
- `packages/client/src/ui/inventoryUI.js` — Inventory panel
- `packages/client/src/ui/purchaseUI.js` — Premium currency purchase flow
- `packages/shared/src/config.js` — Add ITEMS, SHOP, EQUIPMENT configs

### SUBAGENT 3: Agent Dashboards & Demo Scenarios
Files to create/modify:
- `packages/client/src/ui/agentPanel.js` — Live agent panel with tabs
- `packages/client/src/ui/telemetryDashboard.js` — Telemetry viz
- `packages/client/src/ui/abDashboard.js` — A/B test comparison
- `packages/client/src/ui/dataDashboard.js` — Trajectory visualization
- `packages/client/src/ui/damageNumbers.js` — Floating damage text
- `packages/client/src/ui/screenEffects.js` — Shake, flash, vignette
- `packages/client/src/demo/scenarioRunner.js` — Automated demo scenarios
- `packages/client/src/demo/judgeWalkthrough.js` — Scripted demo flow

## Technical Constraints
- PixiJS v7+ (already installed)
- Vite dev server on port 5173
- Express + WS on port 3001
- All UI overlays are HTML/CSS over the canvas (not PixiJS UI)
- Use the existing riftAssets.js loader for all sprites
- Game events must flow through telemetry/dataLog systems
- A/B overrides must actually change gameplay parameters
- Keep frame rate at 60fps (no heavy particle systems)
