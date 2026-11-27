// Pure helpers for the admin backup/restore feature. No database import here so
// the test can exercise ordering and encoding without a running server.

export type SnapshotColumn = { name: string; isDate: boolean };

export type SnapshotTable = {
  name: string;
  columns: SnapshotColumn[];
  /** Names of tables this one points at through a foreign key. */
  references: string[];
};

export type SnapshotDump = {
  version: 1;
  mode: 'sqlite' | 'postgres';
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export const BACKUP_VERSION = 1;

/**
 * Parents first: a row can only be inserted after every table it references.
 * Tables caught in a cycle keep their declared order, which is the best a plain
 * topological sort can do; no current table has one.
 */
export function sortTables(tables: SnapshotTable[]): SnapshotTable[] {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const ordered: SnapshotTable[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (table: SnapshotTable) => {
    if (state.has(table.name)) return;
    state.set(table.name, 'visiting');
    for (const parent of table.references) {
      const target = byName.get(parent);
      if (target && state.get(target.name) !== 'visiting') visit(target);
    }
    state.set(table.name, 'done');
    ordered.push(table);
  };

  for (const table of tables) visit(table);
  return ordered;
}

export function encodeRows(
  rows: Record<string, unknown>[],
  columns: SnapshotColumn[],
): Record<string, unknown>[] {
  const dateColumns = columns.filter((column) => column.isDate).map((column) => column.name);
  if (!dateColumns.length) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const name of dateColumns) {
      const value = copy[name];
      if (value instanceof Date) copy[name] = value.toISOString();
    }
    return copy;
  });
}

export function decodeRows(
  rows: Record<string, unknown>[],
  columns: SnapshotColumn[],
): Record<string, unknown>[] {
  const dateColumns = columns.filter((column) => column.isDate).map((column) => column.name);
  if (!dateColumns.length) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const name of dateColumns) {
      const value = copy[name];
      if (typeof value === 'string') copy[name] = new Date(value);
    }
    return copy;
  });
}

export function createDump(
  mode: 'sqlite' | 'postgres',
  tables: Record<string, Record<string, unknown>[]>,
  now: Date = new Date(),
): SnapshotDump {
  return { version: BACKUP_VERSION, mode, createdAt: now.toISOString(), tables };
}

export function backupFileName(now: Date = new Date()) {
  return `ppob-backup-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

function fail(code: string): never {
  throw new Error(code);
}

/**
 * Rejects a file that does not match the running schema instead of restoring
 * half of it. Names are compared exactly, so a dump from a different app
 * version is refused rather than silently dropping columns.
 */
export function parseDump(
  text: string,
  tables: SnapshotTable[],
  mode: 'sqlite' | 'postgres',
): SnapshotDump {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('INVALID_BACKUP_FILE');
  }
  if (typeof parsed !== 'object' || parsed === null) fail('INVALID_BACKUP_FILE');
  const dump = parsed as Partial<SnapshotDump>;
  if (dump.version !== BACKUP_VERSION) fail('INVALID_BACKUP_FILE');
  if (dump.mode !== 'sqlite' && dump.mode !== 'postgres') fail('INVALID_BACKUP_FILE');
  if (dump.mode !== mode) fail('BACKUP_DIALECT_MISMATCH');
  if (typeof dump.tables !== 'object' || dump.tables === null) fail('INVALID_BACKUP_FILE');

  const expected = new Map(tables.map((table) => [table.name, table]));
  const seen = Object.keys(dump.tables);
  if (seen.length !== expected.size || seen.some((name) => !expected.has(name))) {
    fail('BACKUP_SCHEMA_MISMATCH');
  }

  const rows: Record<string, Record<string, unknown>[]> = {};
  for (const [name, value] of Object.entries(dump.tables)) {
    if (!Array.isArray(value)) fail('INVALID_BACKUP_FILE');
    const allowed = new Set(expected.get(name)!.columns.map((column) => column.name));
    for (const row of value) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) fail('INVALID_BACKUP_FILE');
      for (const key of Object.keys(row)) {
        if (!allowed.has(key)) fail('BACKUP_SCHEMA_MISMATCH');
      }
    }
    rows[name] = value as Record<string, unknown>[];
  }

  return {
    version: BACKUP_VERSION,
    mode,
    createdAt: typeof dump.createdAt === 'string' ? dump.createdAt : new Date(0).toISOString(),
    tables: rows,
  };
}
