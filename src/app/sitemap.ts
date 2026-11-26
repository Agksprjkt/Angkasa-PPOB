import type { MetadataRoute } from 'next';
import { asc, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { products } from '@/lib/server/db/schema';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const activeProducts = await getDatabase()
    .select({ category: products.category, operator: products.operator })
    .from(products)
    .where(eq(products.status, 'active'))
    .orderBy(asc(products.category), asc(products.operator));
  const providerPaths = new Set(
    activeProducts.map(({ category, operator }) =>
      `/checkout/${encodeURIComponent(category)}/${encodeURIComponent(operator)}`,
    ),
  );
  const staticPaths = ['/', '/produk', '/promo', '/bantuan', '/kontak', '/legal'];
  return [
    ...staticPaths.map((path) => ({
      url: new URL(path, baseUrl).toString(),
      changeFrequency: (path === '/' || path === '/promo' ? 'daily' : 'monthly') as
        | 'daily'
        | 'monthly',
      priority: path === '/' ? 1 : 0.6,
    })),
    ...[...providerPaths].map((path) => ({
      url: new URL(path, baseUrl).toString(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ];
}
