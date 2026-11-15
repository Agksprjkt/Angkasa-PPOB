import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashOrderLookupValue,
  matchesOrderLookupHash,
  normalizeOrderLookupIdentifier,
} from '../src/lib/server/order-lookup-core.ts';

test('normalizes phone numbers and order codes without accepting arbitrary identifiers', () => {
  assert.deepEqual(normalizeOrderLookupIdentifier('08123456789'), {
    kind: 'phone',
    value: '+628123456789',
  });
  assert.deepEqual(normalizeOrderLookupIdentifier(' inv-abcd-1234 '), {
    kind: 'code',
    value: 'INV-ABCD-1234',
  });
  assert.equal(normalizeOrderLookupIdentifier('not-an-identifier'), null);
});

test('uses purpose-bound hashes for OTP and access grants', () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = 'test-secret-with-sufficient-entropy';
  try {
    const hash = hashOrderLookupValue('code', 'challenge:123456');
    assert.equal(matchesOrderLookupHash('code', 'challenge:123456', hash), true);
    assert.equal(matchesOrderLookupHash('grant', 'challenge:123456', hash), false);
    assert.equal(matchesOrderLookupHash('code', 'challenge:123457', hash), false);
  } finally {
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousSecret;
  }
});
