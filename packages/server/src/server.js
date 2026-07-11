// ============================================================
// Server — Express + WebSocket hub for the three AI agents
// ============================================================
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { CLASS_STATS, ENEMIES, ITEMS, SERVER, SKILLS, WEAPONS } from '@rift-seed/shared/config';
import { TelemetryAgent } from './agents/telemetry-agent.js';
import { ABTestingAgent } from './agents/ab-testing-agent.js';
import { DataCleaningAgent } from './agents/data-cleaning-agent.js';
import { HermesBalanceAgent } from './agents/hermes-balance-agent.js';
import { getBalance, setBalance, getAllBalance, getMatchHistory, getAdjustments, getClasses, getClass, getAggregateStats, getDashboardData, saveDB, recordMatch, initDB } from './database.js';
import { getRuntimeConfig } from './runtime-config.js';
import { closePool, verifyConnection as verifyPostgresConnection } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { getGameplayEventStats, insertGameplayEventBatch, upsertGameCatalog } from './db/repositories.js';

const app = express();
app.use(cors());
app.use(express.json());
// navigator.sendBeacon posts JSON with a text/plain content type on page unload.
app.use(express.text({ type: 'text/plain' }));

// Serve the telemetry agent web dashboard (static files).
const DASHBOARD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'dashboard');
app.use('/dashboard', express.static(DASHBOARD_DIR));
app.get('/dashboard', (req, res) => res.redirect('/dashboard/'));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// ---- Init Agents ----
const telemetryAgent = new TelemetryAgent();
const abAgent = new ABTestingAgent();
const dataAgent = new DataCleaningAgent();
const hermesAgent = new HermesBalanceAgent({ telemetryAgent });
let postgresTelemetryReady = false;

