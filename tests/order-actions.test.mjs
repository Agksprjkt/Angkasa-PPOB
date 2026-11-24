import assert from 'node:assert/strict';
import test from 'node:test';
import { canManageQrislyOrder } from '../src/lib/order-actions.ts';

test('allows cancel and renew only for an unpaid, unprocessed invoice', () => {
  assert.equal(canManageQrislyOrder({ paymentStatus: 'unpaid', transactionStatus: 'pending' }), true);
});

test('refuses once the QRIS payment settled', () => {
  assert.equal(canManageQrislyOrder({ paymentStatus: 'paid', transactionStatus: 'pending' }), false);
  assert.equal(canManageQrislyOrder({ paymentStatus: 'paid', transactionStatus: 'processing' }), false);
});

test('refuses an invoice that already reached a final order state', () => {
  assert.equal(canManageQrislyOrder({ paymentStatus: 'unpaid', transactionStatus: 'success' }), false);
  assert.equal(canManageQrislyOrder({ paymentStatus: 'unpaid', transactionStatus: 'failed' }), false);
});

test('refuses an already retired or reviewed invoice', () => {
  assert.equal(canManageQrislyOrder({ paymentStatus: 'expired', transactionStatus: 'pending' }), false);
  assert.equal(canManageQrislyOrder({ paymentStatus: 'review', transactionStatus: 'failed' }), false);
});
