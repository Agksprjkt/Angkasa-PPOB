import { NextResponse } from 'next/server';
import { getStoreSettings } from '@/lib/server/store-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getStoreSettings();
    const name = settings.storeName.trim();
    const description = settings.seoDescription.trim() ||
      settings.description.trim() ||
      'Platform PPOB untuk pulsa, paket data, token PLN, dan pembayaran tagihan.';
    // A 192px upload also serves as the 512px slot when no dedicated icon exists;
    // browsers scale, and it keeps a single upload usable for install.
    const iconFile = settings.iconFile ?? settings.logoFile;
    const iconUrl = iconFile
      ? `/api/store-assets/${encodeURIComponent(iconFile)}`
      : null;

    return NextResponse.json({
      name,
      short_name: name,
      description,
      start_url: '/',
      display: 'standalone',
      background_color: '#F8FAFC',
      theme_color: '#F8FAFC',
      orientation: 'portrait-primary',
      icons: iconUrl
        ? [
            { src: iconUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
          ]
        : [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
      categories: ['finance', 'utilities', 'shopping'],
      shortcuts: [
        { name: 'Beli Pulsa', short_name: 'Pulsa', description: 'Isi pulsa reguler instan', url: '/?category=pulsa' },
        { name: 'Token PLN', short_name: 'PLN', description: 'Beli token listrik prabayar', url: '/?category=pln' },
        { name: 'Deposit Saldo', short_name: 'Top Up', description: 'Isi ulang saldo akun', url: '/?action=deposit' },
      ],
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[APP_MANIFEST_GET_FAILED]', error);
    return NextResponse.json({ error: 'APP_MANIFEST_UNAVAILABLE' }, { status: 503 });
  }
}
