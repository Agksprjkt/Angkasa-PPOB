import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSocialLink,
  normalizeSocialLinks,
  normalizeWhatsAppNumber,
  parseSocialLinks,
  withSupportPhoneFallback,
} from '../src/lib/social-links.ts';

test('whatsapp numbers are normalized to the 62 country code', () => {
  assert.equal(normalizeWhatsAppNumber('0812-3456-7890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber('6281234567890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber('81234567890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber(''), '');
});

test('whatsapp links use wa.me and reject too-short numbers', () => {
  const link = normalizeSocialLink({ type: 'whatsapp', label: '', value: '081234567890' });
  assert.equal(link?.href, 'https://wa.me/6281234567890');
  assert.equal(link?.label, 'WhatsApp');
  assert.equal(normalizeSocialLink({ type: 'whatsapp', label: '', value: '0812' }), null);
});

test('email links use mailto and reject malformed addresses', () => {
  const link = normalizeSocialLink({ type: 'email', label: 'Bantuan', value: 'halo@toko.com' });
  assert.equal(link?.href, 'mailto:halo@toko.com');
  assert.equal(link?.label, 'Bantuan');
  assert.equal(normalizeSocialLink({ type: 'email', label: '', value: 'bukan-email' }), null);
});

test('social handles become canonical profile URLs', () => {
  assert.equal(
    normalizeSocialLink({ type: 'instagram', label: '', value: '@angksapay' })?.href,
    'https://instagram.com/angksapay',
  );
  assert.equal(
    normalizeSocialLink({ type: 'tiktok', label: '', value: 'angksapay' })?.href,
    'https://tiktok.com/angksapay',
  );
  assert.equal(
    normalizeSocialLink({ type: 'telegram', label: '', value: '@angksapay' })?.value,
    '@angksapay',
  );
});

test('full URLs are only accepted on the real service domain', () => {
  assert.equal(
    normalizeSocialLink({
      type: 'facebook',
      label: '',
      value: 'https://www.facebook.com/angksapay',
    })?.href,
    'https://www.facebook.com/angksapay',
  );
  assert.equal(
    normalizeSocialLink({
      type: 'instagram',
      label: '',
      value: 'https://evil.example.com/angksapay',
    }),
    null,
  );
  assert.equal(
    normalizeSocialLink({ type: 'instagram', label: '', value: 'javascript:alert(1)' }),
    null,
  );
});

test('parsing drops unknown types and normalizing drops invalid values', () => {
  const parsed = parseSocialLinks([
    { type: 'whatsapp', label: '', value: '081234567890' },
    { type: 'myspace', label: '', value: 'x' },
    { type: 'email', label: '', value: 'halo@toko.com' },
    'nonsense',
  ]);
  assert.equal(parsed.length, 2);
  assert.equal(normalizeSocialLinks(parsed).length, 2);
  assert.deepEqual(normalizeSocialLinks('not an array'), []);
});

test('supportPhone becomes a WhatsApp link only while no contacts exist', () => {
  const fallback = withSupportPhoneFallback([], '081234567890');
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].href, 'https://wa.me/6281234567890');

  const existing = normalizeSocialLinks([
    { type: 'instagram', label: '', value: '@angksapay' },
  ]);
  assert.deepEqual(withSupportPhoneFallback(existing, '081234567890'), existing);
  assert.deepEqual(withSupportPhoneFallback([], '0812'), []);
});
