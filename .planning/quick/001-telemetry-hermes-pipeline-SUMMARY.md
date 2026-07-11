# Telemetry SDK + Hermes Patch Pipeline — Summary

## Delivered

- Versioned `GameTelemetrySDK` with attributed weapon/skill/enemy damage, HP/MP deltas and samples, path metrics, kills, player deaths, session context, offline buffering, and WebSocket reconnect.
- Correct combat instrumentation and distinct kill/death semantics.
- Server-side evidence aggregation plus REST ingestion fallback.
- Local Hermes one-shot integration with strict JSON parsing, allowlisted keys, hard bounds, ±30% host limit, proposal history, and explicit audited apply.
- Runtime config publishing so applied patches affect the next game session.
- In-game Telemetry → Hermes dashboard and updated two-part demo messaging.
- Node test suites for SDK aggregation, Hermes validation, integer edge cases, error handling, and application idempotency.

## Notes

- Hermes proposals are retention hypotheses. The A/B workflow remains the validation step.
- A full brand redesign was not performed because the frontend-design workflow requires creator-provided brand personality and references. Functional UI follows the existing project language.
