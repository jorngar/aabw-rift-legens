// Shared barrel export — browser-safe only (no node:fs, no top-level await).
// Server code that needs PATCHES imports from '@rift-seed/shared/patches-loader.js'.
export { EventType, createEvent, TELEMETRY_SCHEMA_VERSION } from './events.js';
export {
  TILE, PLAYER_DEFAULTS, ENEMIES, SKILLS, MAP,
  AB_TESTS,
  SERVER, CLIENT,
} from './config.js';
export { TILE_TYPES, parseLayout, validatePatch, hashPlayerToVariant } from './patch.js';
export * as scoring from './scoring.js';
