import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { createDigiflazzTransaction } from '@/lib/digiflazz';
import { classifyQrislyPayment } from '@/lib/deposit-validation';
import { getDatabase } from '@/lib/server/db/client';
import { getDigiflazzConfig, getQrislyConfig } from '@/lib/server/integration-settings';
import { checkQrislyPayment } from '@/lib/server/qrisly';
import { invoices, transactions } from '@/lib/server/db/schema';
import { createOrderCode } from '@/lib/order-codes';

function isProviderResponse(
  value: unknown,
): value is {
  data: {
    ref_id: string;
    status: string;
    message: string;
    rc: string;
    sn?: string;
  };
} {
  if (typeof value !== 'object' || value === null || !('data' in value)) return false;
  const data = value.data;
  return (
    typeof data === 'object' &&
    data !== null &&
    'ref_id' in data &&
    typeof data.ref_id === 'string' &&
    'status' in data &&
    typeof data.status === 'string' &&
    'message' in data &&
    typeof data.message === 'string' &&
    'rc' in data &&
    typeof data.rc === 'string' &&
    (!('sn' in data) || typeof data.sn === 'string')
  );
}

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
        customerNo: invoice.serverZoneId
          ? `${invoice.destination}.${invoice.serverZoneId}`
          : invoice.destination,
        refId: transaction.referenceId,
      },
    );
    if (!isProviderResponse(response) || response.data.ref_id !== transaction.referenceId) {
      throw new Error('DIGIFLAZZ_RESPONSE_UNCLEAR');
    }

    const provider = response.data;
    const providerStatus = provider.status.toLowerCase();
    const status = providerStatus === 'sukses' && provider.rc === '00'
      ? 'success'
      : providerStatus === 'gagal'
        ? 'failed'
        : 'pending';
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
      invoice.totalPay,
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

    if (paymentResult === 'amount_mismatch') {
      console.error(
        '[QRISLY_ORDER_AMOUNT_MISMATCH]',
        invoice.id,
        Number.isSafeInteger(payment.amount) ? payment.amount : 'invalid amount',
        invoice.totalPay,
      );
      const [updated] = await db
        .update(invoices)
        .set({ paymentStatus: 'review', updatedAt: new Date() })
        .where(and(eq(invoices.id, invoice.id), eq(invoices.paymentStatus, 'unpaid')))
        .returning();
      invoice = updated ?? invoice;
      return { invoice, transaction, paymentCheckError: 'PAYMENT_AMOUNT_MISMATCH' };
    }

    if (paymentResult === 'failed' || paymentResult === 'pending') {
      const [updated] = await db
        .update(invoices)
        .set({ paymentStatus: 'expired', updatedAt: new Date() })
        .where(and(eq(invoices.id, invoice.id), eq(invoices.paymentStatus, 'unpaid')))
        .returning();
      invoice = updated ?? invoice;
      return { invoice, transaction, paymentCheckError: null };
    }

    const claimed = await db.transaction(async (tx) => {
      const [updatedInvoice] = await tx
        .update(invoices)
        .set({
          paymentStatus: 'paid',
          transactionStatus: 'processing',
          updatedAt: new Date(),
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
