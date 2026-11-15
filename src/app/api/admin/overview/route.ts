import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import {
  balanceLedger,
  deposits,
  products,
  transactions,
  users,
} from '@/lib/server/db/schema';

export const runtime = 'nodejs';

const periodDurations = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const requestedPeriod = request.nextUrl.searchParams.get('period') ?? '7d';
  if (requestedPeriod !== '7d' && requestedPeriod !== '30d' && requestedPeriod !== 'all') {
    return NextResponse.json({ error: 'INVALID_PERIOD' }, { status: 400 });
  }
  const period = requestedPeriod;
  const duration = period === 'all' ? null : periodDurations[period];
  const now = Date.now();
  const periodStart = duration === null ? null : now - duration;
  const previousPeriodStart = duration === null ? null : now - duration * 2;

  try {
    const db = getDatabase();
    const selectTransactionStats = () => db.select({
      totalTransactions: count(),
      successfulCount: sql<number>`coalesce(sum(case when ${transactions.status} = 'success' then 1 else 0 end), 0)`,
      failedCount: sql<number>`coalesce(sum(case when ${transactions.status} = 'failed' then 1 else 0 end), 0)`,
      pendingCount: sql<number>`coalesce(sum(case when ${transactions.status} = 'pending' then 1 else 0 end), 0)`,
      totalRevenue: sql<number>`coalesce(sum(case when ${transactions.status} = 'success' then ${transactions.amount} else 0 end), 0)`,
      totalProfit: sql<number>`coalesce(sum(case when ${transactions.status} = 'success' then ${transactions.profit} else 0 end), 0)`,
    }).from(transactions);
    const [
      transactionStats,
      previousTransactionStats,
      pendingDeposits,
      userCount,
      activeProductCount,
      pendingOperations,
      recentTransactions,
      recentMutations,
    ] =
      await Promise.all([
        periodStart === null
          ? selectTransactionStats().where(lt(transactions.createdAt, new Date(now)))
          : selectTransactionStats().where(and(
              gte(transactions.createdAt, new Date(periodStart)),
              lt(transactions.createdAt, new Date(now)),
            )),
        periodStart === null || previousPeriodStart === null
          ? Promise.resolve(null)
          : selectTransactionStats().where(and(
              gte(transactions.createdAt, new Date(previousPeriodStart)),
              lt(transactions.createdAt, new Date(periodStart)),
            )),
        db.select({
          count: count(),
          amount: sql<number>`coalesce(sum(${deposits.amount}), 0)`,
        }).from(deposits).where(eq(deposits.status, 'pending')),
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(products).where(eq(products.status, 'active')),
        db.select({
          count: count(),
          overdueCount: sql<number>`coalesce(sum(case when ${transactions.createdAt} < ${new Date(now - 5 * 60 * 1000)} then 1 else 0 end), 0)`,
          oldestCreatedAt: sql<number | null>`min(${transactions.createdAt})`,
        }).from(transactions).where(eq(transactions.status, 'pending')),
        db
          .select({
            id: transactions.id,
            productName: transactions.productName,
            destination: transactions.destination,
            serverZoneId: transactions.serverZoneId,
            amount: transactions.amount,
            profit: transactions.profit,
            status: transactions.status,
            paymentMethod: transactions.paymentMethod,
            createdAt: transactions.createdAt,
            userName: users.name,
          })
          .from(transactions)
          .leftJoin(users, eq(transactions.userId, users.id))
          .orderBy(desc(transactions.createdAt))
          .limit(10),
        db
          .select({
            id: balanceLedger.id,
            userName: users.name,
            type: balanceLedger.type,
            amount: balanceLedger.amount,
            balanceAfter: balanceLedger.balanceAfter,
            reference: balanceLedger.reference,
            note: balanceLedger.note,
            createdAt: balanceLedger.createdAt,
          })
          .from(balanceLedger)
          .innerJoin(users, eq(balanceLedger.userId, users.id))
          .orderBy(desc(balanceLedger.createdAt))
          .limit(10),
      ]);

    return NextResponse.json({
      ...transactionStats[0],
      previousPeriodStats: previousTransactionStats?.[0] ?? null,
      period,
      generatedAt: new Date().toISOString(),
      pendingDepositsCount: pendingDeposits[0]?.count ?? 0,
      pendingDepositsAmount: pendingDeposits[0]?.amount ?? 0,
      userCount: userCount[0]?.count ?? 0,
      activeProductCount: activeProductCount[0]?.count ?? 0,
      pendingCount: pendingOperations[0]?.count ?? 0,
      overduePendingCount: pendingOperations[0]?.overdueCount ?? 0,
      oldestPendingAt: pendingOperations[0]?.oldestCreatedAt
        ? new Date(pendingOperations[0].oldestCreatedAt).toISOString()
        : null,
      recentTransactions,
      recentMutations,
    });
  } catch (error) {
    console.error(
      '[ADMIN_OVERVIEW_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'ADMIN_OVERVIEW_UNAVAILABLE' }, { status: 503 });
  }
}
