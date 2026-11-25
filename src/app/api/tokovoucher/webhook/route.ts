import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/server/db/client';
import { products, transactions } from '@/lib/server/db/schema';
import { getTokoVoucherConfig, getVendorRuntimeConfig } from '@/lib/server/integration-settings';
import {
  mapTokoVoucherStatus,
  readTokoVoucherTransaction,
  verifyTokoVoucherWebhook,
} from '@/lib/tokovoucher-protocol';
import { checkTokoVoucherTransactionStatus } from '@/lib/tokovoucher';
import { reconcileBalanceOrder } from '@/lib/server/orders/reconcile-balance-order';
import { applyDigiflazzTransactionStatus } from '@/lib/server/orders/apply-digiflazz-status';
import { claimWebhookEvent, markWebhookEventProcessed } from '@/lib/server/webhook-events';
import { clientAddress, consumeRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Read through the integration settings so the secret can be rotated from the
// dashboard; the environment still wins when it is set.
async function getWebhookSecret() {
  const config = await getVendorRuntimeConfig();
  return config.tokovoucherWebhookSecret;
}

// The webhook carries a shared token, not an HMAC over the body. The payload is
// therefore only a hint: a signed-by-token body still has its status re-read
// from TokoVoucher before anything is settled.
export async function POST(request: NextRequest) {
  const secret = await getWebhookSecret();
  if (!secret || Buffer.byteLength(secret) < 16) {
    return noStore({ error: 'TOKOVOUCHER_WEBHOOK_NOT_CONFIGURED' }, 503);
  }
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) {
    return noStore({ error: 'REQUEST_TOO_LARGE' }, 413);
  }
  const allowed = await consumeRateLimit(
    `ppob:rate:webhook:tokovoucher:${clientAddress(request)}`,
    240,
    60_000,
  );
  if (allowed === false) return noStore({ error: 'RATE_LIMITED' }, 429);

  const rawBody = await request.text();
  if (!verifyTokoVoucherWebhook(
    request.headers.get('x-tokovoucher-authorization'),
    secret,
  )) {
    return noStore({ error: 'UNAUTHORIZED' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return noStore({ error: 'INVALID_JSON' }, 400);
  }

  const response = readTokoVoucherTransaction(payload);
  if (!response) return noStore({ error: 'INVALID_REF_ID' }, 400);

  const eventKey = `${response.refId}:${response.status}`;
  const claim = await claimWebhookEvent('tokovoucher', eventKey, 'update');
  if (claim.replayed) return noStore({ received: true, replayed: true });

  const db = getDatabase();
  const transaction = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      paymentMethod: transactions.paymentMethod,
      referenceId: transactions.referenceId,
    })
    .from(transactions)
    .leftJoin(products, eq(transactions.productId, products.id))
    .where(eq(transactions.referenceId, response.refId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!transaction) {
    // Unknown reference: acknowledge without acting so a probing caller learns
    // nothing about our order table.
    return noStore({ received: true });
  }

  try {
    if (transaction.status !== 'pending') {
      await markWebhookEventProcessed('tokovoucher', claim.id);
      return noStore({ received: true, ignored: 'transaction-already-settled' });
    }

    const config = await getTokoVoucherConfig();
    if (!config.memberCode || !config.secret) {
      return noStore({ error: 'TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED' }, 503);
    }

    if (transaction.paymentMethod === 'balance') {
      // Re-read from the provider; the body is not trusted for the final status.
      await reconcileBalanceOrder(transaction.id);
    } else {
      // QRIS invoices are settled through the invoice flow; the provider status
      // still decides whether the product was delivered.
      const verified = await checkTokoVoucherTransactionStatus(
        {
          memberCode: config.memberCode,
          secret: config.secret,
          defaultSignature: config.defaultSignature,
          mode: config.mode,
        },
        { refId: transaction.referenceId },
      );
      if (mapTokoVoucherStatus(verified.status) !== 'pending') {
        await applyDigiflazzTransactionStatus(transaction.id, {
          refId: verified.refId,
          status: verified.status,
          message: verified.message,
          rc: verified.status,
          sn: verified.sn,
        });
      }
    }
  } catch (error) {
    console.error(
      '[TOKOVOUCHER_WEBHOOK_FAILED]',
      response.refId,
      error instanceof Error ? error.message : 'Unknown TokoVoucher error',
    );
    // Leave the event unprocessed so a TokoVoucher retry can finish the work.
    return noStore({ error: 'WEBHOOK_PROCESSING_FAILED' }, 503);
  }

  await markWebhookEventProcessed('tokovoucher', claim.id);
  return noStore({ received: true });
}
