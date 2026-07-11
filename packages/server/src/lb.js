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
// - GET/POST /api/lb/weights lets the ab-testing skill (or a human)
//   shift traffic live; handled locally, never proxied.
// ============================================================
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import httpProxy from 'http-proxy';

// Railway injects $PORT for public services. Local dev uses LB_PORT=3000.
const LB_PORT = Number(process.env.LB_PORT || process.env.PORT) || 3000;

/** Weight in percent (must sum to 100 for readability, but any positive int works). */
const POOLS = [
  { variant: 'A', target: process.env.POOL_A_URL || 'http://localhost:3001', weight: 50 },
  { variant: 'B', target: process.env.POOL_B_URL || 'http://localhost:3002', weight: 50 },
];

// In-memory only — resets to {A:50, B:50} on LB restart. Documented behaviour v1.
let lastChangeAt = null;
let lastChangeOrigin = null;

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

const app = express();
// CORS lets the deployed client (on a different Railway domain) reach the
// LB API. `origin: true` reflects the request Origin header — safe because
// there is no cookie-based auth. Pin to CLIENT_ORIGIN in production if desired.
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json());

// Read current weights + last-change telemetry (skill verifies propagation,
// dashboard header polls this to show live LB state).
app.get('/api/lb/weights', (_req, res) => {
  res.json({
    A: POOLS[0].weight,
    B: POOLS[1].weight,
    lastChangeAt,
    lastChangeOrigin,
  });
});

app.post('/api/lb/weights', (req, res) => {
  const { A, B } = req.body || {};
  const bad =
    ![A, B].every(Number.isFinite) ||
    [A, B].some((n) => n < 0 || n > 100) ||
    A + B !== 100;
  if (bad) return res.status(400).json({ error: 'A and B must be integers 0-100 summing to 100' });

  const before = { A: POOLS[0].weight, B: POOLS[1].weight };
  POOLS[0].weight = A; // POOLS[0] is variant A by construction
  POOLS[1].weight = B;
  const stamp = new Date().toISOString();
  lastChangeAt = stamp;
  lastChangeOrigin = req.get('user-agent') || req.ip || 'unknown';
  console.log(`[LB] ${stamp} weights ${before.A}/${before.B} → ${A}/${B} · via ${lastChangeOrigin}`);
  res.json({ ok: true, weights: { A, B }, at: stamp });
});

// Round-robin cursor for HTTP requests (both pools serve identical data).
let httpCursor = 0;

// Fallthrough: everything else (game HTTP, dashboard fetches, other /api/*)
// proxies to a pool. Registered AFTER /api/lb/* so weight routes stay local.
app.use((req, res) => {
  const pool = POOLS[httpCursor++ % POOLS.length];
  proxy.web(req, res, { target: pool.target });
});

const httpServer = http.createServer(app);

httpServer.on('upgrade', (req, socket, head) => {
  const pool = pickPool();
  // Use a scheme that matches whatever protocol the request came in on.
  // Locally that's ws://; on Railway public WSS terminates at the edge.
  const playerId = new URL(req.url, `ws://x`).searchParams.get('playerId') || '?';
  console.log(`[LB] ws upgrade → pool=${pool.variant} (player=${playerId})`);
  proxy.ws(req, socket, head, { target: pool.target });
});

httpServer.listen(LB_PORT, () => {
  console.log(`[LB] listening on :${LB_PORT}`);
  for (const p of POOLS) {
    console.log(`[LB]   pool ${p.variant} weight=${p.weight}% → ${p.target}`);
  }
});
