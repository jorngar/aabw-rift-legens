// ============================================================
// Rift SEED Load Balancer — weighted routing to variant pools.
//
// Simulates the enterprise pattern where the LB (not the app code)
// picks the A/B variant. Two backend pools each run the same server
// code with SERVER_VARIANT=A or SERVER_VARIANT=B pinned via env.
//
// - HTTP is round-robin (both pools share Postgres, either can serve
//   dashboard reads / snapshot queries).
// - WebSocket upgrades are weighted random per new connection, then
//   sticky for the life of that socket (http-proxy pins the target).
// ============================================================
import http from 'node:http';
import httpProxy from 'http-proxy';

const LB_PORT = Number(process.env.LB_PORT) || 3000;

/** Weight in percent (must sum to 100 for readability, but any positive int works). */
const POOLS = [
  { variant: 'A', target: 'http://localhost:3001', weight: 50 },
  { variant: 'B', target: 'http://localhost:3002', weight: 50 },
];

const proxy = httpProxy.createProxyServer({ changeOrigin: true, ws: true });

proxy.on('error', (err, _req, res) => {
  console.error(`[LB] proxy error:`, err.message);
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(502);
    res.end('bad gateway');
  }
});

/** Weighted-random pick over POOLS. */
function pickPool() {
  const total = POOLS.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of POOLS) { r -= p.weight; if (r <= 0) return p; }
  return POOLS[POOLS.length - 1];
}

// Round-robin cursor for HTTP requests (both pools serve identical data).
let httpCursor = 0;

const server = http.createServer((req, res) => {
  const pool = POOLS[httpCursor++ % POOLS.length];
  proxy.web(req, res, { target: pool.target });
});

server.on('upgrade', (req, socket, head) => {
  const pool = pickPool();
  const playerId = new URL(req.url, 'ws://x').searchParams.get('playerId') || '?';
  console.log(`[LB] ws upgrade → pool=${pool.variant} (player=${playerId})`);
  proxy.ws(req, socket, head, { target: pool.target });
});

server.listen(LB_PORT, () => {
  console.log(`[LB] listening on :${LB_PORT}`);
  for (const p of POOLS) {
    console.log(`[LB]   pool ${p.variant} weight=${p.weight}% → ${p.target}`);
  }
});
