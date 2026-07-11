# Telemetry SDK + Hermes Patch Pipeline

<plan>
  <task id="1" type="auto">
    <name>Build normalized gameplay telemetry SDK</name>
    <files>packages/shared/src/events.js packages/client/src/systems/telemetry.js packages/client/src/engine/combat.js packages/client/src/main.js packages/client/src/systems/inventorySystem.js</files>
    <action>Capture attributed weapon, skill, and enemy damage; HP/MP time series and deltas; sampled player paths; kills and player deaths; sessions and context. Preserve the existing TelemetrySystem API while exposing a reusable SDK contract.</action>
    <verify>Node tests assert normalized counters, attribution, resource series, rates, and path metrics.</verify>
    <done>The browser emits comprehensible versioned events and exposes a complete live snapshot.</done>
  </task>
  <task id="2" type="auto" depends="1">
    <name>Integrate safe local Hermes balance agent</name>
    <files>packages/server/src/agents/telemetry-agent.js packages/server/src/agents/hermes-balance-agent.js packages/server/src/server.js packages/server/test/hermes-balance-agent.test.js</files>
    <action>Aggregate SDK evidence, invoke local `hermes -z`, parse strict JSON, validate patch keys and bounded numeric values, store proposals, and require an explicit API call before applying changes.</action>
    <verify>Node tests cover valid output, fenced JSON, invalid keys, clamping, failure states, and proposal application.</verify>
    <done>POST analysis returns a validated patch proposal and applying it is an explicit auditable action.</done>
  </task>
  <task id="3" type="auto" depends="1,2">
    <name>Expose the SDK-to-patch story in the demo</name>
    <files>packages/client/src/ui/agentPanel.js README.md .impeccable.md</files>
    <action>Show live damage attribution, HP/MP and path metrics, Hermes status, evidence, proposed diffs, analyze/apply controls, and document setup and API usage. Preserve existing tabs.</action>
    <verify>Production build succeeds; browser/API smoke test completes the telemetry → proposal → apply flow.</verify>
    <done>A judge can understand and demonstrate both halves of the solution without reading source code.</done>
  </task>
</plan>
