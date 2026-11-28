import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { calculateDigiflazzSellPrices } from '@/lib/digiflazz-product-pricing';
import {
  getNextDigiflazzProductSyncAt,
  isDigiflazzProductSyncDue,
} from '@/lib/digiflazz-product-sync-schedule';
import { fetchTokoVoucherProducts } from '@/lib/tokovoucher';
import { tokoVoucherCategory } from '@/lib/tokovoucher-category';
import { resolveVariant } from '@/lib/product-variant';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
import { getDatabase } from '@/lib/server/db/client';
import {
  productProviderSettings,
  products as productTable,
} from '@/lib/server/db/schema';
import {
  getTokoVoucherAutoSyncConfig,
  getTokoVoucherConfig,
  saveTokoVoucherAutoSyncState,
  type DigiflazzAutoSyncResult,
} from '@/lib/server/integration-settings';
import { acquireRedisLease } from '@/lib/server/redis';
import {
  disableProductsByVendorCodes,
  reviveProductsAvailableAtVendor,
} from '@/lib/server/product-health';

const syncLockKey = 'ppob:lock:tokovoucher-product-sync';
const syncLockTtlMs = 10 * 60 * 1000;
let localSyncRunning = false;

const getCategory = tokoVoucherCategory;

export async function syncTokoVoucherProducts(): Promise<DigiflazzAutoSyncResult> {
  const config = await getTokoVoucherConfig();
  if (!config.memberCode || !config.secret) {
    throw new Error('TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED');
  }

  const [remote, databaseProducts, providerSettings] = await Promise.all([
    fetchTokoVoucherProducts({
      memberCode: config.memberCode,
      secret: config.secret,
      defaultSignature: config.defaultSignature,
      mode: config.mode,
    }),
    // Scoped to this vendor so a Digiflazz product can never be read or
    // overwritten by this sync.
    getDatabase()
      .select()
      .from(productTable)
      .where(eq(productTable.vendor, 'TokoVoucher')),
    getDatabase().select().from(productProviderSettings),
  ]);

  const db = getDatabase();
  const existingProducts = new Map(
    databaseProducts.map((product) => [product.vendorCode, product]),
  );
  const pricingSettings = new Map(
    providerSettings.map((setting) => [
      `${setting.category}:${setting.operator.toLocaleLowerCase('id-ID')}`,
      setting,
    ]),
  );

  const synced = new Map<string, typeof productTable.$inferInsert>();
  let skipped = 0;

  for (const source of remote.products) {
    const category = getCategory(source.categoryName, source.jenisName, source.name);
    const operator = source.operatorName.trim();
    if (!category || !operator || source.price <= 0) {
      skipped += 1;
      continue;
    }

    const existing = existingProducts.get(source.code);
    const pricing = pricingSettings.get(
      `${category}:${operator.toLocaleLowerCase('id-ID')}`,
    );
    const sellPrices = calculateDigiflazzSellPrices(
      source.price,
      existing
        ? {
          basePrice: existing.basePrice,
          sellPriceUser: existing.sellPriceUser,
          sellPriceAgent: existing.sellPriceAgent,
        }
        : undefined,
      pricing,
    );

    const resolvedVariant = existing?.variantSource === 'manual'
      ? { variant: existing.variant, source: 'type' as const }
      : resolveVariant({
        type: source.jenisName,
        productName: source.name,
        category,
      });

    // A new product always lands inactive: syncing must never publish a product
    // to the storefront on its own. An admin turns it on deliberately.
    const productStatus = source.active
      ? existing?.status ?? 'inactive'
      : 'inactive';
    synced.set(source.code, {
      id: existing?.id ?? randomUUID(),
      vendorCode: source.code,
      name: source.name,
      category,
      operator,
      variant: resolvedVariant.variant,
      variantSource: existing?.variantSource === 'manual' ? 'manual' : 'sync',
      description: source.description,
      basePrice: source.price,
      ...sellPrices,
      compareAtPrice: existing?.compareAtPrice ?? null,
      status: productStatus,
      vendor: 'TokoVoucher',
      vendorLabel: existing?.vendorLabel ?? null,
    });
  }

  const rows = [...synced.values()];
  await db.transaction(async (tx) => {
    for (let index = 0; index < rows.length; index += 50) {
      const batch = rows.slice(index, index + 50);
      await tx
        .insert(productTable)
        .values(batch)
        .onConflictDoUpdate({
          target: [productTable.vendor, productTable.vendorCode],
          set: {
            name: sql`excluded."name"`,
            category: sql`excluded."category"`,
            operator: sql`excluded."operator"`,
            description: sql`excluded."description"`,
            basePrice: sql`excluded."basePrice"`,
            sellPriceUser: sql`excluded."sellPriceUser"`,
            sellPriceAgent: sql`excluded."sellPriceAgent"`,
            status: sql`excluded."status"`,
            updatedAt: sql`excluded."updatedAt"`,
          },
          // Belt and braces: even a bad target cannot touch another vendor.
          setWhere: and(
            eq(productTable.vendor, 'TokoVoucher'),
            eq(productTable.vendorCode, sql`excluded."vendorCode"`),
          ),
        });
    }
  });

  // Same two-step as Digiflazz: only a product that was live and is now reported
  // down counts as an outage, and only system disables are revived automatically.
  await reviveProductsAvailableAtVendor(
    'TokoVoucher',
    rows.filter((row) => row.status === 'active').map((row) => row.vendorCode),
  );
  await disableProductsByVendorCodes(
    'TokoVoucher',
    rows
      .filter((row) => row.status === 'inactive' && existingProducts.get(row.vendorCode)?.status === 'active')
      .map((row) => row.vendorCode),
    'Ditutup penyedia (katalog TokoVoucher)',
  );

  const created = rows.filter((product) => !existingProducts.has(product.vendorCode)).length;
  return {
    total: remote.total,
    synced: rows.length,
    created,
    updated: rows.length - created,
    skipped,
  };
}

