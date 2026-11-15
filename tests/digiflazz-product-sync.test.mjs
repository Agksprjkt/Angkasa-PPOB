import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDigiflazzSellPrices } from '../src/lib/digiflazz-product-pricing.ts';
import {
  getNextDigiflazzProductSyncAt,
  isDigiflazzProductSyncDue,
} from '../src/lib/digiflazz-product-sync-schedule.ts';

test('sync pricing applies customer and Member markups independently', () => {
  assert.deepEqual(
    calculateDigiflazzSellPrices(
      10_000,
      { basePrice: 9_000, sellPriceUser: 9_500, sellPriceAgent: 9_200 },
      {
        pricingType: 'percent',
        pricingValue: 10,
        memberPricingType: 'fixed',
        memberPricingValue: 300,
      },
    ),
    { sellPriceUser: 11_000, sellPriceAgent: 10_300 },
  );
});

test('sync pricing preserves separate existing nominal markups without provider rules', () => {
  assert.deepEqual(
    calculateDigiflazzSellPrices(
      12_000,
      { basePrice: 10_000, sellPriceUser: 10_500, sellPriceAgent: 10_200 },
      undefined,
    ),
    { sellPriceUser: 12_500, sellPriceAgent: 12_200 },
  );
});

test('new products start at provider cost when no markup rule exists', () => {
  assert.deepEqual(
    calculateDigiflazzSellPrices(8_000, undefined, undefined),
    { sellPriceUser: 8_000, sellPriceAgent: 8_000 },
  );
});

test('auto-sync becomes due only when enabled and its timestamp has arrived', () => {
  const now = new Date('2026-11-15T00:00:00.000Z');
  assert.equal(isDigiflazzProductSyncDue(false, null, now), false);
  assert.equal(isDigiflazzProductSyncDue(true, null, now), true);
  assert.equal(
    isDigiflazzProductSyncDue(true, '2026-11-16T00:00:00.000Z', now),
    false,
  );
  assert.equal(
    isDigiflazzProductSyncDue(true, '2026-11-14T00:00:00.000Z', now),
    true,
  );
  assert.equal(isDigiflazzProductSyncDue(true, 'invalid', now), true);
});

test('auto-sync interval adds the selected number of calendar days', () => {
  const start = new Date('2026-11-15T00:00:00.000Z');
  assert.equal(
    getNextDigiflazzProductSyncAt(start, 14).toISOString(),
    '2026-11-29T00:00:00.000Z',
  );
  assert.equal(
    getNextDigiflazzProductSyncAt(start, 30).toISOString(),
    '2026-12-15T00:00:00.000Z',
  );
});
