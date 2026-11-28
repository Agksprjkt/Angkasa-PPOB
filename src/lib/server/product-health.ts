import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { products } from '@/lib/server/db/schema';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
import { afterFailedOrder, afterSuccessfulOrder, type ProductHealth } from '@/lib/product-health';

/**
 * Records the outcome of one order against the product's health.
 *
 * A single provider outage disables the product so the next customer cannot buy
 * something that is already known to be broken; ordinary failures have to repeat
 * before they count. Nothing here touches a product an admin disabled by hand.
 */
export async function recordProductOutcome(
  productId: string | null,
  outcome:
    | { ok: true }
    | { ok: false; rc?: string | null; message?: string | null },
) {
  if (!productId) return;
  const [product] = await getDatabase()
    .select({
      id: products.id,
      status: products.status,
      disabledBy: products.disabledBy,
      failureStreak: products.failureStreak,
      lastFailureAt: products.lastFailureAt,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return;

  const health: ProductHealth = {
    status: product.status,
    disabledBy: product.disabledBy ?? null,
    failureStreak: product.failureStreak,
    lastFailureAt: product.lastFailureAt ?? null,
  };

  if (outcome.ok) {
    const next = afterSuccessfulOrder();
    // Only rewrite when something actually changed: this runs on the hot order
    // path and most orders are ordinary successes.
    const needsReset = health.failureStreak !== 0;
    const needsEnable = next.enable && health.status === 'inactive' && health.disabledBy === 'system';
    if (!needsReset && !needsEnable) return;
    await getDatabase()
      .update(products)
      .set({
        failureStreak: 0,
        ...(needsEnable
          ? { status: 'active' as const, disabledBy: null, disabledReason: null, disabledAt: null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
    if (needsEnable) await invalidateCatalog();
    return;
  }

  const next = afterFailedOrder(health, outcome.rc, outcome.message);
  if (!next.disable) {
    await getDatabase()
      .update(products)
      .set({ failureStreak: next.failureStreak, lastFailureAt: new Date() })
      .where(eq(products.id, productId));
    return;
  }

  await getDatabase()
    .update(products)
    .set({
      failureStreak: next.failureStreak,
      lastFailureAt: new Date(),
      status: 'inactive',
      disabledBy: 'system',
      disabledReason: next.reason?.slice(0, 300) ?? null,
      disabledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
  await invalidateCatalog();
}

/**
 * Sync-side disable: the vendor lists the product as unavailable. Only the system
 * marker is written, so a later sync can revive it.
 */
export async function disableProductsByVendorCodes(
  vendor: 'Digiflazz' | 'TokoVoucher',
  vendorCodes: string[],
  reason: string,
) {
  if (!vendorCodes.length) return 0;
  const changed = await getDatabase()
    .update(products)
    .set({
      status: 'inactive',
      disabledBy: 'system',
      disabledReason: reason.slice(0, 300),
      disabledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(products.vendor, vendor),
      inArray(products.vendorCode, vendorCodes),
      // Never relabel an admin's decision as the system's.
      sql`(${products.disabledBy} IS NULL OR ${products.disabledBy} <> 'admin')`,
    ))
    .returning({ id: products.id });
  if (changed.length) await invalidateCatalog();
  return changed.length;
}

/**
 * Sync-side revival: only the products the vendor now lists as available, and only
 * those the system disabled. A product an admin switched off is left alone.
 */
export async function reviveProductsAvailableAtVendor(
  vendor: 'Digiflazz' | 'TokoVoucher',
  availableVendorCodes: string[],
) {
  if (!availableVendorCodes.length) return 0;
  const revived = await getDatabase()
    .update(products)
    .set({
      status: 'active',
      disabledBy: null,
      disabledReason: null,
      disabledAt: null,
      failureStreak: 0,
      updatedAt: new Date(),
    })
    .where(and(
      eq(products.vendor, vendor),
      eq(products.status, 'inactive'),
      eq(products.disabledBy, 'system'),
      inArray(products.vendorCode, availableVendorCodes),
    ))
    .returning({ id: products.id });
  if (revived.length) await invalidateCatalog();
  return revived.length;
}
