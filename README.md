# Rift SEED — 2.5D Isometric Action RPG

> SEED Garden x Solo Leveling — A hackathon demo showcasing three AI-powered game analytics agents built on PixiJS.

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

### Three AI Agents

1. **Telemetry Agent** — Tracks game events (kills, deaths, skill usage, session duration). Detects anomalies and recommends balance changes (nerfs/buffs).

2. **A/B Testing Agent** — Compares two game variants with statistical significance testing (Welch's t-test). Auto-promotes winners.

3. **Data Cleaning Agent** — Transforms raw play logs into robotics-ready CSV. Tracks decision paths, movement trajectories, action sequences.

### Data Flow

```
Game Event → emitEvent() → TelemetrySystem.record()
                         → DataLoggingSystem.record()
                         → WebSocket → Server Agents
                         → Agent Panel (live dashboard)
```

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
