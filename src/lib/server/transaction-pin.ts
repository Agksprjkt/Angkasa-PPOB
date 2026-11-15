import 'server-only';

import { eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { transactionPins } from '@/lib/server/db/schema';
import { verifyTransactionPin } from '@/lib/server/transaction-pin-core';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export type TransactionPinVerification =
  | 'valid'
  | 'not_set'
  | 'invalid'
  | 'locked';

export async function verifyAndRecordTransactionPin(
  userId: string,
  pin: string,
): Promise<TransactionPinVerification> {
  return getDatabase().transaction(async (tx) => {
    const savedPin = await tx
      .select()
      .from(transactionPins)
      .where(eq(transactionPins.userId, userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!savedPin) return 'not_set';

    const now = new Date();
    if (savedPin.lockedUntil && savedPin.lockedUntil > now) return 'locked';

    const attempts = savedPin.lockedUntil ? 0 : savedPin.failedAttempts;
    if (await verifyTransactionPin(pin, savedPin.pinHash)) {
      await tx
        .update(transactionPins)
        .set({ failedAttempts: 0, lockedUntil: null, updatedAt: now })
        .where(eq(transactionPins.userId, userId));
      return 'valid';
    }

    const failedAttempts = attempts + 1;
    await tx
      .update(transactionPins)
      .set({
        failedAttempts,
        lockedUntil:
          failedAttempts >= MAX_FAILED_ATTEMPTS
            ? new Date(now.getTime() + LOCK_DURATION_MS)
            : null,
        updatedAt: now,
      })
      .where(eq(transactionPins.userId, userId));

    return failedAttempts >= MAX_FAILED_ATTEMPTS ? 'locked' : 'invalid';
  });
}
