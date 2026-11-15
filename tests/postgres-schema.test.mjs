import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { readFile, readdir } from 'node:fs/promises';
import { drizzle as drizzleLibSql } from 'drizzle-orm/libsql';
import { migrate as migrateLibSql } from 'drizzle-orm/libsql/migrator';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

async function getPostgresColumns(database) {
  const result = await database.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  return groupColumns(result.rows);
}

function groupColumns(rows) {
  const tables = new Map();
  for (const row of rows) {
    const columns = tables.get(row.table_name) ?? [];
    columns.push(row.column_name);
    tables.set(row.table_name, columns);
  }
  return Object.fromEntries(
    [...tables.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, columns]) => [name, columns.sort()]),
  );
}

async function getSqliteColumns(client) {
  const tables = await client.execute(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      AND name != '__drizzle_migrations'
    ORDER BY name
  `);
  const columns = [];
  for (const { name } of tables.rows) {
    const result = await client.execute(`PRAGMA table_info("${name.replaceAll('"', '""')}")`);
    columns.push(...result.rows.map((row) => ({
      table_name: name,
      column_name: row.name,
    })));
  }
  return groupColumns(columns);
}

test('PostgreSQL migration creates financial tables and enforces ledger constraints', async () => {
  const migrationDirectory = new URL('../drizzle/postgres-runtime/', import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const database = new PGlite();
  try {
    for (const migrationFile of migrationFiles) {
      const migration = await readFile(new URL(migrationFile, migrationDirectory), 'utf8');
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) await database.exec(statement);
      }
    }

    await database.query(`
      INSERT INTO "user" (
        id, name, email, "emailVerified", "phoneNumberVerified", role,
        balance, "commissionBalance", "createdAt", "updatedAt"
      ) VALUES ('user-1', 'Test', 'test@example.invalid', false, false,
        'user', 0, 0, now(), now())
    `);
    await database.query(`
      INSERT INTO balance_ledger (
        id, "idempotencyKey", "userId", type, amount,
        "balanceBefore", "balanceAfter", reference, note
      ) VALUES ('ledger-1', 'deposit-1', 'user-1', 'credit', 1000, 0, 1000,
        'deposit-1', 'test deposit')
    `);

    const result = await database.query(`
      SELECT "balanceAfter" FROM balance_ledger WHERE id = 'ledger-1'
    `);
    assert.equal(result.rows[0].balanceAfter, 1000);
    await assert.rejects(database.query(`
      INSERT INTO balance_ledger (
        id, "idempotencyKey", "userId", type, amount,
        "balanceBefore", "balanceAfter", reference, note
      ) VALUES ('ledger-2', 'deposit-2', 'user-1', 'credit', 0, 1000, 1000,
        'deposit-2', 'invalid zero amount')
    `));
  } finally {
    await database.close();
  }
});

test('PostgreSQL and SQLite migrations create matching application tables and columns', async () => {
  const migrationDirectory = new URL('../drizzle/postgres-runtime/', import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const postgresDatabase = new PGlite();
  const sqliteClient = createClient({ url: 'file::memory:' });
  try {
    for (const migrationFile of migrationFiles) {
      const migration = await readFile(new URL(migrationFile, migrationDirectory), 'utf8');
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) await postgresDatabase.exec(statement);
      }
    }
    await migrateLibSql(drizzleLibSql(sqliteClient), {
      migrationsFolder: fileURLToPath(new URL('../drizzle/', import.meta.url)),
    });

    assert.deepEqual(
      await getPostgresColumns(postgresDatabase),
      await getSqliteColumns(sqliteClient),
    );
  } finally {
    sqliteClient.close();
    await postgresDatabase.close();
  }
});
