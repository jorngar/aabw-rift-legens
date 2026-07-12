import {
  CLASS_STATS,
  ENEMIES,
  ITEMS,
  PLAYER_CLASSES,
  SKILLS,
  WEAPONS,
} from '@rift-seed/shared/config';
import { TELEMETRY_SCHEMA_VERSION } from '@rift-seed/shared/events';

export const GAME_CATALOG_VERSION = TELEMETRY_SCHEMA_VERSION;

function rowsFor(category, definitions) {
  return Object.entries(definitions).map(([key, definition]) => ({
    category,
    key,
    version: GAME_CATALOG_VERSION,
    definition,
  }));
}

export function buildGameCatalog() {
  const classes = Object.fromEntries(Object.entries(PLAYER_CLASSES).map(([key, cls]) => [
    key,
    { ...cls, stats: CLASS_STATS[key] },
  ]));

  return [
    ...rowsFor('class', classes),
    ...rowsFor('weapon', WEAPONS),
    ...rowsFor('skill', SKILLS),
    ...rowsFor('enemy', ENEMIES),
    ...rowsFor('item', ITEMS),
  ];
}
