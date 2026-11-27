import 'server-only';

import { and, eq, lt, or, sql } from 'drizzle-orm';
import { checkDigiflazzTransactionStatus } from '@/lib/digiflazz';
import { checkDigiflazzPostpaidStatus } from '@/lib/digiflazz-postpaid';
import {
  isDigiflazzStatusCheckSafe,
  mapDigiflazzStatus,
  readDigiflazzTransactionResponse,
} from '@/lib/digiflazz-protocol';
import { checkTokoVoucherTransactionStatus } from '@/lib/tokovoucher';
import { mapTokoVoucherStatus } from '@/lib/tokovoucher-protocol';
import { getTokoVoucherConfig } from '@/lib/server/integration-settings';
import { getDatabase } from '@/lib/server/db/client';
import { databaseMode } from '@/lib/server/db/database-mode';
import {
  balanceLedger,
  billInquiries,
  products,
  transactions,
} from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';
import { settleFlashSaleForTransaction } from '@/lib/server/flash-sales';
import { settleVoucherForTransaction } from '@/lib/server/vouchers';
import type { DigiflazzConfig } from '@/lib/digiflazz';

export const digiflazzReconciliationCooldownMs = 2 * 60_000;
export const tokoVoucherReconciliationCooldownMs = 10 * 60_000;

// The Digiflazz config is only consulted for Digiflazz orders; a TokoVoucher
// order loads its own credentials, so this argument is optional.
export async function reconcileBalanceOrder(
  transactionId: string,
  config?: DigiflazzConfig,
  options: { force?: boolean } = {},
) {
  const db = getDatabase();
  const transaction = await db
    .select({
      transaction: transactions,
      vendorCode: products.vendorCode,
      billProviderRef: billInquiries.providerRef,
    })
    .from(transactions)
    .leftJoin(products, eq(transactions.productId, products.id))
    .leftJoin(billInquiries, eq(transactions.billInquiryId, billInquiries.id))
    .where(and(
      eq(transactions.id, transactionId),
      eq(transactions.status, 'pending'),
      eq(transactions.paymentMethod, 'balance'),
    ))
    .limit(1)
    .then((rows) => rows[0]);

  if (!transaction) return false;

  const reconciliation = transaction.transaction.vendorResponse?.reconciliation;
  const providerRef = transaction.billProviderRef ?? transaction.transaction.referenceId;
  const isPostpaid = transaction.transaction.billInquiryId !== null;
  // Orders created before the vendor column existed are Digiflazz orders.
  const vendor = reconciliation?.vendor ?? 'Digiflazz';
  if (vendor === 'TokoVoucher') {
    return reconcileTokoVoucherOrder(
      transactionId,
      transaction,
      providerRef,
      db,
      options,
    );
  }
  if (!config) throw new Error('DIGIFLAZZ_CONFIG_REQUIRED');
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
        new Date(Date.now() - (
          options.force ? 30_000 : digiflazzReconciliationCooldownMs
        )),
      ),
    ))
    .returning({ id: transactions.id });
  if (!claimed[0]) return false;

  let responseStatus: string;
  let responseMessage: string;
  let responseRc: string;
  let responseSn: string | null;
  if (isPostpaid) {
    const response = await checkDigiflazzPostpaidStatus(config, {
      skuCode: buyerSkuCode,
      customerNo,
      refId: providerRef,
    });
    responseStatus = response.status;
    responseMessage = response.message;
    responseRc = response.rc ?? '';
    responseSn = response.sn;
  } else {
    const result = await checkDigiflazzTransactionStatus(config, {
      buyerSkuCode,
      customerNo,
      refId: providerRef,
    });
    const response = readDigiflazzTransactionResponse(result);
    if (!response || response.refId !== providerRef) {
      throw new Error('Digiflazz returned an unclear transaction status.');
    }
    responseStatus = response.status;
    responseMessage = response.message;
    responseRc = response.rc;
    responseSn = response.sn ?? null;
  }

  const status = mapDigiflazzStatus(responseStatus, responseRc);
  const vendorResponse = {
    ...(transaction.transaction.vendorResponse ?? {
      code: '',
      message: '',
      rc: '',
      rawTime: '',
    }),
    code: responseRc,
    message: responseMessage.slice(0, 500),
    rc: responseRc,
    rawTime: new Date().toISOString(),
    reconciliation: {
      buyerSkuCode,
      customerNo,
      mode: reconciliation?.mode ?? config.mode,
    },
  };

  await settleReconciledOrder({
    transactionId,
    status,
    vendorResponse,
    vendorLabel: 'Digiflazz',
    sn: status === 'success' ? responseSn : null,
    currentNeedsManualReview: transaction.transaction.needsManualReview,
    currentManualReviewAt: transaction.transaction.manualReviewAt,
  });

  return true;
}

