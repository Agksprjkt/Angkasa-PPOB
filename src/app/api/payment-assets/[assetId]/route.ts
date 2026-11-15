import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getImageMimeType, getUploadedImagePath } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { assetId } = await context.params;
  try {
    const bytes = await readFile(getUploadedImagePath('payment-methods', assetId));
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': getImageMimeType(assetId),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'IMAGE_NOT_FOUND' }, { status: 404 });
  }
}
