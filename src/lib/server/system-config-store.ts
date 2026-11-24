import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseSystemConfig, type SystemConfig } from '../system-config-core';
import {
  decryptIntegrationSetting,
  encryptIntegrationSetting,
} from './integration-settings-crypto';

export const systemConfigPath = () =>
  resolve(
    /*turbopackIgnore: true*/
    process.cwd(),
    process.env.SYSTEM_CONFIG_FILE || '.data/system-config.json',
  );

// Secrets live in the same file but are stored as AES-GCM ciphertext. The field
// name is the AAD, so a ciphertext cannot be moved to a different field.
const secretFields = [
  'database.password',
  'database.neon.apiKey',
  'redis.password',
  'storage.s3.accessKeyId',
  'storage.s3.secretAccessKey',
] as const;

export type SecretField = (typeof secretFields)[number];

function getPath(config: Record<string, unknown>, path: SecretField) {
  const parts = path.split('.');
  if (parts.length === 2) {
    const parent = config[parts[0]] as Record<string, unknown> | undefined;
    return { parent, key: parts[1] };
  }
  const group = config[parts[0]] as Record<string, unknown> | undefined;
  const parent = group?.[parts[1]] as Record<string, unknown> | undefined;
  return { parent, key: parts[2] };
}

function readRaw(): Record<string, unknown> {
  let contents: string;
  try {
    contents = readFileSync(/*turbopackIgnore: true*/ systemConfigPath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error('SYSTEM_CONFIG_UNREADABLE', { cause: error });
  }
  try {
    const parsed: unknown = JSON.parse(contents);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (error) {
    throw new Error('SYSTEM_CONFIG_INVALID_JSON', { cause: error });
  }
}

export function readSystemConfig(): SystemConfig {
  const raw = readRaw();
  for (const field of secretFields) {
    const { parent, key } = getPath(raw, field);
    const value = parent?.[key];
    if (typeof value === 'string' && value.startsWith('v1:')) {
      parent![key] = decryptIntegrationSetting(field, value);
    }
  }
  return parseSystemConfig(raw);
}

// Provider, URLs, and storage driver are not encrypted, so callers that only need
// those can skip decryption (and the BETTER_AUTH_SECRET requirement).
export function readSystemConfigWithoutSecrets(): SystemConfig {
  return parseSystemConfig(readRaw());
}

export function writeSystemConfig(input: SystemConfig) {
  const config = parseSystemConfig(input);
  const raw = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  for (const field of secretFields) {
    const { parent, key } = getPath(raw, field);
    const value = parent?.[key];
    if (typeof value === 'string' && value) {
      parent![key] = encryptIntegrationSetting(field, value);
    }
  }
  const target = systemConfigPath();
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, target);
}
