import { desc, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { balanceLedger, deposits, transactions, users } from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';
import type { UserRole } from '@/types/ppob';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'user' || value === 'agent' || value === 'admin';
}

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const rows = await getDatabase()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phoneNumber,
        role: users.role,
        balance: users.balance,
        commissionBalance: users.commissionBalance,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(500);
    return NextResponse.json({
      users: rows.map((user) => ({
        ...user,
        phone: user.phone ?? '',
        createdAt: user.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error(
      '[ADMIN_USERS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'USERS_UNAVAILABLE' }, { status: 503 });
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
  if (!isRecord(payload) || typeof payload.userId !== 'string' || !payload.userId) {
    return NextResponse.json({ error: 'INVALID_USER_UPDATE' }, { status: 400 });
  }
  const userId = payload.userId;

  if (payload.action === 'role') {
    if (!isUserRole(payload.role)) {
      return NextResponse.json({ error: 'INVALID_ROLE' }, { status: 400 });
    }
    const role = payload.role;
    const userId = payload.userId;
    if (payload.userId === session.user.id) {
      return NextResponse.json({ error: 'CANNOT_CHANGE_OWN_ROLE' }, { status: 409 });
    }

    try {
      const result = await getDatabase().transaction(async (tx) => {
        const target = await tx
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .then((rows) => rows[0]);
        if (!target) return { error: 'USER_NOT_FOUND' as const };

        if (target.role === 'admin' && role !== 'admin') {
          const admins = await tx
            .select({ count: sql<number>`count(*)` })
            .from(users)
            .where(eq(users.role, 'admin'))
            .then((rows) => rows[0]?.count ?? 0);
          if (admins <= 1) return { error: 'LAST_ADMIN_REQUIRED' as const };
        }

        const [updated] = await tx
          .update(users)
          .set({ role, updatedAt: new Date() })
          .where(eq(users.id, target.id))
          .returning({ id: users.id, role: users.role });
        return { user: updated };
      });

      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      return NextResponse.json({ user: result.user });
    } catch (error) {
      console.error(
        '[ADMIN_USER_ROLE_UPDATE_FAILED]',
        error instanceof Error ? error.message : 'Unknown database error',
      );
      return NextResponse.json({ error: 'USER_ROLE_UPDATE_FAILED' }, { status: 503 });
    }
  }

  if (payload.action === 'balance') {
    const { delta, note, requestId } = payload;
    if (
      typeof delta !== 'number' ||
      !Number.isSafeInteger(delta) ||
      delta === 0 ||
      !Number.isSafeInteger(Math.abs(delta)) ||
      typeof note !== 'string' ||
      !note.trim() ||
      note.trim().length > 500 ||
      typeof requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      )
    ) {
      return NextResponse.json({ error: 'INVALID_BALANCE_ADJUSTMENT' }, { status: 400 });
    }

    const amount = Math.abs(delta);
    const type = delta > 0 ? 'credit' : 'debit';
    const idempotencyKey = `admin-adjust:${requestId}`;
    const normalizedNote = note.trim();

    try {
      const result = await getDatabase().transaction(async (tx) => {
        const target = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .then((rows) => rows[0]);
        if (!target) return { error: 'USER_NOT_FOUND' as const };

        const prior = await tx
          .select()
          .from(balanceLedger)
          .where(eq(balanceLedger.idempotencyKey, idempotencyKey))
          .limit(1)
          .then((rows) => rows[0]);
        if (prior) {
          const sameRequest =
            prior.userId === userId &&
            prior.actorId === session.user.id &&
            prior.type === type &&
            prior.amount === amount &&
            prior.note === normalizedNote;
          return sameRequest
            ? { ledger: prior, duplicate: true as const }
            : { error: 'IDEMPOTENCY_KEY_REUSED' as const };
        }

        const walletResult = await applyBalanceDelta(tx, {
          idempotencyKey,
          userId: target.id,
          actorId: session.user.id,
          type,
          amount,
          reference: requestId,
          note: normalizedNote,
        });
        if (!('ledger' in walletResult)) return { error: walletResult.error };
        return { ledger: walletResult.ledger, duplicate: false as const };
      });

      if (!('duplicate' in result)) {
        const status = result.error === 'USER_NOT_FOUND' ? 404 : 409;
        return NextResponse.json({ error: result.error }, { status });
      }
      if (!result.ledger) throw new Error('WALLET_LEDGER_RESULT_MISSING');
      return NextResponse.json({
        balance: result.ledger.balanceAfter,
        duplicate: result.duplicate,
      });
    } catch (error) {
      console.error(
        '[ADMIN_USER_BALANCE_UPDATE_FAILED]',
        error instanceof Error ? error.message : 'Unknown database error',
      );
      return NextResponse.json({ error: 'BALANCE_UPDATE_FAILED' }, { status: 409 });
    }
  }

  return NextResponse.json({ error: 'INVALID_USER_UPDATE_ACTION' }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'USER_ID_REQUIRED' }, { status: 400 });
  }
  if (id === session.user.id) {
    return NextResponse.json({ error: 'CANNOT_DELETE_SELF' }, { status: 409 });
  }

  try {
    const db = getDatabase();
    const [transactionCount] = await db
      .select({ total: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.userId, id));
    const [depositCount] = await db
      .select({ total: sql<number>`count(*)` })
      .from(deposits)
      .where(eq(deposits.userId, id));
    if (Number(transactionCount?.total ?? 0) > 0 || Number(depositCount?.total ?? 0) > 0) {
      return NextResponse.json(
        { error: 'USER_HAS_HISTORY', transactions: Number(transactionCount?.total ?? 0), deposits: Number(depositCount?.total ?? 0) },
        { status: 409 },
      );
    }

    const [removed] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (!removed) {
      return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ id: removed.id });
  } catch (error) {
    console.error(
      '[ADMIN_USER_DELETE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'USER_DELETE_FAILED' }, { status: 503 });
  }
}
