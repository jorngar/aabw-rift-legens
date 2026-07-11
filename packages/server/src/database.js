// ============================================================
// Game Database — sql.js (pure JS SQLite, no native build)
// Telemetry agent reads/writes to adjust game balance live
// ============================================================
import initSqlJs from 'sql.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', 'data');
mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = join(DB_DIR, 'game.json');

let db = null;
let dirty = false;

// ============================================================
// Initialize database
// ============================================================
export async function initDB() {
  const SQL = await initSqlJs();

  // Load from file if exists
  if (existsSync(DB_PATH)) {
    try {
      const data = readFileSync(DB_PATH);
      db = new SQL.Database(new Uint8Array(JSON.parse(data)));
    } catch {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS game_balance (
      key TEXT PRIMARY KEY,
      value REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      last_updated TEXT DEFAULT (datetime('now')),
      updated_by TEXT DEFAULT 'default'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      session_start TEXT NOT NULL,
      session_end TEXT,
      kills INTEGER DEFAULT 0,
      deaths INTEGER DEFAULT 0,
      gold_earned INTEGER DEFAULT 0,
      xp_earned INTEGER DEFAULT 0,
      level_reached INTEGER DEFAULT 1,
      rank_reached TEXT DEFAULT 'D',
      waves_cleared INTEGER DEFAULT 0,
      skills_used INTEGER DEFAULT 0,
      damage_dealt INTEGER DEFAULT 0,
      damage_taken INTEGER DEFAULT 0,
      duration_seconds REAL DEFAULT 0,
      class_type TEXT DEFAULT 'warrior'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS telemetry_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      metric TEXT NOT NULL,
      old_value REAL,
      new_value REAL,
      reason TEXT,
      agent TEXT DEFAULT 'telemetry'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS player_classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      base_hp INTEGER DEFAULT 250,
      base_mp INTEGER DEFAULT 80,
      base_damage INTEGER DEFAULT 25,
      base_speed REAL DEFAULT 3.0,
      attack_range REAL DEFAULT 2.0,
      passive TEXT,
      skills TEXT
    )
  `);

  // Seed defaults
  seedDefaults();
  seedClasses();
  saveDB();

  console.log('[DB] Game database initialized');
  return db;
}

function seedDefaults() {
  const defaults = [
    ['player.base_hp', 500, 'player', 'Starting HP'],
    ['player.base_mp', 100, 'player', 'Starting MP'],
    ['player.base_damage', 30, 'player', 'Base attack damage'],
    ['player.base_speed', 3.0, 'player', 'Movement speed'],
    ['player.attack_range', 2.0, 'player', 'Attack range'],
    ['player.attack_cooldown', 600, 'player', 'Attack cooldown ms'],
    ['player.hp_per_level', 15, 'player', 'HP per level'],
    ['player.mp_per_level', 8, 'player', 'MP per level'],
    ['player.damage_per_level', 4, 'player', 'Damage per level'],
    ['enemy.shadow_beast.hp', 200, 'enemy', 'Shadow Beast HP'],
    ['enemy.shadow_beast.damage', 3, 'enemy', 'Shadow Beast damage'],
    ['enemy.shadow_beast.speed', 1.5, 'enemy', 'Shadow Beast speed'],
    ['enemy.shadow_beast.aggro_range', 4, 'enemy', 'Shadow Beast aggro'],
    ['enemy.shadow_beast.xp_reward', 25, 'enemy', 'Shadow Beast XP'],
    ['enemy.shadow_beast.gold_min', 10, 'enemy', 'Shadow Beast min gold'],
    ['enemy.shadow_beast.gold_max', 20, 'enemy', 'Shadow Beast max gold'],
    ['enemy.rift_knight.hp', 500, 'enemy', 'Rift Knight HP'],
    ['enemy.rift_knight.damage', 8, 'enemy', 'Rift Knight damage'],
    ['enemy.rift_knight.speed', 1.0, 'enemy', 'Rift Knight speed'],
    ['enemy.rift_knight.aggro_range', 5, 'enemy', 'Rift Knight aggro'],
    ['enemy.rift_knight.xp_reward', 100, 'enemy', 'Rift Knight XP'],
    ['enemy.rift_knight.gold_min', 50, 'enemy', 'Rift Knight min gold'],
    ['enemy.rift_knight.gold_max', 100, 'enemy', 'Rift Knight max gold'],
    ['skill.shadow_strike.damage', 45, 'skill', 'Shadow Strike damage'],
    ['skill.shadow_strike.mana_cost', 15, 'skill', 'Shadow Strike mana'],
    ['skill.shadow_strike.cooldown', 3000, 'skill', 'Shadow Strike CD'],
    ['skill.rift_slash.damage', 30, 'skill', 'Rift Slash damage'],
    ['skill.rift_slash.mana_cost', 10, 'skill', 'Rift Slash mana'],
    ['skill.rift_slash.cooldown', 2000, 'skill', 'Rift Slash CD'],
    ['skill.heal.amount', 40, 'skill', 'Heal amount'],
    ['skill.heal.mana_cost', 20, 'skill', 'Heal mana'],
    ['skill.heal.cooldown', 5000, 'skill', 'Heal CD'],
    ['economy.starting_gold', 100, 'economy', 'Starting gold'],
    ['economy.health_potion_price', 25, 'economy', 'HP potion price'],
    ['economy.mana_potion_price', 25, 'economy', 'MP potion price'],
    ['ab.shadow_strike_cooldown_a', 3000, 'ab_test', 'Variant A CD'],
    ['ab.shadow_strike_cooldown_b', 2000, 'ab_test', 'Variant B CD'],
    ['ab.enemy_density_a', 5, 'ab_test', 'Variant A density'],
    ['ab.enemy_density_b', 8, 'ab_test', 'Variant B density'],
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO game_balance (key, value, category, description) VALUES (?, ?, ?, ?)');
  for (const [key, value, category, desc] of defaults) {
    stmt.run([key, value, category, desc]);
  }
  stmt.free();
}

function seedClasses() {
  const classes = [
    ['warrior', 'Warrior', 'Melee fighter with high HP', 300, 60, 35, 2.8, 2.0, 'Thick Skin: -10% damage taken', 'shadow_strike,rift_slash,shield_bash,war_cry'],
    ['mage', 'Mage', 'Ranged caster with high MP', 180, 150, 20, 2.5, 4.0, 'Arcane Overflow: +20% skill damage', 'fireball,ice_shard,mana_shield,meteor'],
    ['rogue', 'Rogue', 'Fast attacker with crits', 220, 80, 28, 4.0, 1.8, 'Backstab: +50% crit from behind', 'shadow_strike,poison_dagger,dash,cloak'],
    ['ranger', 'Ranger', 'Ranged with pet companion', 200, 100, 25, 3.2, 3.5, 'Eagle Eye: +20% range', 'arrow_shot,trap,summon_wolf,rapid_fire'],
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO player_classes (id, name, description, base_hp, base_mp, base_damage, base_speed, attack_range, passive, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const cls of classes) {
    stmt.run(cls);
  }
  stmt.free();
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  writeFileSync(DB_PATH, JSON.stringify(Array.from(data)));
  dirty = false;
}

// Auto-save every 10 seconds without keeping short-lived scripts/tests alive.
const autoSaveTimer = setInterval(() => { if (dirty) saveDB(); }, 10000);
autoSaveTimer.unref?.();

// Flush any pending writes to disk before the process exits so balance patches
// and match records are not lost when the server is stopped/killed.
function flushOnExit() {
  if (dirty) {
    try { saveDB(); } catch { /* best effort during shutdown */ }
  }
}
process.on('exit', flushOnExit);
process.on('SIGINT', () => { flushOnExit(); process.exit(0); });
process.on('SIGTERM', () => { flushOnExit(); process.exit(0); });

// ============================================================
// API Functions
// ============================================================

export function getBalance(key, defaultValue = 0) {
  if (!db) return defaultValue;
  const stmt = db.prepare('SELECT value FROM game_balance WHERE key = ?');
  stmt.bind([key]);
  if (stmt.step()) {
    const val = stmt.getAsObject().value;
    stmt.free();
    return val;
  }
  stmt.free();
  return defaultValue;
}

export function setBalance(key, value, reason = '', agent = 'telemetry') {
  if (!db) return;
  const old = getBalance(key);
  db.run(`INSERT INTO game_balance (key, value, category, description, last_updated, updated_by) VALUES (?, ?, 'auto', ?, datetime('now'), ?) ON CONFLICT(key) DO UPDATE SET value = ?, last_updated = datetime('now'), updated_by = ?`, [key, value, reason, agent, value, agent]);
  db.run('INSERT INTO telemetry_adjustments (metric, old_value, new_value, reason, agent) VALUES (?, ?, ?, ?, ?)', [key, old, value, reason, agent]);
  dirty = true;
}

export function getAllBalance(category) {
  if (!db) return {};
  const rows = category
    ? db.exec('SELECT key, value FROM game_balance WHERE category = ?', [category])
    : db.exec('SELECT key, value FROM game_balance');
  const result = {};
  if (rows.length > 0) {
    for (const row of rows[0].values) {
      result[row[0]] = row[1];
    }
  }
  return result;
}

export function recordMatch(matchData) {
  if (!db) return;
  // Upsert per session: clients re-send cumulative session stats periodically,
  // so replace any earlier row for the same session instead of duplicating it.
  if (matchData.playerId && matchData.sessionStart) {
    db.run('DELETE FROM match_history WHERE player_id = ? AND session_start = ?', [matchData.playerId, matchData.sessionStart]);
  }
  db.run(`INSERT INTO match_history (player_id, session_start, session_end, kills, deaths, gold_earned, xp_earned, level_reached, rank_reached, waves_cleared, skills_used, damage_dealt, damage_taken, duration_seconds, class_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [matchData.playerId, matchData.sessionStart || new Date().toISOString(), matchData.sessionEnd || new Date().toISOString(),
     matchData.kills || 0, matchData.deaths || 0, matchData.goldEarned || 0,
     matchData.xpEarned || 0, matchData.levelReached || 1, matchData.rankReached || 'D',
     matchData.wavesCleared || 0, matchData.skillsUsed || 0, matchData.damageDealt || 0,
     matchData.damageTaken || 0, matchData.durationSeconds || 0, matchData.classType || 'warrior']);
  dirty = true;
}

export function getMatchHistory(limit = 50) {
  if (!db) return [];
  const rows = db.exec('SELECT * FROM match_history ORDER BY id DESC LIMIT ?', [limit]);
  if (rows.length === 0) return [];
  const cols = rows[0].columns;
  return rows[0].values.map(v => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = v[i]);
    return obj;
  });
}

