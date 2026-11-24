import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { readUploadedImage } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { assetId } = await context.params;
  try {
    const image = await readUploadedImage('payment-methods', assetId);
    if (!image) return NextResponse.json({ error: 'IMAGE_NOT_FOUND' }, { status: 404 });
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'IMAGE_NOT_FOUND' }, { status: 404 });
  }
}
