import { count, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { transactions } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (session.user.role !== 'agent') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const [overview] = await getDatabase()
      .select({
        successfulTransactions: count(sql`case when ${transactions.status} = 'success' then 1 end`),
        pendingTransactions: count(sql`case when ${transactions.status} = 'pending' then 1 end`),
        successfulProfit: sql<number>`
          coalesce(sum(case when ${transactions.status} = 'success' then ${transactions.profit} else 0 end), 0)
        `,
      })
      .from(transactions)
      .where(eq(transactions.userId, session.user.id));

    return NextResponse.json(
      {
        successfulTransactions: overview?.successfulTransactions ?? 0,
        pendingTransactions: overview?.pendingTransactions ?? 0,
        successfulProfit: overview?.successfulProfit ?? 0,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error(
      '[AGENT_OVERVIEW_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'AGENT_OVERVIEW_UNAVAILABLE' }, { status: 503 });
  }
}
