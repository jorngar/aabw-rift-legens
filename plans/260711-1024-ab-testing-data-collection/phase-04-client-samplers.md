---
phase: 4
name: Client Samplers — Defect Detector + Trajectory Sampler
status: pending
priority: P1
depends_on: [2]
blocks: [6]
estimate: 2h
---

# Phase 4 — Client Samplers

## Context Links

- Brainstorm: `plans/reports/brainstorm-260711-1024-ab-testing-data-collection.md`
- Existing telemetry: `packages/client/src/systems/telemetry.js`
- Existing pathfinding: `packages/client/src/engine/pathfinding.js`
- Existing shop UI: `packages/client/src/ui/shopUI.js`

## Overview

Emit the 9 new event types from the client. Two new systems (`defect-detector`, `trajectory-sampler`) + wiring existing systems (shop, combat, main loop) to emit purchase/engagement/error events.

## Key Insights

- Each system stays **under 200 lines** per CLAUDE.md rule.
- Samplers piggyback the existing `emitEvent()` → `telemetry.record()` → WS batch pipeline (2s flush).
- Defect detector = passive observers (no game logic change). Trajectory sampler = timer.
- JS-error dedup at client side (5s cooldown per fingerprint) prevents flood.

## Requirements

**Functional:**
- Trajectory sampler emits `TRAJECTORY_SAMPLE` every 2s while player alive with `{x, y, vx, vy, mapZone}`
- Defect detector emits `PATH_STUCK` after 30s no movement, `PATHFIND_FAIL` on A* null return, `IMPOSSIBLE_STATE` on HP<0 or gold<0, `JS_ERROR` on window.onerror
- Shop UI emits `SHOP_PURCHASE` on successful transaction with `{item_id, price, gold_before, gold_after}`
- Combat emits `ENEMY_ENGAGED` on damage exchange (throttled to once per combat encounter, not per hit)

**Non-functional:**
- Each system <200 lines
- No perf hit — trajectory tick is 0.5Hz, defect detection is passive/event-driven
- Dedup JS errors: fingerprint = `msg||stack.split('\n')[0]`, 5s cooldown

## Architecture

```
packages/client/src/systems/
├── defect-detector.js        # NEW — 4 detectors in one class
├── trajectory-sampler.js     # NEW — setInterval + player pos read
├── telemetry.js              # MODIFY — attach session_id to every event
└── inventorySystem.js        # (existing, not modified)

packages/client/src/ui/
└── shopUI.js                 # MODIFY — emit SHOP_PURCHASE on buy

packages/client/src/engine/
├── combat.js                 # MODIFY — emit ENEMY_ENGAGED once per encounter
└── pathfinding.js            # MODIFY — emit PATHFIND_FAIL on null path
```

## Related Code Files

**Create:**
- `packages/client/src/systems/defect-detector.js`
- `packages/client/src/systems/trajectory-sampler.js`

**Modify:**
- `packages/client/src/systems/telemetry.js` — accept sessionId, attach to every event before send
- `packages/client/src/ui/shopUI.js` — hook purchase transaction to emit event
- `packages/client/src/engine/combat.js` — hook damage exchange
- `packages/client/src/engine/pathfinding.js` — emit event on null return
- `packages/client/src/main.js` — instantiate + start samplers with player entity reference

## Implementation Steps

### 1. `trajectory-sampler.js` (~60 lines)

