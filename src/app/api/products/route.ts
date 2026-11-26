import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAvailableFlashSale } from '@/lib/flash-sale';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import {
  flashSaleOffers,
  productProviderSettings,
  products,
} from '@/lib/server/db/schema';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const isAgent = session?.user.role === 'agent';
    const now = new Date();
    const [activeProducts, providers, flashSales] = await Promise.all([
      getDatabase()
      .select()
      .from(products)
      .where(eq(products.status, 'active'))
      .orderBy(asc(products.category), asc(products.name)),
      getDatabase().select().from(productProviderSettings),
      getDatabase()
        .select({ offer: flashSaleOffers, product: products })
        .from(flashSaleOffers)
        .innerJoin(products, eq(flashSaleOffers.productId, products.id))
        .where(and(
          eq(flashSaleOffers.status, 'active'),
          eq(products.status, 'active'),
          lte(flashSaleOffers.startsAt, now),
          gt(flashSaleOffers.endsAt, now),
        )),
    ]);
    const providerSettings = new Map(
      providers.map((provider) => [
        `${provider.category}:${provider.operator.toLocaleLowerCase('id-ID')}`,
        provider,
      ]),
    );
    // Aliases let two vendors selling the same brand share one storefront card
    // (Digiflazz "AXIS" + TokoVoucher "DATA AXIS" -> "AXIS").
    const aliasByName = new Map(
      providers
        .filter((provider) => provider.aliasOf?.trim())
        .map((provider) => [
          `${provider.category}:${provider.operator.toLocaleLowerCase('id-ID')}`,
          provider.aliasOf!.trim(),
        ]),
    );
    const saleByProduct = new Map<
      string,
      { id: string; price: number; compareAtPrice: number | null; discountPercent: number; endsAt: Date; quantityRemaining: number | null }
    >();
    for (const { offer, product } of flashSales) {
      const activeSale = getAvailableFlashSale(product, offer, now, isAgent ? 'agent' : 'user');
      if (activeSale) saleByProduct.set(product.id, activeSale);
    }

    return NextResponse.json({
      products: activeProducts.map((product) => {
        const provider = providerSettings.get(
          `${product.category}:${product.operator.toLocaleLowerCase('id-ID')}`,
        );
        const activeSale = saleByProduct.get(product.id);
        const catalogProduct = {
          ...product,
          ...(activeSale
            ? {
              flashSaleOfferId: activeSale.id,
                flashSalePrice: activeSale.price,
                flashSaleCompareAtPrice: activeSale.compareAtPrice,
                flashSaleDiscountPercent: activeSale.discountPercent,
                flashSaleEndsAt: activeSale.endsAt.toISOString(),
                flashSaleRemaining: activeSale.quantityRemaining,
              }
            : {}),
          providerIconUrl: provider?.iconUrl ?? null,
          providerCoverUrl: provider?.coverUrl ?? null,
          providerDescription: provider?.description ?? '',
          providerAlias: aliasByName.get(
            `${product.category}:${product.operator.toLocaleLowerCase('id-ID')}`,
          ) ?? null,
        };
        if (isAgent) return catalogProduct;
        const { sellPriceAgent, basePrice, ...publicProduct } = catalogProduct;
        void sellPriceAgent;
        void basePrice;
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
