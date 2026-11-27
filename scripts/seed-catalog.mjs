// One-shot, idempotent storefront menu seed. Every row it creates starts
// disabled: nothing changes on the live store until an admin turns it on.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import nextEnv from '@next/env';
import postgres from 'postgres';

import { parseSystemConfig, resolveDatabaseUrls } from '../src/lib/system-config-core.ts';

nextEnv.loadEnvConfig(process.cwd());

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
  try {
    const value = JSON.parse(readFileSync(modeFile, 'utf8'));
    if (value?.mode === 'sqlite' || value?.mode === 'postgres') return value.mode;
  } catch {
    // fall through to the configured provider
  }
  const mode = process.env.DATABASE_PROVIDER ?? readSystemConfig().database.provider;
  if (mode === 'sqlite' || mode === 'postgres') return mode;
  throw new Error('DATABASE_PROVIDER must be "sqlite" or "postgres"');
}

function postgresUrl() {
  if (process.env.DATABASE_URL_FILE) {
    return readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim();
  }
  if (process.env.DATABASE_URL_DIRECT_FILE) {
    return readFileSync(process.env.DATABASE_URL_DIRECT_FILE, 'utf8').trim();
  }
  const resolved = resolveDatabaseUrls(readSystemConfig().database);
  const url = process.env.DATABASE_URL_DIRECT?.trim() || resolved.urlDirect;
  if (!url) throw new Error('Set DATABASE_URL or DATABASE_URL_FILE for PostgreSQL');
  return url;
}

// slug -> label, icon key, accent, kind. Product categories in the vendor feed
// map onto these menus.
const groups = [
  ['pulsa', 'Pulsa', 'smartphone', 'sky', 'prepaid', 'pulsa', true],
  ['paket-data', 'Paket Data', 'wifi', 'cyan', 'prepaid', 'data', true],
  ['voucher', 'Voucher', 'ticket', 'sky', 'prepaid', 'voucher', true],
  ['e-wallet', 'E-Wallet', 'wallet', 'emerald', 'prepaid', 'ewallet', true],
  ['top-up', 'Top Up', 'gamepad', 'blue', 'prepaid', 'game', true],
  ['token-listrik', 'Token Listrik', 'zap', 'amber', 'prepaid', 'pln', false],
  ['tagihan', 'Tagihan', 'filetext', 'rose', 'postpaid', 'tagihan', false],
];

// [group slug, subgroup slug, label, sort]
const subgroups = [
  ['token-listrik', 'pln', 'PLN', 10],
  ['token-listrik', 'pln-promo', 'PLN Promo', 20],
  ['tagihan', 'pdam', 'PDAM', 10],
  ['tagihan', 'bpjs', 'BPJS Kesehatan', 20],
  ['tagihan', 'finance', 'Finance', 30],
  ['tagihan', 'asuransi', 'Asuransi', 40],
  ['tagihan', 'tv-kabel', 'TV Kabel', 50],
  ['tagihan', 'internet-telepon', 'Internet & Telepon', 60],
  ['tagihan', 'gas', 'Gas', 70],
];

// [subgroup slug, matchType, matchValue, priority]
const rules = [
  ['pdam', 'operator', 'PDAM', 50],
  ['bpjs', 'operator', 'BPJS Kesehatan', 50],
  ['finance', 'operator', 'MULTI FINANCE', 50],
  ['asuransi', 'operator', 'ASURANSI', 50],
  ['tv-kabel', 'operator', 'TV KABEL', 50],
  ['internet-telepon', 'operator', 'Internet pascabayar', 50],
  ['internet-telepon', 'operator', 'Telpon Pascabayar', 50],
  ['gas', 'operator', 'GAS', 50],
  ['pln', 'operator', 'PLN', 100],
  ['pln-promo', 'operator', 'Token PLN', 100],
];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const statements = [];
for (const [index, [slug, label, iconKey, accent, kind, productCategory, includeUnmapped]] of groups.entries()) {
  statements.push(
    `INSERT INTO catalog_groups (id, slug, label, "iconKey", accent, kind, "productCategory", "includeUnmapped", "sortOrder", enabled)
     VALUES (${sqlString(randomUUID())}, ${sqlString(slug)}, ${sqlString(label)}, ${sqlString(iconKey)}, ${sqlString(accent)}, ${sqlString(kind)}, ${sqlString(productCategory)}, ${Boolean(includeUnmapped)}, ${(index + 1) * 10}, ${false})
     ON CONFLICT (slug) DO NOTHING`,
  );
}
for (const [groupSlug, slug, label, sort] of subgroups) {
  statements.push(
    `INSERT INTO catalog_subgroups (id, "groupId", slug, label, description, "sortOrder", enabled)
     SELECT ${sqlString(randomUUID())}, g.id, ${sqlString(slug)}, ${sqlString(label)}, '', ${sort}, ${false}
     FROM catalog_groups g WHERE g.slug = ${sqlString(groupSlug)}
     ON CONFLICT ("groupId", slug) DO NOTHING`,
  );
}
for (const [subgroupSlug, matchType, matchValue, priority] of rules) {
  statements.push(
    `INSERT INTO catalog_rules (id, "subgroupId", priority, vendor, "matchType", "matchValue")
     SELECT ${sqlString(randomUUID())}, s.id, ${priority}, NULL, ${sqlString(matchType)}, ${sqlString(matchValue)}
     FROM catalog_subgroups s WHERE s.slug = ${sqlString(subgroupSlug)}
       AND NOT EXISTS (
         SELECT 1 FROM catalog_rules r
         WHERE r."subgroupId" = s.id
           AND r."matchType" = ${sqlString(matchType)}
           AND r."matchValue" = ${sqlString(matchValue)}
       )`,
  );
}

if (getDatabaseMode() === 'postgres') {
  const url = postgresUrl();
  const client = postgres(url, {
    max: 1,
    prepare: false,
    ssl: new URL(url).searchParams.get('sslmode') === 'require' ? 'require' : false,
  });
  try {
    for (const statement of statements) await client.unsafe(statement);
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
    for (const statement of statements) await client.execute(statement);
  } finally {
    client.close();
  }
}

console.log(
  `Catalog seed applied: ${groups.length} kategori, ${subgroups.length} subkategori, ${rules.length} aturan (semua nonaktif).`,
);
console.log('Aktifkan di Admin > Katalog & Subkategori, lalu tekan Terapkan aturan.');
