import { NextResponse } from 'next/server';
import { getStoreSettings, getStoreSocialLinks } from '@/lib/server/store-settings';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const [settings, socialLinks] = await Promise.all([
      getStoreSettings(),
      getStoreSocialLinks(),
    ]);
    const iconFile = settings.iconFile ?? settings.logoFile;
    const faviconFile = settings.faviconFile ?? iconFile;
    return NextResponse.json({
      storeName: settings.storeName,
      tagline: settings.tagline,
      description: settings.description,
      supportPhone: settings.supportPhone,
      logoUrl: settings.logoFile
        ? `/api/store-assets/${encodeURIComponent(settings.logoFile)}`
        : null,
      iconUrl: iconFile
        ? `/api/store-assets/${encodeURIComponent(iconFile)}`
        : null,
      faviconUrl: faviconFile
        ? `/api/store-assets/${encodeURIComponent(faviconFile)}`
        : null,
      socialLinks,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[STORE_SETTINGS_PUBLIC_GET_FAILED]', error);
    return NextResponse.json({ error: 'STORE_SETTINGS_UNAVAILABLE' }, { status: 503 });
  }
}
