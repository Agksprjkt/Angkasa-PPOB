import 'server-only';

import { randomInt, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { transactionPins, users, verifications } from '@/lib/server/db/schema';
import { normalizePhone } from '@/lib/phone';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import {
  RECOVERY_GRANT_TTL_MS,
  RECOVERY_OTP_TTL_MS,
  evaluateRecoveryOtp,
  recoveryGrantHash,
  recoveryGrantIdentifier,
  recoveryOtpDigest,
  recoveryOtpIdentifier,
  type RecoveryPurpose,
} from '@/lib/server/recovery-core';
import { hashTransactionPin, isValidTransactionPin } from '@/lib/server/transaction-pin-core';
import { sendWhatsAppRecoveryOtp } from '@/lib/server/whatsapp';

export type RecoveryResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

async function findVerifiedUser(phoneNumber: string) {
  const [user] = await getDatabase()
    .select({ id: users.id, email: users.email, phoneNumberVerified: users.phoneNumberVerified })
    .from(users)
    .where(eq(users.phoneNumber, phoneNumber))
    .limit(1);
  return user && user.phoneNumberVerified ? user : null;
}

export async function requestRecoveryOtp(
  purpose: RecoveryPurpose,
  rawPhoneNumber: string,
  address: string,
): Promise<RecoveryResult<{ phoneNumber: string }>> {
  const phoneNumber = normalizePhone(rawPhoneNumber);
  if (!phoneNumber) return { ok: false, status: 400, error: 'INVALID_PHONE_NUMBER' };

  const perAddress = await consumeRateLimit(
    `ppob:rate:recovery:ip:${address}`,
    8,
    10 * 60_000,
  );
  if (!perAddress) return { ok: false, status: 429, error: 'RATE_LIMITED' };
  const perPhone = await consumeRateLimit(
    `ppob:rate:recovery:phone:${purpose}:${phoneNumber}`,
    3,
    10 * 60_000,
  );
  if (!perPhone) return { ok: false, status: 429, error: 'RATE_LIMITED' };

  const user = await findVerifiedUser(phoneNumber);
  // Always report success so the endpoint cannot enumerate registered numbers.
  if (!user) return { ok: true, value: { phoneNumber } };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const db = getDatabase();
  const now = new Date();
  const identifier = recoveryOtpIdentifier(purpose, phoneNumber);
  await db.delete(verifications).where(eq(verifications.identifier, identifier));
  await db.insert(verifications).values({
    id: randomUUID(),
    identifier,
    value: `${recoveryOtpDigest(purpose, phoneNumber, code)}:0`,
    expiresAt: new Date(now.getTime() + RECOVERY_OTP_TTL_MS),
    createdAt: now,
    updatedAt: now,
  });

  try {
    await sendWhatsAppRecoveryOtp(purpose, phoneNumber, code);
  } catch (error) {
    console.error(
      '[RECOVERY_SEND_FAILED]',
      error instanceof Error ? error.message : 'Unknown WhatsApp error',
    );
    return { ok: false, status: 503, error: 'WHATSAPP_UNAVAILABLE' };
  }

  return { ok: true, value: { phoneNumber } };
}

// Verifying the OTP issues a short-lived grant. The reset step never sees the
// OTP again, so a leaked grant cannot be used to brute-force the code.
export async function verifyRecoveryOtp(
  purpose: RecoveryPurpose,
  rawPhoneNumber: string,
  otp: string,
): Promise<RecoveryResult<{ phoneNumber: string; grant: string }>> {
  const phoneNumber = normalizePhone(rawPhoneNumber);
  if (!phoneNumber) return { ok: false, status: 400, error: 'INVALID_PHONE_NUMBER' };
  if (!isValidTransactionPin(otp)) return { ok: false, status: 400, error: 'INVALID_OTP' };

  const user = await findVerifiedUser(phoneNumber);
  if (!user) return { ok: false, status: 400, error: 'INVALID_OTP' };

  const db = getDatabase();
  const identifier = recoveryOtpIdentifier(purpose, phoneNumber);
  const [saved] = await db
    .select()
    .from(verifications)
    .where(and(
      eq(verifications.identifier, identifier),
      gt(verifications.expiresAt, new Date()),
    ))
    .limit(1);

  const check = evaluateRecoveryOtp({
    storedValue: saved?.value ?? null,
    expiresAt: saved?.expiresAt ?? null,
    purpose,
    phoneNumber,
    code: otp,
    now: new Date(),
  });

  if (check.status === 'missing' || check.status === 'expired') {
    return { ok: false, status: 400, error: 'OTP_NOT_FOUND' };
  }
  if (check.status === 'too_many_attempts') {
    await db.delete(verifications).where(eq(verifications.identifier, identifier));
    return { ok: false, status: 429, error: 'TOO_MANY_ATTEMPTS' };
  }
  if (check.status === 'mismatch') {
    const [digest] = (saved?.value ?? '').split(':');
    await db
      .update(verifications)
      .set({ value: `${digest}:${check.attempts}`, updatedAt: new Date() })
      .where(eq(verifications.identifier, identifier));
    return { ok: false, status: 400, error: 'INVALID_OTP' };
  }

  // Spend the OTP so the same code cannot mint a second grant.
  await db.delete(verifications).where(eq(verifications.identifier, identifier));

  const grant = randomUUID();
  const now = new Date();
  await db.insert(verifications).values({
    id: randomUUID(),
    identifier: recoveryGrantIdentifier(purpose, recoveryGrantHash(grant)),
    value: phoneNumber,
    expiresAt: new Date(now.getTime() + RECOVERY_GRANT_TTL_MS),
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, value: { phoneNumber, grant } };
}

// Spends the grant. Returns the phone number it was issued for, or null when it
// is unknown, expired, or already used.
async function consumeRecoveryGrant(purpose: RecoveryPurpose, grant: string) {
  if (typeof grant !== 'string' || !grant) return null;
  const db = getDatabase();
  const identifier = recoveryGrantIdentifier(purpose, recoveryGrantHash(grant));
  const [saved] = await db
    .select()
    .from(verifications)
    .where(and(
      eq(verifications.identifier, identifier),
      gt(verifications.expiresAt, new Date()),
    ))
    .limit(1);
  if (!saved) return null;
  await db.delete(verifications).where(eq(verifications.identifier, identifier));
  return saved.value;
}

type AuthInternal = {
  $context: Promise<{
    internalAdapter: {
      findCredentialAccount: (userId: string) => Promise<unknown>;
      createAccount: (data: Record<string, unknown>) => Promise<unknown>;
      updatePassword: (userId: string, password: string) => Promise<unknown>;
      deleteUserSessions: (userId: string) => Promise<unknown>;
    };
    password: { hash: (password: string) => Promise<string> };
  }>;
};

async function setCredentialPassword(userId: string, password: string) {
  const auth = getAuth() as unknown as AuthInternal;
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(password);
  const existing = await ctx.internalAdapter.findCredentialAccount(userId);
  if (!existing) {
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: 'credential',
      accountId: userId,
      password: passwordHash,
    });
  } else {
    await ctx.internalAdapter.updatePassword(userId, passwordHash);
  }
  // A password reset means the account may have been compromised.
  await ctx.internalAdapter.deleteUserSessions(userId);
}