export function getAdjustments(limit = 20) {
  if (!db) return [];
  const rows = db.exec('SELECT * FROM telemetry_adjustments ORDER BY id DESC LIMIT ?', [limit]);
  if (rows.length === 0) return [];
  const cols = rows[0].columns;
  return rows[0].values.map(v => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = v[i]);
    return obj;
  });
}

export function getClasses() {
  if (!db) return [];
  const rows = db.exec('SELECT * FROM player_classes');
  if (rows.length === 0) return [];
  const cols = rows[0].columns;
  return rows[0].values.map(v => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = v[i]);
    return obj;
  });
}

export function getClass(id) {
  if (!db) return null;
  const rows = db.exec('SELECT * FROM player_classes WHERE id = ?', [id]);
  if (rows.length === 0 || rows[0].values.length === 0) return null;
  const cols = rows[0].columns;
  const obj = {};
  cols.forEach((c, i) => obj[c] = rows[0].values[0][i]);
  return obj;
}

export function getAggregateStats() {
  if (!db) return {};
  const rows = db.exec(`SELECT COUNT(*) as total_matches, AVG(kills) as avg_kills, AVG(deaths) as avg_deaths, AVG(gold_earned) as avg_gold, AVG(xp_earned) as avg_xp, AVG(level_reached) as avg_level, AVG(duration_seconds) as avg_duration, AVG(damage_dealt) as avg_damage_dealt, AVG(damage_taken) as avg_damage_taken, SUM(kills) as total_kills, SUM(deaths) as total_deaths, MAX(level_reached) as max_level FROM match_history`);
  if (rows.length === 0) return {};
  const cols = rows[0].columns;
  const obj = {};
  cols.forEach((c, i) => obj[c] = rows[0].values[0][i]);
  return obj;
}

