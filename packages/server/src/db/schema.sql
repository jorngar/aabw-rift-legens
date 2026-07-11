CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS patches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  variant_a JSONB NOT NULL,
  variant_b JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  player_id TEXT NOT NULL,
  patch_id INT NOT NULL REFERENCES patches(id),
  variant CHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, patch_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  patch_id INT REFERENCES patches(id),
  variant CHAR(1) CHECK (variant IN ('A', 'B')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INT,
  end_reason TEXT,
  completed_rift BOOLEAN DEFAULT FALSE,
  final_gold INT,
  final_xp INT,
  final_level INT,
  path_compressed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS game_catalog (
  game_version TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  definition JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_version, entity_kind, entity_id)
);

CREATE TABLE IF NOT EXISTS gameplay_events (
  event_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  session_id TEXT NOT NULL,
  player_id TEXT,
  patch_id TEXT,
  game_version TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_id TEXT,
  actor_type TEXT,
  target_id TEXT,
  target_type TEXT,
  enemy_type TEXT,
  source_id TEXT,
  source_type TEXT,
  damage REAL,
  hp_before REAL,
  hp_after REAL,
  position_x REAL,
  position_y REAL,
  area TEXT,
  class_id TEXT,
  player_level INT,
  enemy_level INT,
  wave INT,
  tier INT,
  weapon_class TEXT,
  item_type TEXT,
  player_rank TEXT,
  unit_price INT,
  quantity INT,
  gold_before INT,
  gold_after INT,
  weapon_damage REAL,
  weapon_skill_power REAL,
  weapon_affinity REAL,
  payload JSONB NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gameplay_events_session_time
  ON gameplay_events (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_gameplay_events_type_time
  ON gameplay_events (event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_gameplay_events_balance_dimensions
  ON gameplay_events (class_id, source_id, enemy_type, player_level);

ALTER TABLE gameplay_events ADD COLUMN IF NOT EXISTS player_rank TEXT;
ALTER TABLE gameplay_events ADD COLUMN IF NOT EXISTS unit_price INT;
ALTER TABLE gameplay_events ADD COLUMN IF NOT EXISTS quantity INT;
ALTER TABLE gameplay_events ADD COLUMN IF NOT EXISTS weapon_damage REAL;
ALTER TABLE gameplay_events ADD COLUMN IF NOT EXISTS weapon_skill_power REAL;
ALTER TABLE gameplay_events ADD COLUMN IF NOT EXISTS weapon_affinity REAL;

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  x REAL,
  y REAL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  patch_id INT REFERENCES patches(id),
  variant CHAR(1) CHECK (variant IN ('A', 'B')),
  item_id TEXT NOT NULL,
  price INT NOT NULL,
  gold_before INT,
  gold_after INT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS defects (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  patch_id INT REFERENCES patches(id),
  variant CHAR(1) CHECK (variant IN ('A', 'B')),
  defect_type TEXT NOT NULL,
  context JSONB,
  x REAL,
  y REAL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deaths (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  patch_id INT REFERENCES patches(id),
  variant CHAR(1) CHECK (variant IN ('A', 'B')),
  killed_by TEXT,
  x REAL,
  y REAL,
  map_zone TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trajectories (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  vx REAL,
  vy REAL,
  map_zone TEXT NOT NULL,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paths (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) UNIQUE,
  patch_id INT,
  variant CHAR(1) CHECK (variant IN ('A', 'B')),
  waypoints JSONB NOT NULL,
  sample_count INT NOT NULL,
  compression_ratio REAL,
  compressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagements (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  patch_id INT REFERENCES patches(id),
  variant CHAR(1) CHECK (variant IN ('A', 'B')),
  enemy_type TEXT NOT NULL,
  damage_dealt INT,
  damage_taken INT,
  killed BOOLEAN,
  x REAL,
  y REAL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
