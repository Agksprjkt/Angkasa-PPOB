import { and, count, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import { deposits, users } from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDepositReviewPayload(
  value: unknown,
): value is { id: string; action: 'approve' | 'reject'; note?: string } {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    (value.action === 'approve' || value.action === 'reject') &&
    (value.note === undefined || typeof value.note === 'string')
  );
}

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const rawPage = request.nextUrl.searchParams.get('page') ?? '1';
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
    return NextResponse.json({ error: 'INVALID_DEPOSIT_PAGE' }, { status: 400 });
  }

  const pageSize = 50;
  try {
    const db = getDatabase();
    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: deposits.id,
          userId: deposits.userId,
          userName: users.name,
          userPhone: users.phoneNumber,
          amount: deposits.amount,
          type: deposits.type,
          paymentMethodLabel: deposits.paymentMethodLabel,
          targetBank: deposits.targetBank,
          proofPath: deposits.proofUrl,
          providerReference: deposits.providerReference,
          expiresAt: deposits.expiresAt,
          status: deposits.status,
          adminNote: deposits.adminNote,
          reviewedBy: deposits.reviewedBy,
          reviewedAt: deposits.reviewedAt,
          createdAt: deposits.createdAt,
        })
        .from(deposits)
        .innerJoin(users, eq(deposits.userId, users.id))
        .orderBy(desc(deposits.createdAt), desc(deposits.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: count() }).from(deposits),
    ]);

    return NextResponse.json({
      deposits: rows.map((row) => ({
        ...row,
        proofPath: row.proofPath ? `/api/deposits/${row.id}/proof` : null,
      })),
      page,
      pageSize,
      total: totalRows[0]?.total ?? 0,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error(
      '[ADMIN_DEPOSITS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'DEPOSITS_UNAVAILABLE' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!isDepositReviewPayload(payload)) {
    return NextResponse.json({ error: 'INVALID_DEPOSIT_REVIEW' }, { status: 400 });
  }

  const depositId = payload.id;
  const action = payload.action;
  const note = typeof payload.note === 'string'
    ? payload.note.trim().slice(0, 500)
    : '';
  try {
    const result = await getDatabase().transaction(async (tx) => {
      const deposit = await tx
        .select()
        .from(deposits)
        .where(eq(deposits.id, depositId))
        .limit(1)
        .then((rows) => rows[0]);
      if (!deposit) return { error: 'DEPOSIT_NOT_FOUND' as const };
      if (deposit.status !== 'pending') {
        return { deposit, alreadyReviewed: true };
      }
      if (deposit.type === 'qrisly' && action === 'approve') {
        return { error: 'QRISLY_DEPOSITS_REQUIRE_PROVIDER_CONFIRMATION' as const };
      }

      const reviewedAt = new Date();
      if (action === 'reject') {
        const [updatedDeposit] = await tx
          .update(deposits)
          .set({
            status: 'rejected',
            adminNote: note || 'Ditolak oleh admin',
            reviewedBy: session.user.id,
            reviewedAt,
            updatedAt: reviewedAt,
          })
          .where(and(eq(deposits.id, deposit.id), eq(deposits.status, 'pending')))
          .returning();
        return { deposit: updatedDeposit };
      }

      const walletResult = await applyBalanceDelta(tx, {
        idempotencyKey: `deposit-credit:${deposit.id}`,
        userId: deposit.userId,
        type: 'credit',
        amount: deposit.amount,
        reference: deposit.id,
        note: note || 'Deposit disetujui admin',
        actorId: session.user.id,
        updatedAt: reviewedAt,
      });
      if ('error' in walletResult) throw new Error(walletResult.error);
      const [updatedDeposit] = await tx
        .update(deposits)
        .set({
          status: 'approved',
          adminNote: note || 'Deposit disetujui admin',
          reviewedBy: session.user.id,
          reviewedAt,
          updatedAt: reviewedAt,
        })
        .where(and(eq(deposits.id, deposit.id), eq(deposits.status, 'pending')))
        .returning();
      return { deposit: updatedDeposit };
    });

    if ('error' in result && result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'DEPOSIT_NOT_FOUND' ? 404 : 409 },
      );
    }
    return NextResponse.json({
      deposit: result.deposit,
      alreadyReviewed: 'alreadyReviewed' in result && result.alreadyReviewed,
    });
  } catch (error) {
    console.error(
      '[ADMIN_DEPOSIT_REVIEW_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'DEPOSIT_REVIEW_FAILED' }, { status: 409 });
  }
}
