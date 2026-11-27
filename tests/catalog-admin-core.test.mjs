import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeCatalogSlug,
  parseGroupInput,
  parseRuleInput,
  parseSubgroupInput,
} from '../src/lib/catalog-admin-core.ts';

test('slugs are normalised and rejected when empty', () => {
  assert.equal(normalizeCatalogSlug('PLN Promo'), 'pln-promo');
  assert.equal(normalizeCatalogSlug('  --Token  Listrik--  '), 'token-listrik');
  assert.equal(normalizeCatalogSlug('!!!'), null);
  assert.equal(normalizeCatalogSlug(''), null);
  assert.equal(normalizeCatalogSlug(42), null);
});

test('a group needs a slug, label, icon, accent, and kind', () => {
  const valid = parseGroupInput({
    slug: 'Token Listrik',
    label: 'Token Listrik',
    iconKey: 'zap',
    accent: 'amber',
    kind: 'prepaid',
    sortOrder: 10,
    enabled: false,
  });
  assert.ok(valid);
  assert.equal(valid.slug, 'token-listrik');
  assert.equal(valid.productCategory, null);
  assert.equal(valid.includeUnmapped, false);
  assert.equal(valid.enabled, false);

  assert.equal(parseGroupInput({ ...valid, slug: 'x', kind: 'bogus' }), null);
  assert.equal(parseGroupInput({ ...valid, slug: 'x', accent: 'magenta' }), null);
  assert.equal(parseGroupInput({ ...valid, slug: 'x', productCategory: 'nope' }), null);
  assert.equal(parseGroupInput({ ...valid, slug: 'x', label: '   ' }), null);
});

test('a group may draw from a vendor category and include unmapped products', () => {
  const parsed = parseGroupInput({
    slug: 'pulsa',
    label: 'Pulsa',
    iconKey: 'smartphone',
    accent: 'sky',
    kind: 'prepaid',
    productCategory: 'pulsa',
    includeUnmapped: true,
  });
  assert.ok(parsed);
  assert.equal(parsed.productCategory, 'pulsa');
  assert.equal(parsed.includeUnmapped, true);
});

test('a subgroup needs a parent, slug, and label', () => {
  const valid = parseSubgroupInput({
    groupId: 'g1',
    slug: 'pln-promo',
    label: 'PLN Promo',
    description: 'Harga khusus',
  });
  assert.ok(valid);
  assert.equal(valid.iconUrl, null);
  assert.equal(valid.enabled, true);

  assert.equal(parseSubgroupInput({ ...valid, groupId: '' }), null);
  assert.equal(parseSubgroupInput({ ...valid, label: '' }), null);
  assert.equal(parseSubgroupInput({ ...valid, iconUrl: 'x'.repeat(301) }), null);
});

test('a partial update body merges onto the stored row', () => {
  // The enable toggle only sends { enabled }, so the route spreads it over the
  // existing row before validating.
  const stored = {
    slug: 'token-listrik',
    label: 'Token Listrik',
    iconKey: 'zap',
    accent: 'amber',
    kind: 'prepaid',
    productCategory: 'pln',
    includeUnmapped: false,
    sortOrder: 10,
    enabled: true,
  };
  const merged = parseGroupInput({ ...stored, enabled: false });
  assert.ok(merged);
  assert.equal(merged.enabled, false);
  assert.equal(merged.slug, 'token-listrik');
  assert.equal(merged.productCategory, 'pln');

  // A partial body on its own would be invalid, which is why the merge matters.
  assert.equal(parseGroupInput({ enabled: false }), null);
});

test('a rule accepts a null vendor and rejects unknown match types', () => {
  const valid = parseRuleInput({
    subgroupId: 's1',
    priority: 10,
    vendor: null,
    matchType: 'operator',
    matchValue: ' PLN ',
  });
  assert.ok(valid);
  assert.equal(valid.matchValue, 'PLN');
  assert.equal(valid.vendor, null);

  assert.equal(parseRuleInput({ ...valid, matchType: 'regex' }), null);
  assert.equal(parseRuleInput({ ...valid, vendor: 'Unknown' }), null);
  assert.equal(parseRuleInput({ ...valid, matchValue: '  ' }), null);
  assert.equal(parseRuleInput({ ...valid, priority: -1 }), null);
});
