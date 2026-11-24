import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAvailableFlashSale, getFlashSalePrice } from '../src/lib/flash-sale.ts';

const now = new Date('2026-10-10T12:00:00.000Z');
const product = {
  status: 'active',
  basePrice: 8000,
  sellPriceUser: 12000,
  sellPriceAgent: 11000,
  compareAtPrice: 15000,
};
const offer = {
  id: 'offer-1',
  salePrice: 12000,
  startsAt: new Date('2026-10-10T11:00:00.000Z'),
  endsAt: new Date('2026-10-10T13:00:00.000Z'),
  quotaLimit: 10,
  quantitySold: 3,
  quantityReserved: 2,
  status: 'active',
};

test('flash sale price follows the product selling price per role', () => {
  assert.equal(getFlashSalePrice(product, 'user'), 12000);
  assert.equal(getFlashSalePrice(product, 'agent'), 11000);
  assert.equal(getFlashSalePrice({ sellPriceUser: 12000 }, 'agent'), 12000);
  assert.equal(getFlashSalePrice({ sellPriceUser: 0 }, 'user'), null);
  assert.equal(getFlashSalePrice({ sellPriceUser: 12000.5 }, 'user'), null);
});

test('availability derives price and discount from the product, ignoring stored salePrice', () => {
  assert.deepEqual(getAvailableFlashSale(product, offer, now), {
    id: 'offer-1',
    price: 12000,
    compareAtPrice: 15000,
    discountPercent: 20,
    endsAt: offer.endsAt,
    quantityRemaining: 5,
  });
  assert.equal(
    getAvailableFlashSale(product, { ...offer, salePrice: 9000 }, now)?.price,
    12000,
  );
});

test('discount stays 0 when the product has no compare-at price above the selling price', () => {
  const withoutCompare = { ...product, compareAtPrice: null };
  const result = getAvailableFlashSale(withoutCompare, offer, now);
  assert.equal(result?.compareAtPrice, null);
  assert.equal(result?.discountPercent, 0);

  const lowCompare = { ...product, compareAtPrice: 11000 };
  assert.equal(getAvailableFlashSale(lowCompare, offer, now)?.discountPercent, 0);
});

test('agent pricing applies to the flash sale amount', () => {
  assert.equal(getAvailableFlashSale(product, offer, now, 'agent')?.price, 11000);
});

test('active Flash Sale availability accounts for schedule and reserved quota', () => {
  assert.equal(
    getAvailableFlashSale(product, offer, new Date(offer.startsAt.getTime() - 1)),
    null,
  );
  assert.equal(getAvailableFlashSale(product, offer, offer.endsAt), null);
  assert.equal(getAvailableFlashSale(product, { ...offer, quantityReserved: 7 }, now), null);
  assert.equal(getAvailableFlashSale({ ...product, status: 'inactive' }, offer, now), null);
});
