import 'server-only';

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import postgres from 'postgres';
import { drizzle as drizzleLibSql, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate as migrateLibSql } from 'drizzle-orm/libsql/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import * as postgresSchema from './schema.postgres';
import * as sqliteSchema from './schema.sqlite';
import schema from './schema';
import { databaseMode, type DatabaseMode } from './database-mode';

type AppDatabase = LibSQLDatabase<typeof sqliteSchema>;
type DatabaseInstance = {
  mode: DatabaseMode;
  db: AppDatabase;
  close: () => Promise<void>;
  runMigrations: () => Promise<void>;
  migration?: Promise<void>;
};

const globalForDatabase = globalThis as typeof globalThis & {
  ppobDatabase?: DatabaseInstance;
};

function getPostgresUrl() {
  const url = process.env.DATABASE_URL_FILE
    ? readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim()
    : process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL or DATABASE_URL_FILE for PostgreSQL');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error('DATABASE_URL is not a valid URL', { cause: error });
  }
  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }
  return url;
}

function openDatabase(): DatabaseInstance {
  const mode = databaseMode;
  if (mode === 'postgres') {
    const client = postgres(getPostgresUrl(), {
      max: 10,
      connect_timeout: 10,
      idle_timeout: 20,
    });
    const database = drizzlePostgres(client, { schema: postgresSchema });
    return {
      mode,
      db: database as unknown as AppDatabase,
      close: () => client.end({ timeout: 5 }),
      runMigrations: () => migratePostgres(database, {
        migrationsFolder: resolve(process.cwd(), 'drizzle', 'postgres-runtime'),
      }),
    };
  }

  const filePath = resolve(/*turbopackIgnore: true*/
    process.cwd(),
    process.env.SQLITE_DATABASE_PATH || join('.data', 'app.db'),
  );
  mkdirSync(dirname(filePath), { recursive: true });

  const client = createClient({ url: pathToFileURL(filePath).href });
  const database = drizzleLibSql(client, { schema });
  return {
    mode,
    db: database,
    close: async () => { client.close(); },
    runMigrations: async () => {
      await client.execute('PRAGMA foreign_keys = ON');
      await migrateLibSql(database, {
        migrationsFolder: resolve(process.cwd(), 'drizzle'),
      });
    },
  };
}

export function getDatabase(): AppDatabase {
  globalForDatabase.ppobDatabase ??= openDatabase();
  return globalForDatabase.ppobDatabase.db;
}

export async function initializeDatabase() {
  globalForDatabase.ppobDatabase ??= openDatabase();
  const database = globalForDatabase.ppobDatabase;
  database.migration ??= database.runMigrations();
  await database.migration;
}