// TokoVoucher status queries are safe to retry indefinitely, but the provider
// recommends spacing periodic checks by ten minutes.
async function reconcileTokoVoucherOrder(
  transactionId: string,
  transaction: {
    transaction: typeof transactions.$inferSelect;
    vendorCode: string | null;
  },
  providerRef: string,
  db: ReturnType<typeof getDatabase>,
  options: { force?: boolean },
) {
  const config = await getTokoVoucherConfig();
  if (!config.memberCode || !config.secret) {
    throw new Error('TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED');
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
        new Date(Date.now() - (
          options.force ? 30_000 : tokoVoucherReconciliationCooldownMs
        )),
      ),
    ))
    .returning({ id: transactions.id });
  if (!claimed[0]) return false;

  const response = await checkTokoVoucherTransactionStatus(
    {
      memberCode: config.memberCode,
      secret: config.secret,
      defaultSignature: config.defaultSignature,
      mode: config.mode,
    },
    { refId: providerRef },
  );
  if (response.refId !== providerRef) {
    throw new Error('TokoVoucher returned an unclear transaction status.');
  }

  const status = mapTokoVoucherStatus(response.status);
  const reconciliation = transaction.transaction.vendorResponse?.reconciliation;
  const vendorResponse = {
    ...(transaction.transaction.vendorResponse ?? {
      code: '',
      message: '',
      rc: '',
      rawTime: '',
    }),
    code: response.status,
    message: response.message.slice(0, 500),
    rc: response.status,
    rawTime: new Date().toISOString(),
    reconciliation: {
      buyerSkuCode: reconciliation?.buyerSkuCode ?? transaction.vendorCode ?? '',
      customerNo: reconciliation?.customerNo ?? transaction.transaction.destination,
      vendor: 'TokoVoucher' as const,
      mode: config.mode,
    },
  };

  await settleReconciledOrder({
    transactionId,
    status,
    vendorResponse,
    vendorLabel: 'TokoVoucher',
    sn: status === 'success' ? response.sn || null : null,
    currentNeedsManualReview: transaction.transaction.needsManualReview,
    currentManualReviewAt: transaction.transaction.manualReviewAt,
  });

  return true;
}

// Shared by both vendors: once a vendor reports a final status the refund,
// flash-sale, and voucher bookkeeping is identical.
async function settleReconciledOrder(input: {
  transactionId: string;
  status: 'success' | 'pending' | 'failed';
  vendorResponse: NonNullable<typeof transactions.$inferSelect.vendorResponse>;
  vendorLabel: string;
  sn: string | null;
  currentNeedsManualReview: boolean;
  currentManualReviewAt: Date | null;
}) {
  const db = getDatabase();
  if (input.status === 'failed') {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(transactions)
        .set({
          status: 'failed',
          needsManualReview: false,
          manualReviewAt: null,
          vendorResponse: input.vendorResponse,
          updatedAt: new Date(),
        })
        .where(and(
          eq(transactions.id, input.transactionId),
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
      await settleFlashSaleForTransaction(tx, input.transactionId, 'released', new Date());
      await settleVoucherForTransaction(tx, input.transactionId, 'released', new Date());

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
        note: `Refund gagal ${input.vendorLabel} ${updated.productName}`,
      });
      if ('error' in walletResult) throw new Error(walletResult.error);
    });
    return;
  }

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(transactions)
      .set({
        status: input.status,
        needsManualReview: input.status === 'success'
          ? false
          : input.currentNeedsManualReview,
        manualReviewAt: input.status === 'success'
          ? null
          : input.currentManualReviewAt,
        sn: input.sn,
        vendorResponse: input.vendorResponse,
        updatedAt: new Date(),
      })
      .where(and(
        eq(transactions.id, input.transactionId),
        eq(transactions.status, 'pending'),
      ))
      .returning({ id: transactions.id });
    if (updated[0] && input.status === 'success') {
      await settleFlashSaleForTransaction(tx, input.transactionId, 'consumed', new Date());
      await settleVoucherForTransaction(tx, input.transactionId, 'consumed', new Date());
    }
  });
}

export async function listReconciliationCandidates(
  batchSize: number,
  digiflazzUpdatedBefore: Date,
  tokoVoucherUpdatedBefore = digiflazzUpdatedBefore,
) {
  const hasReconciliationSku = databaseMode === 'postgres'
    ? sql`${transactions.vendorResponse}->'reconciliation'->>'buyerSkuCode' IS NOT NULL`
    : sql`json_extract(${transactions.vendorResponse}, '$.reconciliation.buyerSkuCode') IS NOT NULL`;
  const isTokoVoucherReconciliation = databaseMode === 'postgres'
    ? sql`${transactions.vendorResponse}->'reconciliation'->>'vendor' = 'TokoVoucher'`
    : sql`json_extract(${transactions.vendorResponse}, '$.reconciliation.vendor') = 'TokoVoucher'`;
  return getDatabase()
    .select({ id: transactions.id, vendor: products.vendor })
    .from(transactions)
    .leftJoin(products, eq(transactions.productId, products.id))
    .where(and(
      eq(transactions.status, 'pending'),
      eq(transactions.paymentMethod, 'balance'),
      // Orders parked for admin review must not be re-queried at the provider.
      eq(transactions.needsManualReview, false),
      // A typed Drizzle operator, not a raw sql template: the raw form binds the
      // Date without a type mapping and postgres-js then fails to encode it.
      or(
        and(
          lt(transactions.updatedAt, digiflazzUpdatedBefore),
          or(eq(products.vendor, 'Digiflazz'), hasReconciliationSku),
        ),
        and(
          lt(transactions.updatedAt, tokoVoucherUpdatedBefore),
          or(eq(products.vendor, 'TokoVoucher'), isTokoVoucherReconciliation),
        ),
      ),
    ))
    .orderBy(transactions.updatedAt)
    .limit(batchSize);
}
