import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getExternalApiOrigin,
  frontendApiSecretMatches,
  isInternalOrigin,
  normalizeAuthBaseUrl,
  parseFrontendOrigins,
  resolveTrustedOrigins,
} from '../src/lib/frontend-integration.ts';

test('auth base URL accepts only an HTTP origin', () => {
  assert.equal(normalizeAuthBaseUrl('https://api.example.com/'), 'https://api.example.com');
  assert.equal(normalizeAuthBaseUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.throws(() => normalizeAuthBaseUrl('https://user:pass@example.com'));
  assert.throws(() => normalizeAuthBaseUrl('https://example.com/auth'));
  assert.throws(() => normalizeAuthBaseUrl('file:///tmp/app'));
});

test('trusted frontend origins are normalized, deduplicated and bounded', () => {
  assert.deepEqual(
    parseFrontendOrigins('https://shop.example.com/\nhttps://shop.example.com, http://localhost:3001'),
    ['https://shop.example.com', 'http://localhost:3001'],
  );
  assert.deepEqual(parseFrontendOrigins(' \n , '), []);
  assert.throws(() => parseFrontendOrigins('https://shop.example.com/path'));
  assert.throws(() => parseFrontendOrigins(
    Array.from({ length: 33 }, (_, index) => `https://shop${index}.example.com`).join('\n'),
  ));
});

test('trusted origins always include the application origin without a wildcard', () => {
  assert.deepEqual(
    resolveTrustedOrigins('https://api.example.com/', [
      'https://shop.example.com',
      'https://shop.example.com/',
    ]),
    ['https://api.example.com', 'https://shop.example.com'],
  );
  assert.deepEqual(
    resolveTrustedOrigins('https://api.example.com', []),
    ['https://api.example.com'],
  );
  assert.throws(() => resolveTrustedOrigins('https://api.example.com', ['*']));
});

test('trusted origins are internal and need no frontend API secret', () => {
  assert.equal(
    isInternalOrigin('https://www.api.example.com', 'https://api.example.com', [
      'https://www.api.example.com',
    ]),
    true,
  );
  assert.equal(isInternalOrigin('https://api.example.com', 'https://api.example.com', []), true);
  assert.equal(
    isInternalOrigin('https://other.example.com', 'https://api.example.com', [
      'https://www.api.example.com',
    ]),
    false,
  );
});

test('external API requests are identified from origin or referrer', () => {
  const backend = 'https://api.example.com';
  const requestOrigin = backend;
  const path = '/api/products';

  assert.equal(
    getExternalApiOrigin(path, new Headers({ origin: 'https://shop.example.com' }), requestOrigin, backend),
    'https://shop.example.com',
  );
  assert.equal(
    getExternalApiOrigin(path, new Headers({ referer: 'https://shop.example.com/products' }), requestOrigin, backend),
    'https://shop.example.com',
  );
  assert.equal(
    getExternalApiOrigin(path, new Headers({ origin: backend }), requestOrigin, backend),
    null,
  );
  assert.equal(
    getExternalApiOrigin('/health', new Headers({ origin: 'https://shop.example.com' }), requestOrigin, backend),
    null,
  );
  assert.equal(
    getExternalApiOrigin(path, new Headers({ 'sec-fetch-site': 'cross-site' }), requestOrigin, backend),
    'cross-site',
  );
});

test('frontend API secrets are compared safely and oversized values are rejected', () => {
  assert.equal(frontendApiSecretMatches('generated-secret', 'generated-secret'), true);
  assert.equal(frontendApiSecretMatches('wrong-secret', 'generated-secret'), false);
  assert.equal(frontendApiSecretMatches('x'.repeat(513), 'generated-secret'), false);
  assert.equal(frontendApiSecretMatches('generated-secret', ''), false);
});
