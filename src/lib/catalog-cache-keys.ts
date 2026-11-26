// Pure cache contract, shared by the server module and its test. Kept free of
// imports so `node --experimental-strip-types` can load it directly.

// Public catalog data is read on every page view but written only by admin
// actions and the vendor sync. TTL is a backstop, not the invalidation
// strategy: a missed invalidateCatalog call goes stale for at most this long.
export const catalogCacheTtlSeconds = 60;

// Flash sale stock changes on every order, so it gets a shorter window. The
// reservation is still authoritative; a stale count only affects the label.
export const flashSaleCacheTtlSeconds = 15;

export const catalogCacheKeys = {
  // Prices differ per role, so an agent must never read the public entry.
  products: (role: 'public' | 'agent') => `ppob:catalog:products:${role}`,
  promotions: 'ppob:catalog:promotions',
  flashSales: (role: 'public' | 'agent') => `ppob:catalog:flash-sales:${role}`,
} as const;

export function allCatalogCacheKeys() {
  return [
    catalogCacheKeys.products('public'),
    catalogCacheKeys.products('agent'),
    catalogCacheKeys.promotions,
    catalogCacheKeys.flashSales('public'),
    catalogCacheKeys.flashSales('agent'),
  ];
}
