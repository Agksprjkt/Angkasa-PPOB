import 'server-only';

import { and, eq, lt, or, sql } from 'drizzle-orm';
import { checkDigiflazzTransactionStatus } from '@/lib/digiflazz';
import {
  isDigiflazzStatusCheckSafe,
  mapDigiflazzStatus,
  readDigiflazzTransactionResponse,
} from '@/lib/digiflazz-protocol';
import { getDatabase } from '@/lib/server/db/client';
import { databaseMode } from '@/lib/server/db/database-mode';
import { balanceLedger, products, transactions } from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';
import { settleFlashSaleForTransaction } from '@/lib/server/flash-sales';
import type { DigiflazzConfig } from '@/lib/digiflazz';

export const digiflazzReconciliationCooldownMs = 2 * 60_000;

export async function reconcileBalanceOrder(
  transactionId: string,
  config: DigiflazzConfig,
) {
  const db = getDatabase();
  const transaction = await db
    .select({
      transaction: transactions,
      vendorCode: products.vendorCode,
    })
    .from(transactions)
    .leftJoin(products, eq(transactions.productId, products.id))
    .where(and(
      eq(transactions.id, transactionId),
      eq(transactions.status, 'pending'),
      eq(transactions.paymentMethod, 'balance'),
    ))
    .limit(1)
    .then((rows) => rows[0]);

  if (!transaction) return false;

  const reconciliation = transaction.transaction.vendorResponse?.reconciliation;
  if (reconciliation?.mode && reconciliation.mode !== config.mode) {
    throw new Error('Digiflazz mode changed since this order was submitted.');
  }
  const buyerSkuCode = reconciliation?.buyerSkuCode ?? transaction.vendorCode;
  const legacyGameDestination = transaction.transaction.category === 'game'
    ? transaction.transaction.destination.match(/^(.*) \(([^()]*)\)$/)
    : null;
  const customerNo = reconciliation?.customerNo ?? (
    legacyGameDestination
      ? `${legacyGameDestination[1]}.${legacyGameDestination[2]}`
      : transaction.transaction.destination
  );
  if (!buyerSkuCode || !customerNo) {
    throw new Error('Digiflazz request details are unavailable for this pending order.');
  }
  // Re-querying a pending order older than 90 days makes Digiflazz create a brand
  // new transaction, which would charge the customer twice. Park it for an admin
  // instead of throwing, otherwise the reconciler retries it every minute forever.
  if (!isDigiflazzStatusCheckSafe(transaction.transaction.createdAt, new Date())) {
    const now = new Date();
    await db
      .update(transactions)
      .set({
        needsManualReview: true,
        manualReviewAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(transactions.id, transactionId),
        eq(transactions.status, 'pending'),
      ));
    return true;
  }

  const claimed = await db
    .update(transactions)
    .set({ updatedAt: new Date() })
    .where(and(
      eq(transactions.id, transactionId),
      eq(transactions.status, 'pending'),
      eq(transactions.paymentMethod, 'balance'),
      lt(
        transactions.updatedAt,
        new Date(Date.now() - digiflazzReconciliationCooldownMs),
      ),
    ))
    .returning({ id: transactions.id });
  if (!claimed[0]) return false;

  const result = await checkDigiflazzTransactionStatus(config, {
    buyerSkuCode,
    customerNo,
    refId: transaction.transaction.referenceId,
  });
  const response = readDigiflazzTransactionResponse(result);
  if (!response || response.refId !== transaction.transaction.referenceId) {
    throw new Error('Digiflazz returned an unclear transaction status.');
  }

  const status = mapDigiflazzStatus(response.status, response.rc);
  const vendorResponse = {
    ...(transaction.transaction.vendorResponse ?? {
      code: '',
      message: '',
      rc: '',
      rawTime: '',
    }),
    code: response.rc,
    message: response.message.slice(0, 500),
    rc: response.rc,
    rawTime: new Date().toISOString(),
    reconciliation: {
      buyerSkuCode,
      customerNo,
      mode: reconciliation?.mode ?? config.mode,
    },
  };

  if (status === 'failed') {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(transactions)
        .set({
          status: 'failed',
          needsManualReview: false,
          manualReviewAt: null,
          vendorResponse,
          updatedAt: new Date(),
        })
        .where(and(
          eq(transactions.id, transactionId),
          eq(transactions.status, 'pending'),
        ))
        .returning({
          userId: transactions.userId,
          amount: transactions.amount,
          referenceId: transactions.referenceId,
          productName: transactions.productName,
        })
        .then((rows) => rows[0]);

      if (!updated) return;
      if (!updated.userId) throw new Error('Pending balance order has no owner to refund.');
      await settleFlashSaleForTransaction(tx, transactionId, 'released', new Date());

      const refundKey = `refund:${updated.referenceId}`;
      const existingRefund = await tx
        .select({ id: balanceLedger.id })
        .from(balanceLedger)
        .where(eq(balanceLedger.idempotencyKey, refundKey))
        .limit(1);
      if (existingRefund[0]) return;

      const walletResult = await applyBalanceDelta(tx, {
        idempotencyKey: refundKey,
        userId: updated.userId,
        type: 'credit',
        amount: updated.amount,
        reference: updated.referenceId,
        note: `Refund gagal Digiflazz ${updated.productName}`,
      });
      if ('error' in walletResult) throw new Error(walletResult.error);
    });
  } else {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(transactions)
        .set({
          status,
          needsManualReview: status === 'success' ? false : transaction.transaction.needsManualReview,
          manualReviewAt: status === 'success'
            ? null
            : transaction.transaction.manualReviewAt,
          sn: status === 'success' ? response.sn ?? null : null,
          vendorResponse,
          updatedAt: new Date(),
        })
        .where(and(
          eq(transactions.id, transactionId),
          eq(transactions.status, 'pending'),
        ))
        .returning({ id: transactions.id });
      if (updated[0] && status === 'success') {
        await settleFlashSaleForTransaction(tx, transactionId, 'consumed', new Date());
      }
    });
  }

  return true;
}

export async function listReconciliationCandidates(batchSize: number, updatedBefore: Date) {
  const hasReconciliationSku = databaseMode === 'postgres'
    ? sql`${transactions.vendorResponse}->'reconciliation'->>'buyerSkuCode' IS NOT NULL`
    : sql`json_extract(${transactions.vendorResponse}, '$.reconciliation.buyerSkuCode') IS NOT NULL`;
  return getDatabase()
    .select({ id: transactions.id })
    .from(transactions)
    .leftJoin(products, eq(transactions.productId, products.id))
    .where(and(
      eq(transactions.status, 'pending'),
      eq(transactions.paymentMethod, 'balance'),
      // Orders parked for admin review must not be re-queried at the provider.
      eq(transactions.needsManualReview, false),
      sql`${transactions.updatedAt} < ${updatedBefore}`,
      or(
        eq(products.vendor, 'Digiflazz'),
        hasReconciliationSku,
      ),
    ))
    .orderBy(transactions.updatedAt)
    .limit(batchSize);
}