/**
 * Aggregate everything the telemetry dashboard web pages need in one call:
 * player usage from match history, deployed items/weapons (with their balance
 * impact), the Hermes patch history (telemetry_adjustments), and current balance.
 */
export function getDashboardData() {
  const agg = getAggregateStats();
  const matches = getMatchHistory(500);

  // Class distribution + per-class performance from match history.
  const classStats = {};
  let totalDuration = 0;
  for (const m of matches) {
    const cls = m.class_type || 'warrior';
    if (!classStats[cls]) {
      classStats[cls] = { class: cls, matches: 0, kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0, totalDuration: 0 };
    }
    const s = classStats[cls];
    s.matches++;
    s.kills += m.kills || 0;
    s.deaths += m.deaths || 0;
    s.damageDealt += m.damage_dealt || 0;
    s.damageTaken += m.damage_taken || 0;
    s.totalDuration += m.duration_seconds || 0;
  }
  const playerUsage = Object.values(classStats).map(s => ({
    class: s.class,
    matches: s.matches,
    avgKills: s.matches ? Number((s.kills / s.matches).toFixed(1)) : 0,
    avgDeaths: s.matches ? Number((s.deaths / s.matches).toFixed(1)) : 0,
    avgDamageDealt: s.matches ? Number((s.damageDealt / s.matches).toFixed(0)) : 0,
    avgDamageTaken: s.matches ? Number((s.damageTaken / s.matches).toFixed(0)) : 0,
    avgDurationMin: s.matches ? Number((s.totalDuration / s.matches / 60).toFixed(1)) : 0,
    killDeathRatio: s.deaths > 0 ? Number((s.kills / s.deaths).toFixed(2)) : s.kills,
  }));

  // Deployed items + weapons, joined to live balance where it exists, plus a
  // rough "impact" estimate so the dashboard can rank them.
  const balance = getAllBalance();
  const deployedItems = [
    ...Object.entries(ITEMS_FOR_DASHBOARD.items).map(([id, it]) => ({ id, ...it, kind: 'item' })),
    ...Object.entries(ITEMS_FOR_DASHBOARD.weapons).map(([id, w]) => ({ id, ...w, kind: 'weapon' })),
  ].map(item => {
    // Estimate impact: consumables scale with price/heal, weapons with damage.
    let impact = 0;
    if (item.kind === 'weapon') impact = Number((item.damage || 0) + (item.speed || 0) * 50 + (item.skillDmg || 0));
    else impact = Number(((item.heal || 0) + (item.mana || 0)) / 10 + (item.price || 0) / 25);
    return { ...item, liveBalance: balance[item.id] ?? null, estimatedImpact: Number(impact.toFixed(1)) };
  }).sort((a, b) => b.estimatedImpact - a.estimatedImpact);

  return {
    generatedAt: Date.now(),
    summary: agg,
    matchCount: matches.length,
    playerUsage,
    deployedItems,
    balance: balance,
    adjustments: getAdjustments(50),
  };
}

