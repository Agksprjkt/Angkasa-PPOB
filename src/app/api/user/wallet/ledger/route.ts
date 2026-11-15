import { count, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { balanceLedger } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

const pageSize = 25;

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const rawPage = request.nextUrl.searchParams.get('page') ?? '1';
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
    return NextResponse.json({ error: 'INVALID_LEDGER_PAGE' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const [mutations, totalRows] = await Promise.all([
      db
        .select({
          id: balanceLedger.id,
          userId: balanceLedger.userId,
          type: balanceLedger.type,
          amount: balanceLedger.amount,
          balanceBefore: balanceLedger.balanceBefore,
          balanceAfter: balanceLedger.balanceAfter,
          reference: balanceLedger.reference,
          note: balanceLedger.note,
          createdAt: balanceLedger.createdAt,
        })
        .from(balanceLedger)
        .where(eq(balanceLedger.userId, session.user.id))
        .orderBy(desc(balanceLedger.createdAt), desc(balanceLedger.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(balanceLedger)
        .where(eq(balanceLedger.userId, session.user.id)),
    ]);

    return NextResponse.json(
      { mutations, page, pageSize, total: totalRows[0]?.total ?? 0 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error(
      '[USER_WALLET_LEDGER_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'WALLET_LEDGER_UNAVAILABLE' }, { status: 503 });
  }
}
