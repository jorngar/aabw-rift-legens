# Rift SEED — AI Agents Documentation

## Overview

Rift SEED demonstrates three AI-powered game analytics agents that process live gameplay data and provide actionable insights. Each agent runs server-side (Express + WebSocket) with client-side collection systems.

## Agent 1: Telemetry Agent

### Purpose
Measures patch impact on live-service games. Proposes buffs, nerfs, and bug fixes based on real-time gameplay data.

### How It Works
1. **Event Ingestion**: Client emits game events (kills, deaths, skill usage, session duration) via WebSocket
2. **Aggregation**: Events are grouped by patch ID and compared against baselines
3. **Anomaly Detection**: Flags when metrics deviate beyond threshold (e.g., death rate spike after a patch)
4. **Recommendation Engine**: Generates actionable outputs with confidence scores

### Tracked Metrics
- Total events processed
- Death count and death rate
- Skill usage distribution (per skill)
- Damage dealt / damage taken
- Session duration
- Item purchases
- Area transitions

### Output Format
```json
{
  "patch_id": "v0.1.0",
  "findings": [
    {
      "metric": "skill_shadow_strike_usage",
      "change": "+340%",
      "recommendation": "NERF: reduce base damage 210→175",
      "confidence": 0.87
    }
  ],
  "overall_health_score": 72
}
```

### Dashboard Features
- Real-time event counter
- Skill usage bar chart (4 skills)
- Anomaly alerts with severity levels
- Agent recommendations (NERF/BUFF/HEALTH/ENGAGE)
- Patch health score (0-100)

### API Endpoints
- `GET /api/telemetry` — Current snapshot
- `GET /api/agents/status` — Agent health

---

## Agent 2: A/B Testing Agent

### Purpose
Deploys dual versions of game changes, measures player reactions, and statistically promotes the winning variant.

### How It Works
1. **Cohort Assignment**: Hash player ID to deterministic bucket (A or B)
2. **KPI Tracking**: Track session length, death count, skill usage, completion rate per variant
3. **Statistical Significance**: Welch's t-test on primary KPI
4. **Promotion Decision**: When p < 0.05, auto-promote winning variant

### Active Tests
| Test | Param | Variant A | Variant B | Primary KPI |
|------|-------|-----------|-----------|-------------|
| Shadow Strike Cooldown | `skills.shadowStrike.cooldownMs` | 3000ms | 2000ms | Session Duration |
| Enemy Density | `dungeon.enemyCount` | 5 enemies | 8 enemies | Completion Rate |

### Output Format
```json
{
  "test_name": "shadow_strike_cooldown",
  "variant_a": { "cooldown": 3, "avg_session_min": 12.3, "retention": 0.68 },
  "variant_b": { "cooldown": 2, "avg_session_min": 18.7, "retention": 0.81 },
  "winner": "B",
  "p_value": 0.003,
  "recommendation": "PROMOTE variant B to all players"
}
```

### Dashboard Features
- Variant A vs B comparison cards
- Sample progress bar (current/required)
- p-value display with significance threshold
- Winner declaration with confetti animation
- KPI comparison table (4 metrics)

### API Endpoints
- `GET /api/ab-tests` — All test results
- `POST /api/ab-tests/:id/assign` — Assign player to cohort

---

## Agent 3: Data Cleaning Agent (Robotics Pipeline)

### Purpose
Transforms raw gameplay logs into structured, robotics-ready data for behavioral cloning and spatial trajectory analysis.

### How It Works
1. **Log Parsing**: Extract structured events from raw telemetry
2. **Path Smoothing**: Convert pixel-level movement to waypoint sequences with velocity vectors
3. **Decision Categorization**: Classify actions (navigate, engage, retreat, use-item, explore)
4. **Format Transformation**: Output as robotics-compatible CSV

### Decision Categories
| Category | Trigger | Description |
|----------|---------|-------------|
| NAVIGATE | move:start | Moving toward destination |
| COMBAT | attack:hit, skill:use | In combat |
| COMBAT_INITIATION | combat after navigate | Starting a fight |
| RETREAT | navigate after combat | Running away |
| RESOURCE_MGMT | item:use | Using consumables |
| EXPLORATION | area:enter | Entering new area |
| ELIMINATED | death | Player died |
| DEFEND | damage:taken | Taking damage |

### Output Format (Robotics CSV)
```
timestamp,entity_id,pos_x,pos_y,vel_x,vel_y,action,target_id,context
1689345600,P1,12.4,8.7,1.2,0.3,MOVE,,PATH_A
1689345601,P1,13.1,8.9,1.5,0.2,ATTACK,MOB_23,COMBAT
1689345602,P1,13.1,8.9,0.0,0.0,USE_ITEM,POTION_1,HEALTH_LOW
```

### Why This Matters for Robotics
A humanoid robot observing a human playing this game could learn:
- Spatial navigation patterns
- Threat-response decision-making
- Resource management strategies
- Path planning in constrained environments

### Dashboard Features
- Trajectory visualization (dots on grid showing movement path)
- Decision category distribution (bar chart)
- CSV/JSON export buttons (triggers browser download)
- Robotics CSV preview (last 10 events)
- Live event stream (last 25 events)

### API Endpoints
- `GET /api/data-export?format=csv` — Download CSV
- `GET /api/data-export?format=json` — Download JSON

---

## Client-Side Collection

### TelemetrySystem (`packages/client/src/infrastructure/analytics/telemetry.js`)
- Buffers events locally (2s flush interval)
- Maintains per-metric counters
- Connects to server via WebSocket
- Falls back to local-only if server unavailable

### ABTestingSystem (`packages/client/src/infrastructure/analytics/ab-testing.js`)
- Deterministic cohort assignment (hash player ID + test ID)
- Overrides game config values based on assigned variant
- Records exposure events

### DataLoggingSystem (`packages/client/src/infrastructure/analytics/data-logging.js`)
- Captures all game events with spatial data
- Infers decision context from event sequences
- Exports CSV and JSON locally

### Event Flow
```
Player Action
  → createEvent(type, playerId, payload)
  → emitEvent(event)
  → telemetry.record(event)    // counters + buffer
  → dataLog.record(event)      // spatial data + context
  → WebSocket → Server Agents  // batched every 2s
  → Agent Panel render()       // live dashboard update
```

---

## Running the Agents

```bash
# Start server only
pnpm dev:server

# Server starts on http://localhost:3001
# WebSocket on ws://localhost:3001/ws

# API endpoints:
curl http://localhost:3001/api/health
curl http://localhost:3001/api/telemetry
curl http://localhost:3001/api/ab-tests
curl http://localhost:3001/api/data-export?format=csv
```

## Adding New Metrics

1. Add event type to `packages/shared/src/events.js` EventType enum
2. Emit event from game code: `emitEvent(createEvent(EventType.NEW_TYPE, playerId, payload))`
3. Handle in agent: add case to `_updateBaseline()` or `recordEvent()`
4. Display in dashboard: add to `_renderTelemetry()` or `_renderAB()`
