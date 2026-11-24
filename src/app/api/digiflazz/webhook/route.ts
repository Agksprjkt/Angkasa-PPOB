import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/server/db/client';
import { products, transactions } from '@/lib/server/db/schema';
import { getDigiflazzConfig } from '@/lib/server/integration-settings';
import {
  isDigiflazzStatusCheckSafe,
  readDigiflazzTransactionResponse,
  verifyDigiflazzWebhookSignature,
} from '@/lib/digiflazz-protocol';
import { reconcileBalanceOrder } from '@/lib/server/orders/reconcile-balance-order';
import { applyDigiflazzTransactionStatus } from '@/lib/server/orders/apply-digiflazz-status';
import { claimWebhookEvent, markWebhookEventProcessed } from '@/lib/server/webhook-events';
import { clientAddress, consumeRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function readRefId(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const data = (value as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) return '';
  const refId = (data as Record<string, unknown>).ref_id;
  return typeof refId === 'string' ? refId.trim().slice(0, 128) : '';
}

// Digiflazz signs the raw body with HMAC-SHA1 using the webhook secret configured
// in the member panel. The payload is only a hint: status is re-read from
// Digiflazz (or applied directly when the signed payload already names a state),
// so a forged body cannot mark an order successful.
export async function POST(request: NextRequest) {
  const secret = process.env.DIGIFLAZZ_WEBHOOK_SECRET;
  if (!secret || Buffer.byteLength(secret) < 16) {
    return noStore({ error: 'DIGIFLAZZ_WEBHOOK_NOT_CONFIGURED' }, 503);
  }
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) {
    return noStore({ error: 'REQUEST_TOO_LARGE' }, 413);
  }
  const allowed = await consumeRateLimit(
    `ppob:rate:webhook:digiflazz:${clientAddress(request)}`,
    240,
    60_000,
  );
  if (allowed === false) return noStore({ error: 'RATE_LIMITED' }, 429);

  const rawBody = await request.text();
  if (!verifyDigiflazzWebhookSignature(
    rawBody,
    request.headers.get('x-hub-signature'),
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
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return noStore({ error: 'INVALID_WEBHOOK_BODY' }, 400);
  }

  const event = request.headers.get('x-digiflazz-event')?.trim().slice(0, 32) || 'update';
  if (event === 'ping') {
    return noStore({ received: true, pong: true });
  }
  const userAgent = request.headers.get('user-agent') ?? '';
  if (userAgent.includes('Pasca') || userAgent.includes('Hotel')) {
    // Postpaid and hotel callbacks are out of scope; acknowledge so they stop retrying.
    return noStore({ received: true, ignored: 'unsupported-product-type' });
  }

  const refId = readRefId(payload);
  if (!refId) {
    return noStore({ error: 'INVALID_REF_ID' }, 400);
  }
  const response = readDigiflazzTransactionResponse(payload);
  const eventKey = `${refId}:${event}:${response?.status ?? ''}:${response?.rc ?? ''}`;
  const claim = await claimWebhookEvent('digiflazz', eventKey, event);
  if (claim.replayed) {
    return noStore({ received: true, replayed: true });
  }

  const db = getDatabase();
  const transaction = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      paymentMethod: transactions.paymentMethod,
      createdAt: transactions.createdAt,
      referenceId: transactions.referenceId,
      category: transactions.category,
      destination: transactions.destination,
      serverZoneId: transactions.serverZoneId,
      productVendorCode: products.vendorCode,
    })
    .from(transactions)
    .leftJoin(products, eq(transactions.productId, products.id))
    .where(eq(transactions.referenceId, refId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!transaction) {
    // Unknown reference: acknowledge without acting so a probing caller learns nothing.
    return noStore({ received: true });
  }

  try {
    if (transaction.status !== 'pending') {
      await markWebhookEventProcessed('digiflazz', claim.id);
      return noStore({ received: true, ignored: 'transaction-already-settled' });
    }

    if (!isDigiflazzStatusCheckSafe(transaction.createdAt, new Date())) {
      // Digiflazz re-creates a transaction after 90 days; never re-query. The
      // reconciler parks it for admin review instead.
      await markWebhookEventProcessed('digiflazz', claim.id);
      return noStore({ received: true, ignored: 'status-check-window-expired' });
    }

    if (response) {
      await applyDigiflazzTransactionStatus(transaction.id, response);
    } else if (transaction.paymentMethod === 'balance' && transaction.productVendorCode) {
      // No usable payload status: fall back to a provider re-query.
      const config = await getDigiflazzConfig();
      if (
        !config.username ||
        !config.apiKey ||
        (config.mode !== 'sandbox' && config.mode !== 'production')
      ) {
        return noStore({ error: 'DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED' }, 503);
      }
      await reconcileBalanceOrder(transaction.id, {
        username: config.username,
        apiKey: config.apiKey,
        mode: config.mode,
      });
    }
  } catch (error) {
    console.error(
      '[DIGIFLAZZ_WEBHOOK_FAILED]',
      refId,
      error instanceof Error ? error.message : 'Unknown Digiflazz error',
    );
    // Leave the event unprocessed so a Digiflazz retry can finish the work.
    return noStore({ error: 'WEBHOOK_PROCESSING_FAILED' }, 503);
  }

  await markWebhookEventProcessed('digiflazz', claim.id);
  return noStore({ received: true });
}
