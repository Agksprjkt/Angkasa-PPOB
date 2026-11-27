import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapPostpaidError,
  readDigiflazzInquiry,
  readPostpaidPayment,
  readTokoVoucherInquiry,
} from '../src/lib/postpaid-protocol.ts';

// Captured from a real Digiflazz sandbox call (sku pln, customer 530000000001).
const digiflazzOneBill = {
  data: {
    ref_id: 'INQ17957838261592878',
    customer_no: '530000000001',
    customer_name: 'Nama Pelanggan Pertama',
    buyer_sku_code: 'pln',
    admin: 2500,
    message: 'Transaksi Sukses',
    status: 'Sukses',
    rc: '00',
    periode: '201901',
    buyer_last_saldo: 100000,
    price: 10000,
    selling_price: 11000,
    desc: {
      tarif: 'R1',
      daya: 1300,
      lembar_tagihan: 1,
      detail: [{ periode: '201901', nilai_tagihan: '8000', admin: '2500', denda: '500' }],
    },
  },
};

// Real second sandbox customer: two billed periods.
const digiflazzTwoBills = {
  data: {
    customer_name: 'Nama Pelanggan Kedua',
    status: 'Sukses',
    admin: 5000,
    price: 23000,
    selling_price: 25000,
    desc: {
      tarif: 'R1',
      daya: 1300,
      lembar_tagihan: 2,
      detail: [
        { periode: '201901', nilai_tagihan: '8000', admin: '2500', denda: '500' },
        { periode: '201902', nilai_tagihan: '11500', admin: '2500', denda: '0' },
      ],
    },
  },
};

test('Digiflazz: bill amount comes from the detail rows, not from price', () => {
  const inquiry = readDigiflazzInquiry(digiflazzOneBill);
  assert.ok(inquiry);
  assert.equal(inquiry.customerName, 'Nama Pelanggan Pertama');
  // 8000 + 500 denda, NOT price (10000)
  assert.equal(inquiry.billAmount, 8500);
  assert.equal(inquiry.adminFee, 2500);
  assert.equal(inquiry.totalAmount, 11000);
  assert.deepEqual(inquiry.periods, ['01/2019']);
  assert.ok(inquiry.lines.some((line) => line.label === 'Tarif' && line.value === 'R1'));
  assert.ok(inquiry.lines.some((line) => line.label === 'Daya' && line.value === '1300 VA'));
});

test('Digiflazz: multiple periods are summed and listed separately', () => {
  const inquiry = readDigiflazzInquiry(digiflazzTwoBills);
  assert.ok(inquiry);
  assert.equal(inquiry.billAmount, 8000 + 500 + 11500);
  assert.equal(inquiry.adminFee, 5000);
  assert.equal(inquiry.totalAmount, 25000);
  assert.deepEqual(inquiry.periods, ['01/2019', '02/2019']);
  assert.equal(
    inquiry.lines.filter((line) => line.label.startsWith('Tagihan')).length,
    2,
  );
});

test('Digiflazz: a failed inquiry is not an inquiry', () => {
  assert.equal(readDigiflazzInquiry({
    data: { status: 'Gagal', rc: '02', message: 'Transaksi Gagal' },
  }), null);
  assert.equal(readDigiflazzInquiry({ message: 'Test case tidak ditemukan' }), null);
  assert.equal(readDigiflazzInquiry(null), null);
});

test('Digiflazz: falls back to price when the provider sends no detail array', () => {
  const inquiry = readDigiflazzInquiry({
    data: {
      status: 'Sukses',
      customer_name: 'X',
      admin: 1000,
      price: 20000,
      selling_price: 21000,
      desc: {},
    },
  });
  assert.ok(inquiry);
  assert.equal(inquiry.billAmount, 20000);
  assert.equal(inquiry.totalAmount, 21000);
});

