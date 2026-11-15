import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export function isInternalJobAuthorized(request: NextRequest) {
  const expected = process.env.PAYMENT_RECONCILER_SECRET;
  const authorization = request.headers.get('authorization') ?? '';
  if (
    !expected ||
    Buffer.byteLength(expected) < 32 ||
    !authorization.startsWith('Bearer ')
  ) {
    return false;
  }
  const supplied = Buffer.from(authorization.slice(7));
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}
