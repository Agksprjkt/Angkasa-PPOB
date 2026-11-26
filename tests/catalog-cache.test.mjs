import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allCatalogCacheKeys,
  catalogCacheKeys,
  catalogCacheTtlSeconds,
  flashSaleCacheTtlSeconds,
} from '../src/lib/catalog-cache-keys.ts';

test('agent and public catalog entries never share a key', () => {
  assert.notEqual(
    catalogCacheKeys.products('public'),
    catalogCacheKeys.products('agent'),
  );
  assert.notEqual(
    catalogCacheKeys.flashSales('public'),
    catalogCacheKeys.flashSales('agent'),
  );
});

test('promotions key is role independent', () => {
  assert.equal(catalogCacheKeys.promotions, 'ppob:catalog:promotions');
  assert.ok(!catalogCacheKeys.promotions.includes('agent'));
});

test('invalidation covers every key the cache can write', () => {
  const keys = allCatalogCacheKeys();
  assert.equal(keys.length, 5);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes(catalogCacheKeys.products('public')));
  assert.ok(keys.includes(catalogCacheKeys.products('agent')));
  assert.ok(keys.includes(catalogCacheKeys.promotions));
  assert.ok(keys.includes(catalogCacheKeys.flashSales('public')));
  assert.ok(keys.includes(catalogCacheKeys.flashSales('agent')));
});

test('cache TTLs stay short enough to bound stale data', () => {
  // A forgotten invalidation must not hide a price change for long.
  assert.ok(catalogCacheTtlSeconds <= 120);
  assert.ok(flashSaleCacheTtlSeconds <= 30);
  // Flash sale stock moves on every order, so it must be shorter than the rest.
  assert.ok(flashSaleCacheTtlSeconds < catalogCacheTtlSeconds);
});
