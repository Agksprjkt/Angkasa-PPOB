import { NextRequest, NextResponse } from 'next/server';
import { getAuth, refreshAuthConfig } from '@/lib/server/auth';
import {
  getSystemConfig,
  getSystemConfigSnapshot,
  saveSystemConfig,
} from '@/lib/server/system-config';
import { clearNeonCache } from '@/lib/server/neon-api';
import { parseSystemConfig, type SystemConfig } from '@/lib/system-config-core';
import { testStorageConnection } from '@/lib/server/storage';
import { pingRedis } from '@/lib/server/redis';
import { databaseMode } from '@/lib/server/db/database-mode';
import { readSystemConfig } from '@/lib/server/system-config-store';
import { normalizeAuthBaseUrl, parseFrontendOrigins } from '@/lib/frontend-integration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const secretFields = [
  'database.password',
  'database.neon.apiKey',
  'redis.password',
  'storage.s3.accessKeyId',
  'storage.s3.secretAccessKey',
] as const;

// The browser never receives a stored secret; it only learns whether one exists.
function redact(config: SystemConfig) {
  const clone = JSON.parse(JSON.stringify(config)) as SystemConfig;
  for (const path of secretFields) {
    const parts = path.split('.');
    let target = clone as unknown as Record<string, unknown>;
    for (const part of parts.slice(0, -1)) {
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = '';
  }
  return clone;
}

function secretsPresent(config: SystemConfig) {
  return {
    databasePassword: Boolean(config.database.password),
    neonApiKey: Boolean(config.database.neon.apiKey),
    redisPassword: Boolean(config.redis.password),
    s3AccessKeyId: Boolean(config.storage.s3.accessKeyId),
    s3SecretAccessKey: Boolean(config.storage.s3.secretAccessKey),
  };
}

async function requireAdmin(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin';
}

// Storage is re-read on every call, so its saved value is the running value.
function snapshot() {
  const config = getSystemConfig();
  return {
    ...getSystemConfigSnapshot({
      provider: databaseMode,
      storageDriver: config.storage.driver,
    }),
    config,
  };
}

function snapshotResponse(includeSecrets: boolean) {
  const { config, sources, running, restartRequired } = snapshot();
  return {
    config: includeSecrets ? config : redact(config),
    secretsPresent: secretsPresent(config),
    sources,
    running,
    restartRequired,
  };
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const [redisConnected] = await Promise.all([pingRedis()]);
    return NextResponse.json({ ...snapshotResponse(false), redisConnected });
  } catch (error) {
    console.error(
      '[ADMIN_SYSTEM_SETTINGS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown system settings error',
    );
    return NextResponse.json({ error: 'SYSTEM_SETTINGS_UNAVAILABLE' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json({ error: 'INVALID_SETTINGS_BODY' }, { status: 400 });
  }
  const body = payload as { config?: unknown; action?: unknown; clearSecrets?: unknown };
  const action = typeof body.action === 'string' ? body.action : 'save';

  if (action === 'test-storage') {
    try {
      await testStorageConnection();
      return NextResponse.json({ ok: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'STORAGE_TEST_FAILED';
      return NextResponse.json({ ok: false, error: code }, { status: 400 });
    }
  }
  if (action !== 'save') {
    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
  }
  if (!body.config) {
    return NextResponse.json({ error: 'INVALID_SETTINGS_BODY' }, { status: 400 });
  }

  try {
    const current = getSystemConfig();
    const stored = readSystemConfig();
    const next = parseSystemConfig(body.config);
    if (process.env.BETTER_AUTH_URL?.trim()) {
      next.auth.baseUrl = stored.auth.baseUrl;
    }
    if (process.env.BETTER_AUTH_TRUSTED_ORIGINS?.trim()) {
      next.auth.trustedOrigins = stored.auth.trustedOrigins;
    }
    // Empty secret fields mean "keep the stored value"; the UI cannot echo them back.
    if (!next.database.password) next.database.password = current.database.password;
    if (!next.database.neon.apiKey) next.database.neon.apiKey = current.database.neon.apiKey;
    if (!next.redis.password) next.redis.password = current.redis.password;
    if (!next.storage.s3.accessKeyId) next.storage.s3.accessKeyId = current.storage.s3.accessKeyId;
    if (!next.storage.s3.secretAccessKey) {
      next.storage.s3.secretAccessKey = current.storage.s3.secretAccessKey;
    }
    if (Array.isArray(body.clearSecrets)) {
      for (const field of body.clearSecrets) {
        if (typeof field === 'string') clearSecret(next, field);
      }
    }

    validateConfig(next);
    saveSystemConfig(next);
    if (
      !process.env.BETTER_AUTH_URL?.trim() &&
      next.auth.baseUrl !== stored.auth.baseUrl
    ) {
      refreshAuthConfig();
    }
    clearNeonCache();
    return NextResponse.json(snapshotResponse(false));
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SYSTEM_SETTINGS_SAVE_FAILED';
    if (code.startsWith('INVALID_')) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    console.error('[ADMIN_SYSTEM_SETTINGS_SAVE_FAILED]', code);
    return NextResponse.json({ error: 'SYSTEM_SETTINGS_COULD_NOT_BE_SAVED' }, { status: 503 });
  }
}

function clearSecret(config: SystemConfig, field: string) {
  if (!(secretFields as readonly string[]).includes(field)) return;
  const parts = field.split('.');
  let target = config as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    target = target[part] as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = '';
}

function validateConfig(config: SystemConfig) {
  const { auth, database, storage, redis } = config;
  if (!process.env.BETTER_AUTH_URL?.trim()) {
    try {
      auth.baseUrl = normalizeAuthBaseUrl(auth.baseUrl);
    } catch {
      throw new Error('INVALID_AUTH_BASE_URL');
    }
  }
  if (!process.env.BETTER_AUTH_TRUSTED_ORIGINS?.trim()) {
    try {
      auth.trustedOrigins = parseFrontendOrigins(auth.trustedOrigins.join('\n'));
    } catch {
      throw new Error('INVALID_FRONTEND_ORIGINS');
    }
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(database.schema)) {
    throw new Error('INVALID_DATABASE_SCHEMA');
  }
  if (database.url && !/^postgres(ql)?:\/\//.test(database.url)) {
    throw new Error('INVALID_DATABASE_URL');
  }
  if (database.urlDirect && !/^postgres(ql)?:\/\//.test(database.urlDirect)) {
    throw new Error('INVALID_DATABASE_URL_DIRECT');
  }
  if (redis.url && !/^rediss?:\/\//.test(redis.url)) {
    throw new Error('INVALID_REDIS_URL');
  }
  if (storage.localPath.includes('..')) throw new Error('INVALID_STORAGE_PATH');
  if (storage.driver !== 's3') return;

  const { s3 } = storage;
  if (!s3.endpoint || !s3.bucket) throw new Error('INVALID_S3_REQUIRED_FIELDS');
  let endpoint: URL;
  try {
    endpoint = new URL(s3.endpoint);
  } catch {
    throw new Error('INVALID_S3_ENDPOINT');
  }
  // Plain HTTP is only acceptable for a local MinIO-style endpoint.
  const privateHost = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname) ||
    /^10\./.test(endpoint.hostname) ||
    /^192\.168\./.test(endpoint.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && privateHost)) {
    throw new Error('INVALID_S3_ENDPOINT_PROTOCOL');
  }
  if (endpoint.username || endpoint.password) throw new Error('INVALID_S3_ENDPOINT');
}
