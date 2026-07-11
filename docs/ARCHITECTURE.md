# Rift SEED Architecture

Rift SEED uses a layered game architecture rather than a literal web MVC framework. The mapping is still familiar:

- **Model:** shared balance/event contracts plus `client/src/game/core`.
- **Controllers:** input and deterministic gameplay systems under `client/src/game`.
- **Views:** DOM/Pixi presentation code under `client/src/presentation`.
- **Infrastructure:** asset loading and telemetry transports under `client/src/infrastructure`.

## Repository layout

```text
packages/
  client/
    public/assets/              Runtime-ready files copied by Vite
      atlases/
      licenses/
      sprites/
      video/
    src/
      app/demo/                 Demo orchestration
      game/
        core/                   ECS, combat, projection, maps, pathfinding
        controllers/            Keyboard and pointer intent
        systems/                Animation, AI, progression, inventory, rifts
      infrastructure/
        analytics/              Telemetry SDK, A/B client, data logger
        assets/                 Pixi runtime asset adapter
      presentation/             Screens, HUDs, overlays, effects
      main.js                   Composition root and game loop
  server/
    public/dashboard/           Static agent dashboard
    src/                        HTTP/WS APIs, agents, persistence
    test/
  shared/
    src/                        Cross-runtime events and balance contracts
tools/
  asset-pipeline/               Editable/source art, generated library, scripts
docs/
```

## Dependency direction

1. `shared` has no client or server dependency.
2. `game/core` may depend on Pixi and `shared`, but not presentation or transports.
3. `game/controllers` and `game/systems` coordinate core state; they do not render HTML.
4. `presentation` may read game state and call controller/system APIs.
5. `infrastructure` implements boundaries to files, WebSockets, and analytics services.
6. `main.js` is the composition root. It is the only module expected to know every layer.

Use the real `@rift-seed/shared` workspace package for cross-package imports. Do not add bundler-only aliases for shared contracts.

## Asset boundary

`packages/client/public/assets` is a production allowlist. Every file in it is copied to the build and must be referenced by the running game.

`tools/asset-pipeline` is the workshop. It owns source sheets, Aseprite files, conversion scripts, contact sheets, previews, and downloaded references. Nothing there is served by Vite.

To add an asset:

1. Put or generate the source under `tools/asset-pipeline`.
2. Export only the runtime frames/atlas into `packages/client/public/assets`.
3. Register the stable `/assets/...` URL in `infrastructure/assets/rift-asset-loader.js`.
4. Keep the relevant license under `public/assets/licenses`.
5. Run `pnpm test`, `pnpm build`, and the browser game check.

This boundary keeps production output small and prevents editor files or reference packs from leaking into deployments.
