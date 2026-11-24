import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildDigiflazzCustomerNo,
  isDigiflazzStatusCheckSafe,
  mapDigiflazzStatus,
  parseDigiflazzPrice,
  readDigiflazzTransactionResponse,
  verifyDigiflazzWebhookSignature,
} from '../src/lib/digiflazz-protocol.ts';

test('price parsing accepts numbers and numeric strings', () => {
  assert.equal(parseDigiflazzPrice(98000), 98000);
  assert.equal(parseDigiflazzPrice('98000'), 98000);
  assert.equal(parseDigiflazzPrice(' 12500 '), 12500);
  assert.equal(parseDigiflazzPrice(0), 0);
});

test('price parsing rejects unusable values instead of silently skipping products', () => {
  assert.equal(parseDigiflazzPrice(''), null);
  assert.equal(parseDigiflazzPrice('  '), null);
  assert.equal(parseDigiflazzPrice(-1), null);
  assert.equal(parseDigiflazzPrice(1000.5), null);
  assert.equal(parseDigiflazzPrice(Number.MAX_SAFE_INTEGER + 2), null);
  assert.equal(parseDigiflazzPrice(null), null);
  assert.equal(parseDigiflazzPrice(undefined), null);
});

test('customer number keeps the game zone separator only when needed', () => {
  assert.deepEqual(buildDigiflazzCustomerNo('087800001230'), {
    customerNo: '087800001230',
    allowDot: false,
  });
  assert.deepEqual(buildDigiflazzCustomerNo('12345678', '2056'), {
    customerNo: '12345678.2056',
    allowDot: true,
  });
  assert.deepEqual(buildDigiflazzCustomerNo('12345678', null), {
    customerNo: '12345678',
    allowDot: false,
  });
  assert.deepEqual(buildDigiflazzCustomerNo('12345678', ''), {
    customerNo: '12345678',
    allowDot: false,
  });
});

test('transaction response parsing reads the documented data wrapper', () => {
  assert.deepEqual(
    readDigiflazzTransactionResponse({
      data: {
        ref_id: 'test1',
        status: 'Sukses',
        message: 'Transaksi Sukses',
        rc: '00',
        sn: '1234567890',
      },
    }),
    {
      refId: 'test1',
      status: 'Sukses',
      message: 'Transaksi Sukses',
      rc: '00',
      sn: '1234567890',
    },
  );
  // sn is optional for pending/failed responses.
  assert.deepEqual(
    readDigiflazzTransactionResponse({
      data: { ref_id: 'r', status: 'Pending', message: 'Transaksi pending', rc: '03' },
    }),
    { refId: 'r', status: 'Pending', message: 'Transaksi pending', rc: '03' },
  );
});

test('transaction response parsing rejects malformed payloads', () => {
  assert.equal(readDigiflazzTransactionResponse(null), null);
  assert.equal(readDigiflazzTransactionResponse({}), null);
  assert.equal(readDigiflazzTransactionResponse({ data: null }), null);
  assert.equal(
    readDigiflazzTransactionResponse({ data: { ref_id: 1, status: 'Sukses', message: '', rc: '00' } }),
    null,
  );
  assert.equal(
    readDigiflazzTransactionResponse({ data: { ref_id: 'r', status: 'Sukses', message: '', rc: 0 } }),
    null,
  );
});

test('status mapping only treats rc 00 as success and Gagal as failure', () => {
  assert.equal(mapDigiflazzStatus('Sukses', '00'), 'success');
  assert.equal(mapDigiflazzStatus('sukses', '00'), 'success');
  assert.equal(mapDigiflazzStatus('Sukses', '02'), 'pending');
  assert.equal(mapDigiflazzStatus('Gagal', '02'), 'failed');
  assert.equal(mapDigiflazzStatus('gagal', '00'), 'failed');
  assert.equal(mapDigiflazzStatus('Pending', '03'), 'pending');
  assert.equal(mapDigiflazzStatus('', ''), 'pending');
});

test('status checks stop before the 90-day re-creation window', () => {
  const now = new Date('2026-11-22T00:00:00.000Z');
  const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60_000);
  assert.equal(isDigiflazzStatusCheckSafe(daysAgo(1), now), true);
  assert.equal(isDigiflazzStatusCheckSafe(daysAgo(88), now), true);
  assert.equal(isDigiflazzStatusCheckSafe(daysAgo(89), now), false);
  assert.equal(isDigiflazzStatusCheckSafe(daysAgo(90), now), false);
});

test('webhook signature verification matches the documented sha1 HMAC header', () => {
  const secret = 'somesecretvalue';
  const body = '{"data":{"ref_id":"30467470","status":"Sukses","rc":"00"}}';
  const signature = createHmac('sha1', secret).update(body).digest('hex');
  assert.equal(verifyDigiflazzWebhookSignature(body, `sha1=${signature}`, secret), true);
  assert.equal(verifyDigiflazzWebhookSignature(body, signature, secret), true);
  assert.equal(verifyDigiflazzWebhookSignature(body, `sha1=${signature}`, 'wrong-secret'), false);
  assert.equal(verifyDigiflazzWebhookSignature(`${body} `, `sha1=${signature}`, secret), false);
  assert.equal(verifyDigiflazzWebhookSignature(body, null, secret), false);
  assert.equal(verifyDigiflazzWebhookSignature(body, 'sha1=nothex', secret), false);
  assert.equal(verifyDigiflazzWebhookSignature(body, `sha1=${signature}`, ''), false);
});
