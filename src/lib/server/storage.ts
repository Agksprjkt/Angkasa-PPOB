import 'server-only';

import { AwsClient } from 'aws4fetch';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readSystemConfig, readSystemConfigWithoutSecrets } from './system-config-store';
import type { StorageConfig } from '@/lib/system-config-core';

export type StoredObject = { bytes: Buffer; mimeType: string } | null;

const mimeTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function imageMimeTypeFor(filename: string) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error('IMAGE_NAME_INVALID');
  return mimeType;
}

// The local driver never needs decrypted secrets, so a deployment without
// BETTER_AUTH_SECRET can still store and serve local files.
function storageConfig(): StorageConfig {
  const raw = readSystemConfigWithoutSecrets().storage;
  return raw.driver === 's3' ? readSystemConfig().storage : raw;
}

// Stored paths come from the dashboard, so they must stay inside the project
// root. Absolute paths are rejected outright rather than resolved.
function localRoot(config: StorageConfig) {
  if (isAbsolute(config.localPath)) {
    throw new Error('STORAGE_PATH_MUST_BE_RELATIVE');
  }
  const root = resolve(/*turbopackIgnore: true*/ process.cwd(), config.localPath);
  if (relative(process.cwd(), root).startsWith('..')) {
    throw new Error('STORAGE_PATH_OUTSIDE_PROJECT');
  }
  return root;
}

function objectKey(config: StorageConfig, folder: string, filename: string) {
  return [config.s3.prefix, folder, filename].filter(Boolean).join('/');
}

function s3Client(config: StorageConfig) {
  const { s3 } = config;
  if (!s3.endpoint || !s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
    throw new Error('STORAGE_S3_NOT_CONFIGURED');
  }
  const url = new URL(s3.endpoint);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('STORAGE_S3_ENDPOINT_INVALID');
  }
  const client = new AwsClient({
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    service: 's3',
    region: s3.region || 'auto',
    retries: 2,
  });
  const objectUrl = (key: string) =>
    s3.forcePathStyle
      ? new URL(`${url.origin}/${s3.bucket}/${key}`)
      : new URL(`https://${s3.bucket}.${url.host}/${key}`);
  return { client, objectUrl };
}

export async function putObject(
  folder: string,
  filename: string,
  bytes: Buffer,
  contentType: string,
) {
  const config = storageConfig();
  if (config.driver === 'local') {
    const target = join(localRoot(config), folder, filename);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
    return;
  }
  const { client, objectUrl } = s3Client(config);
  const response = await client.fetch(objectUrl(objectKey(config, folder, filename)), {
    method: 'PUT',
    body: new Uint8Array(bytes),
    headers: { 'Content-Type': contentType },
  });
  if (!response.ok) throw new Error(`STORAGE_S3_PUT_FAILED_${response.status}`);
}

export async function getObject(folder: string, filename: string): Promise<StoredObject> {
  const config = storageConfig();
  const mimeType = imageMimeTypeFor(filename);
  if (config.driver === 'local') {
    try {
      const bytes = await readFile(join(localRoot(config), folder, filename));
      return { bytes, mimeType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  const { client, objectUrl } = s3Client(config);
  const response = await client.fetch(objectUrl(objectKey(config, folder, filename)));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`STORAGE_S3_GET_FAILED_${response.status}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), mimeType };
}

export async function deleteObject(folder: string, filename: string) {
  const config = storageConfig();
  if (config.driver === 'local') {
    try {
      await unlink(join(localRoot(config), folder, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }
  const { client, objectUrl } = s3Client(config);
  const response = await client.fetch(objectUrl(objectKey(config, folder, filename)), {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`STORAGE_S3_DELETE_FAILED_${response.status}`);
  }
}

// Probe for the admin "test connection" button: write then remove a tiny object.
export async function testStorageConnection() {
  const probe = `connection-probe-${Date.now()}.png`;
  await putObject('system-probe', probe, Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
  await deleteObject('system-probe', probe);
}
