import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/server/db/client';
import {
  cacheCatalog,
  catalogCacheKeys,
  catalogCacheTtlSeconds,
  readCachedCatalog,
} from '@/lib/server/catalog-cache';
import { promotionalBanners } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  const now = new Date();
  try {
    const cached = await readCachedCatalog<{ banners: unknown[] }>(catalogCacheKeys.promotions);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': `public, max-age=30, stale-while-revalidate=${catalogCacheTtlSeconds}`,
          'X-Catalog-Cache': 'hit',
        },
      });
    }

    const banners = await getDatabase()
      .select({
        id: promotionalBanners.id,
        title: promotionalBanners.title,
        description: promotionalBanners.description,
        imageUrl: promotionalBanners.imageUrl,
        targetPath: promotionalBanners.targetPath,
        buttonLabel: promotionalBanners.buttonLabel,
        sortOrder: promotionalBanners.sortOrder,
        startsAt: promotionalBanners.startsAt,
        endsAt: promotionalBanners.endsAt,
        enabled: promotionalBanners.enabled,
      })
      .from(promotionalBanners)
      .where(and(
        eq(promotionalBanners.enabled, true),
        or(isNull(promotionalBanners.startsAt), lte(promotionalBanners.startsAt, now)),
        or(isNull(promotionalBanners.endsAt), gt(promotionalBanners.endsAt, now)),
      ))
      .orderBy(asc(promotionalBanners.sortOrder), asc(promotionalBanners.createdAt));
    const payload = { banners };
    await cacheCatalog(catalogCacheKeys.promotions, payload);
    return NextResponse.json(
      payload,
      {
        headers: {
          'Cache-Control': `public, max-age=30, stale-while-revalidate=${catalogCacheTtlSeconds}`,
          'X-Catalog-Cache': 'miss',
        },
      },
    );
  } catch (error) {
    console.error(
      '[PROMOTIONS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json(
      { error: 'PROMOTIONS_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
