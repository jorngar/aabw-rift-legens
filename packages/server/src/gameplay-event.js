function nested(event, bucket, key) {
  return event?.[bucket]?.[key] ?? event?.[key] ?? null;
}

function eventDate(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export const GAMEPLAY_EVENT_COLUMNS = Object.freeze([
  'event_id', 'schema_version', 'session_id', 'player_id', 'patch_id', 'game_version',
  'event_type', 'occurred_at', 'actor_id', 'actor_type', 'target_id', 'target_type',
  'enemy_type', 'source_type', 'source_id', 'class_id', 'player_level', 'previous_level',
  'enemy_level', 'wave', 'tier', 'rank', 'weapon_class', 'item_type', 'map_zone',
  'layout_id', 'damage', 'hp_before', 'hp_after', 'mp_before', 'mp_after', 'delta',
  'quantity', 'unit_price', 'gold_before', 'gold_after', 'xp_before', 'xp_after',
  'weapon_damage', 'weapon_skill_power', 'weapon_affinity', 'x', 'y', 'context',
  'metrics', 'payload',
]);

export function toGameplayEventRow(event, defaults = {}) {
  const context = event?.context || {};
  const metrics = event?.metrics || {};
  const position = event?.position || {};
  const source = event?.source || {};
  const target = event?.target || {};
  const actor = event?.actor || {};

  return {
    event_id: event?.eventId ?? null,
    schema_version: event?.schemaVersion ?? defaults.schemaVersion ?? 'legacy',
    session_id: event?.sessionId ?? defaults.sessionId ?? null,
    player_id: event?.playerId ?? defaults.playerId ?? null,
    patch_id: event?.patchId ?? defaults.patchId ?? null,
    game_version: event?.gameVersion ?? defaults.gameVersion ?? null,
    event_type: event?.type,
    occurred_at: eventDate(event?.timestamp),
    actor_id: actor.id ?? event?.actorId ?? event?.attackerId ?? null,
    actor_type: actor.type ?? event?.actorType ?? null,
    target_id: target.id ?? event?.targetId ?? event?.victimId ?? null,
    target_type: target.type ?? event?.targetType ?? event?.victimType ?? null,
    enemy_type: target.enemyType ?? event?.targetEnemyType ?? event?.enemyType ?? null,
    source_type: source.type ?? event?.sourceType ?? null,
    source_id: source.id ?? event?.sourceId ?? event?.skillId ?? event?.itemId ?? event?.weaponId ?? null,
    class_id: context.classId ?? event?.classId ?? null,
    player_level: context.playerLevel ?? event?.playerLevel ?? event?.level ?? null,
    previous_level: context.previousLevel ?? event?.previousLevel ?? null,
    enemy_level: context.enemyLevel ?? event?.enemyLevel ?? null,
    wave: context.wave ?? event?.wave ?? null,
    tier: context.tier ?? event?.tier ?? null,
    rank: context.rank ?? event?.rank ?? null,
    weapon_class: context.weaponClass ?? event?.weaponClass ?? null,
    item_type: context.itemType ?? event?.itemType ?? null,
    map_zone: context.mapZone ?? context.area ?? event?.mapZone ?? event?.area ?? null,
    layout_id: context.layoutId ?? event?.layoutId ?? null,
    damage: nested(event, 'metrics', 'damage'),
    hp_before: nested(event, 'metrics', 'hpBefore'),
    hp_after: nested(event, 'metrics', 'hpAfter'),
    mp_before: nested(event, 'metrics', 'mpBefore'),
    mp_after: nested(event, 'metrics', 'mpAfter'),
    delta: nested(event, 'metrics', 'delta'),
    quantity: nested(event, 'metrics', 'quantity'),
    unit_price: nested(event, 'metrics', 'unitPrice') ?? event?.price ?? null,
    gold_before: nested(event, 'metrics', 'goldBefore'),
    gold_after: nested(event, 'metrics', 'goldAfter'),
    xp_before: nested(event, 'metrics', 'xpBefore'),
    xp_after: nested(event, 'metrics', 'xpAfter'),
    weapon_damage: nested(event, 'metrics', 'weaponDamage'),
    weapon_skill_power: nested(event, 'metrics', 'weaponSkillPower'),
    weapon_affinity: nested(event, 'metrics', 'weaponAffinity'),
    x: position.x ?? event?.x ?? null,
    y: position.y ?? event?.y ?? null,
    context,
    metrics,
    payload: event,
  };
}

export function buildGameplayEventInsert(events, defaults = {}) {
  const rows = (events || [])
    .filter(event => event && typeof event === 'object' && event.type)
    .map(event => toGameplayEventRow(event, defaults));
  if (rows.length === 0) return null;

  const params = [];
  const values = rows.map(row => {
    const placeholders = GAMEPLAY_EVENT_COLUMNS.map(column => {
      const value = ['context', 'metrics', 'payload'].includes(column)
        ? JSON.stringify(row[column] || {})
        : row[column];
      params.push(value);
      const cast = ['context', 'metrics', 'payload'].includes(column) ? '::jsonb' : '';
      return `$${params.length}${cast}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  return {
    text: `INSERT INTO gameplay_events (${GAMEPLAY_EVENT_COLUMNS.join(', ')})\nVALUES ${values.join(',\n')}\nON CONFLICT (event_id) DO NOTHING`,
    params,
    rowCount: rows.length,
  };
}
