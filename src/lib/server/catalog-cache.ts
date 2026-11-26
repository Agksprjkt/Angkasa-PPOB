import 'server-only';

import {
  allCatalogCacheKeys,
  catalogCacheKeys,
  catalogCacheTtlSeconds,
  flashSaleCacheTtlSeconds,
} from '@/lib/catalog-cache-keys';
import { deleteRedisKeys, readRedisJson, writeRedisJson } from './redis';

// Public catalog data is read on every page view but written only by admin
// actions and the vendor sync. A short Redis cache keeps a burst of visitors
// from turning into a burst of queries, and every write path clears the keys so
// a change is visible immediately.
export {
  catalogCacheKeys,
  catalogCacheTtlSeconds,
  flashSaleCacheTtlSeconds,
};

export async function readCachedCatalog<T>(key: string): Promise<T | null> {
  return readRedisJson<T>(key);
}

export async function cacheCatalog(key: string, value: unknown) {
  await writeRedisJson(key, value, catalogCacheTtlSeconds);
}

export async function cacheFlashSales(key: string, value: unknown) {
  await writeRedisJson(key, value, flashSaleCacheTtlSeconds);
}

// Anything that changes what the storefront shows calls this once.
export async function invalidateCatalog() {
  await deleteRedisKeys(...allCatalogCacheKeys());
}
