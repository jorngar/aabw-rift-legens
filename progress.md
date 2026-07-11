Original prompt: okay now we need to focus on fixing the game for the demo, we have a base but the graphical assets are a mess, the animation loop plays even when the characters are stationery, the attack animations are not there, let's focus on make the game play and the visuals as best as we can, maybe search for more assets if needed , also add a .gitignore for some reason it got remote

## Current focus

- Audit sprite sheets and atlas frame ranges.
- Add explicit idle / move / attack animation states.
- Improve combat readability and demo presentation.
- Add deterministic game-state hooks for browser testing.
- Expand `.gitignore` and remove tracked generated artifacts where appropriate.

## Notes

- Existing asset pack already includes dedicated chibi idle, walk, run, and attack sheets plus multiple Flare character/enemy sheets.
- Do not source new assets until the local atlases are visually audited.

## Completed

- Audited contact sheet and individual sprite sheets. The dedicated chibi idle/walk/attack sheets are the only consistent high-resolution player sequence; the AI-generated SEED sheets vary in character, scale, and direction and are unsuitable as a frame animation.
- Added an explicit animation state machine. Stationary entities now hold a single idle frame; movement loops only while moving; attacks play once; enemies use hit/death poses.
- Wired attack animations and hit reactions for player basic attacks, skills, and enemy attacks.
- Centralized enemy defeat handling so melee and skill kills share rewards, death animation, and delayed cleanup.
- Remapped Shadow Beasts to the werewolf sheet and Rift Knights to the armored heavy sheet; darkened the garden palette for better silhouette contrast.
- Added `render_game_to_text`, deterministic stepping, and `?autostart=warrior` for repeatable game tests.
- Enabled readable WebGL screenshots and removed the favicon console error.
- Added four animation state regression tests. Full test suite and production build pass.
- Expanded `.gitignore` for nested dependencies, builds, Playwright output, secrets, and generated server data.

## Visual verification

- `output/web-game-pass3/shot-0.png` was inspected: protagonist, Shadow Beasts, Rift Knight, terrain, and rift area are visible and visually coherent.
- Final state reported `player.animation="idle"` and `moving=false` after a movement burst; no console errors were emitted.

## Session 2026-07-11 — Hermes tab, dashboard URL, persistence

- Verified the full in-game telemetry tab → Hermes → APPLY loop in a real browser (Playwright): proposal generated in ~45s, rendered in the tab, deployed to live balance.
- Hardened the flow: Hermes CLI timeout raised 90s → 240s (`HERMES_TIMEOUT_MS` overrides), the 2.5s server poll no longer clobbers in-flight analyzing state, 409 "already running" now waits instead of erroring, and the tab shows elapsed seconds while the local model thinks.
- Telemetry web dashboard page (not just API): **http://localhost:3001/dashboard/** — tab 1 patch implementation, tab 2 recommendations & analytics. Fixed the empty "Match Volume by Class" chart.
- Match history was never recorded (nothing called POST /api/matches) so dashboard analytics were empty. The client now upserts a per-session match row every 30s, on defeat, and on page unload (sendBeacon; server accepts text/plain).
- Persistence confirmed: balance values, deployed patch history (telemetry_adjustments), and match history live in sql.js SQLite persisted to `packages/server/data/game.json` (auto-save every 10s when dirty + on shutdown + on patch apply/match record). In-memory only: raw telemetry event stream/baselines, Hermes proposal list (until applied), A/B state, data-cleaning logs.
- All 17 unit tests pass (8 client + 9 server).
- Note: the database currently contains this session's test data — 2 applied test patches (shadow_strike.cooldown 3000→2500, rift_knight.damage 8→7, from earlier runs also shadow_beast.hp etc. proposed but not applied) and 3 test match rows. To reset: stop the server and delete `packages/server/data/game.json`.

## Remaining TODO

- The new `gitignore added` commit removed the 6,141 tracked `node_modules` files. One ignored runtime file is still tracked: `packages/server/data/game.json`. The safe index-only cleanup could not run because the environment approval quota was exhausted. Run `git rm --cached packages/server/data/game.json`, then commit that deletion; the local file will remain.
- A second immediate movement-frame capture was blocked by the same approval quota; animation state transitions are covered by unit tests.