export async function resetPasswordWithGrant(
  grant: string,
  newPassword: string,
): Promise<RecoveryResult<{ phoneNumber: string; email: string }>> {
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, status: 400, error: 'PASSWORD_TOO_SHORT' };
  }
  if (newPassword.length > 128) {
    return { ok: false, status: 400, error: 'PASSWORD_TOO_LONG' };
  }

  const phoneNumber = await consumeRecoveryGrant('password', grant);
  if (!phoneNumber) return { ok: false, status: 400, error: 'RECOVERY_GRANT_INVALID' };

  const user = await findVerifiedUser(phoneNumber);
  if (!user) return { ok: false, status: 400, error: 'RECOVERY_GRANT_INVALID' };

  await setCredentialPassword(user.id, newPassword);
  // The stored address may still be the legacy domain, so the client must sign in
  // with exactly what the database holds rather than rebuilding it.
  return { ok: true, value: { phoneNumber, email: user.email } };
}

export async function resetPinWithGrant(
  grant: string,
  newPin: string,
): Promise<RecoveryResult<{ phoneNumber: string }>> {
  if (!isValidTransactionPin(newPin)) {
    return { ok: false, status: 400, error: 'INVALID_TRANSACTION_PIN' };
  }

  const phoneNumber = await consumeRecoveryGrant('pin', grant);
  if (!phoneNumber) return { ok: false, status: 400, error: 'RECOVERY_GRANT_INVALID' };

  const user = await findVerifiedUser(phoneNumber);
  if (!user) return { ok: false, status: 400, error: 'RECOVERY_GRANT_INVALID' };

  const pinHash = await hashTransactionPin(newPin);
  const now = new Date();
  const db = getDatabase();
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(transactionPins)
      .set({ pinHash, failedAttempts: 0, lockedUntil: null, updatedAt: now })
      .where(eq(transactionPins.userId, user.id))
      .returning({ userId: transactionPins.userId });
    if (!updated) {
      await tx.insert(transactionPins).values({ userId: user.id, pinHash });
    }
  });

  return { ok: true, value: { phoneNumber } };
}
