import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { calculateDigiflazzSellPrices } from '@/lib/digiflazz-product-pricing';
import {
  getNextDigiflazzProductSyncAt,
  isDigiflazzProductSyncDue,
} from '@/lib/digiflazz-product-sync-schedule';
import { fetchDigiflazzPriceList } from '@/lib/digiflazz';
import { parseDigiflazzPrice } from '@/lib/digiflazz-protocol';
import { readPostpaidProductRow } from '@/lib/postpaid-protocol';
import { resolveVariant } from '@/lib/product-variant';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
import { getDatabase } from '@/lib/server/db/client';
import {
  productProviderSettings,
  products as productTable,
} from '@/lib/server/db/schema';
import {
  getDigiflazzAutoSyncConfig,
  getDigiflazzConfig,
  saveDigiflazzAutoSyncState,
  type DigiflazzAutoSyncResult,
} from '@/lib/server/integration-settings';
import { acquireRedisLease } from '@/lib/server/redis';
import {
  disableProductsByVendorCodes,
  reviveProductsAvailableAtVendor,
} from '@/lib/server/product-health';
import { isVendorOutage } from '@/lib/product-health';
import type { ProductCategory } from '@/types/ppob';

const syncLockKey = 'ppob:lock:digiflazz-product-sync';
const syncLockTtlMs = 10 * 60_000;
let localSyncRunning = false;

function getCategory(value: unknown): ProductCategory | null {
  if (typeof value !== 'string') return null;
  const category = value.toLocaleLowerCase('id-ID').replace(/[^a-z]/g, '');
  if (category.includes('pulsa')) return 'pulsa';
  if (category.includes('data') || category.includes('internet')) return 'data';
  if (category.includes('voucher')) return 'voucher';
  if (category.includes('pln') || category.includes('listrik')) return 'pln';
  if (category.includes('tagihan') || category.includes('pascabayar')) return 'tagihan';
  if (category.includes('ewallet') || category.includes('emoney') || category.includes('uangelektronik')) {
    return 'ewallet';
  }
  if (category.includes('game')) return 'game';
  return null;
}

function isProviderUnavailable(value: unknown) {
  return value === false || value === 'false' || value === 0;
}

