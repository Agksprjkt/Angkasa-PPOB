import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

function getEncryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'Set BETTER_AUTH_SECRET before saving integration credentials',
    );
  }

  return Buffer.from(
    hkdfSync(
      'sha256',
      secret,
      'payku-integration-settings-v1',
      'aes-256-gcm',
      32,
    ),
  );
}

// Shared by integration credentials and system-config secrets. The `name` is the
// AES-GCM additional authenticated data, so ciphertext cannot be swapped between
// fields without failing to decrypt.
export const encryptSecret = encryptIntegrationSetting;
export const decryptSecret = decryptIntegrationSetting;

export function encryptIntegrationSetting(name: string, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(name, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptIntegrationSetting(name: string, value: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(':');
  if (
    version !== 'v1' ||
    !encodedIv ||
    !encodedTag ||
    encodedCiphertext === undefined
  ) {
    throw new Error(`Unsupported encrypted integration setting: ${name}`);
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(encodedIv, 'base64url'),
  );
  decipher.setAAD(Buffer.from(name, 'utf8'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
