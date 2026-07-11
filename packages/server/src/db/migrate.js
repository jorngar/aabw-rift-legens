import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from './pool.js';

const filePath = fileURLToPath(import.meta.url);
const schemaPath = join(dirname(filePath), 'schema.sql');

export function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(chunk => chunk
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim())
    .filter(Boolean)
    .map(statement => `${statement};`);
}

export async function runMigrations(queryable = pool) {
  const statements = splitStatements(readFileSync(schemaPath, 'utf8'));
  for (const statement of statements) await queryable.query(statement);
  return statements.length;
}

if (process.argv[1] === filePath) {
  runMigrations()
    .then(count => console.log(`[Postgres] applied ${count} schema statements`))
    .catch(error => {
      console.error('[Postgres] migration failed:', error.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}
