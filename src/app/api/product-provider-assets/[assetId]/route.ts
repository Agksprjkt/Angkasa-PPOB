import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getImageMimeType, getUploadedImagePath } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  try {
    const bytes = await readFile(getUploadedImagePath('product-providers', assetId));
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': getImageMimeType(assetId),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'ASSET_NOT_FOUND' }, { status: 404 });
  }
}
