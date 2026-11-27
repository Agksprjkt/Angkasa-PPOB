import { eq, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/server/db/client';
import { billInquiries, products, transactions } from '@/lib/server/db/schema';
import { getDigiflazzConfig, getVendorRuntimeConfig } from '@/lib/server/integration-settings';
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

// Read through the integration settings so the secret can be rotated from the
// dashboard; the environment still wins when it is set.
async function getWebhookSecret() {
  const config = await getVendorRuntimeConfig();
  return config.digiflazzWebhookSecret;
}

function readRefId(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const data = (value as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) return '';
  const refId = (data as Record<string, unknown>).ref_id;
  return typeof refId === 'string' ? refId.trim().slice(0, 128) : '';
}

// Digiflazz signs the raw body with HMAC-SHA1 using the webhook secret configured
// in the member panel. A verified callback is authoritative; the 90-day limit
// applies only to fallback status queries, which can create a new transaction.
export async function POST(request: NextRequest) {
  const secret = await getWebhookSecret();
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
  if (userAgent.includes('Hotel')) {
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
      productVendorCode: products.vendorCode,
    })
    .from(transactions)
    .leftJoin(products, eq(transactions.productId, products.id))
    .leftJoin(billInquiries, eq(transactions.billInquiryId, billInquiries.id))
    .where(or(
      eq(transactions.referenceId, refId),
      eq(billInquiries.providerRef, refId),
    ))
    .limit(1)
    .then((rows) => rows[0]);

  if (!transaction) {
    // Unknown reference: acknowledge without acting so a probing caller learns nothing.
    await markWebhookEventProcessed('digiflazz', claim.id);
    return noStore({ received: true });
  }

  try {
    if (transaction.status !== 'pending') {
      await markWebhookEventProcessed('digiflazz', claim.id);
      return noStore({ received: true, ignored: 'transaction-already-settled' });
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
      if (!isDigiflazzStatusCheckSafe(transaction.createdAt, new Date())) {
        await reconcileBalanceOrder(transaction.id, {
          username: config.username,
          apiKey: config.apiKey,
          mode: config.mode,
        }, { force: true });
      } else {
        const reconciled = await reconcileBalanceOrder(transaction.id, {
          username: config.username,
          apiKey: config.apiKey,
          mode: config.mode,
        }, { force: true });
        if (!reconciled) {
          const current = await db
            .select({ status: transactions.status })
            .from(transactions)
            .where(eq(transactions.id, transaction.id))
            .limit(1)
            .then((rows) => rows[0]);
          if (current?.status === 'pending') {
            return noStore({ error: 'RECONCILIATION_NOT_READY' }, 503);
          }
        }
      }
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
