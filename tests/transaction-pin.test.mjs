import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashTransactionPin,
  isValidTransactionPin,
  verifyTransactionPin,
} from '../src/lib/server/transaction-pin-core.ts';

test('requires exactly six numeric digits', () => {
  assert.equal(isValidTransactionPin('000012'), true);
  assert.equal(isValidTransactionPin('12345'), false);
  assert.equal(isValidTransactionPin('1234567'), false);
  assert.equal(isValidTransactionPin('12a456'), false);
  assert.equal(isValidTransactionPin(123456), false);
});

test('stores a salted hash and verifies only the matching PIN and secret', async () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = 'test-secret-with-sufficient-entropy';
  try {
    const hash = await hashTransactionPin('000012');
    assert.notEqual(await hashTransactionPin('000012'), hash);
    assert.notEqual(hash, '000012');
    assert.equal(await verifyTransactionPin('000012', hash), true);
    assert.equal(await verifyTransactionPin('000013', hash), false);
    assert.equal(
      await verifyTransactionPin('000012', 'not-a-valid-hash'),
      false,
    );

    process.env.BETTER_AUTH_SECRET = 'a-different-server-secret';
    assert.equal(await verifyTransactionPin('000012', hash), false);
  } finally {
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousSecret;
  }
});
