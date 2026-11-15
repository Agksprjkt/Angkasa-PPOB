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

    return NextResponse.json({
      name,
      short_name: name,
      description,
      start_url: '/',
      display: 'standalone',
      background_color: '#0F2C59',
      theme_color: '#0F2C59',
      orientation: 'portrait-primary',
      icons: [
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
