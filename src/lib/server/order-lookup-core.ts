import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from '../phone.ts';

export type OrderLookupIdentifier =
  | { kind: 'phone'; value: string }
  | { kind: 'code'; value: string };

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error('BETTER_AUTH_SECRET is required for order lookup');
  return value;
}

export function normalizeOrderLookupIdentifier(value: string): OrderLookupIdentifier | null {
  const trimmed = value.trim();
  if (/^(INV|PAY)-[A-Z0-9-]{4,32}$/i.test(trimmed)) {
    return { kind: 'code', value: trimmed.toUpperCase() };
  }
  const phone = normalizePhone(trimmed);
  return phone ? { kind: 'phone', value: phone } : null;
}

// Public lookup is unauthenticated, so it only ever shows a partial destination.
export function maskOrderLookupDestination(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  const head = Math.min(4, Math.floor(trimmed.length / 2));
  const tail = trimmed.length >= 8 ? 4 : 0;
  const stars = Math.max(3, trimmed.length - head - tail);
  return `${trimmed.slice(0, head)}${'*'.repeat(stars)}${tail ? trimmed.slice(-tail) : ''}`;
}

export function hashOrderLookupValue(purpose: string, value: string) {
  return createHmac('sha256', secret())
    .update(`payku:order-lookup:${purpose}:${value}`)
    .digest('hex');
}

export function matchesOrderLookupHash(purpose: string, value: string, expectedHex: string) {
  const actual = Buffer.from(hashOrderLookupValue(purpose, value), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
