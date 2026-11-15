import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenWaTextRequest } from '../src/lib/server/openwa-request.ts';

test('creates an authenticated OpenWA send-text request', () => {
  const request = createOpenWaTextRequest('+628123456789', 'OTP 123456', {
    apiUrl: 'http://localhost:2785/',
    apiKey: 'secret-key',
    sessionId: 'session / one',
  });

  assert.equal(
    request.url.href,
    'http://localhost:2785/api/sessions/session%20%2F%20one/messages/send-text',
  );
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers['X-API-Key'], 'secret-key');
  assert.deepEqual(JSON.parse(request.init.body), {
    chatId: '628123456789@c.us',
    text: 'OTP 123456',
  });
});

test('rejects an incomplete OpenWA configuration', () => {
  assert.throws(
    () => createOpenWaTextRequest('+628123456789', 'OTP', {}),
    /OPENWA_SESSION_ID/,
  );
});
