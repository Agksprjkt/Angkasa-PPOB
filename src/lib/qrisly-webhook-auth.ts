import { timingSafeEqual } from 'node:crypto';

export function qrislyWebhookSecretMatches(supplied: string, expected: string) {
  if (Buffer.byteLength(expected, 'utf8') < 32) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}
