import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { createDigiflazzTransaction } from '@/lib/digiflazz';
import { classifyQrislyPayment, isWithinLateSettlementGrace, isValidQrislyAmount } from '@/lib/deposit-validation';
import { getDatabase } from '@/lib/server/db/client';
import { getDigiflazzConfig, getQrislyConfig } from '@/lib/server/integration-settings';
import { checkQrislyPayment, createQrislyPayment } from '@/lib/server/qrisly';
import { invoices, transactions } from '@/lib/server/db/schema';
import { createOrderCode } from '@/lib/order-codes';
import {
  buildDigiflazzCustomerNo,
  mapDigiflazzStatus,
  readDigiflazzTransactionResponse,
} from '@/lib/digiflazz-protocol';
import {
  expireFlashSaleReservationForInvoice,
  settleFlashSaleReservation,
} from '@/lib/server/flash-sales';
import { expireVoucherForInvoice, settleVoucherUsage } from '@/lib/server/vouchers';

// QRIS can settle shortly after our local expiry. Keep polling the provider
// through this grace window so a late-but-real payment is never marked expired.
const lateSettlementGraceMs = 60 * 60_000;

async function submitPaidOrder(
  invoice: typeof invoices.$inferSelect,
  transaction: typeof transactions.$inferSelect,
) {
  try {
    const config = await getDigiflazzConfig();
    if (
      !config.username ||
      !config.apiKey ||
      (config.mode !== 'sandbox' && config.mode !== 'production') ||
      (config.mode === 'production' && !config.enableRealTransactions)
    ) {
      throw new Error('DIGIFLAZZ_NOT_READY_AFTER_PAYMENT');
    }

    const response: unknown = await createDigiflazzTransaction(
      { username: config.username, apiKey: config.apiKey, mode: config.mode },
      {
        buyerSkuCode: invoice.vendorCode,
        customerNo: buildDigiflazzCustomerNo(
          invoice.destination,
          invoice.serverZoneId,
        ).customerNo,
        refId: transaction.referenceId,
      },
    );
    const provider = readDigiflazzTransactionResponse(response);
    if (!provider || provider.refId !== transaction.referenceId) {
      throw new Error('DIGIFLAZZ_RESPONSE_UNCLEAR');
    }

    const status = mapDigiflazzStatus(provider.status, provider.rc);
    const vendorResponse = {
      code: provider.rc.slice(0, 100),
      message: provider.message.slice(0, 500),
      rc: provider.rc.slice(0, 100),
      rawTime: new Date().toISOString(),
    };

    const db = getDatabase();
    const [updatedTransaction] = await db
      .update(transactions)
      .set({
        status,
        sn: status === 'success' ? provider.sn ?? null : null,
        vendorResponse,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transaction.id))
      .returning();
    if (!updatedTransaction) throw new Error('DIGIFLAZZ_TRANSACTION_SAVE_FAILED');

    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        transactionStatus: status === 'pending' ? 'processing' : status,
        sn: status === 'success' ? provider.sn ?? null : null,
        // The customer already paid at the gateway, so a definitive vendor failure
        // needs a manual refund; flag the invoice like the webhook path does.
        ...(status === 'failed' ? { paymentStatus: 'review' as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id))
      .returning();
    if (!updatedInvoice) throw new Error('ORDER_INVOICE_SAVE_FAILED');
    return { invoice: updatedInvoice, transaction: updatedTransaction };
  } catch (error) {
    console.error(
      '[QRISLY_ORDER_VENDOR_OUTCOME_UNCLEAR]',
      error instanceof Error ? error.message : 'Unknown Digiflazz error',
    );
    const db = getDatabase();
    const vendorResponse = {
      code: 'OUTCOME_UNCLEAR',
      message: 'Pembayaran diterima; hasil vendor belum dapat dipastikan.',
      rc: 'OUTCOME_UNCLEAR',
      rawTime: new Date().toISOString(),
    };
    const [updatedTransaction] = await db
      .update(transactions)
      .set({ vendorResponse, updatedAt: new Date() })
      .where(eq(transactions.id, transaction.id))
      .returning();
    const [updatedInvoice] = await db
      .update(invoices)
      .set({ transactionStatus: 'processing', updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id))
      .returning();
    if (!updatedTransaction || !updatedInvoice) {
      throw new Error('PAID_ORDER_STATUS_SAVE_FAILED');
    }
    return { invoice: updatedInvoice, transaction: updatedTransaction };
  }
}

