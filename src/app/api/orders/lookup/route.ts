import { desc, eq, lt, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  maskOrderLookupDestination,
  normalizeOrderLookupIdentifier,
  hashOrderLookupValue,
} from '@/lib/server/order-lookup';
import { getDatabase } from '@/lib/server/db/client';
import { consumeRedisRateLimit } from '@/lib/server/redis';
import { invoices, orderLookupRateLimits, transactions } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

const rateWindowMs = 10 * 60_000;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = request.headers.get('x-real-ip')?.trim();
  const address = forwarded || real || 'unknown';
  return address.slice(0, 128);
}

async function consumeRateLimit(
  tx: Parameters<Parameters<ReturnType<typeof getDatabase>['transaction']>[0]>[0],
  key: string,
  limit: number,
  now: Date,
) {
  const expiry = new Date(now.getTime() + rateWindowMs);
  const [entry] = await tx
    .insert(orderLookupRateLimits)
    .values({
      key,
      attempts: 1,
      windowStartedAt: now,
      expiresAt: expiry,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: orderLookupRateLimits.key,
      set: {
        attempts: sql`CASE WHEN ${orderLookupRateLimits.expiresAt} <= ${now} THEN 1 ELSE ${orderLookupRateLimits.attempts} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${orderLookupRateLimits.expiresAt} <= ${now} THEN ${now} ELSE ${orderLookupRateLimits.windowStartedAt} END`,
        expiresAt: sql`CASE WHEN ${orderLookupRateLimits.expiresAt} <= ${now} THEN ${expiry} ELSE ${orderLookupRateLimits.expiresAt} END`,
        updatedAt: now,
      },
    })
    .returning({ attempts: orderLookupRateLimits.attempts });
  return Boolean(entry && entry.attempts <= limit);
}

