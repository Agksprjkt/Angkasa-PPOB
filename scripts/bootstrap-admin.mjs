import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { hashPassword } from 'better-auth/crypto';
import nextEnv from '@next/env';
import postgres from 'postgres';

nextEnv.loadEnvConfig(process.cwd());

if (process.env.BOOTSTRAP_ADMIN_ENABLED !== 'true') {
  console.log('Admin bootstrap is disabled; set BOOTSTRAP_ADMIN_ENABLED=true to enable it.');
  process.exit(0);
}

const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const rawPhone = process.env.BOOTSTRAP_ADMIN_PHONE?.trim();
const phoneDigits = rawPhone?.replace(/\D/g, '') ?? '';
const phone = rawPhone?.startsWith('+')
  ? `+${phoneDigits}`
  : phoneDigits.startsWith('0')
    ? `+62${phoneDigits.slice(1)}`
    : phoneDigits.startsWith('62')
      ? `+${phoneDigits}`
      : phoneDigits.startsWith('8')
        ? `+62${phoneDigits}`
        : '';
const validPhone = /^\+[1-9]\d{7,14}$/.test(phone);

if (!validPhone || !name || name.length > 100) {
  console.error('Set a valid BOOTSTRAP_ADMIN_PHONE and BOOTSTRAP_ADMIN_NAME in .env.local.');
  process.exit(1);
}
if (!password || password.length < 8 || password.length > 128) {
  console.error('BOOTSTRAP_ADMIN_PASSWORD must be between 8 and 128 characters.');
  process.exit(1);
}

const email = `${phone.replace(/\D/g, '')}@phone.payku.invalid`;

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

async function createPostgresAdmin() {
  const client = postgres(getPostgresUrl(), {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
  });
  try {
    const existing = await client`
      SELECT id FROM "user"
      WHERE "phoneNumber" = ${phone} OR email = ${email}
      LIMIT 1
    `;
    if (existing.length > 0) {
      console.log('Admin account already exists; no account or password was changed.');
      return;
    }
    const userId = randomUUID();
    const now = new Date();
    const passwordHash = await hashPassword(password);
    await client.begin(async (transaction) => {
      await transaction`
        INSERT INTO "user" (
          id, name, email, "emailVerified", "phoneNumber",
          "phoneNumberVerified", role, balance, "commissionBalance",
          "createdAt", "updatedAt"
        ) VALUES (${userId}, ${name}, ${email}, false, ${phone},
          true, 'admin', 0, 0, ${now}, ${now})
      `;
      await transaction`
        INSERT INTO "account" (
          id, "accountId", "providerId", "userId", password,
          "createdAt", "updatedAt"
        ) VALUES (${randomUUID()}, ${userId}, 'credential', ${userId},
          ${passwordHash}, ${now}, ${now})
      `;
    });
    console.log('Default admin account created from environment configuration.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function createSqliteAdmin() {
  const databasePath = resolve(
    process.cwd(),
    process.env.SQLITE_DATABASE_PATH || '.data/app.db',
  );
  mkdirSync(dirname(databasePath), { recursive: true });
  const client = createClient({ url: pathToFileURL(databasePath).href });
  try {
    const transaction = await client.transaction('write');
    try {
      const existing = await transaction.execute({
        sql: 'SELECT id FROM "user" WHERE "phoneNumber" = ? OR "email" = ? LIMIT 1',
        args: [phone, email],
      });

      if (existing.rows.length > 0) {
        await transaction.rollback();
        console.log('Admin account already exists; no account or password was changed.');
      } else {
        const userId = randomUUID();
        const now = Date.now();
        const passwordHash = await hashPassword(password);
        await transaction.execute({
          sql: `INSERT INTO "user" (
            "id", "name", "email", "emailVerified", "phoneNumber",
            "phoneNumberVerified", "role", "balance", "commissionBalance",
            "createdAt", "updatedAt"
          ) VALUES (?, ?, ?, 0, ?, 1, 'admin', 0, 0, ?, ?)`,
          args: [userId, name, email, phone, now, now],
        });
        await transaction.execute({
          sql: `INSERT INTO "account" (
            "id", "accountId", "providerId", "userId", "password",
            "createdAt", "updatedAt"
          ) VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
          args: [randomUUID(), userId, userId, passwordHash, now, now],
        });
        await transaction.commit();
        console.log('Default admin account created from environment configuration.');
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } finally {
    client.close();
  }
}

try {
  if (getDatabaseMode() === 'postgres') await createPostgresAdmin();
  else await createSqliteAdmin();
} catch (error) {
  console.error(
    'Admin bootstrap failed:',
    error instanceof Error ? error.message : 'Unknown database error',
  );
  process.exitCode = 1;
}
