import assert from 'node:assert/strict';
import test from 'node:test';

import { tokoVoucherCategory } from '../src/lib/tokovoucher-category.ts';

test('Topup Game becomes the game category', () => {
  assert.equal(tokoVoucherCategory('Topup Game', 'Free Fire ID Fast'), 'game');
  assert.equal(tokoVoucherCategory('Topup Game', 'Mobile Legends (Cek Username)'), 'game');
});

test('Voucher Game stays a voucher', () => {
  assert.equal(tokoVoucherCategory('Voucher Game', 'Free Fire 5 Diamond'), 'voucher');
});

test('the other TokoVoucher categories keep their mapping', () => {
  assert.equal(tokoVoucherCategory('Pulsa', 'PULSA FAST'), 'pulsa');
  // "Voucher Data" is a data package, matching the mapping before this change.
  assert.equal(tokoVoucherCategory('Voucher Data', 'CEK STATUS VOUCHER'), 'data');
  assert.equal(tokoVoucherCategory('E-Money', 'CEK NAMA AKUN DANA'), 'ewallet');
  assert.equal(tokoVoucherCategory('PLN', 'PROMO'), 'pln');
  assert.equal(tokoVoucherCategory('Pascabayar', 'PDAM'), 'tagihan');
  assert.equal(tokoVoucherCategory('Aktivasi Perdana', 'KARTU PERDANA TRI'), null);
});

test('an empty or unknown name has no category', () => {
  assert.equal(tokoVoucherCategory('', ''), null);
  assert.equal(tokoVoucherCategory('TV', 'Saldo K-Vision'), null);
});

test('the first value that maps wins', () => {
  assert.equal(tokoVoucherCategory('Topup Game', 'Pulsa'), 'game');
  assert.equal(tokoVoucherCategory('', 'Pulsa'), 'pulsa');
});