```js
import { EventType, createEvent } from '@shared/events.js';

export class TrajectorySampler {
  constructor({ player, emitEvent, playerId, intervalMs = 2000 }) {
    this.player = player;
    this.emitEvent = emitEvent;
    this.playerId = playerId;
    this.intervalMs = intervalMs;
    this.prevX = player.x; this.prevY = player.y; this.prevT = performance.now();
    this.timerId = null;
  }
  start(mapZoneRef) { // mapZoneRef = () => 'garden' | 'dungeon'
    this.timerId = setInterval(() => this._sample(mapZoneRef()), this.intervalMs);
  }
  stop() { clearInterval(this.timerId); }
  _sample(zone) {
    if (!this.player.alive) return;
    const now = performance.now();
    const dt = (now - this.prevT) / 1000;
    const vx = (this.player.x - this.prevX) / dt;
    const vy = (this.player.y - this.prevY) / dt;
    this.emitEvent(createEvent(EventType.TRAJECTORY_SAMPLE, this.playerId, {
      x: this.player.x, y: this.player.y, vx, vy, mapZone: zone,
    }));
    this.prevX = this.player.x; this.prevY = this.player.y; this.prevT = now;
  }
}
```

### 2. `defect-detector.js` (~150 lines)

```js
import { EventType, createEvent } from '@shared/events.js';

export class DefectDetector {
  constructor({ player, emitEvent, playerId, stuckMs = 30_000, errorCooldownMs = 5_000 }) {
    this.player = player;
    this.emitEvent = emitEvent;
    this.playerId = playerId;
    this.stuckMs = stuckMs;
    this.errorCooldownMs = errorCooldownMs;
    this._lastMoveAt = performance.now();
    this._lastX = player.x; this._lastY = player.y;
    this._stuckTimer = null;
    this._errorFingerprints = new Map(); // fingerprint -> lastEmittedAt
    this._impossibleReported = new Set();
  }
  start() {
    // Poll movement every 1s
    this._stuckTimer = setInterval(() => this._checkStuck(), 1000);
    // window error hook
    window.addEventListener('error', (ev) => this._onWindowError(ev));
    window.addEventListener('unhandledrejection', (ev) => this._onRejection(ev));
  }
  stop() { clearInterval(this._stuckTimer); /* leave window listeners */ }

  _checkStuck() {
    const dx = Math.abs(this.player.x - this._lastX);
    const dy = Math.abs(this.player.y - this._lastY);
    if (dx > 0.05 || dy > 0.05) {
      this._lastX = this.player.x; this._lastY = this.player.y;
      this._lastMoveAt = performance.now();
    } else if (performance.now() - this._lastMoveAt > this.stuckMs) {
      this.emitEvent(createEvent(EventType.PATH_STUCK, this.playerId, { x: this.player.x, y: this.player.y, durationMs: this.stuckMs }));
      this._lastMoveAt = performance.now(); // don't spam
    }
    // Impossible state
    if (this.player.hp < 0) this._reportOnce('hp_negative', { hp: this.player.hp });
    if (this.player.gold < 0) this._reportOnce('gold_negative', { gold: this.player.gold });
  }

  _reportOnce(key, payload) {
    if (this._impossibleReported.has(key)) return;
    this._impossibleReported.add(key);
    this.emitEvent(createEvent(EventType.IMPOSSIBLE_STATE, this.playerId, { kind: key, ...payload }));
  }

  _onWindowError(ev) {
    const fp = ev.message || ev.error?.stack?.split('\n')[0] || 'unknown';
    if (this._recentlyEmitted(fp)) return;
    this.emitEvent(createEvent(EventType.JS_ERROR, this.playerId, {
      message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno,
      stack: ev.error?.stack?.slice(0, 500),
    }));
  }

  _onRejection(ev) {
    const fp = String(ev.reason?.message || ev.reason || 'unknown-rejection');
    if (this._recentlyEmitted(fp)) return;
    this.emitEvent(createEvent(EventType.JS_ERROR, this.playerId, {
      kind: 'unhandledrejection', message: fp,
    }));
  }

  _recentlyEmitted(fp) {
    const now = performance.now();
    const last = this._errorFingerprints.get(fp);
    if (last && now - last < this.errorCooldownMs) return true;
    this._errorFingerprints.set(fp, now);
    return false;
  }

  reportPathfindFail({ from, to }) {
    this.emitEvent(createEvent(EventType.PATHFIND_FAIL, this.playerId, { from, to }));
  }
}
```

