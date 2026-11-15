import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const HASH_BYTES = 64;

function deriveKey(pin: string, salt: Buffer) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required for transaction PINs');
  const pepperedPin = createHmac('sha256', secret).update(pin).digest('hex');
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(pepperedPin, salt, HASH_BYTES, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function isValidTransactionPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

export async function hashTransactionPin(pin: string) {
  const salt = randomBytes(16);
  const hash = await deriveKey(pin, salt);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyTransactionPin(pin: string, storedHash: string) {
  const [algorithm, saltValue, hashValue, extra] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue || extra !== undefined) {
    return false;
  }

  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  if (salt.length !== 16 || expected.length !== HASH_BYTES) return false;

  const actual = await deriveKey(pin, salt);
  return timingSafeEqual(actual, expected);
}
