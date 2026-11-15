import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { hashOrderLookupValue } from '@/lib/server/order-lookup';
import { refreshQrislyOrder } from '@/lib/server/qrisly-orders';
import { invoices, orderLookupGrants, transactions } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

function hash(value: string) {
  return createHash('sha256').update(value).digest();
}

function hasGuestAccess(token: string | null, tokenHash: string | null) {
  if (!token || !tokenHash) return false;
  const provided = hash(token);
  const expected = Buffer.from(tokenHash, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function hasLookupGrant(
  token: string | null,
  orderId: string,
  target: 'invoice' | 'transaction',
) {
  if (!token) return false;
  const [grant] = await getDatabase()
    .select({ tokenHash: orderLookupGrants.tokenHash })
    .from(orderLookupGrants)
    .where(and(
      eq(orderLookupGrants.tokenHash, hashOrderLookupValue('grant', token)),
      target === 'invoice'
        ? eq(orderLookupGrants.invoiceId, orderId)
        : eq(orderLookupGrants.transactionId, orderId),
      gt(orderLookupGrants.expiresAt, new Date()),
    ))
    .limit(1);
  return Boolean(grant);
}

function presentInvoice(invoice: typeof invoices.$inferSelect) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    productName: invoice.productName,
    destination: invoice.serverZoneId
      ? `${invoice.destination} (${invoice.serverZoneId})`
      : invoice.destination,
    totalPay: invoice.totalPay,
    paymentStatus: invoice.paymentStatus,
    transactionStatus: invoice.transactionStatus,
    qrString: invoice.qrString,
    expiresAt: invoice.expiresAt,
    createdAt: invoice.createdAt,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await context.params;
  const db = getDatabase();
  const invoice = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)
    .then((rows) => rows[0]);

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!invoice) {
    const transaction = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, invoiceId))
      .limit(1)
      .then((rows) => rows[0]);
    const hasGrant = await hasLookupGrant(
      request.headers.get('X-Order-Access-Token'),
      invoiceId,
      'transaction',
    );
    if (
      !transaction ||
      (!hasGrant && (!session || transaction.userId !== session.user.id))
    ) {
      return NextResponse.json(
        { error: 'ORDER_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    return NextResponse.json(
      { transaction },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const isOwner = Boolean(invoice.userId && session?.user.id === invoice.userId);
  const hasAccessToken = hasGuestAccess(
    request.headers.get('X-Order-Access-Token'),
    invoice.guestAccessTokenHash,
  );
  const hasGrant = await hasLookupGrant(
    request.headers.get('X-Order-Access-Token'),
    invoiceId,
    'invoice',
  );
  if (!isOwner && !hasAccessToken && !hasGrant) {
    return NextResponse.json(
      { error: 'ORDER_NOT_FOUND' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  try {
    const refreshed = await refreshQrislyOrder(invoice.id);
    if (!refreshed) {
      return NextResponse.json(
        { error: 'ORDER_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    return NextResponse.json({
      invoice: presentInvoice(refreshed.invoice),
      transaction: refreshed.transaction,
      paymentCheckError: refreshed.paymentCheckError,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error(
      '[QRISLY_ORDER_STATUS_FAILED]',
      error instanceof Error ? error.message : 'Unknown Qrisly order error',
    );
    return NextResponse.json(
      { error: 'ORDER_STATUS_UNAVAILABLE' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
