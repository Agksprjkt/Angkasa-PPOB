import { NextResponse } from 'next/server';
import { getStoreSettings } from '@/lib/server/store-settings';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const settings = await getStoreSettings();
    return NextResponse.json({
      storeName: settings.storeName,
      tagline: settings.tagline,
      description: settings.description,
      supportPhone: settings.supportPhone,
      logoUrl: settings.logoFile
        ? `/api/store-assets/${encodeURIComponent(settings.logoFile)}`
        : null,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[STORE_SETTINGS_PUBLIC_GET_FAILED]', error);
    return NextResponse.json({ error: 'STORE_SETTINGS_UNAVAILABLE' }, { status: 503 });
  }
}
