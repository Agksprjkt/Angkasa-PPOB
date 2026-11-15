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

nextEnv.loadEnvConfig(process.cwd());

function getDatabaseMode() {
  const modeFile = process.env.DATABASE_MODE_FILE ||
    resolve(process.cwd(), '.data', 'database-mode.json');
  let contents;
  try {
    contents = readFileSync(modeFile, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      const mode = process.env.DATABASE_PROVIDER ?? 'sqlite';
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

function getPostgresUrl() {
  const url = process.env.DATABASE_URL_FILE
    ? readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim()
    : process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL or DATABASE_URL_FILE for PostgreSQL');
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }
  return url;
}

if (getDatabaseMode() === 'postgres') {
  const client = postgres(getPostgresUrl(), {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
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
