import { pool } from './pool.js';

const EVENT_COLUMNS = [
  'event_id', 'schema_version', 'session_id', 'player_id', 'patch_id', 'game_version',
  'event_type', 'occurred_at', 'actor_id', 'actor_type', 'target_id', 'target_type',
  'enemy_type', 'source_id', 'source_type', 'damage', 'hp_before', 'hp_after',
  'position_x', 'position_y', 'area', 'class_id', 'player_level', 'enemy_level',
  'wave', 'tier', 'weapon_class', 'item_type', 'player_rank', 'unit_price', 'quantity',
  'gold_before', 'gold_after', 'weapon_damage', 'weapon_skill_power', 'weapon_affinity',
  'payload',
];

export function toGameplayEventRow(event) {
  const metrics = event.metrics || {};
  const context = event.context || {};
  const position = event.position || {};
  return [
    event.eventId,
    event.schemaVersion || '1.0.0',
    event.sessionId,
    event.playerId ?? null,
    event.patchId ?? null,
    event.gameVersion || 'unknown',
    event.type,
    new Date(Number(event.timestamp) || Date.now()),
    event.actor?.id != null ? String(event.actor.id) : null,
    event.actor?.type ?? null,
    event.target?.id != null ? String(event.target.id) : null,
    event.target?.type ?? null,
    event.target?.enemyType ?? context.enemyType ?? null,
    event.source?.id != null ? String(event.source.id) : null,
    event.source?.type ?? null,
    metrics.damage ?? null,
    metrics.hpBefore ?? null,
    metrics.hpAfter ?? null,
    position.x ?? null,
    position.y ?? null,
    context.area ?? null,
    context.classId ?? null,
    context.playerLevel ?? null,
    context.enemyLevel ?? null,
    context.wave ?? null,
    context.tier ?? null,
    context.weaponClass ?? null,
    context.itemType ?? null,
    context.rank ?? null,
    metrics.unitPrice ?? null,
    metrics.quantity ?? null,
    metrics.goldBefore ?? null,
    metrics.goldAfter ?? null,
    metrics.weaponDamage ?? null,
    metrics.weaponSkillPower ?? null,
    metrics.weaponAffinity ?? null,
    JSON.stringify(event),
  ];
}

export function buildGameplayEventInsert(events) {
  const valid = (events || []).filter(event => event?.eventId && event?.sessionId && event?.type);
  if (valid.length === 0) return null;
  const params = [];
  const values = valid.map((event, rowIndex) => {
    const row = toGameplayEventRow(event);
    const offset = rowIndex * EVENT_COLUMNS.length;
    params.push(...row);
    return `(${row.map((_, index) => `$${offset + index + 1}${index === EVENT_COLUMNS.length - 1 ? '::jsonb' : ''}`).join(', ')})`;
  });
  return {
    text: `INSERT INTO gameplay_events (${EVENT_COLUMNS.join(', ')}) VALUES ${values.join(', ')} ON CONFLICT (event_id) DO NOTHING`,
    params,
    rowCount: valid.length,
  };
}

export async function insertGameplayEventBatch(events, queryable = pool) {
  const insert = buildGameplayEventInsert(events);
  if (!insert) return 0;
  await queryable.query(insert.text, insert.params);
  return insert.rowCount;
}

export async function upsertGameCatalog(gameVersion, catalog, queryable = pool) {
  let count = 0;
  for (const [entityKind, definitions] of Object.entries(catalog)) {
    for (const [entityId, definition] of Object.entries(definitions)) {
      await queryable.query(
        `INSERT INTO game_catalog (game_version, entity_kind, entity_id, definition)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (game_version, entity_kind, entity_id)
         DO UPDATE SET definition = EXCLUDED.definition, updated_at = NOW()`,
        [gameVersion, entityKind, entityId, JSON.stringify(definition)],
      );
      count++;
    }
  }
  return count;
}

export async function getGameplayEventStats(queryable = pool) {
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS total_events,
            COUNT(DISTINCT session_id)::int AS sessions,
            MAX(ingested_at) AS last_ingested_at
       FROM gameplay_events`,
  );
  return rows[0];
}