test('TokoVoucher: flat body is read without a detail array', () => {
  const inquiry = readTokoVoucherInquiry({
    status: 'Sukses',
    ref_id: 'INQ20240115001',
    trx_id: 'TRX123456',
    customer_no: '123456789012',
    customer_name: 'BUDI SANTOSO',
    produk: 'PLNPASCA',
    message: 'Inquiry berhasil',
    price: 150000,
    admin: 2500,
    selling_price: 152500,
    due_date: '2024-01-20',
    tagihan: 147500,
    blnth: '012024',
    data: '900VA',
    denda: 0,
    jml_bulan: 1,
  });
  assert.ok(inquiry);
  assert.equal(inquiry.customerName, 'BUDI SANTOSO');
  assert.equal(inquiry.billAmount, 147500);
  assert.equal(inquiry.adminFee, 2500);
  assert.equal(inquiry.totalAmount, 152500);
  assert.deepEqual(inquiry.periods, ['01/2024']);
  assert.equal(inquiry.dueDate, '2024-01-20');
  assert.ok(inquiry.lines.some((line) => line.label === 'Daya' && line.value === '900VA'));
});

test('TokoVoucher: a penalty is added to the bill and shown separately', () => {
  const inquiry = readTokoVoucherInquiry({
    status: 'Sukses',
    customer_name: 'X',
    tagihan: 100000,
    denda: 5000,
    admin: 2500,
    selling_price: 107500,
    blnth: '022024',
    jml_bulan: 2,
  });
  assert.ok(inquiry);
  assert.equal(inquiry.billAmount, 105000);
  assert.equal(inquiry.totalAmount, 107500);
  const billLine = inquiry.lines.find((line) => line.label.startsWith('Tagihan'));
  assert.ok(billLine);
  assert.equal(billLine.value, 'Rp 100.000');
  assert.equal(inquiry.lines.filter((line) => line.label === 'Denda').length, 1);
  assert.ok(inquiry.lines.some((line) => line.label === 'Denda'));
  assert.ok(inquiry.lines.some((line) => line.label === 'Jumlah bulan' && line.value === '2'));
});

test('TokoVoucher: fallback total includes penalty and admin fee', () => {
  const inquiry = readTokoVoucherInquiry({
    status: 'Sukses',
    tagihan: 100000,
    denda: 5000,
    admin: 2500,
  });
  assert.ok(inquiry);
  assert.equal(inquiry.billAmount, 105000);
  assert.equal(inquiry.totalAmount, 107500);
});

test('TokoVoucher: rejects a success response without a documented bill amount', () => {
  assert.equal(readTokoVoucherInquiry({
    status: 'Sukses',
    price: 150000,
    admin: 2500,
  }), null);
});

test('TokoVoucher: an error body is not an inquiry', () => {
  assert.equal(readTokoVoucherInquiry({ error_msg: 'ID Pelanggan tidak terdaftar', status: 0 }), null);
  assert.equal(readTokoVoucherInquiry({ status: 'Gagal', message: 'Signature not valid' }), null);
  assert.equal(readTokoVoucherInquiry(undefined), null);
});

test('provider messages map to internal error codes', () => {
  assert.equal(mapPostpaidError('Tagihan sudah dibayar', '40'), 'BILL_ALREADY_PAID');
  assert.equal(mapPostpaidError('ID Pelanggan tidak terdaftar'), 'BILL_NOT_FOUND');
  assert.equal(mapPostpaidError('Nomor Tujuan Salah', '54'), 'BILL_NOT_FOUND');
  assert.equal(mapPostpaidError('', 'expired'), 'BILL_EXPIRED');
  assert.equal(mapPostpaidError('IP Not Allowed'), 'BILL_PROVIDER_UNAVAILABLE');
  assert.equal(mapPostpaidError('Signature not valid'), 'BILL_PROVIDER_UNAVAILABLE');
  assert.equal(mapPostpaidError('Transaksi Gagal', '02'), 'BILL_REJECTED');
});

test('payment confirmation is read from either wrapper', () => {
  assert.deepEqual(
    readPostpaidPayment({ data: { status: 'Sukses', message: 'ok', sn: 'S123', rc: '00' } }),
    { status: 'Sukses', message: 'ok', sn: 'S123', rc: '00' },
  );
  assert.deepEqual(
    readPostpaidPayment({ status: 'Gagal', message: 'nope' }),
    { status: 'Gagal', message: 'nope', sn: null, rc: null },
  );
  assert.equal(readPostpaidPayment({ message: 'no status' }), null);
});
