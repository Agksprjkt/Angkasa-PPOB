import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { balanceLedger, transactions } from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') return errorResponse('FORBIDDEN', 403);
  if (Number(request.headers.get('content-length') ?? 0) > 1_024) {
    return errorResponse('REQUEST_TOO_LARGE', 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('INVALID_JSON', 400);
  }
  if (!isRecord(payload) || typeof payload.action !== 'string') {
    return errorResponse('INVALID_REVIEW_ACTION', 400);
  }
  if (
    (payload.action === 'flag' && Object.keys(payload).some((key) => key !== 'action')) ||
    (payload.action === 'confirm-failed' &&
      (Object.keys(payload).some((key) => !['action', 'confirm'].includes(key)) ||
        payload.confirm !== true)) ||
    !['flag', 'confirm-failed'].includes(payload.action)
  ) {
    return errorResponse('INVALID_REVIEW_ACTION', 400);
  }

  const { transactionId } = await params;
  const db = getDatabase();
  const current = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!current) return errorResponse('TRANSACTION_NOT_FOUND', 404);
  if (
    current.paymentMethod !== 'balance' ||
    !current.userId ||
    current.status !== 'pending'
  ) {
    return errorResponse('TRANSACTION_NOT_REVIEWABLE', 409);
  }
  const ownerUserId = current.userId;

  if (payload.action === 'flag') {
    if (current.needsManualReview) {
      return NextResponse.json(
        { transaction: current, duplicate: true },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const now = new Date();
    const [updated] = await db
      .update(transactions)
      .set({ needsManualReview: true, manualReviewAt: now, updatedAt: now })
      .where(and(
        eq(transactions.id, current.id),
        eq(transactions.status, 'pending'),
        eq(transactions.needsManualReview, false),
        eq(transactions.updatedAt, current.updatedAt),
      ))
      .returning();
    if (!updated) return errorResponse('TRANSACTION_STATE_CHANGED', 409);
    return NextResponse.json(
      { transaction: updated, duplicate: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!current.needsManualReview) {
    return errorResponse('MANUAL_REVIEW_REQUIRED', 409);
  }

  try {
    const result = await db.transaction(async (tx) => {
      const idempotencyKey = `manual-review-refund:${current.id}`;
      const existingRefund = await tx
        .select({ id: balanceLedger.id })
        .from(balanceLedger)
        .where(eq(balanceLedger.idempotencyKey, idempotencyKey))
        .limit(1)
        .then((rows) => rows[0]);
      if (existingRefund) return { error: 'REFUND_ALREADY_RECORDED' as const };

      const now = new Date();
      const walletResult = await applyBalanceDelta(tx, {
        idempotencyKey,
        userId: ownerUserId,
        actorId: session.user.id,
        type: 'credit',
        amount: current.amount,
        reference: current.referenceId,
        note: `Refund transaksi ${current.referenceId} setelah gagal dikonfirmasi admin`,
        updatedAt: now,
      });
      if ('error' in walletResult) return walletResult;

      const [updatedTransaction] = await tx
        .update(transactions)
        .set({
          status: 'failed',
          needsManualReview: false,
          vendorResponse: {
            code: 'ADMIN_VERIFIED_FAILED',
            message: 'Admin memverifikasi transaksi gagal di Digiflazz; saldo dikembalikan.',
            rc: 'ADMIN_VERIFIED_FAILED',
            rawTime: now.toISOString(),
          },
          updatedAt: now,
        })
        .where(and(
          eq(transactions.id, current.id),
          eq(transactions.status, 'pending'),
          eq(transactions.needsManualReview, true),
          eq(transactions.updatedAt, current.updatedAt),
        ))
        .returning();
      if (!updatedTransaction) throw new Error('TRANSACTION_STATE_CHANGED');

      return { transaction: updatedTransaction, balance: walletResult.balanceAfter };
    });

    if ('error' in result && result.error) return errorResponse(result.error, 409);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'TRANSACTION_STATE_CHANGED' || message === 'REFUND_ALREADY_RECORDED') {
      return errorResponse(message, 409);
    }
    console.error(
      '[ADMIN_TRANSACTION_MANUAL_REVIEW_FAILED]',
      message || 'Unknown database error',
    );
    return errorResponse('MANUAL_REVIEW_FAILED', 503);
  }
}
