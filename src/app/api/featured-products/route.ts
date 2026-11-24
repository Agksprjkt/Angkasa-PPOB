import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { featuredProducts } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const rows = await getDatabase()
      .select({
        id: featuredProducts.id,
        category: featuredProducts.category,
        operator: featuredProducts.operator,
        sortOrder: featuredProducts.sortOrder,
      })
      .from(featuredProducts)
      .where(eq(featuredProducts.enabled, true))
      .orderBy(asc(featuredProducts.sortOrder), asc(featuredProducts.createdAt));
    return NextResponse.json(
      { featured: rows },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('[FEATURED_PRODUCTS_GET_FAILED]', error);
    return NextResponse.json({ error: 'FEATURED_UNAVAILABLE' }, { status: 503 });
  }
}
