// ============================================================
// Hermes Balance Agent — evidence -> validated patch proposal
// ============================================================
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { getAllBalance, getBalance, setBalance } from '../database.js';

const PATCH_LIMITS = Object.freeze({
  'player.base_hp': [100, 1000],
  'player.base_mp': [20, 300],
  'player.base_damage': [5, 100],
  'player.attack_cooldown': [200, 2000],
  'enemy.shadow_beast.hp': [25, 1000],
  'enemy.shadow_beast.damage': [1, 100],
  'enemy.shadow_beast.speed': [0.5, 6],
  'enemy.rift_knight.hp': [100, 2500],
  'enemy.rift_knight.damage': [1, 150],
  'enemy.rift_knight.speed': [0.5, 6],
  'skill.shadow_strike.damage': [5, 250],
  'skill.shadow_strike.mana_cost': [0, 100],
  'skill.shadow_strike.cooldown': [250, 15000],
  'skill.rift_slash.damage': [5, 250],
  'skill.rift_slash.mana_cost': [0, 100],
  'skill.rift_slash.cooldown': [250, 15000],
  'skill.heal.amount': [5, 300],
  'skill.heal.mana_cost': [0, 100],
  'skill.heal.cooldown': [250, 20000],
});

function runHermes(binary, prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-z', prompt, '--ignore-rules'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Hermes timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr.trim() || `Hermes exited with code ${code}`));
      else resolve(stdout.trim());
    });
  });
}

function parseJsonResponse(output) {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1);
  if (!candidate) throw new Error('Hermes returned no JSON object');
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Hermes returned invalid JSON: ${error.message}`);
  }
}

function buildPrompt(evidence, balance) {
  const allowed = Object.entries(PATCH_LIMITS).map(([key, [min, max]]) => ({ key, current: balance[key], min, max }));
  return `You are a game balance and retention analyst. Analyze the telemetry evidence and propose a conservative patch.

Rules:
- Output JSON only. Do not use markdown.
- Ground every change in a numeric telemetry signal.
- Treat fewer than 30 events or fewer than 3 sessions as weak evidence and lower confidence.
- Do not claim retention improved; state the expected behavior to validate in a follow-up cohort.
- Propose at most 4 changes and only use keys from allowed_changes.
- Prefer changes within 15% of current values. The host will enforce a hard 30% maximum.

Required JSON shape:
{"summary":"...","rationale":"...","expectedImpact":"...","confidence":0.0,"changes":[{"key":"...","proposedValue":0,"reason":"...","evidence":["metric=value"]}]}

