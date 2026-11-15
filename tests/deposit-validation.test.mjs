import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyQrislyPayment,
  isValidQrislyAmount,
  parseDepositAmount,
} from '../src/lib/deposit-validation.ts';

test('accepts only safe integer deposit amounts within configured bounds', () => {
  assert.equal(isValidQrislyAmount(1_000), true);
  assert.equal(isValidQrislyAmount(100_000_000), true);
  assert.equal(isValidQrislyAmount(999), false);
  assert.equal(isValidQrislyAmount(1_000.1), false);
  assert.equal(isValidQrislyAmount(Number.MAX_SAFE_INTEGER + 1), false);
});

test('parses valid numeric strings and rejects malformed values', () => {
  assert.equal(parseDepositAmount('1000'), 1_000);
  assert.equal(parseDepositAmount(''), null);
  assert.equal(parseDepositAmount('1e3'), 1_000);
  assert.equal(parseDepositAmount('1000.5'), null);
});

test('classifies paid only when provider and expected amounts match', () => {
  assert.equal(classifyQrislyPayment('settlement', 5_000, 5_000), 'paid');
  assert.equal(classifyQrislyPayment('paid', 4_999, 5_000), 'amount_mismatch');
  assert.equal(classifyQrislyPayment('expired', 5_000, 5_000), 'failed');
  assert.equal(classifyQrislyPayment('processing', 5_000, 5_000), 'pending');
});
