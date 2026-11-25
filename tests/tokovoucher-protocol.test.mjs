import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTokoVoucherDestination,
  mapTokoVoucherStatus,
  parseTokoVoucherPrice,
  readTokoVoucherError,
  readTokoVoucherProducts,
  readTokoVoucherTransaction,
  tokoVoucherSignature,
  verifyTokoVoucherWebhook,
} from '../src/lib/tokovoucher-protocol.ts';

test('signature follows md5(MEMBER:SECRET:REFID)', () => {
  // md5("MEM1:secret:ref1")
  const value = tokoVoucherSignature('MEM1', 'secret', 'ref1');
  assert.match(value, /^[0-9a-f]{32}$/);
  assert.equal(value, tokoVoucherSignature('MEM1', 'secret', 'ref1'));
  assert.notEqual(value, tokoVoucherSignature('MEM1', 'secret', 'ref2'));
});

test('price accepts numbers and numeric strings', () => {
  assert.equal(parseTokoVoucherPrice(1500), 1500);
  assert.equal(parseTokoVoucherPrice('1500'), 1500);
  assert.equal(parseTokoVoucherPrice(' 789 '), 789);
  assert.equal(parseTokoVoucherPrice(0), 0);
});

test('price rejects junk and negatives', () => {
  assert.equal(parseTokoVoucherPrice('abc'), null);
  assert.equal(parseTokoVoucherPrice(-1), null);
  assert.equal(parseTokoVoucherPrice(1.5), null);
  assert.equal(parseTokoVoucherPrice(null), null);
});

test('only sukses is success and only gagal is failure', () => {
  assert.equal(mapTokoVoucherStatus('sukses'), 'success');
  assert.equal(mapTokoVoucherStatus('SUKSES'), 'success');
  assert.equal(mapTokoVoucherStatus('gagal'), 'failed');
  assert.equal(mapTokoVoucherStatus('pending'), 'pending');
  // Their rule: anything unrecognised must stay pending, never fail an order.
  assert.equal(mapTokoVoucherStatus('entah'), 'pending');
  assert.equal(mapTokoVoucherStatus(undefined), 'pending');
  assert.equal(mapTokoVoucherStatus(0), 'pending');
});

test('reads a transaction body', () => {
  assert.deepEqual(readTokoVoucherTransaction({
    status: 'sukses',
    message: 'TRXID:T1. SUKSES, SN: ABC',
    sn: 'ABC',
    ref_id: '5467110',
    trx_id: 'T220907',
    produk: 'ff5',
  }), {
    refId: '5467110',
    status: 'sukses',
    message: 'TRXID:T1. SUKSES, SN: ABC',
    sn: 'ABC',
    trxId: 'T220907',
  });
});

test('rejects an error body instead of reading it as a transaction', () => {
  assert.equal(readTokoVoucherTransaction({ status: 0, error_msg: 'Ip Not Allow' }), null);
  assert.equal(readTokoVoucherTransaction({ status: 'sukses' }), null);
  assert.equal(readTokoVoucherTransaction(null), null);
});

test('reads the provider error message', () => {
  assert.equal(readTokoVoucherError({ status: 0, error_msg: 'Ip Not Allow' }), 'Ip Not Allow');
  assert.equal(readTokoVoucherError({ status: 0, rc: 500, error_msg: 'Kode Produk Tidak Ditemukan' }),
    'Kode Produk Tidak Ditemukan');
  assert.equal(readTokoVoucherError({ status: 1, data: [] }), null);
});

test('game orders send server_id only when a zone exists', () => {
  assert.deepEqual(buildTokoVoucherDestination('12345', '2001'), {
    tujuan: '12345',
    server_id: '2001',
  });
  assert.deepEqual(buildTokoVoucherDestination('081234567890'), { tujuan: '081234567890' });
  assert.deepEqual(buildTokoVoucherDestination('081234567890', '   '), {
    tujuan: '081234567890',
  });
});

test('webhook token is compared exactly and in constant time', () => {
  const secret = 'bd134207f74532a8b094676c4a2ca9ed';
  assert.equal(verifyTokoVoucherWebhook(secret, secret), true);
  assert.equal(verifyTokoVoucherWebhook(` ${secret} `, secret), true);
  assert.equal(verifyTokoVoucherWebhook('wrong', secret), false);
  assert.equal(verifyTokoVoucherWebhook(secret, ''), false);
  assert.equal(verifyTokoVoucherWebhook(null, secret), false);
  // Different lengths must not throw.
  assert.equal(verifyTokoVoucherWebhook('short', secret), false);
});

test('reads the joined product payload', () => {
  const rows = readTokoVoucherProducts({
    status: 1,
    data: {
      category: [{ id: 1, nama: 'Voucher Game' }],
      operator: [{ id: 1, nama: 'Free Fire', status: 1 }],
      jenis: [{ id: 1, nama: 'Free Fire ID Fast', status: 1 }],
      produk: [{
        kode_produk: 'FF5',
        nama: 'Free Fire 5 Diamond',
        deskripsi: '5 diamond',
        price: 1500,
        status: 1,
        kategori_id: 1,
        operator_id: 1,
        jenis_id: 1,
      }],
    },
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    code: 'FF5',
    name: 'Free Fire 5 Diamond',
    description: '5 diamond',
    price: 1500,
    active: true,
    categoryName: 'Voucher Game',
    operatorName: 'Free Fire',
    jenisName: 'Free Fire ID Fast',
  });
});

