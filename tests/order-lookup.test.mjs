import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashOrderLookupValue,
  maskOrderLookupDestination,
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

test('masks the destination shown by the public lookup', () => {
  assert.equal(maskOrderLookupDestination('081234567890'), '0812****7890');
  assert.equal(maskOrderLookupDestination('231'), '***');
  assert.equal(maskOrderLookupDestination('1234567'), '123****');
  assert.equal(maskOrderLookupDestination('12345678'), '1234***5678');
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
