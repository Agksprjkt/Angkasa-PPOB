import { createHmac, timingSafeEqual } from 'node:crypto';

export type RecoveryPurpose = 'password' | 'pin';

export const RECOVERY_OTP_TTL_MS = 5 * 60_000;
export const RECOVERY_GRANT_TTL_MS = 10 * 60_000;
export const RECOVERY_MAX_ATTEMPTS = 3;

export function isRecoveryPurpose(value: unknown): value is RecoveryPurpose {
  return value === 'password' || value === 'pin';
}

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error('BETTER_AUTH_SECRET is required for account recovery');
  return value;
}

export function recoveryOtpIdentifier(purpose: RecoveryPurpose, phoneNumber: string) {
  return `recovery-otp-${purpose}-${phoneNumber}`;
}

export function recoveryGrantIdentifier(purpose: RecoveryPurpose, grantHash: string) {
  return `recovery-grant-${purpose}-${grantHash}`;
}

// The OTP is stored as an HMAC, so a leaked verification row cannot be replayed.
// The purpose and phone number are part of the message, so a code minted for a
// password reset never unlocks a PIN reset or another account.
export function recoveryOtpDigest(
  purpose: RecoveryPurpose,
  phoneNumber: string,
  code: string,
) {
  return createHmac('sha256', secret())
    .update(`payku:recovery:${purpose}:${phoneNumber}:${code}`)
    .digest('hex');
}

// Grants are bearer tokens held by the browser between the verify step and the
// reset step, so only their hash is persisted.
export function recoveryGrantHash(grant: string) {
  return createHmac('sha256', secret())
    .update(`payku:recovery-grant:${grant}`)
    .digest('hex');
}

function sameDigest(left: string, right: string) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export type RecoveryOtpCheck =
  | { status: 'missing' }
  | { status: 'expired' }
  | { status: 'too_many_attempts' }
  | { status: 'mismatch'; attempts: number }
  | { status: 'valid' };

export function evaluateRecoveryOtp(input: {
  storedValue: string | null;
  expiresAt: Date | null;
  purpose: RecoveryPurpose;
  phoneNumber: string;
  code: string;
  now: Date;
}): RecoveryOtpCheck {
  if (!input.storedValue || !input.expiresAt) return { status: 'missing' };
  if (input.expiresAt.getTime() <= input.now.getTime()) return { status: 'expired' };

  const [digest, rawAttempts] = input.storedValue.split(':');
  const attempts = Number(rawAttempts ?? 0);
  if (Number.isFinite(attempts) && attempts >= RECOVERY_MAX_ATTEMPTS) {
    return { status: 'too_many_attempts' };
  }
  if (!sameDigest(
    digest ?? '',
    recoveryOtpDigest(input.purpose, input.phoneNumber, input.code),
  )) {
    return { status: 'mismatch', attempts: (Number.isFinite(attempts) ? attempts : 0) + 1 };
  }
  return { status: 'valid' };
}