// Digiflazz spells the outage state in the description when it does not flip the
// status flag, so the text is a second signal.
function sourceLooksDown(source: Record<string, unknown>) {
  return isProviderUnavailable(source.buyer_product_status) ||
    isProviderUnavailable(source.seller_product_status) ||
    isVendorOutage(null, typeof source.desc === 'string' ? source.desc : '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function syncDigiflazzProducts(): Promise<DigiflazzAutoSyncResult> {
  const config = await getDigiflazzConfig();
  if (
    !config.username ||
    !config.apiKey ||
    (config.mode !== 'sandbox' && config.mode !== 'production')
  ) {
    throw new Error('DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED');
  }

  const [remoteProducts, databaseProducts, providerSettings] = await Promise.all([
    fetchDigiflazzPriceList({
      username: config.username,
      apiKey: config.apiKey,
      mode: config.mode === 'production' ? 'production' : 'sandbox',
    }),
    getDatabase().select().from(productTable),
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
  const synced = new Map<string, {
    id: string;
    vendorCode: string;
    name: string;
    category: ProductCategory;
    operator: string;
    variant: string | null;
    variantSource: 'manual' | 'sync';
    description: string;
    basePrice: number;
    sellPriceUser: number;
    sellPriceAgent: number;
    compareAtPrice: number | null;
    status: 'active' | 'inactive';
    vendor: 'Digiflazz';
  }>();
  let skipped = 0;

  for (const rawProduct of remoteProducts.products) {
    const source = asRecord(rawProduct);
    if (!source) {
      skipped += 1;
      continue;
    }

    const vendorCode = source.buyer_sku_code;
    const name = source.product_name;
    const operator = source.brand;
    const basePrice = parseDigiflazzPrice(source.price);
    const category = getCategory(source.category);
    if (
      typeof vendorCode !== 'string' || !vendorCode.trim() || vendorCode.length > 100 ||
      typeof name !== 'string' || !name.trim() || name.length > 200 ||
      typeof operator !== 'string' || !operator.trim() || operator.length > 200 ||
      basePrice === null ||
      !category
    ) {
      skipped += 1;
      continue;
    }

    const existing = existingProducts.get(vendorCode);
    if (existing && existing.vendor !== 'Digiflazz') {
      skipped += 1;
      continue;
    }
    const normalizedOperator = operator.trim();
    const pricing = pricingSettings.get(
      `${category}:${normalizedOperator.toLocaleLowerCase('id-ID')}`,
    );
    const sellPrices = calculateDigiflazzSellPrices(
      basePrice,
      existing,
      pricing,
    );
    // A manual variant set by an admin must survive every future sync.
    const resolvedVariant = existing?.variantSource === 'manual'
      ? { variant: existing.variant, source: 'type' as const }
      : resolveVariant({
        type: typeof source.type === 'string' ? source.type : null,
        productName: name,
        category,
      });
    const vendorAvailable = !sourceLooksDown(source);
    const productStatus = vendorAvailable ? existing?.status ?? 'inactive' : 'inactive';
    const description = typeof source.desc === 'string' ? source.desc.slice(0, 1000) : '';

    synced.set(vendorCode, {
      id: existing?.id ?? randomUUID(),
      vendorCode,
      name: name.trim(),
      category,
      operator: normalizedOperator,
      variant: resolvedVariant.variant,
      variantSource: existing?.variantSource === 'manual' ? 'manual' : 'sync',
      description,
      basePrice,
      ...sellPrices,
      compareAtPrice: existing?.compareAtPrice ?? null,
      status: productStatus,
      vendor: 'Digiflazz',
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
          // Storefront groups and promo labels are admin-managed, not vendor data.
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
          // The vendor is part of the key now, so this cannot collide with a
          // TokoVoucher product that happens to share the same code.
          setWhere: and(
            eq(productTable.vendor, 'Digiflazz'),
            eq(productTable.vendorCode, sql`excluded."vendorCode"`),
          ),
        });
    }
  });

  // Revival is a separate statement: the upsert above cannot tell "the vendor is
  // healthy again" apart from "an admin turned this on", and only the system's own
  // disables may be undone automatically.
  await reviveProductsAvailableAtVendor(
    'Digiflazz',
    rows.filter((row) => row.status === 'active').map((row) => row.vendorCode),
  );
  // Only a product that was live and is now reported down counts as an outage.
  // A brand-new row also lands inactive, and marking that as a system disable
  // would make the next sync publish it without an admin.
  await disableProductsByVendorCodes(
    'Digiflazz',
    rows
      .filter((row) => row.status === 'inactive' && existingProducts.get(row.vendorCode)?.status === 'active')
      .map((row) => row.vendorCode),
    'Ditutup penyedia (price list Digiflazz)',
  );

  const created = rows.filter((product) => !existingProducts.has(product.vendorCode)).length;
  return {
    total: remoteProducts.total,
    synced: rows.length,
    created,
    updated: rows.length - created,
    skipped,
  };
}

// Postpaid products live in a separate price list (`cmd: "pasca"`). They are
// written inactive like every synced row, so an admin decides when they go live.
export async function syncDigiflazzPostpaidProducts(): Promise<DigiflazzAutoSyncResult> {
  const config = await getDigiflazzConfig();
  if (!config.username || !config.apiKey) {
    throw new Error('DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED');
  }

  const remote = await fetchDigiflazzPriceList(
    {
      username: config.username,
      apiKey: config.apiKey,
      mode: config.mode === 'production' ? 'production' : 'sandbox',
    },
    'pasca',
  );
  const db = getDatabase();
  const existingProducts = new Map(
    (await db.select().from(productTable).where(eq(productTable.vendor, 'Digiflazz')))
      .map((product) => [product.vendorCode, product]),
  );

  const rows: (typeof productTable.$inferInsert)[] = [];
  let skipped = 0;

  for (const rawProduct of remote.products) {
    const row = readPostpaidProductRow(rawProduct);
    if (!row) {
      skipped += 1;
      continue;
    }
    const existing = existingProducts.get(row.vendorCode);
    rows.push({
      id: existing?.id ?? randomUUID(),
      vendorCode: row.vendorCode,
      name: row.name.slice(0, 200),
      // Postpaid rows always belong to the bill category regardless of what the
      // provider calls the group.
      category: 'tagihan',
      operator: row.operator.slice(0, 200),
      variant: existing?.variant ?? null,
      variantSource: existing?.variantSource ?? 'sync',
      description: existing?.description ?? '',
      // Postpaid price lists carry the admin fee, not a sale price; the real
      // amount only exists after an inquiry, so the columns stay at the fee.
      basePrice: existing?.basePrice ?? row.price,
      sellPriceUser: existing?.sellPriceUser ?? row.price,
      sellPriceAgent: existing?.sellPriceAgent ?? row.price,
      compareAtPrice: existing?.compareAtPrice ?? null,
      status: existing?.status ?? 'inactive',
      vendor: 'Digiflazz',
      vendorLabel: existing?.vendorLabel ?? null,
    });
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < rows.length; index += 50) {
      const batch = rows.slice(index, index + 50);
      await tx
        .insert(productTable)
        .values(batch)
        .onConflictDoUpdate({
          target: [productTable.vendor, productTable.vendorCode],
          // Preserve per-product storefront groups and promo labels on resync.
          set: {
            name: sql`excluded."name"`,
            operator: sql`excluded."operator"`,
            updatedAt: sql`excluded."updatedAt"`,
          },
          setWhere: and(
            eq(productTable.vendor, 'Digiflazz'),
            eq(productTable.vendorCode, sql`excluded."vendorCode"`),
          ),
        });
    }
  });

  const created = rows.filter((row) => !existingProducts.has(row.vendorCode)).length;
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

