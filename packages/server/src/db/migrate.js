// ============================================================
// Schema migration runner — reads schema.sql and applies statements.
// Idempotent because schema.sql uses IF NOT EXISTS everywhere.
// Run via: pnpm --filter server run migrate
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closePool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');

/**
 * Split a SQL file into individual statements.
 * Naive but sufficient for our DDL (no `;` inside string literals or
 * dollar-quoted blocks). If we ever add triggers/functions/DO blocks,
 * replace this with a proper parser (e.g. `pg-query-emscripten`).
 * Splits on `;` + newline, then strips leading `-- ...` comment lines
 * from each chunk before keeping non-empty statements.
 */
function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(chunk =>
      chunk
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter(s => s.length > 0)
    .map(s => s + ';');
}

/**
 * Apply schema.sql — idempotent (CREATE TABLE IF NOT EXISTS everywhere).
 * Callable from server.js at boot; safe to run every time.
 * @param {{ verbose?: boolean }} [opts]
 */
export async function applySchema({ verbose = false } = {}) {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  const statements = splitStatements(sql);
  if (verbose) console.log(`[Migrate] executing ${statements.length} statement(s) from schema.sql`);
  for (const stmt of statements) {
    const label = stmt.replace(/\s+/g, ' ').slice(0, 70);
    try {
      await pool.query(stmt);
      if (verbose) console.log(`  ✓ ${label}${label.length >= 70 ? '...' : ''}`);
    } catch (err) {
      const msg = `${label}\n    ${err.message}`;
      throw new Error(`schema statement failed: ${msg}`);
    }
  }
  console.log('[Migrate] schema applied');
}

// CLI mode — invoked as `node src/db/migrate.js` or via `pnpm --filter server migrate`.
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  applySchema({ verbose: true })
    .catch((err) => { console.error('[Migrate] fatal:', err.message); process.exitCode = 1; })
    .finally(() => closePool('migrate-cli-exit'));
}
