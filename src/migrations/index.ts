import * as migration_20261122_170629_initial_schema from './20261122_170629_initial_schema';
import * as migration_20261123_070000_tags_and_search_indexes from './20261123_070000_tags_and_search_indexes';

export const migrations = [
  {
    up: migration_20261122_170629_initial_schema.up,
    down: migration_20261122_170629_initial_schema.down,
    name: '20261122_170629_initial_schema'
  },
  {
    up: migration_20261123_070000_tags_and_search_indexes.up,
    down: migration_20261123_070000_tags_and_search_indexes.down,
    name: '20261123_070000_tags_and_search_indexes'
  },
];