### 3. `pathfinding.js` — emit on null result

Where A* returns `null`, call `defectDetector.reportPathfindFail({from, to})` if a defect-detector instance is exposed. Simplest: accept an optional `onFail` callback in the pathfinding function or read a global handle set at boot.

### 4. `shopUI.js` — emit SHOP_PURCHASE

Find the buy handler. On successful purchase:
```js
emitEvent(createEvent(EventType.SHOP_PURCHASE, playerId, {
  itemId,
  price,
  goldBefore,
  goldAfter,
  x: player.x, y: player.y,
}));
```

### 5. `combat.js` — emit ENEMY_ENGAGED

Add a `Set<enemyId>` per combat-tick tracker so we emit once per encounter, not per hit. On first damage exchange with an enemy:
```js
emitEvent(createEvent(EventType.ENEMY_ENGAGED, playerId, {
  enemyType: enemy.type,
  damageDealt: totalDamageDealt,   // rolling sum for this encounter
  damageTaken: totalDamageTaken,
  killed: enemy.hp <= 0,
  x: enemy.x, y: enemy.y,
}));
```

Simpler alternative: emit once per KILL. Less noisy, still gives combat balance signal.

### 6. `telemetry.js` — session_id attachment

```js
export class TelemetrySystem {
  constructor() {
    this.sessionId = null;
    // ...
  }
  setSessionId(id) { this.sessionId = id; }
  _buildBatch() {
    return this.buffer.map(e => ({ ...e, sessionId: this.sessionId }));
  }
}
```

Server extracts session from WS connection map, so client-attached sessionId is a HINT / redundancy. Server value wins.

### 7. `main.js` — instantiate samplers after session:init

```js
ws.on('session:init', ({ sessionId, variant, patch, mapConfig }) => {
  telemetry.setSessionId(sessionId);
  const zoneRef = () => currentZone; // 'garden' | 'dungeon'
  trajectorySampler = new TrajectorySampler({ player, emitEvent, playerId, intervalMs: 2000 });
  trajectorySampler.start(zoneRef);
  defectDetector = new DefectDetector({ player, emitEvent, playerId });
  defectDetector.start();
});
```

## Todo List

- [ ] Create trajectory-sampler.js
- [ ] Create defect-detector.js
- [ ] Modify telemetry.js to attach sessionId
- [ ] Wire SHOP_PURCHASE in shopUI.js
- [ ] Wire ENEMY_ENGAGED in combat.js (per-kill preferred)
- [ ] Wire PATHFIND_FAIL in pathfinding.js
- [ ] Boot samplers from main.js after session:init
- [ ] Manual test: play → check DB for events of each type

## Success Criteria

1. 30s of play produces ~15 `trajectory_sample` rows in `events` (2s tick) + rows in `trajectories` denormalized table
2. Standing still 30s produces exactly 1 `path_stuck` event (no spam)
3. Force JS error via console → `js_error` row appears; retriggering same error within 5s does NOT re-emit
4. Buy potion in shop → `shop_purchase` row in both `events` and `purchases` tables
5. Kill an enemy → `enemy_engaged` row with `killed=true`
6. Every event in `events` table has non-null `session_id`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Sampler runs before session:init → orphan events | Guard emit with `if (!sessionId) return` at telemetry layer |
| Player entity ref becomes stale on death/respawn | Sampler holds live reference; guard with `player.alive` |
| window.onerror global — pollutes all pages | Not an issue for a single-page game |
| Per-hit engagement events flood DB | Emit only on kill (simpler, sufficient signal) |
| Trajectory sampler while paused (menu, shop open) | Add `pauseRef` similar to zoneRef; skip sample if paused |

## Security Considerations

- Client-attached sessionId not trusted — server uses its own map
- JS stack traces truncated to 500 chars (avoid huge payloads)
- No PII collected

## Next Steps

- Phase 5 wires session:init consumption + map rendering
- Phase 6 processes accumulated trajectories into paths on session end