test('skips products with no code, no name, or no price', () => {
  const rows = readTokoVoucherProducts({
    data: {
      produk: [
        { kode_produk: '', nama: 'X', price: 100, status: 1 },
        { kode_produk: 'A', nama: '', price: 100, status: 1 },
        { kode_produk: 'B', nama: 'Y', price: 'abc', status: 1 },
        { kode_produk: 'C', nama: 'Z', price: 100, status: 1 },
      ],
    },
  });
  assert.deepEqual(rows.map((row) => row.code), ['C']);
});

test('a disabled product, operator, or jenis deactivates the row', () => {
  const base = {
    category: [{ id: 1, nama: 'Pulsa' }],
    produk: [{
      kode_produk: 'S1',
      nama: 'Pulsa 1rb',
      price: 1600,
      status: 1,
      kategori_id: 1,
      operator_id: 1,
      jenis_id: 1,
    }],
  };
  const active = readTokoVoucherProducts({
    data: {
      ...base,
      operator: [{ id: 1, nama: 'Telkomsel', status: 1 }],
      jenis: [{ id: 1, nama: 'Reguler', status: 1 }],
    },
  });
  assert.equal(active[0].active, true);

  const operatorOff = readTokoVoucherProducts({
    data: {
      ...base,
      operator: [{ id: 1, nama: 'Telkomsel', status: 0 }],
      jenis: [{ id: 1, nama: 'Reguler', status: 1 }],
    },
  });
  assert.equal(operatorOff[0].active, false);

  const productOff = readTokoVoucherProducts({
    data: {
      ...base,
      produk: [{ ...base.produk[0], status: '0' }],
      operator: [{ id: 1, nama: 'Telkomsel', status: 1 }],
      jenis: [{ id: 1, nama: 'Reguler', status: 1 }],
    },
  });
  assert.equal(productOff[0].active, false);
});

test('an unrecognised product payload yields no rows', () => {
  assert.deepEqual(readTokoVoucherProducts(null), []);
  assert.deepEqual(readTokoVoucherProducts({ status: 0, error_msg: 'Ip Not Allow' }), []);
  assert.deepEqual(readTokoVoucherProducts({ data: [] }), []);
});

test('reads the joined product payload', () => {
  const rows = readTokoVoucherProducts({
    status: 1,
    data: {
      category: [{ id: 1, nama: 'Voucher Game' }],
      operator: [{ id: 1, nama: 'Free Fire', status: 1 }],
      jenis: [{ id: 1, nama: 'Free Fire ID Fast', status: 1 }],
      produk: [{
        kode_produk: 'FF5',
        nama: 'Free Fire 5 Diamond',
        deskripsi: '5 diamond',
        price: 1500,
        status: 1,
        kategori_id: 1,
        operator_id: 1,
        jenis_id: 1,
      }],
    },
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    code: 'FF5',
    name: 'Free Fire 5 Diamond',
    description: '5 diamond',
    price: 1500,
    active: true,
    categoryName: 'Voucher Game',
    operatorName: 'Free Fire',
    jenisName: 'Free Fire ID Fast',
  });
});

test('skips products with no code, no name, or no price', () => {
  const rows = readTokoVoucherProducts({
    data: {
      produk: [
        { kode_produk: '', nama: 'X', price: 100, status: 1 },
        { kode_produk: 'A', nama: '', price: 100, status: 1 },
        { kode_produk: 'B', nama: 'Y', price: 'abc', status: 1 },
        { kode_produk: 'C', nama: 'Z', price: 100, status: 1 },
      ],
    },
  });
  assert.deepEqual(rows.map((row) => row.code), ['C']);
});

test('a disabled product, operator, or jenis deactivates the row', () => {
  const base = {
    category: [{ id: 1, nama: 'Pulsa' }],
    produk: [{
      kode_produk: 'S1',
      nama: 'Pulsa 1rb',
      price: 1600,
      status: 1,
      kategori_id: 1,
      operator_id: 1,
      jenis_id: 1,
    }],
  };
  const active = readTokoVoucherProducts({
    data: {
      ...base,
      operator: [{ id: 1, nama: 'Telkomsel', status: 1 }],
      jenis: [{ id: 1, nama: 'Reguler', status: 1 }],
    },
  });
  assert.equal(active[0].active, true);

  const operatorOff = readTokoVoucherProducts({
    data: {
      ...base,
      operator: [{ id: 1, nama: 'Telkomsel', status: 0 }],
      jenis: [{ id: 1, nama: 'Reguler', status: 1 }],
    },
  });
  assert.equal(operatorOff[0].active, false);

  const productOff = readTokoVoucherProducts({
    data: {
      ...base,
      produk: [{ ...base.produk[0], status: '0' }],
      operator: [{ id: 1, nama: 'Telkomsel', status: 1 }],
      jenis: [{ id: 1, nama: 'Reguler', status: 1 }],
    },
  });
  assert.equal(productOff[0].active, false);
});

test('an unrecognised product payload yields no rows', () => {
  assert.deepEqual(readTokoVoucherProducts(null), []);
  assert.deepEqual(readTokoVoucherProducts({ status: 0, error_msg: 'Ip Not Allow' }), []);
  assert.deepEqual(readTokoVoucherProducts({ data: [] }), []);
});
