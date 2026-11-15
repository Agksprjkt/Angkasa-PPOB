import { NextRequest, NextResponse } from 'next/server';
import { getStoreSettings } from '@/lib/server/store-settings';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ indexNowFile: string[] }> },
) {
  const { indexNowFile } = await params;
  try {
    const settings = await getStoreSettings();
    if (!settings.indexNowKey || indexNowFile.join('/') !== `${settings.indexNowKey}.txt`) {
      return new NextResponse('Not Found', { status: 404 });
    }
    return new NextResponse(settings.indexNowKey, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('[INDEXNOW_KEY_FILE_FAILED]', error);
    return new NextResponse('Service Unavailable', { status: 503 });
  }
}
