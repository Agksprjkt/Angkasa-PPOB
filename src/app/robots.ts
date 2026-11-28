import type { MetadataRoute } from 'next';
import { getStoreSettings } from '@/lib/server/store-settings';
import { getAuthSettings } from '@/lib/server/system-config';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = getAuthSettings().baseUrl;
  const settings = await getStoreSettings();
  // Private areas never belong in an index; the store itself only stays out
  // while the admin has switched indexing off.
  const disallow = [
    '/admin',
    '/admin/',
    '/dashboard',
    '/agent',
    '/invoice',
    '/api',
    '/cek-pesanan',
  ];
  if (settings.seoNoIndex) {
    return {
      rules: { userAgent: '*', disallow: '/' },
      sitemap: new URL('/sitemap.xml', baseUrl).toString(),
    };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow },
    sitemap: new URL('/sitemap.xml', baseUrl).toString(),
  };
}
