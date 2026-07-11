// ============================================================
// Schema migration runner — reads schema.sql and applies statements.
// Idempotent because schema.sql uses IF NOT EXISTS everywhere.
// Run via: pnpm --filter server run migrate
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

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

async function main() {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  const statements = splitStatements(sql);
  console.log(`[Migrate] executing ${statements.length} statement(s) from schema.sql`);

  for (const stmt of statements) {
    const label = stmt.replace(/\s+/g, ' ').slice(0, 70);
    try {
      await pool.query(stmt);
      console.log(`  ✓ ${label}${label.length >= 70 ? '...' : ''}`);
    } catch (err) {
      console.error(`  ✗ ${label}`);
      console.error(`    ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }

  await pool.end();
  console.log('[Migrate] done');
}

main().catch(err => {
  console.error('[Migrate] fatal:', err);
  process.exit(1);
});