telemetry_evidence=${JSON.stringify(evidence)}
allowed_changes=${JSON.stringify(allowed)}`;
}

export class HermesBalanceAgent {
  constructor({ telemetryAgent, hermesBinary = process.env.HERMES_BIN || 'hermes', execute = null, timeoutMs = 90000, balanceStore = null } = {}) {
    this.telemetryAgent = telemetryAgent;
    this.hermesBinary = hermesBinary;
    this.execute = execute || ((prompt) => runHermes(this.hermesBinary, prompt, timeoutMs));
    this.timeoutMs = timeoutMs;
    this.balanceStore = balanceStore || {
      getAll: () => getAllBalance(),
      get: key => getBalance(key),
      set: (key, value, reason, agent) => setBalance(key, value, reason, agent),
    };
    this.proposals = [];
    this.running = false;
    this.lastError = null;
    this.lastRunAt = null;
  }

  async analyze({ patchId = null } = {}) {
    if (this.running) throw new Error('Hermes analysis is already running');
    const evidence = this.telemetryAgent?.getEvidence(patchId);
    if (!evidence) throw new Error('No telemetry evidence is available yet');
    this.running = true;
    this.lastError = null;
    this.lastRunAt = Date.now();
    try {
      const balance = this.balanceStore.getAll();
      const output = await this.execute(buildPrompt(evidence, balance));
      const raw = parseJsonResponse(output);
      const proposal = this._validateProposal(raw, evidence, balance);
      this.proposals.push(proposal);
      if (this.proposals.length > 50) this.proposals.shift();
      return proposal;
    } catch (error) {
      this.lastError = error.message;
      throw error;
    } finally {
      this.running = false;
    }
  }

  _validateProposal(raw, evidence, balance) {
    const requested = Array.isArray(raw.changes) ? raw.changes.slice(0, 4) : [];
    const rejectedChanges = [];
    const changes = [];
    for (const change of requested) {
      const key = change?.key;
      if (!PATCH_LIMITS[key]) {
        rejectedChanges.push({ key: key || 'missing', reason: 'Key is not in the patch allowlist' });
        continue;
      }
      const currentValue = Number(balance[key] ?? this.balanceStore.get(key));
      const requestedValue = Number(change.proposedValue);
      if (!Number.isFinite(currentValue) || !Number.isFinite(requestedValue)) {
        rejectedChanges.push({ key, reason: 'Current and proposed values must be numeric' });
        continue;
      }
      const [hardMin, hardMax] = PATCH_LIMITS[key];
      const relativeMin = currentValue === 0 ? hardMin : currentValue * 0.7;
      const relativeMax = currentValue === 0 ? hardMax : currentValue * 1.3;
      let safeMin = Math.max(hardMin, relativeMin);
      let safeMax = Math.min(hardMax, relativeMax);
      if (Number.isInteger(currentValue)) {
        // Integer rounding must not accidentally cross the ±30% safety boundary.
        safeMin = Math.ceil(safeMin);
        safeMax = Math.floor(safeMax);
      }
      const safeValue = Math.min(safeMax, Math.max(safeMin, requestedValue));
      const proposedValue = Number.isInteger(currentValue) ? Math.round(safeValue) : Number(safeValue.toFixed(2));
      changes.push({
        key,
        currentValue,
        proposedValue,
        requestedValue,
        operation: proposedValue > currentValue ? 'increase' : proposedValue < currentValue ? 'decrease' : 'no_change',
        clamped: proposedValue !== requestedValue,
        percentChange: currentValue === 0 ? null : Number((((proposedValue - currentValue) / currentValue) * 100).toFixed(1)),
        reason: String(change.reason || 'No reason supplied'),
        evidence: Array.isArray(change.evidence) ? change.evidence.map(String).slice(0, 5) : [],
      });
    }
    return {
      id: `patch_${randomUUID().slice(0, 8)}`,
      createdAt: Date.now(),
      source: 'hermes-local',
      status: 'proposed',
      patchId: evidence.patchId,
      summary: String(raw.summary || 'Hermes balance proposal'),
      rationale: String(raw.rationale || ''),
      expectedImpact: String(raw.expectedImpact || ''),
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
      sample: evidence.sample,
      changes,
      rejectedChanges,
    };
  }

  applyProposal(id) {
    const proposal = this.proposals.find(item => item.id === id);
    if (!proposal) throw new Error('Patch proposal not found');
    if (proposal.status !== 'proposed') throw new Error(`Patch is already ${proposal.status}`);
    for (const change of proposal.changes) {
      if (change.operation === 'no_change') continue;
      this.balanceStore.set(change.key, change.proposedValue, `${proposal.summary}: ${change.reason}`, 'hermes');
    }
    proposal.status = 'applied';
    proposal.appliedAt = Date.now();
    return proposal;
  }

  getSnapshot() {
    return {
      status: this.running ? 'analyzing' : this.lastError ? 'error' : 'ready',
      runtime: 'local Hermes CLI',
      binary: this.hermesBinary,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      latestProposal: this.proposals.at(-1) || null,
      proposals: this.proposals.slice(-10).reverse(),
    };
  }

  getStatus() {
    return {
      name: 'Hermes Balance Agent',
      ...this.getSnapshot(),
      proposalCount: this.proposals.length,
    };
  }
}

export { PATCH_LIMITS, buildPrompt, parseJsonResponse };