async function runWithSyncLock<T>(
  task: () => Promise<T>,
): Promise<{ result: T } | { skipped: 'SYNC_ALREADY_RUNNING' }> {
  if (localSyncRunning) return { skipped: 'SYNC_ALREADY_RUNNING' };
  localSyncRunning = true;
  let lease: Awaited<ReturnType<typeof acquireRedisLease>> = null;
  try {
    lease = await acquireRedisLease(syncLockKey, syncLockTtlMs);
    if (lease && !lease.acquired) return { skipped: 'SYNC_ALREADY_RUNNING' };
    return { result: await task() };
  } finally {
    localSyncRunning = false;
    await lease?.release?.();
  }
}

export async function runTokoVoucherProductSync(
  source: 'manual' | 'scheduled',
  now = new Date(),
): Promise<
  | { result: DigiflazzAutoSyncResult }
  | { skipped: 'SYNC_ALREADY_RUNNING' | 'SYNC_NOT_DUE' }
> {
  const locked = await runWithSyncLock(async () => {
    const schedule = await getTokoVoucherAutoSyncConfig();
    // Auto-sync defaults to off, so a scheduled run is a no-op until enabled.
    if (
      source === 'scheduled' &&
      !isDigiflazzProductSyncDue(schedule.enabled, schedule.nextRunAt, now)
    ) {
      return { skipped: 'SYNC_NOT_DUE' as const };
    }

    const startTime = now.toISOString();
    await saveTokoVoucherAutoSyncState({
      lastRunAt: startTime,
      lastStatus: 'running',
      clearLastError: true,
      clearLastResult: true,
    });

    try {
      const result = await syncTokoVoucherProducts();
      const completedAt = new Date();
      await saveTokoVoucherAutoSyncState({
        lastRunAt: completedAt.toISOString(),
        lastStatus: 'success',
        lastResult: result,
        ...(schedule.enabled
          ? {
            nextRunAt: getNextDigiflazzProductSyncAt(
              completedAt,
              schedule.intervalDays,
            ).toISOString(),
          }
          : { clearNextRunAt: true }),
        clearLastError: true,
      });
      await invalidateCatalog();
      return { result };
    } catch (error) {
      const completedAt = new Date();
      await saveTokoVoucherAutoSyncState({
        lastRunAt: completedAt.toISOString(),
        lastStatus: 'failed',
        lastError: error instanceof Error
          ? error.message.slice(0, 1000)
          : 'Unknown TokoVoucher sync error',
        ...(schedule.enabled
          ? {
            nextRunAt: getNextDigiflazzProductSyncAt(
              completedAt,
              schedule.intervalDays,
            ).toISOString(),
          }
          : { clearNextRunAt: true }),
        clearLastResult: true,
      });
      throw error;
    }
  });
  if ('skipped' in locked) return locked;
  return locked.result;
}
