import 'server-only';

import { and, eq, lt } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { deposits } from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';
import { getQrislyConfig } from '@/lib/server/integration-settings';
import { checkQrislyPayment } from '@/lib/server/qrisly';
import { classifyQrislyPayment } from '@/lib/deposit-validation';

export const qrislyDepositReconciliationCooldownMs = 60_000;

export async function refreshQrislyDeposit(depositId: string) {
  const db = getDatabase();
  const deposit = await db
    .select()
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!deposit || deposit.status !== 'pending' || deposit.type !== 'qrisly') return deposit;
  if (!deposit.providerReference) throw new Error('QRISLY_REFERENCE_MISSING');

  const claimed = await db
    .update(deposits)
    .set({ updatedAt: new Date() })
    .where(and(
      eq(deposits.id, depositId),
      eq(deposits.status, 'pending'),
      lt(
        deposits.updatedAt,
        new Date(Date.now() - qrislyDepositReconciliationCooldownMs),
      ),
    ))
    .returning({ id: deposits.id });
  if (!claimed[0]) return deposit;

  const config = await getQrislyConfig();
  if (!config.apiKey) throw new Error('QRISLY_API_KEY_NOT_CONFIGURED');
  const payment = await checkQrislyPayment({
    apiKey: config.apiKey,
    mode: config.mode,
  }, deposit.providerReference);
  const paymentResult = classifyQrislyPayment(payment.status, payment.amount, deposit.amount);
  if (paymentResult === 'pending') return deposit;

  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!current || current.status !== 'pending') return current;

    const reviewedAt = new Date();
    if (paymentResult === 'failed') {
      const [updated] = await tx
        .update(deposits)
        .set({
          status: 'rejected',
          adminNote: `Status dari Qrisly: ${payment.status}`,
          reviewedAt,
          updatedAt: reviewedAt,
        })
        .where(and(eq(deposits.id, depositId), eq(deposits.status, 'pending')))
        .returning();
      return updated ?? current;
    }

    if (paymentResult === 'amount_mismatch' || payment.amount !== current.amount) {
      const [updated] = await tx
        .update(deposits)
        .set({
          adminNote: `Nominal Qrisly tidak cocok (diterima: ${Number.isFinite(payment.amount) ? payment.amount : 'tidak diketahui'}). Perlu pemeriksaan admin.`,
          updatedAt: reviewedAt,
        })
        .where(and(eq(deposits.id, depositId), eq(deposits.status, 'pending')))
        .returning();
      return updated ?? current;
    }

    const [updated] = await tx
      .update(deposits)
      .set({
        status: 'approved',
        adminNote: 'Pembayaran diverifikasi otomatis oleh Qrisly.',
        reviewedAt,
        updatedAt: reviewedAt,
      })
      .where(and(eq(deposits.id, depositId), eq(deposits.status, 'pending')))
      .returning();
    if (!updated) return current;

    const walletResult = await applyBalanceDelta(tx, {
      idempotencyKey: `qrisly-deposit-credit:${current.id}`,
      userId: current.userId,
      type: 'credit',
      amount: current.amount,
      reference: current.id,
      note: 'Deposit Qrisly terverifikasi',
      updatedAt: reviewedAt,
    });
    if ('error' in walletResult) throw new Error(walletResult.error);
    return updated;
  });
}
