import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/server/db/client';
import { deposits, invoices } from '@/lib/server/db/schema';
import { getQrislyWebhookSecret } from '@/lib/server/integration-settings';
import { refreshQrislyOrder } from '@/lib/server/qrisly-orders';
import { refreshQrislyDeposit } from '@/lib/server/qrisly-deposits';
import { claimWebhookEvent, markWebhookEventProcessed } from '@/lib/server/webhook-events';
import { consumeRateLimit, clientAddress } from '@/lib/server/rate-limit';
import { qrislyWebhookSecretMatches } from '@/lib/qrisly-webhook-auth';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isAuthorized(request: NextRequest, expected: string) {
  const supplied = request.headers.get('x-webhook-secret') ?? '';
  return qrislyWebhookSecretMatches(supplied, expected);
}

// The payload is only a hint. Status and amount are always re-read from Qrisly
// with our own API key, so a forged or replayed body cannot mark anything paid.
export async function POST(request: NextRequest) {
  let secret: string | undefined;
  try {
    secret = (await getQrislyWebhookSecret()).value;
  } catch (error) {
    console.error(
      '[QRISLY_WEBHOOK_SETTINGS_READ_FAILED]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return noStore({ error: 'QRISLY_WEBHOOK_CONFIG_UNAVAILABLE' }, 503);
  }
  if (!secret || Buffer.byteLength(secret) < 32) {
    return noStore({ error: 'QRISLY_WEBHOOK_NOT_CONFIGURED' }, 503);
  }
  if (!isAuthorized(request, secret)) {
    return noStore({ error: 'UNAUTHORIZED' }, 401);
  }
  if (Number(request.headers.get('content-length') ?? 0) > 4_096) {
    return noStore({ error: 'REQUEST_TOO_LARGE' }, 413);
  }
  const allowed = await consumeRateLimit(
    `ppob:rate:webhook:qrisly:${clientAddress(request)}`,
    120,
    60_000,
  );
  if (allowed === false) return noStore({ error: 'RATE_LIMITED' }, 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStore({ error: 'INVALID_JSON' }, 400);
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return noStore({ error: 'INVALID_WEBHOOK_BODY' }, 400);
  }
  const body = payload as Record<string, unknown>;
  const historyId = typeof body.history_id === 'string'
    ? body.history_id.trim()
    : typeof body.history_id === 'number' && Number.isSafeInteger(body.history_id)
      ? String(body.history_id)
      : '';
  const rawEventId = typeof body.event_id === 'string' ? body.event_id.trim() : '';
  if (!historyId || historyId.length > 128) {
    return noStore({ error: 'INVALID_HISTORY_ID' }, 400);
  }
  const eventId = (rawEventId || historyId).slice(0, 128);
  const eventType = typeof body.event_type === 'string'
    ? body.event_type.trim().slice(0, 64) || 'payment'
    : 'payment';

  const claim = await claimWebhookEvent('qrisly', eventId, eventType);
  if (claim.replayed) {
    // Already handled; acknowledge so the provider stops retrying.
    return noStore({ received: true, replayed: true });
  }

  const db = getDatabase();
  const invoice = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.providerReference, historyId))
    .limit(1)
    .then((rows) => rows[0]);
  const deposit = invoice
    ? null
    : await db
      .select({ id: deposits.id })
      .from(deposits)
      .where(eq(deposits.providerReference, historyId))
      .limit(1)
      .then((rows) => rows[0]);

  if (!invoice && !deposit) {
    // Unknown reference: acknowledge without acting, so a probing caller learns nothing.
    return noStore({ received: true });
  }

  try {
    if (invoice) {
      await refreshQrislyOrder(invoice.id);
    } else if (deposit) {
      await refreshQrislyDeposit(deposit.id);
    }
  } catch (error) {
    console.error(
      '[QRISLY_WEBHOOK_REFRESH_FAILED]',
      invoice?.id ?? deposit?.id,
      error instanceof Error ? error.message : 'Unknown Qrisly error',
    );
    // Not marked processed, so a provider retry can re-attempt reconciliation.
    return noStore({ error: 'WEBHOOK_PROCESSING_FAILED' }, 503);
  }

  await markWebhookEventProcessed('qrisly', claim.id);
  return noStore({ received: true });
}
