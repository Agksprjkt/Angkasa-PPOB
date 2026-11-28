import assert from 'node:assert/strict';
import test from 'node:test';

import { qrislyWebhookSecretMatches } from '../src/lib/qrisly-webhook-auth.ts';

test('Qrisly webhook secrets require 32 bytes and compare in constant time', () => {
  const secret = 'x'.repeat(32);
  assert.equal(qrislyWebhookSecretMatches(secret, secret), true);
  assert.equal(qrislyWebhookSecretMatches('y'.repeat(32), secret), false);
  assert.equal(qrislyWebhookSecretMatches('short', 'short'), false);
  assert.equal(qrislyWebhookSecretMatches('x'.repeat(31), secret), false);
});
