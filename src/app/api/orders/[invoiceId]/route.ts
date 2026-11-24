import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { hashOrderLookupValue } from '@/lib/server/order-lookup';
import { cancelQrislyInvoice, refreshQrislyOrder, renewQrislyInvoice } from '@/lib/server/qrisly-orders';
import { canManageQrislyOrder } from '@/lib/order-actions';
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
    payableAmount: invoice.payableAmount ?? invoice.totalPay,
    paymentStatus: invoice.paymentStatus,
    transactionStatus: invoice.transactionStatus,
    qrString: invoice.qrString,
    expiresAt: invoice.expiresAt,
    createdAt: invoice.createdAt,
  };
}

function presentTransaction(transaction: typeof transactions.$inferSelect) {
  // Store margin is internal; never expose the profit column to the buyer.
  const { profit, ...publicTransaction } = transaction;
  void profit;
  return publicTransaction;
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
      { transaction: presentTransaction(transaction) },
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
      transaction: refreshed.transaction
        ? presentTransaction(refreshed.transaction)
        : refreshed.transaction,
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

function hasInvoiceAccess(
  request: NextRequest,
  invoice: typeof invoices.$inferSelect,
  sessionUserId: string | undefined,
  grant: boolean,
) {
  if (invoice.userId && sessionUserId === invoice.userId) return true;
  if (hasGuestAccess(
    request.headers.get('X-Order-Access-Token'),
    invoice.guestAccessTokenHash,
  )) return true;
  return grant;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await context.params;
  if (Number(request.headers.get('content-length') ?? 0) > 1_024) {
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
    Object.keys(payload).some((key) => key !== 'action') ||
    !('action' in payload) ||
    (payload.action !== 'cancel' && payload.action !== 'renew')
  ) {
    return NextResponse.json({ error: 'INVALID_ORDER_ACTION' }, { status: 400 });
  }
  const action = payload.action as 'cancel' | 'renew';

  const db = getDatabase();
  const invoice = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!invoice) {
    return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  const grant = await hasLookupGrant(
    request.headers.get('X-Order-Access-Token'),
    invoiceId,
    'invoice',
  );
  if (!hasInvoiceAccess(request, invoice, session?.user.id, grant)) {
    return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
  }

  if (!canManageQrislyOrder(invoice)) {
    return NextResponse.json({ error: 'ORDER_NOT_CANCELLABLE' }, { status: 409 });
  }

  try {
    if (action === 'cancel') {
      const cancelled = await cancelQrislyInvoice(invoice.id);
      if (!cancelled) {
        return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
      }
      if (cancelled.paymentStatus !== 'expired') {
        return NextResponse.json({ error: 'ORDER_NOT_CANCELLABLE' }, { status: 409 });
      }
      return NextResponse.json(
        { invoice: presentInvoice(cancelled) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const renewed = await renewQrislyInvoice(invoice);
    if (!renewed) {
      return NextResponse.json({ error: 'ORDER_NOT_CANCELLABLE' }, { status: 409 });
    }
    // The renewed invoice inherits the guest access token hash, so the caller's
    // existing X-Order-Access-Token keeps working on the new invoice id.
    return NextResponse.json(
      { invoice: presentInvoice(renewed) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error(
      '[QRISLY_ORDER_ACTION_FAILED]',
      action,
      error instanceof Error ? error.message : 'Unknown Qrisly order error',
    );
    return NextResponse.json({ error: 'ORDER_ACTION_UNAVAILABLE' }, { status: 502 });
  }
}
