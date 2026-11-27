import { eq, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/server/db/client';
import { billInquiries, transactions } from '@/lib/server/db/schema';
import { getTokoVoucherConfig } from '@/lib/server/integration-settings';
import {
  readTokoVoucherTransaction,
  verifyTokoVoucherWebhook,
} from '@/lib/tokovoucher-protocol';
import { applyTokoVoucherTransactionStatus } from '@/lib/server/orders/apply-digiflazz-status';
import { claimWebhookEvent, markWebhookEventProcessed } from '@/lib/server/webhook-events';
import { clientAddress, consumeRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) {
    return noStore({ error: 'REQUEST_TOO_LARGE' }, 413);
  }
  const allowed = await consumeRateLimit(
    `ppob:rate:webhook:tokovoucher:${clientAddress(request)}`,
    240,
    60_000,
  );
  if (allowed === false) return noStore({ error: 'RATE_LIMITED' }, 429);

  const config = await getTokoVoucherConfig();
  if (!config.memberCode || !config.secret) {
    return noStore({ error: 'TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED' }, 503);
  }

  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return noStore({ error: 'INVALID_JSON' }, 400);
  }

  const response = readTokoVoucherTransaction(payload);
  if (!response) return noStore({ error: 'INVALID_REF_ID' }, 400);
  if (!verifyTokoVoucherWebhook(
    request.headers.get('x-tokovoucher-authorization'),
    config.memberCode,
    config.secret,
    response.refId,
  )) {
    return noStore({ error: 'UNAUTHORIZED' }, 401);
  }

  const eventKey = `${response.refId}:${response.status}`;
  const claim = await claimWebhookEvent('tokovoucher', eventKey, 'update');
  if (claim.replayed) return noStore({ received: true, replayed: true });

  const db = getDatabase();
  const transaction = await db
    .select({
      id: transactions.id,
      status: transactions.status,
    })
    .from(transactions)
    .leftJoin(billInquiries, eq(transactions.billInquiryId, billInquiries.id))
    .where(or(
      eq(transactions.referenceId, response.refId),
      eq(billInquiries.providerRef, response.refId),
    ))
    .limit(1)
    .then((rows) => rows[0]);

  if (!transaction) {
    await markWebhookEventProcessed('tokovoucher', claim.id);
    return noStore({ received: true });
  }

  try {
    if (transaction.status !== 'pending') {
      await markWebhookEventProcessed('tokovoucher', claim.id);
      return noStore({ received: true, ignored: 'transaction-already-settled' });
    }

    // TokoVoucher documents this callback as the final transaction status.
    // Apply it directly instead of making an extra status request.
    await applyTokoVoucherTransactionStatus(transaction.id, response);
  } catch (error) {
    console.error(
      '[TOKOVOUCHER_WEBHOOK_FAILED]',
      response.refId,
      error instanceof Error ? error.message : 'Unknown TokoVoucher error',
    );
    return noStore({ error: 'WEBHOOK_PROCESSING_FAILED' }, 503);
  }

  await markWebhookEventProcessed('tokovoucher', claim.id);
  return noStore({ received: true });
}
