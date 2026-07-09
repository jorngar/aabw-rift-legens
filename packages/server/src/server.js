// ============================================================
// Server — Express + WebSocket hub for the three AI agents
// ============================================================
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SERVER } from '@rift-seed/shared/config';
import { TelemetryAgent } from './agents/telemetry-agent.js';
import { ABTestingAgent } from './agents/ab-testing-agent.js';
import { DataCleaningAgent } from './agents/data-cleaning-agent.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// ---- Init Agents ----
const telemetryAgent = new TelemetryAgent();
const abAgent = new ABTestingAgent();
const dataAgent = new DataCleaningAgent();

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
  res.json({ status: 'ok', agents: 3, clients: clients.size });
});

app.get('/api/telemetry', (req, res) => {
  res.json(telemetryAgent.getSnapshot());
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
    abTesting: abAgent.getStatus(),
    dataCleaning: dataAgent.getStatus(),
  });
});

// ---- Start ----
httpServer.listen(SERVER.PORT, () => {
  console.log(`[RiftSEED Server] Running on http://localhost:${SERVER.PORT}`);
  console.log(`[RiftSEED Server] WebSocket on ws://localhost:${SERVER.PORT}/ws`);
  console.log(`[RiftSEED Server] Agents: Telemetry, A/B Testing, Data Cleaning`);
});
