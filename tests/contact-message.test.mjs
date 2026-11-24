import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContactMessage,
  buildWhatsAppMessageUrl,
  maxContactMessageLength,
} from '../src/lib/contact-message.ts';

test('whatsapp url encodes the composed message', () => {
  const url = buildWhatsAppMessageUrl('6281234567890', 'Halo admin & tim');
  assert.equal(
    url,
    'https://wa.me/6281234567890?text=Halo%20admin%20%26%20tim',
  );
});

test('whatsapp url strips formatting from the number', () => {
  assert.equal(
    buildWhatsAppMessageUrl('+62 812-3456-7890', 'hai'),
    'https://wa.me/6281234567890?text=hai',
  );
});

test('whatsapp url is null without digits', () => {
  assert.equal(buildWhatsAppMessageUrl('', 'hai'), null);
  assert.equal(buildWhatsAppMessageUrl('abc', 'hai'), null);
});

test('very long messages are capped so the link stays usable', () => {
  const url = buildWhatsAppMessageUrl('6281234567890', 'a'.repeat(5000));
  assert.ok(url);
  assert.ok(url.length < 4000, `url too long: ${url.length}`);
});

test('composed message includes name, optional phone, topic and body', () => {
  const message = buildContactMessage({
    storeName: 'Angkasa Pay',
    name: '  Budi  ',
    phone: '081234567890',
    topic: 'Status pesanan',
    message: 'Pesanan INV-1 belum berubah.',
  });
  assert.equal(
    message,
    [
      'Halo Angkasa Pay, saya Budi.',
      'Nomor saya: 081234567890',
      'Topik: Status pesanan',
      '',
      'Pesanan INV-1 belum berubah.',
    ].join('\n'),
  );
});

test('composed message omits the phone line when empty', () => {
  const message = buildContactMessage({
    storeName: 'Angkasa Pay',
    name: 'Budi',
    phone: '   ',
    topic: 'Pertanyaan umum',
    message: 'Halo.',
  });
  assert.ok(!message.includes('Nomor saya'));
});

test('message length constant matches the form limit', () => {
  assert.equal(maxContactMessageLength, 800);
});
