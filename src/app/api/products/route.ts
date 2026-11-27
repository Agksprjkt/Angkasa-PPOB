import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAvailableFlashSale } from '@/lib/flash-sale';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import {
  cacheCatalog,
  catalogCacheKeys,
  catalogCacheTtlSeconds,
  readCachedCatalog,
} from '@/lib/server/catalog-cache';
import {
  catalogGroups,
  catalogSubgroups,
  flashSaleOffers,
  productProviderSettings,
  products,
} from '@/lib/server/db/schema';

export const runtime = 'nodejs';

// The whole active catalog is one payload; a burst of visitors would otherwise
// become a burst of identical queries. Cached per role because agent prices are
// part of the response.
export async function GET(request: NextRequest) {
  try {
    // A visitor with no auth cookie cannot be an agent, so the public cache is
    // safe to serve before paying for a session lookup. This is the common case:
    // most catalog reads come from anonymous browsers.
    const hasSessionCookie = Boolean(
      request.cookies.get('better-auth.session_token')?.value ||
      request.cookies.get('__Secure-better-auth.session_token')?.value,
    );

    if (!hasSessionCookie) {
      const publicCached = await readCachedCatalog<{ products: unknown[] }>(
        catalogCacheKeys.products('public'),
      );
      if (publicCached) {
        return NextResponse.json(publicCached, {
          headers: {
            'Cache-Control': `private, max-age=30, stale-while-revalidate=${catalogCacheTtlSeconds}`,
            'X-Catalog-Cache': 'hit-anonymous',
          },
        });
      }
    }

    const session = hasSessionCookie
      ? await getAuth().api.getSession({ headers: request.headers })
      : null;
    const isAgent = session?.user.role === 'agent';
    const cacheKey = catalogCacheKeys.products(isAgent ? 'agent' : 'public');

    const cached = await readCachedCatalog<{ products: unknown[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': `private, max-age=30, stale-while-revalidate=${catalogCacheTtlSeconds}`,
          'X-Catalog-Cache': 'hit',
        },
      });
    }

    const now = new Date();
    const [activeProducts, providers, flashSales, groups, subgroups] = await Promise.all([
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
      getDatabase()
        .select()
        .from(catalogGroups)
        .where(eq(catalogGroups.enabled, true))
        .orderBy(asc(catalogGroups.sortOrder), asc(catalogGroups.label)),
      getDatabase()
        .select()
        .from(catalogSubgroups)
        .where(eq(catalogSubgroups.enabled, true))
        .orderBy(asc(catalogSubgroups.sortOrder), asc(catalogSubgroups.label)),
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

    const payload = {
      // Storefront menus are admin rows now. Products carry subgroupId; a product
      // with no subgroup is managed in the dashboard but hidden from the store.
      groups,
      subgroups,
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
    };

    await cacheCatalog(cacheKey, payload);

    return NextResponse.json(payload, {
      headers: {
        // private: the response differs by role through the session cookie, so a
        // shared CDN copy would leak agent prices.
        'Cache-Control': `private, max-age=30, stale-while-revalidate=${catalogCacheTtlSeconds}`,
        'X-Catalog-Cache': 'miss',
      },
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
