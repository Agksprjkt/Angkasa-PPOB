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
import { resolveDatabaseUrls } from '@/lib/system-config-core';
import * as postgresSchema from './schema.postgres';
import * as sqliteSchema from './schema.sqlite';
import schema from './schema';
import { databaseMode, type DatabaseMode } from './database-mode';
import { isPooledEndpoint, resolveMigrateOnStartup } from './connection-options';
import { getDatabaseConfig } from '../system-config';

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

function assertPostgresUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error('PostgreSQL connection URL is not a valid URL', { cause: error });
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('PostgreSQL connection URL must use the postgres or postgresql protocol');
  }
  return url;
}

function readUrlFile(path: string) {
  return assertPostgresUrl(readFileSync(path, 'utf8').trim());
}

// Runtime uses the pooled URL; migrations use the direct URL, because PgBouncer
// in transaction mode cannot run the advisory locks Drizzle migrations take.
function getPostgresTargets() {
  const config = getDatabaseConfig();
  const resolved = resolveDatabaseUrls(
    config,
    resolveMigrateOnStartup(process.env.DATABASE_MIGRATE_ON_STARTUP, config.migrateOnStartup),
  );  const url = process.env.DATABASE_URL_FILE
    ? readUrlFile(process.env.DATABASE_URL_FILE)
    : assertPostgresUrl(process.env.DATABASE_URL?.trim() || resolved.url);
  const urlDirect = process.env.DATABASE_URL_DIRECT_FILE
    ? readUrlFile(process.env.DATABASE_URL_DIRECT_FILE)
    : assertPostgresUrl(process.env.DATABASE_URL_DIRECT?.trim() || resolved.urlDirect);

  return {
    url,
    urlDirect,
    poolMax: resolved.poolMax,
    ssl: resolved.ssl,
    migrateOnStartup: resolved.migrateOnStartup,
  };
}

function openDatabase(): DatabaseInstance {
  const mode = databaseMode;
  if (mode === 'postgres') {
    const targets = getPostgresTargets();
    const migrationsFolder = resolve(process.cwd(), 'drizzle', 'postgres-runtime');
    const client = postgres(targets.url, {
      max: targets.poolMax,
      connect_timeout: 10,
      idle_timeout: 20,
      prepare: !isPooledEndpoint(targets.url),
      ssl: targets.ssl ? 'require' : false,
    });
    const database = drizzlePostgres(client, { schema: postgresSchema });

    return {
      mode,
      db: database as unknown as AppDatabase,
      close: () => client.end({ timeout: 5 }),
      runMigrations: async () => {
        if (targets.urlDirect === targets.url) {
          await migratePostgres(database, { migrationsFolder });
          return;
        }
        const migrationClient = postgres(targets.urlDirect, {
          max: 1,
          connect_timeout: 10,
          idle_timeout: 10,
          prepare: false,
          ssl: targets.ssl ? 'require' : false,
        });
        try {
          await migratePostgres(drizzlePostgres(migrationClient), { migrationsFolder });
        } finally {
          await migrationClient.end({ timeout: 5 });
        }
      },
    };
  }

  const filePath = resolve(/*turbopackIgnore: true*/
    process.cwd(),
    process.env.SQLITE_DATABASE_PATH || join('.data', 'app.db'),
  );
  mkdirSync(dirname(filePath), { recursive: true });

  const client = createClient({
    url: pathToFileURL(filePath).href,
    // SQLite defaults to a 0ms busy timeout, so any overlap between two
    // requests fails immediately with SQLITE_BUSY. Wait instead of crashing.
    timeout: 5_000,
  });
  const database = drizzleLibSql(client, { schema });
  // WAL lets readers run while a writer holds the lock, which removes most of
  // the contention a single-file SQLite database sees under concurrent requests.
  void client.execute('PRAGMA journal_mode = WAL').catch(() => undefined);
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

function shouldMigrateOnStartup() {
  if (databaseMode === 'postgres') return getPostgresTargets().migrateOnStartup;
  return resolveMigrateOnStartup(process.env.DATABASE_MIGRATE_ON_STARTUP, true);
}

export function getDatabase(): AppDatabase {
  globalForDatabase.ppobDatabase ??= openDatabase();
  return globalForDatabase.ppobDatabase.db;
}

export async function initializeDatabase() {
  globalForDatabase.ppobDatabase ??= openDatabase();
  const database = globalForDatabase.ppobDatabase;
  if (!shouldMigrateOnStartup()) return;
  database.migration ??= database.runMigrations();
  await database.migration;
}
