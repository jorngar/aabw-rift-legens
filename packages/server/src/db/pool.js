// ============================================================
// Postgres connection pool + graceful-shutdown handlers.
// Reads DATABASE_URL from env; falls back to docker-compose defaults.
// ============================================================
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://rift:rift_dev_only@localhost:5432/rift_seed';

// Railway / most managed Postgres providers require SSL. Local Docker
// does not have certs. Detect by hostname — anything that isn't
// localhost / 127.x / *.internal (private DNS) needs SSL.
function needsSsl(url) {
  try {
    const host = new URL(url).hostname;
    return !(
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    );
  } catch { return false; }
}

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  ssl: needsSsl(DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[DB] pool error:', err.message);
});

/** Convenience wrapper — same signature as pg.Pool.query. */
export function query(text, params) {
  return pool.query(text, params);
}

/** Mask password before logging the connection string. */
function maskUrl(url) {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

/** Log a SELECT NOW() round-trip to prove the pool is reachable. */
export async function verifyConnection() {
  const { rows } = await pool.query('SELECT NOW() as now');
  console.log(`[DB] connected to ${maskUrl(DATABASE_URL)} — server time ${rows[0].now.toISOString()}`);
}

// Close the pool on process exit. We do NOT call process.exit here so the
// owning app (server.js / migrate.js) keeps control over its shutdown flow.
let poolClosed = false;
export async function closePool(reason) {
  if (poolClosed) return;
  poolClosed = true;
  console.log(`[DB] closing pool (${reason})`);
  try { await pool.end(); } catch (err) { console.error('[DB] pool.end failed:', err.message); }
}
process.once('SIGTERM', () => closePool('SIGTERM'));
process.once('SIGINT',  () => closePool('SIGINT'));
process.once('beforeExit', () => closePool('beforeExit'));
