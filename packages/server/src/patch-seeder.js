// ============================================================
// Patch seeder — copies PATCHES from shared into the Postgres
// `patches` table. Upserts by name so a shape change in the shared
// map JSON is picked up on server restart without dropping FK
// dependents (sessions, assignments, etc.).
// ============================================================
import { PATCHES } from '@rift-seed/shared';
import { pool } from './db/pool.js';
import { insertPatch } from './db/repositories.js';

export async function seedPatches() {
  const { rows: existing } = await pool.query('SELECT id, name FROM patches');
  const byName = new Map(existing.map(r => [r.name, r.id]));

  for (const [key, patch] of Object.entries(PATCHES)) {
    const existingId = byName.get(patch.name);
    if (existingId) {
      await pool.query(
        `UPDATE patches
            SET variant_a  = $1::jsonb,
                variant_b  = $2::jsonb,
                description = $3
          WHERE id = $4`,
        [
          JSON.stringify(patch.variantA),
          JSON.stringify(patch.variantB),
          patch.description || null,
          existingId,
        ]
      );
      console.log(`[Seed] refreshed patch ${key} → id=${existingId}`);
    } else {
      const id = await insertPatch({
        name: patch.name,
        description: patch.description || null,
        variantA: patch.variantA,
        variantB: patch.variantB,
      });
      console.log(`[Seed] inserted patch ${key} → id=${id}`);
    }
  }
}
