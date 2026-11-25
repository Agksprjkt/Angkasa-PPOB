import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeVoucherDiscount,
  evaluateVoucher,
  isValidVoucherCode,
  normalizeVoucherCode,
  voucherErrorMessage,
} from '../src/lib/voucher-core.ts';

const now = new Date('2026-11-25T12:00:00.000Z');

function voucher(overrides = {}) {
  return {
    code: 'PROMO5',
    discountType: 'percent',
    discountValue: 5,
    maxDiscount: null,
    minOrder: 30_000,
    quotaLimit: null,
    quantityUsed: 0,
    perUserLimit: null,
    startsAt: null,
    endsAt: null,
    enabled: true,
    ...overrides,
  };
}

test('normalizeVoucherCode trims, uppercases, and drops inner spaces', () => {
  assert.equal(normalizeVoucherCode('  promo 5 '), 'PROMO5');
  assert.equal(normalizeVoucherCode('hemat10'), 'HEMAT10');
});

test('isValidVoucherCode rejects too short and unsafe codes', () => {
  assert.equal(isValidVoucherCode('AB'), false);
  assert.equal(isValidVoucherCode('PROMO5'), true);
  assert.equal(isValidVoucherCode('PROMO 5'), false);
  assert.equal(isValidVoucherCode('promo5'), false);
  assert.equal(isValidVoucherCode('<script>'), false);
});

test('percent discount floors fractional rupiah', () => {
  assert.equal(computeVoucherDiscount(voucher(), 30_000), 1_500);
  assert.equal(computeVoucherDiscount(voucher(), 30_001), 1_500);
});

test('maxDiscount caps a percent discount', () => {
  assert.equal(
    computeVoucherDiscount(voucher({ maxDiscount: 1_000 }), 100_000),
    1_000,
  );
});

test('fixed discount subtracts a flat amount', () => {
  assert.equal(
    computeVoucherDiscount(voucher({ discountType: 'fixed', discountValue: 5_000 }), 50_000),
    5_000,
  );
});

test('discount never makes the order free', () => {
  // A 100% voucher would zero the amount, which the vendor cannot fulfil.
  assert.equal(
    computeVoucherDiscount(voucher({ discountValue: 100 }), 10_000),
    9_999,
  );
  assert.equal(
    computeVoucherDiscount(voucher({ discountType: 'fixed', discountValue: 20_000 }), 10_000),
    9_999,
  );
});

test('evaluateVoucher applies a percent discount above the minimum order', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: voucher(),
    basePrice: 30_000,
    now,
    userUsageCount: 0,
  }), { ok: true, discountAmount: 1_500, finalPrice: 28_500 });
});

test('evaluateVoucher rejects a missing voucher', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: null,
    basePrice: 30_000,
    now,
    userUsageCount: 0,
  }), { ok: false, error: 'VOUCHER_NOT_FOUND' });
});

test('evaluateVoucher rejects an order below minOrder', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: voucher(),
    basePrice: 29_999,
    now,
    userUsageCount: 0,
  }), { ok: false, error: 'VOUCHER_MIN_ORDER_NOT_MET' });
});

test('evaluateVoucher respects the schedule window', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: voucher({ startsAt: new Date('2026-11-26T00:00:00.000Z') }),
    basePrice: 30_000,
    now,
    userUsageCount: 0,
  }), { ok: false, error: 'VOUCHER_NOT_STARTED' });

  assert.deepEqual(evaluateVoucher({
    voucher: voucher({ endsAt: new Date('2026-11-25T11:59:59.000Z') }),
    basePrice: 30_000,
    now,
    userUsageCount: 0,
  }), { ok: false, error: 'VOUCHER_EXPIRED' });
});

test('evaluateVoucher treats an end time equal to now as expired', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: voucher({ endsAt: now }),
    basePrice: 30_000,
    now,
    userUsageCount: 0,
  }), { ok: false, error: 'VOUCHER_EXPIRED' });
});

test('evaluateVoucher rejects a disabled voucher', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: voucher({ enabled: false }),
    basePrice: 30_000,
    now,
    userUsageCount: 0,
  }), { ok: false, error: 'VOUCHER_INACTIVE' });
});

test('evaluateVoucher enforces the total quota', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: voucher({ quotaLimit: 10, quantityUsed: 10 }),
    basePrice: 30_000,
    now,
    userUsageCount: 0,
  }), { ok: false, error: 'VOUCHER_QUOTA_EXHAUSTED' });
});

test('evaluateVoucher enforces the per-user limit', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: voucher({ perUserLimit: 2 }),
    basePrice: 30_000,
    now,
    userUsageCount: 2,
  }), { ok: false, error: 'VOUCHER_USER_LIMIT_REACHED' });

  assert.deepEqual(evaluateVoucher({
    voucher: voucher({ perUserLimit: 2 }),
    basePrice: 30_000,
    now,
    userUsageCount: 1,
  }), { ok: true, discountAmount: 1_500, finalPrice: 28_500 });
});

test('unlimited quota and per-user limit allow repeated use', () => {
  assert.deepEqual(evaluateVoucher({
    voucher: voucher({ quotaLimit: null, perUserLimit: null, quantityUsed: 5_000 }),
    basePrice: 30_000,
    now,
    userUsageCount: 999,
  }), { ok: true, discountAmount: 1_500, finalPrice: 28_500 });
});

test('voucherErrorMessage mentions the minimum order when given', () => {
  assert.match(voucherErrorMessage('VOUCHER_MIN_ORDER_NOT_MET', 30_000), /30\.000/);
  assert.equal(voucherErrorMessage('VOUCHER_QUOTA_EXHAUSTED'), 'Kuota kode voucher sudah habis.');
});
