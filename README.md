# Rift SEED — Telemetry SDK + Hermes Balance Agent

> A hackathon demo showing a complete game-data loop: a reusable telemetry SDK turns raw gameplay into explainable evidence, then a locally installed Hermes agent proposes safe balance patches to improve the player experience and test retention hypotheses.

## The Two-Part Solution

### 1. Gameplay Telemetry SDK

`GameTelemetrySDK` captures a versioned, normalized event envelope without coupling analytics to PixiJS. The current game integration records:

- Weapon damage, grouped by equipped weapon
- Skill damage and usage, grouped by skill
- Damage received, grouped by enemy type
- HP and MP values and deltas over time
- Sampled movement paths, distance, turns, and velocity
- Kills, real player deaths, and per-minute rates
- Sessions, areas, class, patch, and game-version context

The SDK keeps unsent events while offline, caps its local queue, reconnects automatically, and exposes a live local snapshot for the in-game dashboard.

### 2. Hermes Balance Agent

The server aggregates SDK events into compact evidence and invokes the locally installed Hermes CLI in one-shot mode. Hermes returns a JSON patch proposal with rationale, confidence, expected impact, and evidence for each change.

Before a proposal can be applied, the host validates it:

- Only known balance keys are accepted
- Only numeric changes are accepted
- Values are constrained by hard gameplay bounds
- Each change is capped to ±30% of the current value
- Applying a proposal requires a separate explicit action
- Every applied value is written to the adjustment audit log
- Approved values are exposed through `/api/runtime-config` and loaded at the start of the next game session

Hermes proposes a retention hypothesis; it does not claim causality from a single session. Use the existing A/B agent to validate the patch on a follow-up cohort.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start client (Vite dev server on :5173)
pnpm dev

# Start server (Express + WebSocket on :3001)
pnpm dev:server

# Start both concurrently
pnpm dev:all
```

Hermes must be available on `PATH`:

```bash
hermes --version
```

To use a custom binary path, start the server with `HERMES_BIN=/path/to/hermes`.

Open http://localhost:5173 in your browser.

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D | Move (isometric) |
| Click | Move to tile / Attack enemy |
| Q | Shadow Strike (damage skill) |
| E | Rift Slash (AoE skill) |
| R | Seed Heal (restore HP) |
| T | Rift Teleport (movement skill) |
| F | Interact (portal / shop) |
| I | Open shop / inventory |
| Tab | Toggle agent dashboard |
| P | Purchase UI (simulated IAP) |
| Shift+P | Auto-demo mode |

## Project Structure

```
rift-seed/
├── packages/
│   ├── client/                    # PixiJS game client (Vite)
│   │   ├── src/
│   │   │   ├── main.js           # Game entry point, game loop
│   │   │   ├── riftAssets.js     # Sprite sheet loader
│   │   │   ├── input.js          # Keyboard/mouse input handler
│   │   │   ├── engine/
│   │   │   │   ├── isometric.js  # Coordinate system, camera
│   │   │   │   ├── tilemap.js    # Procedural tile renderer
│   │   │   │   ├── ecs.js        # Entity-Component-System
│   │   │   │   ├── combat.js     # Damage calc, skills, hit detection
│   │   │   │   └── pathfinding.js # A* on isometric grid
│   │   │   ├── systems/
│   │   │   │   ├── gameSystems.js    # Movement, sprite sync, enemy AI
│   │   │   │   ├── telemetry.js      # Client-side event tracking
│   │   │   │   ├── ab-testing.js     # Feature flag / cohort system
│   │   │   │   ├── data-logging.js   # Raw event capture
│   │   │   │   ├── progression.js    # XP, levels, SEED rank, gold
│   │   │   │   ├── riftSystem.js     # Portal, dungeon instances, waves
│   │   │   │   └── inventorySystem.js # Items, equipment
│   │   │   ├── ui/
│   │   │   │   ├── titleScreen.js    # Animated title + story intro
│   │   │   │   ├── agentPanel.js     # 3-tab agent dashboard
│   │   │   │   ├── shopUI.js         # Buy/sell/weapons shop
│   │   │   │   ├── purchaseUI.js     # Simulated IAP modal
│   │   │   │   ├── minimap.js        # Terrain-colored minimap
│   │   │   │   ├── screenEffects.js  # Shake, flash, overlays
│   │   │   │   ├── skillVFX.js       # Skill burst effects, damage numbers
│   │   │   │   ├── enemyHealthBars.js # Floating HP bars
│   │   │   │   ├── lighting.js       # Player light source, vignette
│   │   │   │   └── portalEffect.js   # Animated CSS portal
│   │   │   └── demo/
│   │   │       └── scenarioRunner.js # Auto-demo walkthrough
│   │   ├── index.html            # Game HTML (HUD, skill bar, item bar)
│   │   └── vite.config.js
│   │
│   ├── server/                    # Express + WebSocket backend
│   │   ├── src/
│   │   │   ├── server.js         # HTTP + WS server, API routes
│   │   │   └── agents/
│   │   │       ├── telemetry-agent.js    # Patch impact analysis
│   │   │       ├── ab-testing-agent.js   # Statistical significance
│   │   │       └── data-cleaning-agent.js # Robotics CSV export
│   │   └── package.json
│   │
│   └── shared/                    # Shared constants & event schema
│       ├── src/
│       │   ├── events.js         # Event taxonomy (30 types)
│       │   ├── config.js         # Balance params, items, ranks
│       │   └── index.js          # Barrel export
│       └── package.json
│
├── game-assets/                   # Sprite sheets, atlases, scripts
│   ├── sheets/                    # Sprite sheet PNGs
│   │   ├── chibi/                # Anime chibi player (CC0)
│   │   ├── skeleton.png          # Flare RPG enemies (CC-BY 3.0)
│   │   ├── ogre.png
│   │   └── ...
│   ├── atlases/                   # PixiJS Spritesheet JSONs
│   ├── scripts/                   # Asset processing scripts
│   │   ├── riftAssets.js         # (legacy copy, main is in client/src)
│   │   ├── convert_chibi.py      # Chibi sprite → PixiJS atlas
│   │   ├── convert_flare.py      # Flare sprites → PixiJS atlas
│   │   ├── chroma_key.py         # Remove dark backgrounds
│   │   └── brighten_assets.py    # Brighten tile sheets
│   └── README.md                 # Asset documentation
│
├── docs/
│   └── PRODUCTION_SPEC.md        # Detailed game design spec
│
├── AGENTS.md                     # AI agent documentation
├── pnpm-workspace.yaml           # Monorepo workspace config
├── tsconfig.base.json            # Shared TypeScript config
├── package.json                  # Root package with scripts
└── .gitignore
```

## Architecture

### Monorepo (pnpm workspaces)

Three packages share code through workspace dependencies:

- `@rift-seed/client` — Vite + PixiJS game
- `@rift-seed/server` — Express + WebSocket backend
- `@rift-seed/shared` — Event schema, config, types

### Game Engine

- **Isometric projection**: `tileToScreen(x,y)` converts tile coords to screen coords using 2:1 diamond grid formula
- **ECS**: Minimal entity-component-system for managing game objects
- **A* pathfinding**: Grid-based pathfinding on the isometric tile map
- **Procedural tiles**: PIXI.Graphics diamond shapes with seeded random color variants

### Analytics Agents

1. **Telemetry SDK Aggregator** — Converts normalized events into damage, resource, movement, outcome, and session evidence.

2. **Hermes Balance Agent** — Uses local Hermes to turn that evidence into validated, reviewable patch proposals.

3. **A/B Testing Agent** — Compares two game variants with statistical significance testing (Welch's t-test). Auto-promotes winners.

4. **Data Cleaning Agent** — Transforms raw play logs into robotics-ready CSV. Tracks decision paths, movement trajectories, action sequences.

### Data Flow

```
Game Event → emitEvent() → TelemetrySystem.record()
                         → DataLoggingSystem.record()
                         → WebSocket → Server Agents
                         → Agent Panel (live dashboard)
