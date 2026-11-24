import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { deposits } from '@/lib/server/db/schema';
import { readUploadedImage } from '@/lib/server/uploaded-image';

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
    const image = await readUploadedImage('deposit-proofs', deposit.proofUrl);
    if (!image) return NextResponse.json({ error: 'PROOF_NOT_FOUND' }, { status: 404 });
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'PROOF_NOT_FOUND' }, { status: 404 });
  }
}