// Static catalog mirror for the dashboard (kept in sync with @rift-seed/shared/config).
const ITEMS_FOR_DASHBOARD = {
  items: {
    health_potion: { name: 'Health Potion', type: 'consumable', heal: 50, price: 15 },
    mana_potion: { name: 'Mana Potion', type: 'consumable', mana: 30, price: 15 },
    rift_shard: { name: 'Rift Shard', type: 'consumable', price: 40 },
    scroll: { name: 'Scroll', type: 'misc', price: 10 },
    key: { name: 'Rift Key', type: 'key', price: 50 },
    ether_crystal: { name: 'Ether Crystal', type: 'material', price: 30 },
    rune_stone: { name: 'Rune Stone', type: 'material', price: 25 },
  },
  weapons: {
    gunblade: { name: 'Gunblade', damage: 15, speed: 0, price: 200 },
    rift_staff: { name: 'Rift Staff', damage: 10, maxMp: 20, skillDmg: 10, price: 300 },
    pistol: { name: 'Pistol', damage: 10, speed: 0.2, price: 150 },
    seed_rifle: { name: 'SEED Rifle', damage: 25, speed: -0.3, price: 350 },
    rune_daggers: { name: 'Rune Daggers', damage: 8, speed: 0.5, price: 250 },
  },
};

export { db, saveDB };
