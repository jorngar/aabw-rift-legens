# Rift SEED — 2.5D Isometric Action RPG Hackathon Demo

## Architecture
- **Monorepo**: pnpm workspaces
- **Client**: Vite + PixiJS v7+ in `packages/client/`
- **Server**: Express + WebSocket in `packages/server/`
- **Shared**: Events + config in `packages/shared/`
- **Assets**: Pre-generated sprite sheets in `game-assets/`

## Key Files
- `packages/client/src/main.js` — Game entry point
- `packages/client/src/engine/isometric.js` — Coordinate math + camera
- `packages/client/src/engine/combat.js` — Damage, skills, hit detection
- `packages/client/src/engine/pathfinding.js` — A* on iso grid
- `packages/client/src/systems/` — Telemetry, A/B testing, data logging
- `packages/server/src/agents/` — Three AI agents
- `packages/shared/src/events.js` — Event taxonomy (the contract)
- `packages/shared/src/config.js` — Balance params, A/B test defs

## Running
```bash
pnpm dev          # Client on port 5173
pnpm dev:server   # Server on port 3001
pnpm dev:all      # Both concurrently
```

## Game Controls
- WASD: Move
- Click: Move/Attack
- Q: Shadow Strike
- W: Rift Slash
- E: Seed Heal
- R: Rift Teleport
- Tab: Toggle agent panel

## Three AI Agents
1. **Telemetry Agent**: Measures patch impact, detects anomalies, recommends balance changes
2. **A/B Testing Agent**: Dual-variant testing with Welch's t-test, auto-promotes winners
3. **Data Cleaning Agent**: Transforms game logs into robotics-ready CSV (behavioral cloning)

## Style
- Manhwa/Korean webtoon art style
- Dark theme: #0a0612 bg, #e8ff47 accent
- SEED Garden x Solo Leveling aesthetic
