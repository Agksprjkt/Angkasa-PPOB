import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapPostpaidError,
  readPostpaidInquiry,
  readPostpaidProductRow,
} from '../src/lib/digiflazz-postpaid-protocol.ts';

test('reads a wrapped inquiry payload', () => {
  const inquiry = readPostpaidInquiry({
    data: {
      ref_id: 'abc',
      customer_name: 'BUDI SANTOSO',
      admin: 2500,
      bill_amount: '152.300',
      total: '154.800',
      periode: 'NOV 2026',
    },
  });
  assert.ok(inquiry);
  assert.equal(inquiry.customerName, 'BUDI SANTOSO');
  assert.equal(inquiry.adminFee, 2500);
  assert.equal(inquiry.billAmount, 152300);
  assert.equal(inquiry.totalAmount, 154800);
  assert.deepEqual(inquiry.lines, [{ label: 'periode', value: 'NOV 2026' }]);
});

test('accepts numeric strings with thousand separators', () => {
  const inquiry = readPostpaidInquiry({
    data: { customer_name: 'X', admin_fee: '2.500', bill_amount: '100.000', total: '102.500' },
  });
  assert.ok(inquiry);
  assert.equal(inquiry.adminFee, 2500);
  assert.equal(inquiry.billAmount, 100000);
  assert.equal(inquiry.totalAmount, 102500);
});

test('detail rows are normalised to label/value pairs', () => {
  const inquiry = readPostpaidInquiry({
    data: {
      customer_name: 'X',
      admin_fee: 0,
      bill_amount: 1000,
      total: 1000,
      detail: [
        { label: 'Tagihan', value: '1.000' },
        { name: 'Denda', amount: '0' },
        { label: 'tanpa value' },
      ],
    },
  });
  assert.ok(inquiry);
  assert.deepEqual(inquiry.lines, [
    { label: 'Tagihan', value: '1.000' },
    { label: 'Denda', value: '0' },
  ]);
});

test('an unrecognised payload is not an inquiry', () => {
  assert.equal(readPostpaidInquiry({ data: { message: 'Nomor tidak ditemukan', rc: '14' } }), null);
  assert.equal(readPostpaidInquiry(null), null);
});

test('provider messages map to internal error codes', () => {
  assert.equal(mapPostpaidError('Tagihan sudah dibayar', '40'), 'BILL_ALREADY_PAID');
  assert.equal(mapPostpaidError('Nomor tidak ditemukan', ''), 'BILL_NOT_FOUND');
  assert.equal(mapPostpaidError('', 'expired'), 'BILL_INQUIRY_EXPIRED');
  assert.equal(mapPostpaidError('Sedang gangguan', ''), 'BILL_PROVIDER_UNAVAILABLE');
  assert.equal(mapPostpaidError('Ditolak', ''), 'BILL_PROVIDER_REJECTED');
});

test('postpaid product rows need a code, name, operator, and price', () => {
  assert.deepEqual(
    readPostpaidProductRow({
      buyer_sku_code: 'PDAM1',
      product_name: 'PDAM Surabaya',
      brand: 'PDAM',
      category: 'Tagihan',
      price: 2500,
    }),
    { vendorCode: 'PDAM1', name: 'PDAM Surabaya', operator: 'PDAM', price: 2500, category: 'Tagihan' },
  );
  assert.equal(readPostpaidProductRow({ buyer_sku_code: 'X', product_name: 'Y' }), null);
});
