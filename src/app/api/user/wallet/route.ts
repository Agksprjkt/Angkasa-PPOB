import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { users } from '@/lib/server/db/schema';

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = await getDatabase()
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);
  if (!user) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ balance: user.balance });
}
