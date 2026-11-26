import assert from 'node:assert/strict';
import test from 'node:test';

import {
  providerGroupKey,
  resolveProviderName,
  sameProviderName,
} from '../src/lib/provider-alias.ts';

test('an empty alias keeps the operator as its own provider', () => {
  assert.equal(resolveProviderName('DATA AXIS'), 'DATA AXIS');
  assert.equal(resolveProviderName('DATA AXIS', null), 'DATA AXIS');
  assert.equal(resolveProviderName('DATA AXIS', '   '), 'DATA AXIS');
});

test('an alias wins over the operator name', () => {
  assert.equal(resolveProviderName('DATA AXIS', 'AXIS'), 'AXIS');
  assert.equal(resolveProviderName('  DATA AXIS  ', '  AXIS  '), 'AXIS');
});

test('aliased operators share one group key', () => {
  assert.equal(
    providerGroupKey('data', 'AXIS'),
    providerGroupKey('data', 'DATA AXIS', 'AXIS'),
  );
  // Different categories never merge, even with the same alias.
  assert.notEqual(
    providerGroupKey('data', 'DATA AXIS', 'AXIS'),
    providerGroupKey('voucher', 'VOUCHER AXIS', 'AXIS'),
  );
});

test('without an alias the operators stay in separate groups', () => {
  assert.notEqual(
    providerGroupKey('data', 'AXIS'),
    providerGroupKey('data', 'DATA AXIS'),
  );
});

test('provider names compare case-insensitively', () => {
  assert.equal(sameProviderName('axis', 'AXIS'), true);
  assert.equal(sameProviderName(' Pulsa Axis ', 'pulsa axis'), true);
  assert.equal(sameProviderName('AXIS', 'DATA AXIS'), false);
});