export async function refreshQrislyOrder(invoiceId: string) {
  const db = getDatabase();
  let invoice = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!invoice) return null;

  let transaction = await db
    .select()
    .from(transactions)
    .where(eq(transactions.invoiceId, invoice.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (
    invoice.paymentStatus === 'paid' &&
    invoice.transactionStatus === 'processing' &&
    transaction?.status === 'pending'
  ) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 30_000);
    const [claimedTransaction] = await db
      .update(transactions)
      .set({
        vendorResponse: {
          code: 'SUBMITTING',
          message: 'Mengirim transaksi ke penyedia.',
          rc: 'SUBMITTING',
          rawTime: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(and(
        eq(transactions.id, transaction.id),
        eq(transactions.status, 'pending'),
        lt(transactions.updatedAt, staleBefore),
      ))
      .returning();
    if (claimedTransaction) {
      const result = await submitPaidOrder(invoice, claimedTransaction);
      return { ...result, paymentCheckError: null };
    }
  }

  if (invoice.paymentStatus === 'unpaid') {
    if (!invoice.providerReference) {
      if (invoice.expiresAt <= new Date()) {
        const now = new Date();
        const [expiredInvoice] = await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(invoices)
            .set({ paymentStatus: 'expired', updatedAt: now })
            .where(and(
              eq(invoices.id, invoice!.id),
              eq(invoices.paymentStatus, 'unpaid'),
            ))
            .returning();
          if (updated) {
            await expireFlashSaleReservationForInvoice(tx, updated.id, now);
            await expireVoucherForInvoice(tx, updated.id, now);
          }
          return [updated];
        });
        return {
          invoice: expiredInvoice ?? invoice,
          transaction,
          paymentCheckError: null,
        };
      }
      return { invoice, transaction, paymentCheckError: 'PAYMENT_INITIALIZING' };
    }

    const config = await getQrislyConfig();
    if (!config.apiKey) throw new Error('QRISLY_API_KEY_NOT_CONFIGURED');
    const payment = await checkQrislyPayment({
      apiKey: config.apiKey,
      mode: config.mode,
    }, invoice.providerReference);
    const paymentResult = classifyQrislyPayment(
      payment.status,
      payment.amount,
      invoice.payableAmount ?? invoice.totalPay,
    );

    if (paymentResult === 'pending' && invoice.expiresAt > new Date()) {
      const [checkedInvoice] = await db
        .update(invoices)
        .set({ updatedAt: new Date() })
        .where(and(
          eq(invoices.id, invoice.id),
          eq(invoices.paymentStatus, 'unpaid'),
        ))
        .returning();
      return { invoice: checkedInvoice ?? invoice, transaction, paymentCheckError: null };
    }

    // Past the local deadline but the provider has not failed it: a QRIS scan can
    // still settle. Keep the invoice unpaid through a short grace window, then expire.
    if (paymentResult === 'pending') {
      if (isWithinLateSettlementGrace(invoice.expiresAt, new Date(), lateSettlementGraceMs)) {
        return {
          invoice,
          transaction,
          paymentCheckError: 'PAYMENT_AWAITING_PROVIDER',
        };
      }
    }

    if (paymentResult === 'amount_mismatch') {
      console.error(
        '[QRISLY_ORDER_AMOUNT_MISMATCH]',
        invoice.id,
        Number.isSafeInteger(payment.amount) ? payment.amount : 'invalid amount',
        invoice.payableAmount ?? invoice.totalPay,
      );
      const now = new Date();
      const [updated] = await db.transaction(async (tx) => {
        const [reviewInvoice] = await tx
          .update(invoices)
          .set({ paymentStatus: 'review', updatedAt: now })
          .where(and(eq(invoices.id, invoice!.id), eq(invoices.paymentStatus, 'unpaid')))
          .returning();
        if (reviewInvoice) {
          await expireFlashSaleReservationForInvoice(tx, reviewInvoice.id, now);
          await expireVoucherForInvoice(tx, reviewInvoice.id, now);
        }
        return [reviewInvoice];
      });
      invoice = updated ?? invoice;
      return { invoice, transaction, paymentCheckError: 'PAYMENT_AMOUNT_MISMATCH' };
    }

    if (paymentResult === 'failed' || paymentResult === 'pending') {
      const now = new Date();
      const [updated] = await db.transaction(async (tx) => {
        const [expiredInvoice] = await tx
          .update(invoices)
          .set({ paymentStatus: 'expired', updatedAt: now })
          .where(and(eq(invoices.id, invoice!.id), eq(invoices.paymentStatus, 'unpaid')))
          .returning();
        if (expiredInvoice) {
          await expireFlashSaleReservationForInvoice(tx, expiredInvoice.id, now);
          await expireVoucherForInvoice(tx, expiredInvoice.id, now);
        }
        return [expiredInvoice];
      });
      invoice = updated ?? invoice;
      return { invoice, transaction, paymentCheckError: null };
    }

    const now = new Date();
    const claimed = await db.transaction(async (tx) => {
      const [updatedInvoice] = await tx
        .update(invoices)
        .set({
          paymentStatus: 'paid',
          transactionStatus: 'processing',
          updatedAt: now,
        })
        .where(and(
          eq(invoices.id, invoice.id),
          eq(invoices.paymentStatus, 'unpaid'),
          eq(invoices.transactionStatus, 'pending'),
        ))
        .returning();
      if (!updatedInvoice) return null;

      const referenceId = createOrderCode('PAY');
      const [createdTransaction] = await tx
        .insert(transactions)
        .values({
          id: randomUUID(),
          referenceId,
          idempotencyKey: `invoice:${invoice.id}`,
          invoiceId: invoice.id,
          userId: invoice.userId,
          customerPhone: invoice.customerPhone,
          productId: invoice.productId,
          productName: invoice.productName,
          category: invoice.category,
          operator: invoice.operator,
          destination: invoice.destination,
          serverZoneId: invoice.serverZoneId,
          customerName: invoice.customerName,
          amount: invoice.productPrice,
          profit: invoice.productPrice - invoice.basePrice,
          status: 'pending',
          paymentMethod: 'qrisly',
        })
        .returning();
      if (!createdTransaction) throw new Error('PAID_ORDER_TRANSACTION_CREATE_FAILED');
      await settleFlashSaleReservation(
        tx,
        { invoiceId: invoice.id },
        'consumed',
        now,
      );
      await settleVoucherUsage(tx, { invoiceId: invoice.id }, 'consumed', now);
      return { invoice: updatedInvoice, transaction: createdTransaction };
    });

    if (claimed) {
      const result = await submitPaidOrder(claimed.invoice, claimed.transaction);
      return { ...result, paymentCheckError: null };
    }

    invoice = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id))
      .limit(1)
      .then((rows) => rows[0]) ?? invoice;
    transaction = await db
      .select()
      .from(transactions)
      .where(eq(transactions.invoiceId, invoice.id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  return { invoice, transaction, paymentCheckError: null };
}

// Buyer-initiated cancel. Compare-and-set on `unpaid` so a QRIS that settles at
// the same moment is never overwritten into `expired`.
export async function cancelQrislyInvoice(invoiceId: string) {
  const db = getDatabase();
  const now = new Date();
  const cancelled = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(invoices)
      .set({ paymentStatus: 'expired', updatedAt: now })
      .where(and(
        eq(invoices.id, invoiceId),
        eq(invoices.paymentStatus, 'unpaid'),
        eq(invoices.transactionStatus, 'pending'),
      ))
      .returning();
    if (!updated) return null;
    await expireFlashSaleReservationForInvoice(tx, updated.id, now);
    await expireVoucherForInvoice(tx, updated.id, now);
    return updated;
  });
  if (cancelled) return cancelled;

  // Already settled or already cancelled: report the current row so the caller
  // can tell "not cancellable" from "not found".
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

