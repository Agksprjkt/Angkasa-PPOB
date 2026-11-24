import { and, eq, gt, lte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { CatalogProduct } from '@/types/ppob';
import { getAvailableFlashSale } from '@/lib/flash-sale';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import {
  flashSaleOffers,
  productProviderSettings,
  products,
} from '@/lib/server/db/schema';

export const runtime = 'nodejs';

function stripVendorCost(product: CatalogProduct) {
  const { basePrice, sellPriceAgent, ...publicProduct } = product;
  void basePrice;
  void sellPriceAgent;
  return publicProduct;
}

export async function GET(request: NextRequest) {
  const now = new Date();
  try {
    const [session, rows, providers] = await Promise.all([
      getAuth().api.getSession({ headers: request.headers }),
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
      getDatabase().select().from(productProviderSettings),
    ]);
    const providerMap = new Map(
      providers.map((provider) => [
        `${provider.category}:${provider.operator.toLocaleLowerCase('id-ID')}`,
        provider,
      ]),
    );
    const isAgent = session?.user.role === 'agent';
    const viewerRole = isAgent ? 'agent' : 'user';
    const offers = rows.flatMap(({ offer, product }) => {
      const available = getAvailableFlashSale(product, offer, now, viewerRole);
      if (!available) return [];
      const provider = providerMap.get(
        `${product.category}:${product.operator.toLocaleLowerCase('id-ID')}`,
      );
      const catalogProduct: CatalogProduct = {
        ...product,
        sellPriceAgent: product.sellPriceAgent,
        flashSaleOfferId: offer.id,
        flashSalePrice: available.price,
        flashSaleCompareAtPrice: available.compareAtPrice,
        flashSaleDiscountPercent: available.discountPercent,
        flashSaleEndsAt: offer.endsAt.toISOString(),
        flashSaleRemaining: available.quantityRemaining,
        providerIconUrl: provider?.iconUrl ?? null,
        providerCoverUrl: provider?.coverUrl ?? null,
        providerDescription: provider?.description ?? '',
      };
      return [{
        ...offer,
        salePrice: available.price,
        compareAtPrice: available.compareAtPrice,
        discountPercent: available.discountPercent,
        quantityRemaining: available.quantityRemaining,
        // Vendor cost stays server-side; strip it for non-agent viewers.
        product: isAgent ? catalogProduct : stripVendorCost(catalogProduct),
      }];
    });
    return NextResponse.json(
      { offers },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[FLASH_SALES_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json(
      { error: 'FLASH_SALES_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
