-- ============================================================
-- Rift SEED A/B Testing Data Collection — Postgres schema
-- Idempotent: safe to run repeatedly.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Registered patches (game version definitions)
CREATE TABLE IF NOT EXISTS patches (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  variant_a     JSONB NOT NULL,
  variant_b     JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Player→variant assignments (deterministic hash, persisted for audit)
CREATE TABLE IF NOT EXISTS assignments (
  id            SERIAL PRIMARY KEY,
  player_id     TEXT NOT NULL,
  patch_id      INT NOT NULL REFERENCES patches(id),
  variant       CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, patch_id)
);

-- Server-owned session (one WS connect → one row)
CREATE TABLE IF NOT EXISTS sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         TEXT NOT NULL,
  patch_id          INT NOT NULL REFERENCES patches(id),
  variant           CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  duration_ms       INT,
  end_reason        TEXT,
  completed_rift    BOOLEAN DEFAULT FALSE,
  final_gold        INT,
  final_xp          INT,
  final_level       INT,
  path_compressed   BOOLEAN DEFAULT FALSE
);

-- Raw audit log (never lose)
CREATE TABLE IF NOT EXISTS events (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  x             REAL,
  y             REAL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_session_type ON events(session_id, event_type);

-- Denormalized: purchases (F-key shop transactions)
CREATE TABLE IF NOT EXISTS purchases (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  patch_id      INT NOT NULL REFERENCES patches(id),
  variant       CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  item_id       TEXT NOT NULL,
  price         INT NOT NULL,
  gold_before   INT,
  gold_after    INT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Denormalized: defects (stuck / pathfind_fail / js_error / impossible_state)
CREATE TABLE IF NOT EXISTS defects (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  patch_id      INT NOT NULL REFERENCES patches(id),
  variant       CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  defect_type   TEXT NOT NULL,
  context       JSONB,
  x             REAL,
  y             REAL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Denormalized: deaths (heatmap source)
CREATE TABLE IF NOT EXISTS deaths (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  patch_id      INT NOT NULL REFERENCES patches(id),
  variant       CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  killed_by     TEXT,
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  map_zone      TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw trajectory samples (temporary buffer; deleted after path compression)
CREATE TABLE IF NOT EXISTS trajectories (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  vx            REAL,
  vy            REAL,
  map_zone      TEXT NOT NULL,
  sampled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_traj_session ON trajectories(session_id, sampled_at);

-- Compressed canonical path per session (robotics artifact)
CREATE TABLE IF NOT EXISTS paths (
  id                BIGSERIAL PRIMARY KEY,
  session_id        UUID NOT NULL REFERENCES sessions(id) UNIQUE,
  patch_id          INT NOT NULL,
  variant           CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  waypoints         JSONB NOT NULL,
  sample_count      INT NOT NULL,
  compression_ratio REAL,
  compressed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Denormalized: enemy engagement
CREATE TABLE IF NOT EXISTS engagements (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  patch_id      INT NOT NULL REFERENCES patches(id),
  variant       CHAR(1) NOT NULL CHECK (variant IN ('A','B')),
  enemy_type    TEXT NOT NULL,
  damage_dealt  INT,
  damage_taken  INT,
  killed        BOOLEAN,
  x             REAL,
  y             REAL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Versioned definitions used by the running game. This prevents telemetry
-- analysis from guessing which class, weapon, skill, enemy, or item values
-- produced an event.
CREATE TABLE IF NOT EXISTS game_catalog (
  category      TEXT NOT NULL CHECK (category IN ('class', 'weapon', 'skill', 'enemy', 'item')),
  catalog_key   TEXT NOT NULL,
  version       TEXT NOT NULL,
  definition    JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category, catalog_key, version)
);

-- Typed gameplay fact table. session_id is intentionally TEXT rather than an
-- A/B session FK so offline/REST telemetry can still be stored durably.
CREATE TABLE IF NOT EXISTS gameplay_events (
  id                    BIGSERIAL PRIMARY KEY,
  event_id              TEXT UNIQUE,
  schema_version        TEXT NOT NULL,
  session_id            TEXT,
  player_id             TEXT,
  patch_id              TEXT,
  game_version          TEXT,
  event_type            TEXT NOT NULL,
  occurred_at           TIMESTAMPTZ NOT NULL,
  actor_id               TEXT,
  actor_type             TEXT,
  target_id              TEXT,
  target_type            TEXT,
  enemy_type             TEXT,
  source_type            TEXT,
  source_id              TEXT,
  class_id               TEXT,
  player_level           INT,
  previous_level         INT,
  enemy_level            INT,
  wave                   INT,
  tier                   INT,
  rank                   TEXT,
  weapon_class           TEXT,
  item_type              TEXT,
  map_zone               TEXT,
  layout_id              TEXT,
  damage                 REAL,
  hp_before              REAL,
  hp_after               REAL,
  mp_before              REAL,
  mp_after               REAL,
  delta                  REAL,
  quantity               INT,
  unit_price             REAL,
  gold_before            REAL,
  gold_after             REAL,
  xp_before              REAL,
  xp_after               REAL,
  weapon_damage          REAL,
  weapon_skill_power     REAL,
  weapon_affinity        REAL,
  x                      REAL,
  y                      REAL,
  context                JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics                JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload                JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gameplay_session_time ON gameplay_events(session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_gameplay_type_time ON gameplay_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_gameplay_balance_dims ON gameplay_events(class_id, weapon_class, enemy_type, player_level);
