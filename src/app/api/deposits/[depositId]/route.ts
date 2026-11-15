import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { deposits } from '@/lib/server/db/schema';
import { refreshQrislyDeposit } from '@/lib/server/qrisly-deposits';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ depositId: string }> },
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { depositId } = await context.params;
  const current = await getDatabase()
    .select()
    .from(deposits)
    .where(and(eq(deposits.id, depositId), eq(deposits.userId, session.user.id)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!current) return NextResponse.json({ error: 'DEPOSIT_NOT_FOUND' }, { status: 404 });

  try {
    const deposit = current.type === 'qrisly' && current.status === 'pending'
      ? await refreshQrislyDeposit(current.id)
      : current;
    return NextResponse.json({ deposit });
  } catch (error) {
    console.error(
      '[USER_QRISLY_PAYMENT_STATUS_FAILED]',
      error instanceof Error ? error.message : 'Unknown Qrisly error',
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'QRISLY_STATUS_UNAVAILABLE' },
      { status: 502 },
    );
  }
}
