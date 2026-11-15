import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { productProviderSettings, products } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const isAgent = session?.user.role === 'agent';
    const [activeProducts, providers] = await Promise.all([
      getDatabase()
      .select()
      .from(products)
      .where(eq(products.status, 'active'))
      .orderBy(asc(products.category), asc(products.name)),
      getDatabase().select().from(productProviderSettings),
    ]);
    const providerSettings = new Map(
      providers.map((provider) => [
        `${provider.category}:${provider.operator.toLocaleLowerCase('id-ID')}`,
        provider,
      ]),
    );

    return NextResponse.json({
      products: activeProducts.map((product) => {
        const provider = providerSettings.get(
          `${product.category}:${product.operator.toLocaleLowerCase('id-ID')}`,
        );
        const catalogProduct = {
          ...product,
          providerIconUrl: provider?.iconUrl ?? null,
          providerCoverUrl: provider?.coverUrl ?? null,
          providerDescription: provider?.description ?? '',
        };
        if (isAgent) return catalogProduct;
        const { sellPriceAgent, ...publicProduct } = catalogProduct;
        void sellPriceAgent;
        return publicProduct;
      }),
    });
  } catch (error) {
    console.error(
      '[PRODUCTS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json(
      { error: 'PRODUCT_CATALOG_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
