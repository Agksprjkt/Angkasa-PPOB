import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getStorefrontGroupOptions,
  isProductInProviderGroup,
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

test('a per-product storefront group takes precedence over provider aliases', () => {
  assert.equal(resolveProviderName('PLN', 'PLN', 'PLN Promo'), 'PLN Promo');
  assert.equal(resolveProviderName('PLN', 'PLN Promo', '   '), 'PLN Promo');
  assert.equal(
    providerGroupKey('pln', 'PLN', null, 'PLN Promo'),
    providerGroupKey('pln', 'PLN', null, 'pln promo'),
  );
  assert.equal(
    providerGroupKey('pln', 'PLN', null, 'PLN Promo'),
    providerGroupKey('pln', 'PLN PREMIUM', 'PLN', 'PLN Promo'),
  );
  assert.notEqual(
    providerGroupKey('pln', 'PLN'),
    providerGroupKey('pln', 'PLN', null, 'PLN Promo'),
  );
  assert.notEqual(
    providerGroupKey('pln', 'PLN', null, 'PLN Promo'),
    providerGroupKey('voucher', 'PLN', null, 'PLN Promo'),
  );
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

test('provider pages isolate default and custom groups across categories', () => {
  for (const category of ['pulsa', 'data', 'voucher', 'pln', 'tagihan', 'ewallet', 'game']) {
    const defaultProduct = { category, operator: 'Provider' };
    const customProduct = { ...defaultProduct, storefrontGroup: 'Promo' };

    assert.equal(isProductInProviderGroup(defaultProduct, category, 'Provider'), true);
    assert.equal(isProductInProviderGroup(defaultProduct, category, 'Promo'), false);
    assert.equal(isProductInProviderGroup(customProduct, category, 'Promo'), true);
    assert.equal(isProductInProviderGroup(customProduct, category, 'Provider'), false);
  }

  const checkIdProduct = {
    category: 'pln',
    operator: 'PLN',
    providerAlias: null,
    storefrontGroup: null,
  };
  assert.equal(isProductInProviderGroup(checkIdProduct, 'pln', 'PLN PROMO'), false);
  assert.equal(isProductInProviderGroup(checkIdProduct, 'pln', 'PLN'), true);
});

test('storefront group options reuse saved labels within the same category', () => {
  const options = getStorefrontGroupOptions([
    { category: 'pln', storefrontGroup: ' PLN PROMO ' },
    { category: 'pln', storefrontGroup: 'pln promo' },
    { category: 'pln', storefrontGroup: 'Token Listrik Utama' },
    { category: 'data', storefrontGroup: 'PLN PROMO' },
    { category: 'pln', storefrontGroup: null },
  ], 'pln');

  assert.deepEqual(options, ['PLN PROMO', 'Token Listrik Utama']);
});
