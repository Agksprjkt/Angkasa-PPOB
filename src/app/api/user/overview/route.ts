import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { transactions } from '@/lib/server/db/schema';
import { getJakartaDayStart } from '@/lib/jakarta-day';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (session.user.role !== 'user') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const now = new Date();
    const dayStart = getJakartaDayStart(now);
    const [overview] = await getDatabase()
      .select({
        totalTransactions: count(),
        successfulTransactions: sql<number>`coalesce(sum(case when ${transactions.status} = 'success' then 1 else 0 end), 0)`,
        pendingTransactions: sql<number>`coalesce(sum(case when ${transactions.status} = 'pending' then 1 else 0 end), 0)`,
        failedTransactions: sql<number>`coalesce(sum(case when ${transactions.status} = 'failed' then 1 else 0 end), 0)`,
        totalSpent: sql<number>`coalesce(sum(case when ${transactions.status} = 'success' then ${transactions.amount} else 0 end), 0)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.userId, session.user.id),
        gte(transactions.createdAt, dayStart),
        lt(transactions.createdAt, now),
      ));

    return NextResponse.json(
      {
        totalTransactions: overview?.totalTransactions ?? 0,
        successfulTransactions: overview?.successfulTransactions ?? 0,
        pendingTransactions: overview?.pendingTransactions ?? 0,
        failedTransactions: overview?.failedTransactions ?? 0,
        totalSpent: overview?.totalSpent ?? 0,
        generatedAt: now.toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error(
      '[USER_OVERVIEW_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'USER_OVERVIEW_UNAVAILABLE' }, { status: 503 });
  }
}
