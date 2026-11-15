import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { deposits, paymentMethods, users } from '@/lib/server/db/schema';
import { parseDepositAmount } from '@/lib/deposit-validation';

export const runtime = 'nodejs';

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const view = request.nextUrl.searchParams.get('view');
  const includePaymentDetails = view !== 'history';
  const activeOnly = view === 'active';
  const rows = await getDatabase()
    .select({
      id: deposits.id,
      amount: deposits.amount,
      type: deposits.type,
      paymentMethodLabel: deposits.paymentMethodLabel,
      status: deposits.status,
      adminNote: deposits.adminNote,
      providerReference: deposits.providerReference,
      expiresAt: deposits.expiresAt,
      createdAt: deposits.createdAt,
      ...(includePaymentDetails ? { qrString: deposits.qrString } : {}),
    })
    .from(deposits)
    .where(activeOnly
      ? and(eq(deposits.userId, session.user.id), eq(deposits.status, 'pending'))
      : eq(deposits.userId, session.user.id))
    .orderBy(desc(deposits.createdAt))
    .limit(activeOnly ? 1 : 20);
  return NextResponse.json({ deposits: rows });
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
    !isRecord(payload) ||
    Object.keys(payload).some((key) => !['amount', 'methodId', 'idempotencyKey'].includes(key))
  ) {
    return NextResponse.json({ error: 'INVALID_DEPOSIT_REQUEST' }, { status: 400 });
  }
  const amount = parseDepositAmount(payload.amount);
  const methodId = payload.methodId;
  const requestKey = payload.idempotencyKey;
  if (
    amount === null ||
    typeof methodId !== 'string' || !uuidPattern.test(methodId) ||
    typeof requestKey !== 'string' || !uuidPattern.test(requestKey)
  ) {
    return NextResponse.json({ error: 'INVALID_DEPOSIT_REQUEST' }, { status: 400 });
  }

  const idempotencyKey = `manual:${session.user.id}:${requestKey}`;
  const existing = await getDatabase()
    .select({
      id: deposits.id,
      amount: deposits.amount,
      paymentMethodId: deposits.paymentMethodId,
      type: deposits.type,
      paymentMethodLabel: deposits.paymentMethodLabel,
      status: deposits.status,
      adminNote: deposits.adminNote,
      createdAt: deposits.createdAt,
    })
    .from(deposits)
    .where(eq(deposits.idempotencyKey, idempotencyKey))
    .limit(1)
    .then((rows) => rows[0]);
  if (existing) {
    if (existing.amount !== amount || existing.paymentMethodId !== methodId) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REUSED' }, { status: 409 });
    }
    return NextResponse.json({ deposit: existing }, { status: 200 });
  }

  const method = await getDatabase()
    .select()
    .from(paymentMethods)
    .where(and(
      eq(paymentMethods.id, methodId),
      eq(paymentMethods.enabled, true),
    ))
    .limit(1)
    .then((rows) => rows[0]);
  if (!method) return NextResponse.json({ error: 'PAYMENT_METHOD_UNAVAILABLE' }, { status: 400 });

  const id = randomUUID();
  try {
    const [deposit] = await getDatabase()
      .insert(deposits)
      .values({
        id,
        userId: session.user.id,
        amount,
        type: method.type,
        paymentMethodId: method.id,
        paymentMethodLabel: method.label,
        targetBank: method.bankName,
        proofUrl: '',
        idempotencyKey,
      })
      .returning({
        id: deposits.id,
        amount: deposits.amount,
        type: deposits.type,
        paymentMethodLabel: deposits.paymentMethodLabel,
        status: deposits.status,
        createdAt: deposits.createdAt,
      });
    return NextResponse.json({ deposit }, { status: 201 });
  } catch (error) {
    console.error(
      '[USER_DEPOSIT_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'DEPOSIT_CREATE_FAILED' }, { status: 503 });
  }
}
