import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptIntegrationSetting,
  encryptIntegrationSetting,
} from '../src/lib/server/integration-settings-crypto.ts';
import { parseSystemConfig } from '../src/lib/system-config-core.ts';
import {
  buildPostgresUrl,
  buildRedisUrl,
  defaultSystemConfig,
  isNeonEndpoint,
  resolveDatabaseUrls,
  resolveAuthSettings,
} from '../src/lib/system-config-core.ts';

// Mirrors the encrypted field list in system-config-store.ts. Each path must
// exist on the parsed config and stay bound to its own name as AES-GCM AAD.
const secretPaths = [
  'database.password',
  'database.neon.apiKey',
  'redis.password',
  'storage.s3.accessKeyId',
  'storage.s3.secretAccessKey',
];

test('system config secret fields exist and are bound to their own name', () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-system-config-fields';
  try {
    const config = parseSystemConfig({});
    for (const path of secretPaths) {
      let node = config;
      for (const part of path.split('.')) {
        assert.equal(typeof node, 'object', `${path}: ${part} is missing`);
        node = node[part];
      }
      assert.equal(typeof node, 'string', `${path} must be a string`);

      const encrypted = encryptIntegrationSetting(path, 'secret-value');
      assert.notEqual(encrypted, 'secret-value');
      assert.equal(decryptIntegrationSetting(path, encrypted), 'secret-value');
      const otherField = secretPaths.find((candidate) => candidate !== path);
      assert.throws(() => decryptIntegrationSetting(otherField, encrypted));
    }
  } finally {
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousSecret;
  }
});

const postgresConfig = {
  ...defaultSystemConfig.database,
  provider: 'postgres',
  host: 'db.example.com',
  port: 5433,
  user: 'app',
  password: 'p@ss word',
  database: 'ppob',
  schema: 'public',
};

test('parseSystemConfig falls back to defaults for unknown values', () => {
  const config = parseSystemConfig({
    database: { provider: 'mysql', port: 99999, poolMax: 'many' },
    storage: { driver: 'ftp', s3: { forcePathStyle: 'maybe' } },
  });

  assert.equal(config.database.provider, 'sqlite');
  assert.equal(config.database.port, 5432);
  assert.equal(config.database.poolMax, 10);
  assert.equal(config.storage.driver, 'local');
  assert.equal(config.storage.s3.forcePathStyle, true);
});

test('parseSystemConfig defaults and reads Better Auth frontend configuration', () => {
  assert.equal(defaultSystemConfig.auth.baseUrl, 'http://localhost:3000');
  assert.deepEqual(defaultSystemConfig.auth.trustedOrigins, []);

  const config = parseSystemConfig({
    auth: {
      baseUrl: 'https://api.example.com',
      trustedOrigins: [' https://shop.example.com ', 42, ''],
    },
  });
  assert.equal(config.auth.baseUrl, 'https://api.example.com');
  assert.deepEqual(config.auth.trustedOrigins, ['https://shop.example.com']);
});

test('Better Auth environment values override dashboard values only when non-empty', () => {
  const stored = {
    baseUrl: 'https://dashboard.example.com',
    trustedOrigins: ['https://shop.example.com'],
  };
  assert.deepEqual(
    resolveAuthSettings(
      stored,
      'https://env.example.com',
      'https://frontend.example.com, http://localhost:3001',
    ),
    {
      baseUrl: 'https://env.example.com',
      trustedOrigins: ['https://frontend.example.com', 'http://localhost:3001'],
    },
  );
  assert.deepEqual(resolveAuthSettings(stored, ' ', ''), stored);
});

test('parseSystemConfig keeps valid dashboard values', () => {
  const config = parseSystemConfig({
    database: { provider: 'postgres', poolMax: 25, neon: { enabled: true, projectId: 'proj-1' } },
    redis: { enabled: true, url: 'redis://cache:6379' },
    storage: { driver: 's3', s3: { endpoint: 'https://s3.example.com', prefix: '/media/' } },
  });

  assert.equal(config.database.provider, 'postgres');
  assert.equal(config.database.poolMax, 25);
  assert.equal(config.database.neon.enabled, true);
  assert.equal(config.redis.enabled, true);
  assert.equal(config.storage.driver, 's3');
  assert.equal(config.storage.s3.prefix, 'media');
});