async function findOrders(identifier: { kind: 'phone'; value: string } | { kind: 'code'; value: string }) {
  const db = getDatabase();
  if (identifier.kind === 'phone') {
    const matchingInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.customerPhone, identifier.value))
      .orderBy(desc(invoices.createdAt))
      .limit(20);
    const walletTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.customerPhone, identifier.value))
      .orderBy(desc(transactions.createdAt))
      .limit(20);

    return [
      ...matchingInvoices.map((invoice) => ({
        id: invoice.id,
        invoiceId: invoice.id,
        transactionId: null,
        invoiceNumber: invoice.invoiceNumber,
        productName: invoice.productName,
        destination: invoice.serverZoneId
          ? `${invoice.destination} (${invoice.serverZoneId})`
          : invoice.destination,
        totalPay: invoice.payableAmount ?? invoice.totalPay,
        paymentStatus: invoice.paymentStatus,
        transactionStatus: invoice.transactionStatus,
        createdAt: invoice.createdAt,
        expiresAt: invoice.expiresAt,
      })),
      ...walletTransactions
        .filter((transaction) => !transaction.invoiceId)
        .map((transaction) => ({
          id: transaction.id,
          invoiceId: null,
          transactionId: transaction.id,
          invoiceNumber: transaction.referenceId,
          productName: transaction.productName,
          destination: transaction.serverZoneId
            ? `${transaction.destination} (${transaction.serverZoneId})`
            : transaction.destination,
          totalPay: transaction.amount,
          paymentStatus: 'paid' as const,
          transactionStatus: transaction.status,
          createdAt: transaction.createdAt,
          expiresAt: null,
        })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 20);
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.invoiceNumber, identifier.value))
    .limit(1);
  if (invoice) {
    return [{
      id: invoice.id,
      invoiceId: invoice.id,
      transactionId: null,
      invoiceNumber: invoice.invoiceNumber,
      productName: invoice.productName,
      destination: invoice.serverZoneId
        ? `${invoice.destination} (${invoice.serverZoneId})`
        : invoice.destination,
      totalPay: invoice.payableAmount ?? invoice.totalPay,
      paymentStatus: invoice.paymentStatus,
      transactionStatus: invoice.transactionStatus,
      createdAt: invoice.createdAt,
      expiresAt: invoice.expiresAt,
    }];
  }

  const [transaction] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.referenceId, identifier.value))
    .limit(1);
  if (!transaction) return [];
  if (transaction.invoiceId) {
    const [linkedInvoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, transaction.invoiceId))
      .limit(1);
    if (linkedInvoice) {
      return [{
        id: linkedInvoice.id,
        invoiceId: linkedInvoice.id,
        transactionId: null,
        invoiceNumber: linkedInvoice.invoiceNumber,
        productName: linkedInvoice.productName,
        destination: linkedInvoice.serverZoneId
          ? `${linkedInvoice.destination} (${linkedInvoice.serverZoneId})`
          : linkedInvoice.destination,
        totalPay: linkedInvoice.payableAmount ?? linkedInvoice.totalPay,
        paymentStatus: linkedInvoice.paymentStatus,
        transactionStatus: linkedInvoice.transactionStatus,
        createdAt: linkedInvoice.createdAt,
        expiresAt: linkedInvoice.expiresAt,
      }];
    }
  }
  return [{
    id: transaction.id,
    invoiceId: null,
    transactionId: transaction.id,
    invoiceNumber: transaction.referenceId,
    productName: transaction.productName,
    destination: transaction.serverZoneId
      ? `${transaction.destination} (${transaction.serverZoneId})`
      : transaction.destination,
    totalPay: transaction.amount,
    paymentStatus: 'paid' as const,
    transactionStatus: transaction.status,
    createdAt: transaction.createdAt,
    expiresAt: null,
  }];
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') ?? 0) > 2_048) {
    return json({ error: 'REQUEST_TOO_LARGE' }, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    !('identifier' in payload) ||
    typeof payload.identifier !== 'string'
  ) {
    return json({ error: 'INVALID_LOOKUP_DETAILS' }, 400);
  }

  const input = payload as Record<string, unknown>;
  const identifier = normalizeOrderLookupIdentifier(input.identifier as string);
  if (!identifier) return json({ error: 'INVALID_LOOKUP_DETAILS' }, 400);

  const db = getDatabase();
  const now = new Date();
  const identifierHash = hashOrderLookupValue('identifier', identifier.value);

  const redisLimits = await Promise.all([
    consumeRedisRateLimit(
      `ppob:rate:lookup:ip:${hashOrderLookupValue('ip', clientAddress(request))}`,
      20,
      rateWindowMs,
    ),
    consumeRedisRateLimit(`ppob:rate:lookup:id:${identifierHash}`, 6, rateWindowMs),
  ]);
  if (redisLimits.includes(false)) return json({ error: 'LOOKUP_RATE_LIMITED' }, 429);

  const rateLimited = await db.transaction(async (tx) => {
    await tx.delete(orderLookupRateLimits).where(lt(orderLookupRateLimits.expiresAt, now));
    const byIp = await consumeRateLimit(
      tx,
      hashOrderLookupValue('ip', clientAddress(request)),
      20,
      now,
    );
    const byIdentifier = await consumeRateLimit(tx, identifierHash, 6, now);
    return !byIp || !byIdentifier;
  });
  if (rateLimited) return json({ error: 'LOOKUP_RATE_LIMITED' }, 429);

  const orders = await findOrders(identifier);
  if (orders.length === 0) return json({ error: 'ORDERS_NOT_FOUND' }, 404);

  // No verification step, so the public result stays read-only: destination is
  // masked and no access token is issued. Opening an invoice still needs the
  // buyer's own token, an owner session, or an existing lookup grant.
  const safeOrders = orders.map((order) => ({
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    productName: order.productName,
    destination: maskOrderLookupDestination(order.destination),
    totalPay: order.totalPay,
    paymentStatus: order.paymentStatus,
    transactionStatus: order.transactionStatus,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
  }));
  return json({ orders: safeOrders });
}
