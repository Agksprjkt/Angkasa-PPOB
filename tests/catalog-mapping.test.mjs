import assert from 'node:assert/strict';
import test from 'node:test';

import { matchSubgroup } from '../src/lib/catalog-mapping.ts';

const product = {
  name: 'PLN 20.000',
  vendorCode: 'pln20',
  operator: 'PLN',
  vendor: 'Digiflazz',
};

const rule = (overrides) => ({
  subgroupId: 'sub-a',
  priority: 100,
  vendor: null,
  matchType: 'operator',
  matchValue: 'PLN',
  ...overrides,
});

test('no rule means the product stays unmapped', () => {
  assert.equal(matchSubgroup(product, []), null);
  assert.equal(matchSubgroup(product, [rule({ matchValue: 'PDAM' })]), null);
});

test('an operator rule matches case-insensitively', () => {
  assert.equal(matchSubgroup(product, [rule({ matchValue: 'pln' })]), 'sub-a');
  assert.equal(matchSubgroup(product, [rule({ matchType: 'operator', matchValue: 'PLN' })]), 'sub-a');
});

test('vendorCode and prefix rules match on the vendor code', () => {
  assert.equal(matchSubgroup(product, [rule({ matchType: 'vendorCode', matchValue: 'PLN20' })]), 'sub-a');
  assert.equal(matchSubgroup(product, [rule({ matchType: 'prefix', matchValue: 'pln' })]), 'sub-a');
  assert.equal(matchSubgroup(product, [rule({ matchType: 'prefix', matchValue: 'zp' })]), null);
});

test('a name rule matches a fragment of the product name', () => {
  assert.equal(matchSubgroup(product, [rule({ matchType: 'name', matchValue: 'promo' })]), null);
  assert.equal(
    matchSubgroup({ ...product, name: 'PLN Promo 20.000' }, [rule({ matchType: 'name', matchValue: 'promo' })]),
    'sub-a',
  );
});

test('the lowest priority number wins regardless of rule order', () => {
  const rules = [
    rule({ subgroupId: 'broad', priority: 100 }),
    rule({ subgroupId: 'narrow', priority: 10, matchType: 'vendorCode', matchValue: 'pln20' }),
  ];
  assert.equal(matchSubgroup(product, rules), 'narrow');
  assert.equal(matchSubgroup(product, [...rules].reverse()), 'narrow');
});

test('a vendor-scoped rule is skipped for other vendors', () => {
  const scoped = rule({ vendor: 'TokoVoucher', matchValue: 'PLN' });
  assert.equal(matchSubgroup(product, [scoped]), null);
  assert.equal(
    matchSubgroup({ ...product, vendor: 'TokoVoucher' }, [scoped]),
    'sub-a',
  );
});

test('a blank match value never matches', () => {
  assert.equal(matchSubgroup(product, [rule({ matchValue: '   ' })]), null);
});
