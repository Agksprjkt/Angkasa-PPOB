import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import nextEnv from '@next/env';
import postgres from 'postgres';
import { drizzle as drizzleLibSql } from 'drizzle-orm/libsql';
import { migrate as migrateLibSql } from 'drizzle-orm/libsql/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { parseSystemConfig, resolveDatabaseUrls } from '../src/lib/system-config-core.ts';

nextEnv.loadEnvConfig(process.cwd());

// The connection fields used here are never encrypted, so the script reads the
// config file directly instead of importing the server-only store.
function readSystemConfig() {
  const file = resolve(
    process.cwd(),
    process.env.SYSTEM_CONFIG_FILE || '.data/system-config.json',
  );
  try {
    return parseSystemConfig(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return parseSystemConfig({});
  }
}

function getDatabaseMode() {
  const modeFile = process.env.DATABASE_MODE_FILE ||
    resolve(process.cwd(), '.data', 'database-mode.json');
  let contents;
  try {
    contents = readFileSync(modeFile, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      const mode = process.env.DATABASE_PROVIDER ?? readSystemConfig().database.provider;
      if (mode === 'sqlite' || mode === 'postgres') return mode;
      throw new Error('DATABASE_PROVIDER must be "sqlite" or "postgres"');
    }
    throw new Error(`Failed to read database mode file: ${modeFile}`, { cause: error });
  }

  let value;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Database mode file contains invalid JSON: ${modeFile}`, { cause: error });
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mode' in value) ||
    (value.mode !== 'sqlite' && value.mode !== 'postgres')
  ) {
    throw new Error(`Database mode file must contain mode "sqlite" or "postgres": ${modeFile}`);
  }
  return value.mode;
}

function assertUrl(url) {
  if (!url) throw new Error('Set DATABASE_URL or DATABASE_URL_FILE for PostgreSQL');
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }
  return url;
}

// Migrations always target the direct URL; a pooled PgBouncer endpoint cannot
// run the advisory locks Drizzle migrations take.
function getPostgresUrl() {
  if (process.env.DATABASE_URL_FILE) {
    return assertUrl(readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim());
  }
  if (process.env.DATABASE_URL_DIRECT_FILE) {
    return assertUrl(readFileSync(process.env.DATABASE_URL_DIRECT_FILE, 'utf8').trim());
  }
  const resolved = resolveDatabaseUrls(readSystemConfig().database);
  return assertUrl(process.env.DATABASE_URL_DIRECT?.trim() || resolved.urlDirect);
}

if (getDatabaseMode() === 'postgres') {
  const url = getPostgresUrl();
  const client = postgres(url, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    prepare: false,
    ssl: new URL(url).searchParams.get('sslmode') === 'require' ? 'require' : false,
  });
  try {
    await migratePostgres(drizzlePostgres(client), {
      migrationsFolder: resolve(process.cwd(), 'drizzle', 'postgres-runtime'),
    });
    console.log('PostgreSQL database is ready.');
  } finally {
    await client.end({ timeout: 5 });
  }
} else {
  const databasePath = resolve(
    process.cwd(),
    process.env.SQLITE_DATABASE_PATH || '.data/app.db',
  );
  mkdirSync(dirname(databasePath), { recursive: true });

  const client = createClient({ url: pathToFileURL(databasePath).href });
  try {
    await client.execute('PRAGMA foreign_keys = ON');
    await migrateLibSql(drizzleLibSql(client), {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
    console.log('Local SQLite database is ready.');
  } finally {
    client.close();
  }
}
