// Pure config model shared by the Next.js server and Node scripts. No imports so
// `node --experimental-strip-types` can load it directly from scripts/.

export type DatabaseProvider = 'sqlite' | 'postgres';
export type StorageDriver = 'local' | 's3';

export type NeonConfig = {
  enabled: boolean;
  projectId: string;
  orgId: string;
  apiKey: string;
  urlPooled: string;
  urlDirect: string;
};

export type DatabaseConfig = {
  provider: DatabaseProvider;
  useBundledContainer: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  poolMax: number;
  schema: string;
  ssl: boolean;
  url: string;
  urlDirect: string;
  migrateOnStartup: boolean;
  neon: NeonConfig;
};

export type RedisConfig = {
  enabled: boolean;
  useBundledContainer: boolean;
  url: string;
  password: string;
};

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  forcePathStyle: boolean;
};

export type StorageConfig = {
  driver: StorageDriver;
  localPath: string;
  s3: S3Config;
};

// When disabled, the built-in storefront is closed and only the admin dashboard
// stays reachable. The API keeps serving external frontends.
export type StorefrontConfig = {
  enabled: boolean;
};

export type AuthConfig = {
  baseUrl: string;
  trustedOrigins: string[];
};

export type SystemConfig = {
  auth: AuthConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  storage: StorageConfig;
  storefront: StorefrontConfig;
};

export function resolveAuthSettings(
  stored: AuthConfig,
  environmentBaseUrl?: string,
  environmentOrigins?: string,
): AuthConfig {
  const baseUrl = environmentBaseUrl?.trim();
  const origins = environmentOrigins?.trim();
  return {
    baseUrl: baseUrl || stored.baseUrl,
    trustedOrigins: origins
      ? origins.split(',').map((origin) => origin.trim()).filter(Boolean)
      : stored.trustedOrigins,
  };
}

export const defaultSystemConfig: SystemConfig = {
  auth: {
    baseUrl: 'http://localhost:3000',
    trustedOrigins: [],
  },
  database: {
    provider: 'sqlite',
    useBundledContainer: false,
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'ppob',
    poolMax: 10,
    schema: 'public',
    ssl: false,
    url: '',
    urlDirect: '',
    migrateOnStartup: true,
    neon: {
      enabled: false,
      projectId: '',
      orgId: '',
      apiKey: '',
      urlPooled: '',
      urlDirect: '',
    },
  },
  redis: {
    enabled: false,
    useBundledContainer: false,
    url: '',
    password: '',
  },
  storage: {
    driver: 'local',
    localPath: '.data/uploads',
    s3: {
      endpoint: '',
      region: 'auto',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      prefix: '',
      forcePathStyle: true,
    },
  },
  storefront: {
    enabled: true,
  },
};

// Hostnames the Compose stack publishes on its internal network.
const bundledHosts = { postgres: 'postgres', redis: 'redis' } as const;

function text(value: unknown, fallback: string, maxLength = 2048) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback;
}

function bool(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return fallback;
}

function int(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseSystemConfig(raw: unknown): SystemConfig {
  const root = record(raw);
  const auth = record(root.auth);
  const database = record(root.database);
  const neon = record(database.neon);
  const redis = record(root.redis);
  const storage = record(root.storage);
  const s3 = record(storage.s3);
  const storefront = record(root.storefront);
  const defaults = defaultSystemConfig;

  return {
    auth: {
      baseUrl: text(auth.baseUrl, defaults.auth.baseUrl, 2048),
      trustedOrigins: Array.isArray(auth.trustedOrigins)
        ? auth.trustedOrigins
            .filter((origin): origin is string => typeof origin === 'string')
            .map((origin) => origin.trim())
            .filter(Boolean)
            .slice(0, 32)
        : [],
    },
    database: {
      provider: database.provider === 'postgres' ? 'postgres' : 'sqlite',
      useBundledContainer: bool(database.useBundledContainer, false),
      host: text(database.host, defaults.database.host, 255),
      port: int(database.port, defaults.database.port, 1, 65535),
      user: text(database.user, defaults.database.user, 128),
      password: text(database.password, '', 512),
      database: text(database.database, defaults.database.database, 128),
      poolMax: int(database.poolMax, defaults.database.poolMax, 1, 100),
      schema: text(database.schema, defaults.database.schema, 63),
      ssl: bool(database.ssl, false),
      url: text(database.url, '', 2048),
      urlDirect: text(database.urlDirect, '', 2048),
      migrateOnStartup: bool(database.migrateOnStartup, true),
      neon: {
        enabled: bool(neon.enabled, false),
        projectId: text(neon.projectId, '', 128),
        orgId: text(neon.orgId, '', 128),
        apiKey: text(neon.apiKey, '', 512),
        urlPooled: text(neon.urlPooled, '', 2048),
        urlDirect: text(neon.urlDirect, '', 2048),
      },
    },
    redis: {
      enabled: bool(redis.enabled, false),
      useBundledContainer: bool(redis.useBundledContainer, false),
      url: text(redis.url, '', 2048),
      password: text(redis.password, '', 512),
    },
    storage: {
      driver: storage.driver === 's3' ? 's3' : 'local',
      localPath: text(storage.localPath, defaults.storage.localPath, 512),
      s3: {
        endpoint: text(s3.endpoint, '', 2048),
        region: text(s3.region, defaults.storage.s3.region, 64),
        bucket: text(s3.bucket, '', 255),
        accessKeyId: text(s3.accessKeyId, '', 512),
        secretAccessKey: text(s3.secretAccessKey, '', 512),
        prefix: text(s3.prefix, '', 255).replace(/^\/+|\/+$/g, ''),
        forcePathStyle: bool(s3.forcePathStyle, true),
      },
    },
    storefront: {
      enabled: bool(storefront.enabled, defaults.storefront.enabled),
    },
  };
}

export function isNeonEndpoint(url: string) {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

function encodeSchema(schema: string) {
  return `options=${encodeURIComponent(`-c search_path=${schema}`)}`;
}

export function buildPostgresUrl(config: DatabaseConfig) {
  const host = config.useBundledContainer ? bundledHosts.postgres : config.host;
  const credentials = `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}`;
  const search = encodeSchema(config.schema || 'public');
  return `postgres://${credentials}@${host}:${config.port}/${encodeURIComponent(config.database)}?${search}`;
}

export function buildRedisUrl(config: RedisConfig) {
  if (config.useBundledContainer) return `redis://${bundledHosts.redis}:6379`;
  return config.url;
}

export type ResolvedDatabase = {
  url: string;
  urlDirect: string;
  poolMax: number;
  ssl: boolean;
  migrateOnStartup: boolean;
  neon: boolean;
};

// Runtime uses the pooled URL, migrations use the direct one. Neon rejects
// startup migrations when several instances boot at once, so they are disabled
// there even when the stored flag says otherwise.
export function resolveDatabaseUrls(
  config: DatabaseConfig,
  migrateOnStartupOverride?: boolean,
): ResolvedDatabase {
  const neon = config.neon.enabled && Boolean(config.neon.urlPooled);
  const url = neon
    ? config.neon.urlPooled
    : config.url || buildPostgresUrl(config);
  const urlDirect = neon
    ? config.neon.urlDirect || config.neon.urlPooled
    : config.urlDirect || url;
  const neonHost = neon || isNeonEndpoint(url);
  const storedMigrate = migrateOnStartupOverride ?? config.migrateOnStartup;

  return {
    url,
    urlDirect,
    poolMax: config.poolMax,
    ssl: config.ssl || neonHost,
    migrateOnStartup: storedMigrate && !neonHost,
    neon: neonHost,
  };
}