export async function runDigiflazzProductSync(
  source: 'manual' | 'scheduled',
  now = new Date(),
): Promise<
  | { result: DigiflazzAutoSyncResult }
  | { skipped: 'SYNC_ALREADY_RUNNING' | 'SYNC_NOT_DUE' }
> {
  const locked = await runWithSyncLock(async () => {
    const schedule = await getDigiflazzAutoSyncConfig();
    if (
      source === 'scheduled' &&
      !isDigiflazzProductSyncDue(schedule.enabled, schedule.nextRunAt, now)
    ) {
      return { skipped: 'SYNC_NOT_DUE' as const };
    }

    const startTime = now.toISOString();
    await saveDigiflazzAutoSyncState({
      lastRunAt: startTime,
      lastStatus: 'running',
      clearLastError: true,
      clearLastResult: true,
    });

    try {
      const result = await syncDigiflazzProducts();
      const completedAt = new Date();
      const nextRunAt = schedule.enabled
        ? getNextDigiflazzProductSyncAt(
            completedAt,
            schedule.intervalDays,
          ).toISOString()
        : '';
      await saveDigiflazzAutoSyncState({
        lastRunAt: completedAt.toISOString(),
        lastStatus: 'success',
        lastResult: result,
        ...(schedule.enabled
          ? { nextRunAt }
          : { clearNextRunAt: true }),
        clearLastError: true,
      });
      await invalidateCatalog();
      return { result };
    } catch (error) {
      const completedAt = new Date();
      const nextRunAt = schedule.enabled
        ? getNextDigiflazzProductSyncAt(
            completedAt,
            schedule.intervalDays,
          ).toISOString()
        : '';
      await saveDigiflazzAutoSyncState({
        lastRunAt: completedAt.toISOString(),
        lastStatus: 'failed',
        lastError: error instanceof Error
          ? error.message.slice(0, 1000)
          : 'Unknown Digiflazz sync error',
        ...(schedule.enabled
          ? { nextRunAt }
          : { clearNextRunAt: true }),
        clearLastResult: true,
      });
      throw error;
    }
  });
  if ('skipped' in locked) return locked;
  return locked.result;
}
