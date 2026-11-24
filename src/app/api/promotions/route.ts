import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/server/db/client';
import { promotionalBanners } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  const now = new Date();
  try {
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
    return NextResponse.json(
      { banners },
      { headers: { 'Cache-Control': 'no-store' } },
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
