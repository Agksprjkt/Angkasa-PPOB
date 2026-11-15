import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { products } from '@/lib/server/db/schema';
import { getStoreSettings } from '@/lib/server/store-settings';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const settings = await getStoreSettings();
    if (!settings.indexNowKey) {
      return NextResponse.json({ error: 'INDEXNOW_KEY_REQUIRED' }, { status: 400 });
    }

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
    const origin = request.nextUrl.origin;
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: request.nextUrl.host,
        key: settings.indexNowKey,
        keyLocation: `${origin}/${settings.indexNowKey}.txt`,
        urlList: [origin, ...[...providerPaths].map((path) => new URL(path, origin).toString())],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200 && response.status !== 202) {
      console.error('[ADMIN_INDEXNOW_SUBMIT_FAILED]', response.status);
      return NextResponse.json({ error: 'INDEXNOW_SUBMISSION_FAILED' }, { status: 502 });
    }
    return NextResponse.json({ submitted: providerPaths.size + 1 });
  } catch (error) {
    console.error('[ADMIN_INDEXNOW_SUBMIT_FAILED]', error);
    return NextResponse.json({ error: 'INDEXNOW_UNAVAILABLE' }, { status: 503 });
  }
}