test('buildPostgresUrl encodes credentials and points at the bundled container', () => {
  const url = new URL(buildPostgresUrl(postgresConfig));
  assert.equal(url.hostname, 'db.example.com');
  assert.equal(url.port, '5433');
  assert.equal(decodeURIComponent(url.username), 'app');
  assert.equal(decodeURIComponent(url.password), 'p@ss word');
  assert.equal(url.pathname, '/ppob');
  assert.match(url.searchParams.get('options') ?? '', /search_path=public/);

  const bundled = new URL(
    buildPostgresUrl({ ...postgresConfig, useBundledContainer: true }),
  );
  assert.equal(bundled.hostname, 'postgres');
});

test('buildRedisUrl uses the bundled host only when requested', () => {
  assert.equal(
    buildRedisUrl({ ...defaultSystemConfig.redis, useBundledContainer: true }),
    'redis://redis:6379',
  );
  assert.equal(
    buildRedisUrl({ ...defaultSystemConfig.redis, url: 'redis://cache:6380' }),
    'redis://cache:6380',
  );
});

test('resolveDatabaseUrls prefers the Neon pooled URL for runtime and direct for migrations', () => {
  const resolved = resolveDatabaseUrls({
    ...postgresConfig,
    neon: {
      enabled: true,
      projectId: 'proj-1',
      orgId: '',
      apiKey: '',
      urlPooled: 'postgresql://u:p@ep-x-pooler.eu.neon.tech/ppob?sslmode=require',
      urlDirect: 'postgresql://u:p@ep-x.eu.neon.tech/ppob?sslmode=require',
    },
  });

  assert.equal(resolved.url, 'postgresql://u:p@ep-x-pooler.eu.neon.tech/ppob?sslmode=require');
  assert.equal(resolved.urlDirect, 'postgresql://u:p@ep-x.eu.neon.tech/ppob?sslmode=require');
  assert.equal(resolved.ssl, true);
  assert.equal(resolved.migrateOnStartup, false);
  assert.equal(resolved.neon, true);
});

test('resolveDatabaseUrls keeps startup migrations for a self-hosted database', () => {
  const resolved = resolveDatabaseUrls(postgresConfig);
  assert.equal(resolved.url, resolved.urlDirect);
  assert.equal(resolved.ssl, false);
  assert.equal(resolved.migrateOnStartup, true);
  assert.equal(resolved.neon, false);
  assert.equal(resolved.poolMax, postgresConfig.poolMax);
});

test('resolveDatabaseUrls detects a Neon host even without the preset flag', () => {
  const resolved = resolveDatabaseUrls({
    ...postgresConfig,
    url: 'postgresql://u:p@ep-y.eu.neon.tech/ppob',
  });
  assert.equal(resolved.neon, true);
  assert.equal(resolved.ssl, true);
  assert.equal(resolved.migrateOnStartup, false);
});

test('storefront defaults to enabled and can be switched off', () => {
  assert.equal(defaultSystemConfig.storefront.enabled, true);
  assert.equal(parseSystemConfig({}).storefront.enabled, true);
  assert.equal(parseSystemConfig({ storefront: { enabled: false } }).storefront.enabled, false);
  assert.equal(parseSystemConfig({ storefront: { enabled: 'false' } }).storefront.enabled, false);
  assert.equal(parseSystemConfig({ storefront: { enabled: 'nonsense' } }).storefront.enabled, true);
});

test('isNeonEndpoint only matches Neon hostnames', () => {
  assert.equal(isNeonEndpoint('postgresql://u:p@ep-x.eu.neon.tech/ppob'), true);
  assert.equal(isNeonEndpoint('postgres://ppob:pw@127.0.0.1:5432/ppob'), false);
  assert.equal(isNeonEndpoint('not a url'), false);
});
