import { and, count, desc, eq, like, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import { transactions, users } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

const pageSize = 50;

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const rawPage = request.nextUrl.searchParams.get('page') ?? '1';
  const page = Number(rawPage);
  const status = request.nextUrl.searchParams.get('status') ?? 'all';
  const search = request.nextUrl.searchParams.get('q')?.trim().slice(0, 120) ?? '';
  if (!Number.isSafeInteger(page) || page < 1 || !['all', 'pending', 'success', 'failed', 'review'].includes(status)) {
    return NextResponse.json({ error: 'INVALID_TRANSACTION_QUERY' }, { status: 400 });
  }

  const filters = [];
  if (status === 'pending' || status === 'success' || status === 'failed') {
    filters.push(eq(transactions.status, status));
  }
  if (status === 'review') filters.push(eq(transactions.needsManualReview, true));
  if (search) {
    const pattern = `%${search}%`;
    filters.push(or(
      like(transactions.referenceId, pattern),
      like(transactions.productName, pattern),
      like(transactions.destination, pattern),
      like(users.name, pattern),
      like(users.email, pattern),
      like(users.phoneNumber, pattern),
    )!);
  }
  const where = filters.length ? and(...filters) : undefined;

  try {
    const db = getDatabase();
    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: transactions.id,
          referenceId: transactions.referenceId,
          userId: transactions.userId,
          userName: users.name,
          userEmail: users.email,
          userPhone: users.phoneNumber,
          productId: transactions.productId,
          productName: transactions.productName,
          category: transactions.category,
          operator: transactions.operator,
          destination: transactions.destination,
          serverZoneId: transactions.serverZoneId,
          customerName: transactions.customerName,
          amount: transactions.amount,
          profit: transactions.profit,
          status: transactions.status,
          paymentMethod: transactions.paymentMethod,
          needsManualReview: transactions.needsManualReview,
          manualReviewAt: transactions.manualReviewAt,
          sn: transactions.sn,
          vendorResponse: transactions.vendorResponse,
          createdAt: transactions.createdAt,
          updatedAt: transactions.updatedAt,
        })
        .from(transactions)
        .leftJoin(users, eq(transactions.userId, users.id))
        .where(where)
        .orderBy(desc(transactions.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(transactions)
        .leftJoin(users, eq(transactions.userId, users.id))
        .where(where),
    ]);

    return NextResponse.json({
      transactions: rows,
      page,
      pageSize,
      total: totalRows[0]?.total ?? 0,
    });
  } catch (error) {
    console.error(
      '[ADMIN_TRANSACTIONS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json(
      { error: 'TRANSACTION_HISTORY_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
