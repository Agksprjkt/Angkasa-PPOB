import 'server-only';

import {
  defaultSystemConfig,
  parseSystemConfig,
  type DatabaseConfig,
  type SystemConfig,
} from '@/lib/system-config-core';
import { readSystemConfig, readSystemConfigWithoutSecrets, writeSystemConfig } from './system-config-store';

export type SystemConfigSource = 'environment' | 'dashboard';

export type SystemConfigSnapshot = {
  config: SystemConfig;
  sources: {
    databaseProvider: SystemConfigSource;
    databaseUrl: SystemConfigSource;
    redisUrl: SystemConfigSource;
    storageDriver: SystemConfigSource;
  };
  running: { provider: 'sqlite' | 'postgres'; storageDriver: 'local' | 's3' };
  restartRequired: boolean;
};

function environmentDatabaseUrl() {
  if (process.env.DATABASE_URL_FILE) return 'DATABASE_URL_FILE';
  if (process.env.DATABASE_URL?.trim()) return 'DATABASE_URL';
  return null;
}

// Environment variables keep overriding the dashboard, matching the integration
// settings panel. `DATABASE_MODE_FILE` is handled by database-mode.ts.
export function getSystemConfig(): SystemConfig {
  const stored = readSystemConfig();
  const provider = process.env.DATABASE_PROVIDER?.trim().toLowerCase();

  return {
    ...stored,
    database: {
      ...stored.database,
      provider: provider === 'postgres' || provider === 'sqlite'
        ? provider
        : stored.database.provider,
    },
    redis: {
      ...stored.redis,
      enabled: process.env.REDIS_URL?.trim() ? true : stored.redis.enabled,
    },
  };
}

export function getDatabaseConfig(): DatabaseConfig {
  return getSystemConfig().database;
}

// The built-in storefront switch. The proxy reads this on every page request so
// a dashboard change takes effect immediately, with no restart. A corrupt or
// unreadable config must not take the whole site down, so it fails open.
export function getStorefrontEnabled(): boolean {
  try {
    return readSystemConfigWithoutSecrets().storefront.enabled;
  } catch (error) {
    console.error(
      '[STOREFRONT_CONFIG_READ_FAILED]',
      error instanceof Error ? error.message : 'Unknown system config error',
    );
    return defaultSystemConfig.storefront.enabled;
  }
}

export function saveSystemConfig(config: SystemConfig) {
  writeSystemConfig(parseSystemConfig(config));
}

export function getSystemConfigSnapshot(
  running: { provider: 'sqlite' | 'postgres'; storageDriver: 'local' | 's3' },
): SystemConfigSnapshot {
  const config = getSystemConfig();
  const databaseUrlSource = environmentDatabaseUrl();
  const provider = process.env.DATABASE_PROVIDER?.trim().toLowerCase();

  return {
    config,
    sources: {
      databaseProvider:
        provider === 'postgres' || provider === 'sqlite' ? 'environment' : 'dashboard',
      databaseUrl: databaseUrlSource ? 'environment' : 'dashboard',
      redisUrl: process.env.REDIS_URL?.trim() ? 'environment' : 'dashboard',
      storageDriver: 'dashboard',
    },
    running,
    restartRequired:
      config.database.provider !== running.provider ||
      config.storage.driver !== running.storageDriver,
  };
}

export { defaultSystemConfig };
