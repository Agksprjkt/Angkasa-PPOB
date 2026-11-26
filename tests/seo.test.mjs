import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSeo, storeAssetUrl } from '../src/lib/seo.ts';

const base = {
  storeName: 'Angkasa Pay',
  tagline: '',
  description: '',
  seoTitle: '',
  seoDescription: '',
  ogTitle: '',
  ogDescription: '',
  ogImageFile: null,
  iconFile: null,
  logoFile: null,
};

test('empty settings fall back to the store name and default description', () => {
  const seo = resolveSeo(base);
  assert.equal(seo.title, 'Angkasa Pay');
  assert.match(seo.description, /Platform PPOB/);
  assert.equal(seo.ogTitle, 'Angkasa Pay');
  assert.equal(seo.imageUrl, null);
});

test('search copy overrides the store profile and drives the social card', () => {
  const seo = resolveSeo({
    ...base,
    seoTitle: 'Pulsa & Token Listrik Murah',
    seoDescription: 'Bayar tagihan dan isi pulsa dalam hitungan detik.',
  });
  assert.equal(seo.title, 'Pulsa & Token Listrik Murah');
  assert.equal(seo.ogTitle, 'Pulsa & Token Listrik Murah');
  assert.equal(seo.ogDescription, 'Bayar tagihan dan isi pulsa dalam hitungan detik.');
});

test('explicit OG copy wins over the search copy', () => {
  const seo = resolveSeo({
    ...base,
    seoTitle: 'Judul pencarian',
    seoDescription: 'Deskripsi pencarian',
    ogTitle: 'Judul pratinjau',
    ogDescription: 'Deskripsi pratinjau',
  });
  assert.equal(seo.title, 'Judul pencarian');
  assert.equal(seo.ogTitle, 'Judul pratinjau');
  assert.equal(seo.ogDescription, 'Deskripsi pratinjau');
});

test('og image falls back through icon and logo', () => {
  assert.equal(resolveSeo({ ...base, ogImageFile: 'og.png', iconFile: 'i.png' }).imageUrl,
    storeAssetUrl('og.png'));
  assert.equal(resolveSeo({ ...base, iconFile: 'i.png', logoFile: 'l.png' }).imageUrl,
    storeAssetUrl('i.png'));
  assert.equal(resolveSeo({ ...base, logoFile: 'l.png' }).imageUrl, storeAssetUrl('l.png'));
});

test('asset urls are encoded and blank input yields null', () => {
  assert.equal(storeAssetUrl(null), null);
  assert.equal(storeAssetUrl('a b.png'), '/api/store-assets/a%20b.png');
});
