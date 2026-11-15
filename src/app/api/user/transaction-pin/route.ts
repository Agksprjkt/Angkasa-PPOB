import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { transactionPins } from '@/lib/server/db/schema';
import { hashTransactionPin, isValidTransactionPin } from '@/lib/server/transaction-pin-core';
import { verifyAndRecordTransactionPin } from '@/lib/server/transaction-pin';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getMember(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return { response: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };
  if (!['user', 'agent'].includes(session.user.role ?? 'user')) {
    return { response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET(request: NextRequest) {
  const member = await getMember(request);
  if ('response' in member) return member.response;

  const savedPin = await getDatabase()
    .select({ userId: transactionPins.userId })
    .from(transactionPins)
    .where(eq(transactionPins.userId, member.userId))
    .limit(1)
    .then((rows) => rows[0]);

  return NextResponse.json({ configured: Boolean(savedPin) });
}

export async function POST(request: NextRequest) {
  const member = await getMember(request);
  if ('response' in member) return member.response;

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!isRecord(payload) || !isValidTransactionPin(payload.pin)) {
    return NextResponse.json({ error: 'INVALID_TRANSACTION_PIN' }, { status: 400 });
  }
  if (
    payload.currentPin !== undefined &&
    typeof payload.currentPin !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_TRANSACTION_PIN' }, { status: 400 });
  }

  const db = getDatabase();
  const existing = await db
    .select({ userId: transactionPins.userId })
    .from(transactionPins)
    .where(eq(transactionPins.userId, member.userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    if (!isValidTransactionPin(payload.currentPin)) {
      return NextResponse.json({ error: 'CURRENT_TRANSACTION_PIN_REQUIRED' }, { status: 400 });
    }
    const verification = await verifyAndRecordTransactionPin(
      member.userId,
      payload.currentPin,
    );
    if (verification === 'locked') {
      return NextResponse.json({ error: 'TRANSACTION_PIN_LOCKED' }, { status: 429 });
    }
    if (verification !== 'valid') {
      return NextResponse.json({ error: 'INVALID_CURRENT_TRANSACTION_PIN' }, { status: 403 });
    }

    await db
      .update(transactionPins)
      .set({
        pinHash: await hashTransactionPin(payload.pin),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(transactionPins.userId, member.userId));
    return NextResponse.json({ configured: true });
  }

  await db.insert(transactionPins).values({
    userId: member.userId,
    pinHash: await hashTransactionPin(payload.pin),
  });
  return NextResponse.json({ configured: true }, { status: 201 });
}
