import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { deposits } from '@/lib/server/db/schema';
import { getImageMimeType, getUploadedImagePath } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ depositId: string }> },
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { depositId } = await context.params;
  const deposit = await getDatabase()
    .select({
      userId: deposits.userId,
      proofUrl: deposits.proofUrl,
    })
    .from(deposits)
    .where(eq(deposits.id, depositId))
    .limit(1)
    .then((rows) => rows[0]);
  if (
    !deposit ||
    (deposit.userId !== session.user.id && session.user.role !== 'admin') ||
    !deposit.proofUrl
  ) {
    return NextResponse.json({ error: 'PROOF_NOT_FOUND' }, { status: 404 });
  }
  try {
    const bytes = await readFile(getUploadedImagePath('deposit-proofs', deposit.proofUrl));
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': getImageMimeType(deposit.proofUrl),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'PROOF_NOT_FOUND' }, { status: 404 });
  }
}
