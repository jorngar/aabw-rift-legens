import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://rift:rift_dev_only@localhost:5432/rift_seed';

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => {
  console.error('[Postgres] pool error:', error.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function verifyConnection() {
  const { rows } = await pool.query('SELECT NOW() AS now');
  return rows[0].now;
}

let closed = false;
export async function closePool() {
  if (closed) return;
  closed = true;
  await pool.end();
}