## Session 2026-07-11 — Video intro and free animation pack

- Replaced the timed text title sequence with `riftseed_intro.mp4` as the full-screen intro visual. The video is muted, looping, inline, uses `intro-video.png` as its poster/fallback, and preserves Enter-to-start; clicking the screen now starts the game too.
- Kept the intro resilient: video playback cannot intercept input, autoplay rejection still leaves the complete poster visible, focus is keyboard-visible, and the video/styles are cleaned up before class selection.
- Added direct 96x96 strip slicing to the Pixi asset loader for the Free Characters Animations Asset Pack, avoiding generated atlas files.
- Warrior now uses the pack's dedicated idle, walk, attack, hurt, and death strips. Other classes retain the existing chibi profile so mage/rogue/ranger are not shown with a sword and shield.
- The stable `shadowBeast` telemetry ID is now presented as a Rift Slime and uses the pack's full slime animation family, including real walk, attack, hurt, and death sequences. Rift Knights retain the armored heavy sprite.
- Hurt strips now play once rather than freezing on their first frame, and enemy cleanup waits long enough for the new death animation to read.
- Ignored the redundant source zip while keeping the extracted, licensed runtime assets in the project.
- Real-browser verification captured both sides of combat at once: the warrior reported `animation="attack"` while its target reported `animation="hit"`, then both returned to non-attacking movement/idle states with no console error file emitted.
- Final intro capture: `packages/client/output/video-pack-intro-final.png`. Browser state reported the MP4 playing at readyState 4, muted, with no console errors; Enter removed the title and revealed class selection.
- Final gameplay captures: `output/video-pack-gameplay-final/shot-0.png` (soldier attack + slime hit) and `shot-1.png` (released attack lock / idle). All 19 client+server tests pass and the production build succeeds.

## Session 2026-07-11 — Pre-push architecture refactor

- Replaced the root `game-assets` catch-all with two explicit boundaries: `packages/client/public/assets` contains only runtime media, while `tools/asset-pipeline` owns source art, generated libraries, previews, converters, and vendor archives.
- Vite now uses its package-local `public` directory. The Pixi loader references a stable `/assets/...` namespace and registers only the five atlas sheets and ten animation strips the current game actually uses.
- Reorganized client code into layered responsibilities: `game/core` (model), `game/controllers` + `game/systems` (controllers), `presentation` (views), `infrastructure` (asset/analytics adapters), and `app/demo` (orchestration).
- Normalized moved modules to kebab-case and replaced the bundler-only `@shared` alias with the real `@rift-seed/shared` workspace package.
- Moved the server's static telemetry site to `packages/server/public/dashboard` and updated its Express path.
- Added `docs/ARCHITECTURE.md` with dependency direction and asset promotion rules; updated README, AGENTS, production spec, asset-pipeline docs, and ignore paths.
- Intermediate verification: all 10 client tests passed. The first build caught the removed `@shared` alias; imports were migrated to the workspace package and the next client production build passed.
- Repaired every asset-pipeline script that still referenced an absolute path from an older machine; Python tools now derive the pipeline root from `__file__`, and the shell generator derives it from `BASH_SOURCE`.
- Added runtime license/credit documentation. The client public allowlist is 8.6 MB; the 114 MB source workshop is no longer copied by Vite.
- Final verification passed: 19 tests, shared/client build, Python compilation, shell parsing, and `git diff --check`.
- Browser verification passed with no console errors: intro asset HTTP responses succeeded, Enter opened class selection, combat rendered, movement returned to `animation="idle"`, and the relocated server dashboard returned HTTP 200.
- Final browser artifacts: `output/architecture-refactor-intro.png`, `output/architecture-refactor-gameplay/`, `output/architecture-refactor-idle/`, and `output/architecture-refactor-dashboard.png`.
- No commit or push was performed. Before committing, the existing tracked `packages/server/data/game.json` should still be removed from the Git index while kept locally by `.gitignore`.