// "Ganti metode bayar": retire the unpaid invoice and issue a fresh QRIS for the
// exact same order. Amount and product are copied so the buyer is not repriced.
export async function renewQrislyInvoice(invoice: typeof invoices.$inferSelect) {
  const config = await getQrislyConfig();
  if (!config.enabled || !config.apiKey || !config.qrisId) {
    throw new Error('QRISLY_NOT_CONFIGURED');
  }
  if (!isValidQrislyAmount(invoice.totalPay)) {
    throw new Error('QRISLY_AMOUNT_OUT_OF_RANGE');
  }

  const db = getDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60_000);
  const id = randomUUID();
  const invoiceNumber = createOrderCode('INV');

  const created = await db.transaction(async (tx) => {
    const [retired] = await tx
      .update(invoices)
      .set({ paymentStatus: 'expired', updatedAt: now })
      .where(and(
        eq(invoices.id, invoice.id),
        eq(invoices.paymentStatus, 'unpaid'),
        eq(invoices.transactionStatus, 'pending'),
      ))
      .returning();
    if (!retired) return null;
    await expireFlashSaleReservationForInvoice(tx, retired.id, now);
    await expireVoucherForInvoice(tx, retired.id, now);

    const [inserted] = await tx
      .insert(invoices)
      .values({
        id,
        invoiceNumber,
        userId: retired.userId,
        customerPhone: retired.customerPhone,
        purchaserName: retired.purchaserName,
        customerEmail: retired.customerEmail,
        productId: retired.productId,
        vendorCode: retired.vendorCode,
        productName: retired.productName,
        category: retired.category,
        operator: retired.operator,
        destination: retired.destination,
        serverZoneId: retired.serverZoneId,
        customerName: retired.customerName,
        productPrice: retired.productPrice,
        basePrice: retired.basePrice,
        adminFee: retired.adminFee,
        totalPay: retired.totalPay,
        paymentMethod: 'qrisly',
        paymentStatus: 'unpaid',
        transactionStatus: 'pending',
        guestAccessTokenHash: retired.guestAccessTokenHash,
        idempotencyKey: `qrisly-order:renew:${retired.id}:${id}`,
        expiresAt,
      })
      .returning();
    return inserted ?? null;
  });

  if (!created) return null;

  const payment = await createQrislyPayment(
    { apiKey: config.apiKey, qrisId: config.qrisId, mode: config.mode },
    created.totalPay,
  );
  if (payment.payableAmount === null) {
    throw new Error('QRISLY_PAYABLE_AMOUNT_INVALID');
  }
  const [updated] = await db
    .update(invoices)
    .set({
      providerReference: payment.historyId,
      qrString: payment.qrString,
      payableAmount: payment.payableAmount,
      expiresAt: payment.expiresAt && payment.expiresAt > now ? payment.expiresAt : expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, created.id))
    .returning();
  return updated ?? created;
}
