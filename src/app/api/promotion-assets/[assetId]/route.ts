import { NextRequest, NextResponse } from 'next/server';
import { readUploadedImage } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  try {
    const image = await readUploadedImage('promotions', assetId);
    if (!image) return NextResponse.json({ error: 'ASSET_NOT_FOUND' }, { status: 404 });
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'ASSET_NOT_FOUND' }, { status: 404 });
  }
}
