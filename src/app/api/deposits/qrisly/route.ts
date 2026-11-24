import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { deposits, users } from '@/lib/server/db/schema';
import { getActivePaymentGateway, getQrislyConfig } from '@/lib/server/integration-settings';
import { createQrislyPayment, type QrislyConfig } from '@/lib/server/qrisly';
import { parseDepositAmount } from '@/lib/deposit-validation';
import { consumeRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

const depositCreateRateLimit = 10;
const depositCreateRateWindowMs = 10 * 60_000;

const depositPublicColumns = {
  id: deposits.id,
  amount: deposits.amount,
  type: deposits.type,
  paymentMethodLabel: deposits.paymentMethodLabel,
  status: deposits.status,
  providerReference: deposits.providerReference,
  qrString: deposits.qrString,
  payableAmount: deposits.payableAmount,
  expiresAt: deposits.expiresAt,
  createdAt: deposits.createdAt,
};

// Generates the QRIS and records the amount the payer must actually pay.
// Guarded on providerReference so a retry cannot double-generate.
async function attachQrislyDeposit(
  depositId: string,
  amount: number,
  config: QrislyConfig,
) {
  const payment = await createQrislyPayment(config, amount);
  if (payment.payableAmount === null) {
    throw new Error('QRISLY_PAYABLE_AMOUNT_INVALID');
  }
  const [updated] = await getDatabase()
    .update(deposits)
    .set({
      providerReference: payment.historyId,
      qrString: payment.qrString,
      payableAmount: payment.payableAmount,
      expiresAt: payment.expiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(deposits.id, depositId), isNull(deposits.providerReference)))
    .returning(depositPublicColumns);
  if (updated) return updated;
  return getDatabase()
    .select(depositPublicColumns)
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1)
    .then((rows) => rows[0]);
}

// A previous attempt reserved the deposit but never got a QRIS back.
async function retryQrislyDeposit(existing: typeof deposits.$inferSelect) {
  if (existing.status !== 'pending' || existing.providerReference) return existing;
  try {
    const config = await getQrislyConfig();
    if (!config.enabled || !config.apiKey || !config.qrisId) return existing;
    const updated = await attachQrislyDeposit(existing.id, existing.amount, {
      apiKey: config.apiKey,
      qrisId: config.qrisId,
      mode: config.mode,
    });
    return updated ?? existing;
  } catch (error) {
    console.error(
      '[USER_QRISLY_DEPOSIT_RETRY_FAILED]',
      error instanceof Error ? error.message : 'Unknown Qrisly error',
    );
    return existing;
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > 4_096) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  const owner = await getDatabase()
    .select({ phoneNumberVerified: users.phoneNumberVerified })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);
  if (!owner?.phoneNumberVerified) {
    return NextResponse.json({ error: 'PHONE_VERIFICATION_REQUIRED' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (
    typeof payload !== 'object' || payload === null || Array.isArray(payload) ||
    Object.keys(payload).some((key) => !['amount', 'idempotencyKey'].includes(key))
  ) {
    return NextResponse.json({ error: 'INVALID_DEPOSIT_REQUEST' }, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  const amount = parseDepositAmount(body.amount);
  if (
    amount === null ||
    typeof body.idempotencyKey !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(body.idempotencyKey)
  ) {
    return NextResponse.json({ error: 'INVALID_DEPOSIT_REQUEST' }, { status: 400 });
  }

  const idempotencyKey = `qrisly:${session.user.id}:${body.idempotencyKey}`;
  const rateLimitOk = await consumeRateLimit(
    `ppob:rate:deposit-create:user:${session.user.id}`,
    depositCreateRateLimit,
    depositCreateRateWindowMs,
  );
  if (rateLimitOk === false) {
    return NextResponse.json({ error: 'DEPOSIT_RATE_LIMITED' }, { status: 429 });
  }
  const existing = await getDatabase()
    .select()
    .from(deposits)
    .where(eq(deposits.idempotencyKey, idempotencyKey))
    .limit(1)
    .then((rows) => rows[0]);
  if (existing) {
    if (existing.amount !== amount) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REUSED' }, { status: 409 });
    }
    const repaired = existing.qrString
      ? existing
      : await retryQrislyDeposit(existing);
    return NextResponse.json(
      { deposit: repaired },
      { status: repaired.qrString ? 200 : 202 },
    );
  }

  try {
    const [config, activeGateway] = await Promise.all([
      getQrislyConfig(),
      getActivePaymentGateway(),
    ]);
    if (activeGateway !== 'qrisly') {
      return NextResponse.json({ error: 'PAYMENT_GATEWAY_NOT_ACTIVE' }, { status: 503 });
    }
    if (!config.enabled || !config.apiKey || !config.qrisId) {
      return NextResponse.json({ error: 'QRISLY_NOT_CONFIGURED' }, { status: 503 });
    }

    const id = randomUUID();
    const [reserved] = await getDatabase()
      .insert(deposits)
      .values({
        id,
        userId: session.user.id,
        amount,
        type: 'qrisly',
        paymentMethodLabel: 'QRIS Otomatis (Qrisly)',
        proofUrl: '',
        idempotencyKey,
      })
      .onConflictDoNothing({ target: deposits.idempotencyKey })
      .returning();
    if (!reserved) {
      const raced = await getDatabase()
        .select()
        .from(deposits)
        .where(eq(deposits.idempotencyKey, idempotencyKey))
        .limit(1)
        .then((rows) => rows[0]);
      if (!raced) throw new Error('DEPOSIT_IDEMPOTENCY_CONFLICT');
      if (raced.amount !== amount) {
        return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REUSED' }, { status: 409 });
      }
      const repairedRaced = await retryQrislyDeposit(raced);
      return NextResponse.json(
        { deposit: repairedRaced },
        { status: repairedRaced.qrString ? 200 : 202 },
      );
    }

    const deposit = await attachQrislyDeposit(id, amount, {
      apiKey: config.apiKey,
      qrisId: config.qrisId,
      mode: config.mode,
    });
    if (!deposit) throw new Error('DEPOSIT_PAYMENT_SAVE_FAILED');
    return NextResponse.json({ deposit }, { status: 201 });
  } catch (error) {
    console.error(
      '[USER_QRISLY_DEPOSIT_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown Qrisly error',
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'QRISLY_PAYMENT_CREATE_FAILED' },
      { status: 502 },
    );
  }
}
