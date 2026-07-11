# Telemetry SDK + Hermes Patch Pipeline — UAT

## Automated

- PASS — `pnpm test`: client and server suites pass.
- PASS — `pnpm build`: shared syntax checks and Vite production build pass.
- PASS — `git diff --check`: no whitespace errors.

## Integration

- PASS — Local server reports Telemetry SDK and Hermes agent ready.
- PASS — REST smoke batch accepted 3 normalized events.
- PASS — Evidence attributed 30 weapon damage to `seed_blade`, 1 kill, and 0 player deaths.
- PASS — Real installed Hermes CLI returned a parsed, validated patch proposal.
- PASS — Integer rounding regression prevents changes from crossing the ±30% limit.
- PASS — Approved balance values map to the client runtime config shape.

## Browser

- PASS — Game starts and class selection completes.
- PASS — Telemetry WebSocket connects and server event count advances.
- PASS — Dashboard displays schema/patch, attributed damage, enemy source, HP/MP, path, sample readiness, and Generate Patch.
- PASS — Browser-to-server endpoint behind Generate Patch was verified independently with the real Hermes runtime.
- INFO — Existing PixiJS texture-cache warnings remain; no new runtime errors were introduced.
