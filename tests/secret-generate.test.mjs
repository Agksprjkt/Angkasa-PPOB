import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import {
  generateSecret,
  isSecretTarget,
  isStoredSecretTarget,
  isStrongSecret,
  secretTargets,
} from '../src/lib/secret-generate.ts';

test('a generated secret is URL-safe and long enough', () => {
  const secret = generateSecret(randomBytes);
  assert.match(secret, /^[A-Za-z0-9_-]+$/);
  assert.equal(secret.length, 43);
  assert.equal(isStrongSecret(secret), true);
});

test('two generations never collide', () => {
  const first = generateSecret(randomBytes);
  const second = generateSecret(randomBytes);
  assert.notEqual(first, second);
});

test('only known targets are accepted', () => {
  for (const target of secretTargets) {
    assert.equal(isSecretTarget(target), true);
  }
  assert.equal(isSecretTarget('unknown'), false);
  assert.equal(isSecretTarget(null), false);
  assert.equal(isSecretTarget(42), false);
});

test('the auth secret is never stored by the dashboard', () => {
  assert.equal(isStoredSecretTarget('betterAuthSecret'), false);
  assert.equal(isStoredSecretTarget('digiflazzWebhookSecret'), true);
  assert.equal(isStoredSecretTarget('tokovoucherWebhookSecret'), true);
  assert.equal(isStoredSecretTarget('qrislyWebhookSecret'), true);
  assert.equal(isStoredSecretTarget('frontendApiSecret'), true);
});

test('a short value is rejected as weak', () => {
  assert.equal(isStrongSecret('short'), false);
  assert.equal(isStrongSecret('x'.repeat(32)), true);
});