function describeError(error) {
  if (error?.message?.trim()) return error.message;
  if (Array.isArray(error?.errors)) {
    const messages = error.errors.map(item => item?.message).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return String(error || 'unknown error');
}

function persistGameplayEvents(events) {
  if (!postgresTelemetryReady || !events?.length) return;
  insertGameplayEventBatch(events).catch(error => {
    console.error('[Postgres] telemetry insert failed:', describeError(error));
  });
}

// ---- WebSocket Routing ----
const clients = new Map(); // ws -> { type, id }

wss.on('connection', (ws, req) => {
  const url = req.url || '';
  let clientType = 'unknown';
  if (url.includes('telemetry')) clientType = 'telemetry';
  else if (url.includes('data')) clientType = 'data';
  else if (url.includes('dashboard')) clientType = 'dashboard';

  const clientId = `${clientType}_${Date.now()}`;
  clients.set(ws, { type: clientType, id: clientId });
  console.log(`[WS] ${clientType} connected (${clients.size} total)`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleMessage(ws, msg, clientType);
    } catch (e) {
      console.error('[WS] Parse error:', e.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] ${clientType} disconnected (${clients.size} total)`);
  });
});

function handleMessage(ws, msg, clientType) {
  switch (msg.type) {
    case 'telemetry:batch':
      telemetryAgent.ingest(msg.events || []);
      persistGameplayEvents(msg.events || []);
      // Broadcast updated telemetry to dashboard clients
      broadcast('dashboard', {
        type: 'telemetry:update',
        snapshot: telemetryAgent.getSnapshot(),
      });
      break;

    case 'data:batch':
      dataAgent.ingest(msg.events || []);
      broadcast('dashboard', {
        type: 'data:update',
        snapshot: dataAgent.getSnapshot(),
      });
      break;

    case 'ab:request_assignment':
      const assignment = abAgent.assignPlayer(msg.playerId, msg.testId);
      ws.send(JSON.stringify({ type: 'ab:assignment', ...assignment }));
      break;

    case 'ab:record_event':
      abAgent.recordEvent(msg.testId, msg.variant, msg.event);
      broadcast('dashboard', {
        type: 'ab:update',
        snapshot: abAgent.getSnapshot(),
      });
      break;
  }
}

function broadcast(clientType, data) {
  const payload = JSON.stringify(data);
  for (const [ws, info] of clients) {
    if (info.type === clientType && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ---- REST API ----
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', agents: 4, clients: clients.size,
    hermes: hermesAgent.getSnapshot().status,
    postgresTelemetry: postgresTelemetryReady ? 'ready' : 'disabled',
  });
});

app.get('/api/telemetry', (req, res) => {
  res.json(telemetryAgent.getSnapshot());
});

// REST fallback for engines that cannot keep a WebSocket connection open.
app.post('/api/telemetry/events', async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (events.length === 0) return res.status(400).json({ error: 'events must be a non-empty array' });
  if (events.length > 1000) return res.status(413).json({ error: 'batch exceeds the 1000 event limit' });
  try {
    telemetryAgent.ingest(events);
    if (postgresTelemetryReady) await insertGameplayEventBatch(events);
    const snapshot = telemetryAgent.getSnapshot();
    broadcast('dashboard', { type: 'telemetry:update', snapshot });
    res.status(202).json({ accepted: events.length, totalEvents: snapshot.totalEvents });
  } catch (error) {
    res.status(502).json({ error: 'telemetry persistence failed', detail: error.message });
  }
});

app.get('/api/telemetry/storage', async (_req, res) => {
  if (!postgresTelemetryReady) return res.status(503).json({ status: 'disabled' });
  try {
    res.json({ status: 'ready', ...(await getGameplayEventStats()) });
  } catch (error) {
    res.status(502).json({ status: 'error', error: error.message });
  }
});

app.get('/api/ab-tests', (req, res) => {
  res.json(abAgent.getSnapshot());
});

app.get('/api/data-export', (req, res) => {
  const format = req.query.format || 'json';
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=data-export.csv');
    res.send(dataAgent.exportCSV());
  } else {
    res.json(dataAgent.exportJSON());
  }
});

app.get('/api/agents/status', (req, res) => {
  res.json({
    telemetry: telemetryAgent.getStatus(),
    hermes: hermesAgent.getStatus(),
    abTesting: abAgent.getStatus(),
    dataCleaning: dataAgent.getStatus(),
  });
});

// ---- Hermes patch proposal API ----
app.get('/api/agents/hermes', (req, res) => {
  res.json(hermesAgent.getSnapshot());
});

app.post('/api/agents/hermes/analyze', async (req, res) => {
  try {
    const proposal = await hermesAgent.analyze({ patchId: req.body?.patchId || null });
    broadcast('dashboard', { type: 'hermes:proposal', proposal });
    res.json(proposal);
  } catch (error) {
    const status = error.message.includes('already running') ? 409 : error.message.includes('No telemetry') ? 400 : 502;
    res.status(status).json({ error: error.message, hermes: hermesAgent.getSnapshot() });
  }
});

app.post('/api/patches/:id/apply', (req, res) => {
  try {
    const proposal = hermesAgent.applyProposal(req.params.id);
    broadcast('dashboard', { type: 'hermes:patch-applied', proposal });
    saveDB(); // persist the deployed balance change immediately
    res.json(proposal);
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 409;
    res.status(status).json({ error: error.message });
  }
});

// ---- Database API ----
app.get('/api/balance', (req, res) => {
  const category = req.query.category;
  res.json(getAllBalance(category));
});

app.get('/api/runtime-config', (req, res) => {
  res.json(getRuntimeConfig());
});

app.get('/api/balance/:key', (req, res) => {
  const value = getBalance(req.params.key);
  res.json({ key: req.params.key, value });
});

app.post('/api/balance/:key', (req, res) => {
  const { value, reason } = req.body;
  setBalance(req.params.key, value, reason || 'manual', 'api');
  res.json({ key: req.params.key, value, updated: true });
});

app.get('/api/matches', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(getMatchHistory(limit));
});

app.post('/api/matches', (req, res) => {
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  if (!payload || typeof payload !== 'object' || !payload.playerId) {
    return res.status(400).json({ error: 'invalid match payload' });
  }
  recordMatch(payload);
  saveDB();
  res.json({ recorded: true });
});

app.get('/api/adjustments', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(getAdjustments(limit));
});

app.get('/api/classes', (req, res) => {
  res.json(getClasses());
});

app.get('/api/classes/:id', (req, res) => {
  const cls = getClass(req.params.id);
  if (cls) res.json(cls);
  else res.status(404).json({ error: 'Class not found' });
});

app.get('/api/stats', (req, res) => {
  res.json(getAggregateStats());
});

// Telemetry agent web dashboard data: patch history, recommendations context,
// player usage, deployed items and their estimated impact.
app.get('/api/dashboard/data', (req, res) => {
  res.json(getDashboardData());
});

// ---- Start ----
async function start() {
  await initDB();
  try {
    await verifyPostgresConnection();
    await runMigrations();
    await upsertGameCatalog('0.1.0', {
      class: CLASS_STATS,
      weapon: WEAPONS,
      skill: SKILLS,
      enemy: ENEMIES,
      item: ITEMS,
    });
    postgresTelemetryReady = true;
    console.log('[Postgres] gameplay telemetry and catalog ready');
  } catch (error) {
    console.warn(`[Postgres] telemetry disabled: ${describeError(error)}`);
  }
  httpServer.listen(SERVER.PORT, () => {
    console.log(`[RiftSEED Server] Running on http://localhost:${SERVER.PORT}`);
    console.log(`[RiftSEED Server] WebSocket on ws://localhost:${SERVER.PORT}/ws`);
    console.log(`[RiftSEED Server] Agents: Telemetry SDK, Hermes Balance, A/B Testing, Data Cleaning`);
    console.log(`[RiftSEED Server] Database: SQLite balance + Postgres telemetry (${postgresTelemetryReady ? 'ready' : 'disabled'})`);
    console.log(`[RiftSEED Server] Classes: ${getClasses().map(c => c.name).join(', ')}`);
  });
}

// Persist the database on shutdown so patches and match records are not lost.
async function shutdown() {
  console.log('[RiftSEED Server] Saving database and shutting down…');
  try { saveDB(); } catch (err) { console.error('[RiftSEED Server] Save failed:', err.message); }
  try { await closePool(); } catch (err) { console.error('[Postgres] close failed:', err.message); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch(err => {
  console.error('[RiftSEED Server] Failed to start:', err);
  process.exit(1);
});
