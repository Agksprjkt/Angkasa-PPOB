import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RECOVERY_MAX_ATTEMPTS,
  evaluateRecoveryOtp,
  isRecoveryPurpose,
  recoveryGrantHash,
  recoveryOtpDigest,
} from '../src/lib/server/recovery-core.ts';

process.env.BETTER_AUTH_SECRET = 'test-secret-with-sufficient-entropy';

const phone = '+628111222333';
const code = '424242';
const now = new Date('2026-01-01T00:00:00.000Z');
const freshExpiry = new Date('2026-01-01T00:05:00.000Z');

function stored(purpose, attempts = 0) {
  return `${recoveryOtpDigest(purpose, phone, code)}:${attempts}`;
}

test('accepts the matching code for the requested purpose', () => {
  for (const purpose of ['password', 'pin']) {
    const result = evaluateRecoveryOtp({
      storedValue: stored(purpose),
      expiresAt: freshExpiry,
      purpose,
      phoneNumber: phone,
      code,
      now,
    });
    assert.equal(result.status, 'valid', purpose);
  }
});

test('a password code never unlocks the PIN reset', () => {
  const result = evaluateRecoveryOtp({
    storedValue: stored('password'),
    expiresAt: freshExpiry,
    purpose: 'pin',
    phoneNumber: phone,
    code,
    now,
  });
  assert.equal(result.status, 'mismatch');
});

test('a code minted for one phone number never validates for another', () => {
  const result = evaluateRecoveryOtp({
    storedValue: stored('password'),
    expiresAt: freshExpiry,
    purpose: 'password',
    phoneNumber: '+628999888777',
    code,
    now,
  });
  assert.equal(result.status, 'mismatch');
});

test('counts a wrong code and stops at the attempt budget', () => {
  const wrong = evaluateRecoveryOtp({
    storedValue: stored('password'),
    expiresAt: freshExpiry,
    purpose: 'password',
    phoneNumber: phone,
    code: '111111',
    now,
  });
  assert.deepEqual(wrong, { status: 'mismatch', attempts: 1 });

  const exhausted = evaluateRecoveryOtp({
    storedValue: stored('password', RECOVERY_MAX_ATTEMPTS),
    expiresAt: freshExpiry,
    purpose: 'password',
    phoneNumber: phone,
    code,
    now,
  });
  assert.equal(exhausted.status, 'too_many_attempts');
});

test('rejects an expired or missing code', () => {
  assert.equal(evaluateRecoveryOtp({
    storedValue: stored('pin'),
    expiresAt: new Date('2025-12-31T23:59:00.000Z'),
    purpose: 'pin',
    phoneNumber: phone,
    code,
    now,
  }).status, 'expired');

  assert.equal(evaluateRecoveryOtp({
    storedValue: null,
    expiresAt: null,
    purpose: 'pin',
    phoneNumber: phone,
    code,
    now,
  }).status, 'missing');
});

test('the stored value never contains the plain code', () => {
  assert.equal(stored('password').includes(code), false);
});

test('grant hashes are stable and never equal the raw grant', () => {
  const grant = 'a8f5f167-8f7e-4c9a-9c1e-2b4a6d8e0f12';
  assert.equal(recoveryGrantHash(grant), recoveryGrantHash(grant));
  assert.notEqual(recoveryGrantHash(grant), grant);
  assert.notEqual(recoveryGrantHash(grant), recoveryGrantHash(`${grant}x`));
});

test('only the two supported purposes are accepted', () => {
  assert.equal(isRecoveryPurpose('password'), true);
  assert.equal(isRecoveryPurpose('pin'), true);
  assert.equal(isRecoveryPurpose('email'), false);
  assert.equal(isRecoveryPurpose(null), false);
});
