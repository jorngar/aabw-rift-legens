// ============================================================
// One-shot patch seeder — copies PATCHES from shared into the
// Postgres `patches` table if it is empty.
// ============================================================
import { PATCHES } from '@rift-seed/shared';
import { insertPatch, countPatches } from './db/repositories.js';

export async function seedPatches() {
  const n = await countPatches();
  if (n > 0) {
    console.log(`[Seed] patches table has ${n} row(s), skipping`);
    return;
  }
  for (const [key, patch] of Object.entries(PATCHES)) {
    const id = await insertPatch({
      name: patch.name,
      description: patch.description || null,
      variantA: patch.variantA,
      variantB: patch.variantB,
    });
    console.log(`[Seed] inserted patch ${key} → id=${id}`);
  }
}
