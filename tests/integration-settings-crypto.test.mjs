import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptIntegrationSetting,
  encryptIntegrationSetting,
} from '../src/lib/server/integration-settings-crypto.ts';

test('encrypts and decrypts integration secrets with authenticated setting names', () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = 'test-secret-with-sufficient-entropy';
  try {
    const encrypted = encryptIntegrationSetting('fonnteToken', 'provider-secret');
    assert.notEqual(encrypted, 'provider-secret');
    assert.equal(decryptIntegrationSetting('fonnteToken', encrypted), 'provider-secret');
    assert.throws(
      () => decryptIntegrationSetting('openwaApiKey', encrypted),
    );
  } finally {
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousSecret;
  }
});

test('requires a server secret before encrypting settings', () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  delete process.env.BETTER_AUTH_SECRET;
  try {
    assert.throws(
      () => encryptIntegrationSetting('fonnteToken', 'provider-secret'),
      /BETTER_AUTH_SECRET/,
    );
  } finally {
    if (previousSecret !== undefined) process.env.BETTER_AUTH_SECRET = previousSecret;
  }
});
