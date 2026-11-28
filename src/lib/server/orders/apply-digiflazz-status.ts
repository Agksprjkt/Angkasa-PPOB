import 'server-only';

import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { balanceLedger, invoices, transactions } from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';
import { settleFlashSaleForTransaction } from '@/lib/server/flash-sales';
import { settleVoucherForTransaction } from '@/lib/server/vouchers';
import { mapDigiflazzStatus, type DigiflazzTransactionResponse } from '@/lib/digiflazz-protocol';
import { recordProductOutcome } from '@/lib/server/product-health';
import {
  mapTokoVoucherStatus,
  type TokoVoucherTransaction,
} from '@/lib/tokovoucher-protocol';

// Applies a provider-confirmed final status once. The compare-and-set on
// `status = pending` keeps callbacks from applying refunds more than once.
export async function applyDigiflazzTransactionStatus(
  transactionId: string,
  response: DigiflazzTransactionResponse,
) {
  const status = mapDigiflazzStatus(response.status, response.rc);
  return applyProviderTransactionStatus(transactionId, {
    status,
    code: response.rc,
    message: response.message,
    sn: response.sn,
    vendorLabel: 'Digiflazz',
  });
}

export async function applyTokoVoucherTransactionStatus(
  transactionId: string,
  response: TokoVoucherTransaction,
) {
  const status = mapTokoVoucherStatus(response.status);
  return applyProviderTransactionStatus(transactionId, {
    status,
    code: response.status,
    message: response.message,
    sn: response.sn,
    vendorLabel: 'TokoVoucher',
  });
}

async function applyProviderTransactionStatus(
  transactionId: string,
  response: {
    status: 'success' | 'pending' | 'failed';
    code: string;
    message: string;
    sn?: string | null;
    vendorLabel: string;
  },
) {
  const { status } = response;
  if (status === 'pending') return false;

  const vendorResponse = {
    code: response.code,
    message: response.message.slice(0, 500),
    rc: response.code,
    rawTime: new Date().toISOString(),
  };

  let settledProductId: string | null = null;
  const applied = await getDatabase().transaction(async (tx) => {
    const [updated] = await tx
      .update(transactions)
      .set({
        status,
        needsManualReview: false,
        manualReviewAt: null,
        sn: status === 'success' ? response.sn ?? null : null,
        vendorResponse,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transactions.id, transactionId),
        eq(transactions.status, 'pending'),
      ))
      .returning({
        id: transactions.id,
        userId: transactions.userId,
        productId: transactions.productId,
        amount: transactions.amount,
        referenceId: transactions.referenceId,
        productName: transactions.productName,
        paymentMethod: transactions.paymentMethod,
        invoiceId: transactions.invoiceId,
      });
    if (!updated) return false;
    settledProductId = updated.productId;

    await settleFlashSaleForTransaction(
      tx,
      transactionId,
      status === 'success' ? 'consumed' : 'released',
      new Date(),
    );
    await settleVoucherForTransaction(
      tx,
      transactionId,
      status === 'success' ? 'consumed' : 'released',
      new Date(),
    );

    if (updated.invoiceId) {
      // A QRIS invoice tracks fulfilment separately from the payment itself.
      await tx
        .update(invoices)
        .set({
          transactionStatus: status,
          sn: status === 'success' ? response.sn ?? null : null,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, updated.invoiceId));
    }

    if (status === 'failed' && updated.paymentMethod === 'balance') {
      if (!updated.userId) throw new Error('Pending balance order has no owner to refund.');
      const refundKey = `refund:${updated.referenceId}`;
      const existingRefund = await tx
        .select({ id: balanceLedger.id })
        .from(balanceLedger)
        .where(eq(balanceLedger.idempotencyKey, refundKey))
        .limit(1);
      if (existingRefund[0]) return true;

      const walletResult = await applyBalanceDelta(tx, {
        idempotencyKey: refundKey,
        userId: updated.userId,
        type: 'credit',
        amount: updated.amount,
        reference: updated.referenceId,
        note: `Refund gagal ${response.vendorLabel} ${updated.productName}`,
      });
      if ('error' in walletResult) throw new Error(walletResult.error);
    }

    // A QRIS order was already paid at the gateway, so its refund is a manual
    // bank transfer. Flag the invoice so an admin settles it by hand.
    if (status === 'failed' && updated.paymentMethod !== 'balance' && updated.invoiceId) {
      await tx
        .update(invoices)
        .set({ paymentStatus: 'review', updatedAt: new Date() })
        .where(eq(invoices.id, updated.invoiceId));
    }

    return true;
  });

  if (applied) {
    await recordProductOutcome(
      settledProductId,
      status === 'success'
        ? { ok: true }
        : { ok: false, rc: response.code, message: response.message },
    ).catch(() => undefined);
  }
  return applied;
}
