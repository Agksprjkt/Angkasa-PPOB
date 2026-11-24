import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseQrislyExpiry,
  resolveQrislyPayableAmount,
} from '../src/lib/qrisly-protocol.ts';

test('parses Qrisly WIB expiry without shifting the wall clock', () => {
  const expiry = parseQrislyExpiry('2026-11-22 22:23:49');
  assert.equal(expiry?.toISOString(), '2026-11-22T15:23:49.000Z');
  assert.equal(parseQrislyExpiry(''), null);
  assert.equal(parseQrislyExpiry(undefined), null);
  assert.equal(parseQrislyExpiry('bukan tanggal'), null);
});

test('takes the payable amount from Qrisly final_amount, not the requested amount', () => {
  // Qrisly appends a unique code, so final_amount is what the buyer must pay.
  assert.equal(resolveQrislyPayableAmount(5_996, 6_008, 5_996), 6_008);
  assert.equal(resolveQrislyPayableAmount(5_996, undefined, 5_996), 5_996);
  assert.equal(resolveQrislyPayableAmount(5_996, 5_000, undefined), null);
  assert.equal(resolveQrislyPayableAmount(5_996, 'abc', undefined), null);
});
