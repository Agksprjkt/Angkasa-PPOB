import 'server-only';

import { getTableConfig as getPgTableConfig } from 'drizzle-orm/pg-core';
import { getTableConfig as getSqliteTableConfig } from 'drizzle-orm/sqlite-core';
import * as postgresSchema from './schema.postgres';
import * as sqliteSchema from './schema.sqlite';
import { databaseMode } from './database-mode';
import type { SnapshotTable } from '@/lib/db-snapshot';

type AnyTable = Parameters<typeof getPgTableConfig>[0] | Parameters<typeof getSqliteTableConfig>[0];

// Drizzle's table objects are the source of truth: a hand-written list would
// drift the moment a migration adds a table, and a backup that silently skips
// a table is worse than no backup.
function describe(table: unknown): SnapshotTable {
  const config = databaseMode === 'postgres'
    ? getPgTableConfig(table as Parameters<typeof getPgTableConfig>[0])
    : getSqliteTableConfig(table as Parameters<typeof getSqliteTableConfig>[0]);

  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      isDate: column.dataType === 'date',
    })),
    references: config.foreignKeys
      .map((foreignKey) => foreignKey.reference().foreignTable)
      .filter((target): target is AnyTable => Boolean(target))
      .map((target) => (databaseMode === 'postgres'
        ? getPgTableConfig(target as Parameters<typeof getPgTableConfig>[0]).name
        : getSqliteTableConfig(target as Parameters<typeof getSqliteTableConfig>[0]).name))
      .filter((targetName) => targetName !== config.name),
  };
}

const activeSchema = databaseMode === 'postgres'
  ? (postgresSchema as unknown as Record<string, unknown>)
  : (sqliteSchema as unknown as Record<string, unknown>);

const seen = new Set<unknown>();
const described: { meta: SnapshotTable; table: unknown }[] = [];
for (const value of Object.values(activeSchema)) {
  if (typeof value !== 'object' || value === null || seen.has(value)) continue;
  seen.add(value);
  try {
    described.push({ meta: describe(value), table: value });
  } catch {
    // Not a table export (types, helpers); skip it.
  }
}
described.sort((left, right) => left.meta.name.localeCompare(right.meta.name));

export const snapshotTables: SnapshotTable[] = described.map((entry) => entry.meta);
export const tableByName = new Map(described.map((entry) => [entry.meta.name, entry.table]));
