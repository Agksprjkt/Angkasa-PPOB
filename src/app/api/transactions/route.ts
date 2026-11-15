import { count, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { transactions } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

const userPageSize = 50;
const adminPageSize = 100;

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const rawPage = request.nextUrl.searchParams.get('page') ?? '1';
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
    return NextResponse.json({ error: 'INVALID_TRANSACTION_PAGE' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const pageSize = session.user.role === 'admin' ? adminPageSize : userPageSize;
    const query = db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const totalQuery = db.select({ total: count() }).from(transactions);
    const [rows, totalRows] = session.user.role === 'admin'
      ? await Promise.all([query, totalQuery])
      : await Promise.all([
          query.where(eq(transactions.userId, session.user.id)),
          totalQuery.where(eq(transactions.userId, session.user.id)),
        ]);

    return NextResponse.json(
      {
        transactions: rows,
        page,
        pageSize,
        total: totalRows[0]?.total ?? 0,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error(
      '[TRANSACTIONS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json(
      { error: 'TRANSACTION_HISTORY_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
