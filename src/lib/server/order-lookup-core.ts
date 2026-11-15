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
