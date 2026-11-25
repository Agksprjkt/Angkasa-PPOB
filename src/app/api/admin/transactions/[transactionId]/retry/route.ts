import { randomUUID } from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { createDigiflazzTransaction } from '@/lib/digiflazz';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { getDigiflazzConfig } from '@/lib/server/integration-settings';
import { balanceLedger, products, transactions, users } from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';
import { createOrderCode } from '@/lib/order-codes';
import { isOrderableVendor } from '@/lib/vendor-registry';
import {
  buildDigiflazzCustomerNo,
  mapDigiflazzStatus,
  readDigiflazzTransactionResponse,
} from '@/lib/digiflazz-protocol';

export const runtime = 'nodejs';

type RetryHistory = NonNullable<
  NonNullable<typeof transactions.$inferSelect.vendorResponse>['retryHistory']
>;

function transactionResponse(
  response: NonNullable<typeof transactions.$inferSelect.vendorResponse>,
  history: RetryHistory,
  code: string,
  message: string,
  rc: string,
) {
  return {
    ...response,
    code,
    message: message.slice(0, 500),
    rc,
    rawTime: new Date().toISOString(),
    retryHistory: history,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { transactionId } = await params;
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1_024) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    !('confirm' in payload) ||
    payload.confirm !== true
  ) {
    return NextResponse.json({ error: 'RETRY_CONFIRMATION_REQUIRED' }, { status: 400 });
  }

  const db = getDatabase();
  const original = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!original) return NextResponse.json({ error: 'TRANSACTION_NOT_FOUND' }, { status: 404 });
  if (original.status !== 'failed') {
    return NextResponse.json({ error: 'ONLY_FAILED_TRANSACTIONS_CAN_BE_RETRIED' }, { status: 409 });
  }
  if (original.paymentMethod !== 'balance' || !original.userId) {
    return NextResponse.json({ error: 'RETRY_REQUIRES_A_WALLET_TRANSACTION' }, { status: 409 });
  }
  const userId = original.userId;

  let config: Awaited<ReturnType<typeof getDigiflazzConfig>>;
  try {
    config = await getDigiflazzConfig();
  } catch (error) {
    console.error(
      '[ADMIN_TRANSACTION_RETRY_SETTINGS_FAILED]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return NextResponse.json({ error: 'VENDOR_SETTINGS_UNAVAILABLE' }, { status: 503 });
  }
  if (
    !config.username ||
    !config.apiKey ||
    (config.mode !== 'sandbox' && config.mode !== 'production')
  ) {
    return NextResponse.json({ error: 'VENDOR_NOT_CONFIGURED' }, { status: 503 });
  }
  const mode = config.mode === 'sandbox' ? 'sandbox' : 'production';
  if (mode === 'production' && !config.enableRealTransactions) {
    return NextResponse.json({ error: 'PRODUCTION_TRANSACTIONS_DISABLED' }, { status: 503 });
  }

  const product = await db
    .select()
    .from(products)
    .where(and(eq(products.id, original.productId), eq(products.status, 'active')))
    .limit(1)
    .then((rows) => rows[0]);
  if (!product || !isOrderableVendor(product.vendor)) {
    return NextResponse.json({ error: 'RETRY_PRODUCT_UNAVAILABLE' }, { status: 409 });
  }
  // Manual retry re-charges the buyer and re-sends the order, and the refund path
  // below is written for Digiflazz. A TokoVoucher pending order is already settled
  // by the reconciler, so retrying it by hand would risk a double charge.
  if (product.vendor !== 'Digiflazz') {
    return NextResponse.json(
      {
        error: 'RETRY_NOT_SUPPORTED_FOR_VENDOR',
        message: 'Pesanan TokoVoucher diselesaikan otomatis oleh reconciler, bukan lewat retry manual.',
      },
      { status: 409 },
    );
  }
  if (!Number.isSafeInteger(original.amount) || original.amount <= 0) {
    return NextResponse.json({ error: 'INVALID_TRANSACTION_AMOUNT' }, { status: 409 });
  }

  const previousReference = original.referenceId;
  const referenceId = createOrderCode('PAY');
  const attemptedAt = new Date();
  const history: RetryHistory = [
    ...(original.vendorResponse?.retryHistory ?? []),
    {
      referenceId: previousReference,
      attemptedAt: original.updatedAt.toISOString(),
      status: original.status,
      adminId: session.user.id,
      code: original.vendorResponse?.code,
      message: original.vendorResponse?.message,
      rc: original.vendorResponse?.rc,
    },
    {
      referenceId,
      attemptedAt: attemptedAt.toISOString(),
      status: 'pending',
      adminId: session.user.id,
    },
  ];
  const legacyGameDestination = original.category === 'game' && !original.serverZoneId
    ? original.destination.match(/^(.*) \(([^()]*)\)$/)
    : null;
  const serverZoneId = original.serverZoneId ?? legacyGameDestination?.[2];
  const destination = legacyGameDestination?.[1] ?? original.destination;
  const customerNo = buildDigiflazzCustomerNo(destination, serverZoneId).customerNo;
  const createRetryResponse = (
    code: string,
    message: string,
    rc: string,
  ): NonNullable<typeof transactions.$inferSelect.vendorResponse> => ({
    ...transactionResponse(
      original.vendorResponse ?? { code: '', message: '', rc: '', rawTime: '' },
      history,
      code,
      message,
      rc,
    ),
    reconciliation: {
      buyerSkuCode: product.vendorCode,
      customerNo,
      mode,
    },
  });

  try {
    const claimed = await db.transaction(async (tx) => {
      const current = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId))
        .limit(1)
        .then((rows) => rows[0]);
      if (!current || current.status !== 'failed' || current.referenceId !== previousReference) {
        return { error: 'TRANSACTION_STATE_CHANGED' as const };
      }

      const debit = await tx
        .update(users)
        .set({
          balance: sql`${users.balance} - ${original.amount}`,
          updatedAt: attemptedAt,
        })
        .where(and(eq(users.id, userId), gte(users.balance, original.amount)))
        .returning({ balance: users.balance });
      if (!debit[0]) return { error: 'INSUFFICIENT_USER_BALANCE' as const };

      const balanceAfter = debit[0].balance;
      await tx.insert(balanceLedger).values({
        id: randomUUID(),
        idempotencyKey: `retry-debit:${referenceId}`,
        userId,
        actorId: session.user.id,
        type: 'debit',
        amount: original.amount,
        balanceBefore: balanceAfter + original.amount,
        balanceAfter,
        reference: referenceId,
        note: `Retry transaksi ${previousReference} oleh admin`,
      });

      const [updated] = await tx
        .update(transactions)
        .set({
          referenceId,
          status: 'pending',
          sn: null,
          vendorResponse: createRetryResponse(
            'RETRY_PENDING',
            'Retry dikirim oleh admin; menunggu hasil vendor.',
            'RETRY_PENDING',
          ),
          updatedAt: attemptedAt,
        })
        .where(and(eq(transactions.id, transactionId), eq(transactions.status, 'failed')))
        .returning();
      if (!updated) throw new Error('Failed to claim transaction for retry');
      return { transaction: updated };
    });

    if ('error' in claimed) {
      return NextResponse.json({ error: claimed.error }, { status: 409 });
    }

    let response: unknown;
    try {
      response = await createDigiflazzTransaction(
        { username: config.username, apiKey: config.apiKey, mode },
        { buyerSkuCode: product.vendorCode, customerNo, refId: referenceId },
      );
    } catch (error) {
      console.error(
        '[ADMIN_TRANSACTION_RETRY_OUTCOME_UNCLEAR]',
        error instanceof Error ? error.message : 'Unknown provider error',
      );
      await db
        .update(transactions)
        .set({
          vendorResponse: createRetryResponse(
            'RETRY_OUTCOME_UNCLEAR',
            'Hasil retry belum dapat dipastikan; periksa status vendor sebelum mencoba lagi.',
            'RETRY_OUTCOME_UNCLEAR',
          ),
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, transactionId), eq(transactions.referenceId, referenceId)));
      return NextResponse.json({ error: 'RETRY_OUTCOME_UNCLEAR' }, { status: 202 });
    }

    const provider = readDigiflazzTransactionResponse(response);
    if (!provider || provider.refId !== referenceId) {
      history[history.length - 1] = {
        ...history[history.length - 1],
        code: 'RETRY_OUTCOME_UNCLEAR',
        message: 'Respons vendor tidak dapat dipastikan; periksa status vendor.',
      };
      await db
        .update(transactions)
        .set({
          vendorResponse:           createRetryResponse(
            'RETRY_OUTCOME_UNCLEAR',
            'Hasil retry belum dapat dipastikan; periksa status vendor sebelum mencoba lagi.',
            'RETRY_OUTCOME_UNCLEAR',
          ),
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, transactionId), eq(transactions.referenceId, referenceId)));
      return NextResponse.json({ error: 'RETRY_OUTCOME_UNCLEAR' }, { status: 202 });
    }

    const status = mapDigiflazzStatus(provider.status, provider.rc);
    const vendorResponse = createRetryResponse(
      provider.rc,
      provider.message,
      provider.rc,
    );
    history[history.length - 1] = {
      ...history[history.length - 1],
      status,
      code: provider.rc,
      message: provider.message.slice(0, 500),
      rc: provider.rc,
    };
    vendorResponse.retryHistory = history;

    const updated = status === 'failed'
      ? await db.transaction(async (tx) => {
          const refundKey = `retry-refund:${referenceId}`;
          const existingRefund = await tx
            .select({ id: balanceLedger.id })
            .from(balanceLedger)
            .where(eq(balanceLedger.idempotencyKey, refundKey))
            .limit(1);
          if (!existingRefund[0]) {
            const walletResult = await applyBalanceDelta(tx, {
              idempotencyKey: refundKey,
              userId,
              actorId: session.user.id,
              type: 'credit',
              amount: original.amount,
              reference: referenceId,
              note: `Refund retry transaksi ${referenceId} gagal`,
            });
            if ('error' in walletResult) throw new Error(walletResult.error);
          }
          return tx
            .update(transactions)
            .set({ status, vendorResponse, updatedAt: new Date() })
            .where(and(eq(transactions.id, transactionId), eq(transactions.referenceId, referenceId)))
            .returning()
            .then((rows) => rows[0]);
        })
      : await db
          .update(transactions)
          .set({
            status,
            sn: status === 'success' ? provider.sn ?? null : null,
            vendorResponse,
            updatedAt: new Date(),
          })
          .where(and(eq(transactions.id, transactionId), eq(transactions.referenceId, referenceId)))
          .returning()
          .then((rows) => rows[0]);

    if (!updated) {
      console.error('[ADMIN_TRANSACTION_RETRY_SAVE_FAILED]', transactionId);
      return NextResponse.json({ error: 'RETRY_RESULT_COULD_NOT_BE_SAVED' }, { status: 503 });
    }
    return NextResponse.json({ transaction: updated }, { status: status === 'pending' ? 202 : 200 });
  } catch (error) {
    console.error(
      '[ADMIN_TRANSACTION_RETRY_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'TRANSACTION_RETRY_FAILED' }, { status: 503 });
  }
}