```

### Patch Proposal API

```bash
# Inspect aggregated evidence
curl http://localhost:3001/api/telemetry

# Optional REST ingestion fallback (the game uses WebSocket batches)
curl -X POST http://localhost:3001/api/telemetry/events \
  -H 'Content-Type: application/json' \
  -d '{"events":[{"schemaVersion":"1.0.0","type":"state:sample","patchId":"v0.1.0","sessionId":"demo","actor":{"type":"player"},"metrics":{"hpAfter":500,"mpAfter":100}}]}'

# Ask local Hermes for a validated proposal
curl -X POST http://localhost:3001/api/agents/hermes/analyze \
  -H 'Content-Type: application/json' \
  -d '{"patchId":"v0.1.0"}'

# Review Hermes status and the latest proposal
curl http://localhost:3001/api/agents/hermes

# Explicitly apply a reviewed proposal
curl -X POST http://localhost:3001/api/patches/PATCH_ID/apply
```

In the game, press `Tab`, open **Telemetry**, play long enough to collect at least 30 events, then use **Generate Patch**. The dashboard shows the exact proposed diff before **Apply** becomes available.

## Sprite Assets

| Source | License | Used For |
|--------|---------|----------|
| Chibi Swordman (sonild) | CC0 | Player character |
| Flare RPG (Clint Bellanger) | CC-BY 3.0 | Enemies (skeleton, ogre, etc.) |
| DENZI | CC-BY-SA 3.0 | Reference tiles |

## Game Design

### Theme
Final Fantasy VIII SEED Garden × Solo Leveling rift/dungeon system. Manhwa/Korean webtoon art style.

### Core Loop
1. Spawn in garden (16x16 isometric map)
2. Fight enemies, earn gold and XP
3. Level up → SEED rank increases (D→C→B→A→S)
4. Enter rift portal → dungeon instance (wave-based)
5. Clear waves → boss fight → rewards
6. Return to garden, buy equipment, repeat

### Progression
- **XP**: From kills (beast: 25xp, knight: 100xp)
- **Levels**: 1→5 with stat bonuses per level
- **SEED Ranks**: D (Cadet) → C (Mercenary) → B (Knight) → A (Elite) → S (Shadow Lord)
- **Gold**: From enemy drops, used at shop
- **Rift Crystals**: Premium currency (simulated IAP)

## Development

### Adding New Enemies
1. Add sprite sheet to `game-assets/sheets/`
2. Run `python3 game-assets/scripts/convert_flare.py` (or create atlas JSON manually)
3. Add entry to `riftAssets.js` SHEETS array
4. Add enemy definition to `packages/shared/src/config.js` ENEMIES
5. Spawn in `packages/client/src/main.js` spawnEnemy()

### Adding New Skills
1. Add skill definition to `packages/shared/src/config.js` SKILLS
2. Add keybinding in `packages/client/src/input.js` skillKeys
3. Add skill slot in `packages/client/index.html` skill-bar
4. Handle in `packages/client/src/engine/combat.js` useSkill()

### Running the Demo
1. Start both servers: `pnpm dev:all`
2. Open http://localhost:5173
3. Press Enter to start
4. Press Shift+P for auto-demo walkthrough
5. Press Tab to toggle agent dashboard
