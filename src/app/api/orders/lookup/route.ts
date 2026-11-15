import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeOrderLookupIdentifier, hashOrderLookupValue, matchesOrderLookupHash } from '@/lib/server/order-lookup';
import { getDatabase } from '@/lib/server/db/client';
import { consumeRedisRateLimit } from '@/lib/server/redis';
import {
  invoices,
  orderLookupChallenges,
  orderLookupGrants,
  orderLookupRateLimits,
  transactions,
} from '@/lib/server/db/schema';
import { sendWhatsAppOtp } from '@/lib/server/whatsapp';

export const runtime = 'nodejs';

const challengeLifetimeMs = 5 * 60_000;
const grantLifetimeMs = 30 * 60_000;
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

function phoneHash(phone: string) {
  return hashOrderLookupValue('phone-rate', phone);
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

async function resolvePhone(identifier: { kind: 'phone'; value: string } | { kind: 'code'; value: string }) {
  const db = getDatabase();
  if (identifier.kind === 'phone') {
    const [invoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.customerPhone, identifier.value))
      .limit(1);
    if (invoice) return identifier.value;
    const [transaction] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.customerPhone, identifier.value))
      .limit(1);
    return transaction ? identifier.value : null;
  }

  const [invoice] = await db
    .select({ customerPhone: invoices.customerPhone })
    .from(invoices)
    .where(eq(invoices.invoiceNumber, identifier.value))
    .limit(1);
  if (invoice?.customerPhone) return invoice.customerPhone;
  const [transaction] = await db
    .select({ customerPhone: transactions.customerPhone })
    .from(transactions)
    .where(eq(transactions.referenceId, identifier.value))
    .limit(1);
  return transaction?.customerPhone ?? null;
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
        totalPay: invoice.totalPay,
        paymentStatus: invoice.paymentStatus,
        transactionStatus: invoice.transactionStatus,
        createdAt: invoice.createdAt,
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
      totalPay: invoice.totalPay,
      paymentStatus: invoice.paymentStatus,
      transactionStatus: invoice.transactionStatus,
      createdAt: invoice.createdAt,
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
        totalPay: linkedInvoice.totalPay,
        paymentStatus: linkedInvoice.paymentStatus,
        transactionStatus: linkedInvoice.transactionStatus,
        createdAt: linkedInvoice.createdAt,
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
    !('action' in payload) ||
    !('identifier' in payload) ||
    typeof payload.action !== 'string' ||
    typeof payload.identifier !== 'string'
  ) {
    return json({ error: 'INVALID_LOOKUP_DETAILS' }, 400);
  }

  const input = payload as Record<string, unknown>;
  if (typeof input.identifier !== 'string') return json({ error: 'INVALID_LOOKUP_DETAILS' }, 400);
  const identifier = normalizeOrderLookupIdentifier(input.identifier);
  if (!identifier) return json({ error: 'INVALID_LOOKUP_DETAILS' }, 400);

  const db = getDatabase();
  const now = new Date();
  const identifierHash = hashOrderLookupValue('identifier', identifier.value);
  await Promise.all([
    db.delete(orderLookupChallenges).where(lt(orderLookupChallenges.expiresAt, now)),
    db.delete(orderLookupGrants).where(lt(orderLookupGrants.expiresAt, now)),
  ]);

  if (input.action === 'request-otp') {
    const redisLimits = await Promise.all([
      consumeRedisRateLimit(
        `ppob:rate:lookup:ip:${hashOrderLookupValue('ip', clientAddress(request))}`,
        20,
        rateWindowMs,
      ),
      consumeRedisRateLimit(`ppob:rate:lookup:id:${identifierHash}`, 3, rateWindowMs),
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
      const byIdentifier = await consumeRateLimit(tx, identifierHash, 3, now);
      return !byIp || !byIdentifier;
    });
    if (rateLimited) return json({ error: 'LOOKUP_RATE_LIMITED' }, 429);

    const phone = await resolvePhone(identifier);
    const challengeId = randomUUID();
    const code = String(randomInt(100_000, 1_000_000));
    await db
      .insert(orderLookupChallenges)
      .values({
        id: challengeId,
        identifierHash,
        codeHash: hashOrderLookupValue('code', `${challengeId}:${code}`),
        expiresAt: new Date(now.getTime() + challengeLifetimeMs),
      });

    if (!phone) {
      return json({ challengeId, message: 'Jika pesanan cocok, kode verifikasi akan dikirim ke nomor terkait.' }, 202);
    }

    const perPhoneLimited = await db.transaction(async (tx) =>
      !await consumeRateLimit(
        tx,
        phoneHash(phone),
        3,
        now,
      ),
    );
    const redisPhoneLimited = await consumeRedisRateLimit(
      `ppob:rate:lookup:phone:${phoneHash(phone)}`,
      3,
      rateWindowMs,
    );
    if (perPhoneLimited || redisPhoneLimited === false) {
      await db.delete(orderLookupChallenges).where(eq(orderLookupChallenges.id, challengeId));
      return json({ error: 'LOOKUP_RATE_LIMITED' }, 429);
    }

    try {
      await sendWhatsAppOtp(phone, code);
    } catch (error) {
      await db.delete(orderLookupChallenges).where(eq(orderLookupChallenges.id, challengeId));
      console.error(
        '[ORDER_LOOKUP_OTP_DELIVERY_FAILED]',
        error instanceof Error ? error.message : 'Unknown WhatsApp provider error',
      );
      return json({ error: 'OTP_DELIVERY_FAILED' }, 503);
    }
    return json({ challengeId, message: 'Kode verifikasi dikirim jika pesanan cocok.' }, 202);
  }

  if (
    input.action !== 'verify-otp' ||
    typeof input.challengeId !== 'string' ||
    typeof input.code !== 'string' ||
    !/^\d{6}$/.test(input.code)
  ) {
    return json({ error: 'INVALID_LOOKUP_DETAILS' }, 400);
  }

  const challenge = await db
    .select()
    .from(orderLookupChallenges)
    .where(and(
      eq(orderLookupChallenges.id, input.challengeId),
      eq(orderLookupChallenges.identifierHash, identifierHash),
      gt(orderLookupChallenges.expiresAt, now),
    ))
    .limit(1)
    .then((rows) => rows[0]);
  if (!challenge || challenge.consumedAt || challenge.attempts >= 5) {
    return json({ error: 'LOOKUP_OTP_INVALID' }, 400);
  }

  const matches = matchesOrderLookupHash('code', `${challenge.id}:${input.code}`, challenge.codeHash);
  if (!matches) {
    const [updated] = await db
      .update(orderLookupChallenges)
      .set({
        attempts: sql`${orderLookupChallenges.attempts} + 1`,
        ...(challenge.attempts + 1 >= 5 ? { consumedAt: now } : {}),
      })
      .where(and(
        eq(orderLookupChallenges.id, challenge.id),
        eq(orderLookupChallenges.attempts, challenge.attempts),
        sql`${orderLookupChallenges.consumedAt} IS NULL`,
      ))
      .returning({ attempts: orderLookupChallenges.attempts });
    if (!updated) return json({ error: 'LOOKUP_OTP_INVALID' }, 400);
    return json({ error: updated.attempts >= 5 ? 'LOOKUP_OTP_ATTEMPTS_EXCEEDED' : 'LOOKUP_OTP_INVALID' }, 400);
  }

  const orders = await findOrders(identifier);
  if (orders.length === 0) {
    await db
      .update(orderLookupChallenges)
      .set({ consumedAt: now })
      .where(and(
        eq(orderLookupChallenges.id, challenge.id),
        sql`${orderLookupChallenges.consumedAt} IS NULL`,
      ));
    return json({ error: 'ORDERS_NOT_FOUND' }, 404);
  }

  const grants = orders.map((order) => {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      tokenHash: hashOrderLookupValue('grant', token),
      invoiceId: order.invoiceId,
      transactionId: order.transactionId,
    };
  });
  const consumed = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(orderLookupChallenges)
      .set({ consumedAt: now })
      .where(and(
        eq(orderLookupChallenges.id, challenge.id),
        eq(orderLookupChallenges.attempts, challenge.attempts),
        sql`${orderLookupChallenges.consumedAt} IS NULL`,
        gt(orderLookupChallenges.expiresAt, now),
      ))
      .returning({ id: orderLookupChallenges.id });
    if (!updated) return false;
    await tx.insert(orderLookupGrants).values(
      grants.map((grant) => ({
        tokenHash: grant.tokenHash,
        invoiceId: grant.invoiceId,
        transactionId: grant.transactionId,
        expiresAt: new Date(now.getTime() + grantLifetimeMs),
      })),
    );
    return true;
  });
  if (!consumed) return json({ error: 'LOOKUP_OTP_INVALID' }, 400);

  const safeOrders = orders.map((order, index) => ({
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    productName: order.productName,
    destination: order.destination,
    totalPay: order.totalPay,
    paymentStatus: order.paymentStatus,
    transactionStatus: order.transactionStatus,
    createdAt: order.createdAt,
    accessToken: grants[index].token,
  }));
  return json({ orders: safeOrders });
}
