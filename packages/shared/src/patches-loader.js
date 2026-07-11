// ============================================================
// PATCHES loader — directory scan replacement for a hardcoded
// Object.freeze({...}) map. Dropping a new maps/patch-vN/index.js
// folder auto-registers it; no source-file edits required.
// ============================================================
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePatch } from './patch.js';

const MAPS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'maps');

async function loadPatches() {
  const dirs = readdirSync(MAPS_DIR).filter((d) => /^patch-v\d+$/.test(d));
  const out = {};
  for (const dir of dirs.sort()) {
    const mod = await import(`./maps/${dir}/index.js`);
    validatePatch(mod.default);
    out[mod.default.id] = mod.default;
  }
  return Object.freeze(out);
}

export const PATCHES = await loadPatches();
