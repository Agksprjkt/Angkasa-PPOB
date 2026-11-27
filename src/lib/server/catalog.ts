import 'server-only';

import { and, asc, eq, gt } from 'drizzle-orm';
import { matchSubgroup, type CatalogRuleLike } from '@/lib/catalog-mapping';
import { getDatabase } from '@/lib/server/db/client';
import {
  catalogGroups,
  catalogRules,
  catalogSubgroups,
  products,
} from '@/lib/server/db/schema';

export async function listCatalogGroups() {
  return getDatabase()
    .select()
    .from(catalogGroups)
    .orderBy(asc(catalogGroups.sortOrder), asc(catalogGroups.label));
}

export async function listCatalogSubgroups() {
  return getDatabase()
    .select()
    .from(catalogSubgroups)
    .orderBy(asc(catalogSubgroups.sortOrder), asc(catalogSubgroups.label));
}

export async function listCatalogRules() {
  return getDatabase()
    .select()
    .from(catalogRules)
    .orderBy(asc(catalogRules.priority), asc(catalogRules.createdAt));
}

const applyBatchSize = 500;

// Re-evaluates only rule-placed products. A row an admin placed by hand is never
// touched, so "hidden on purpose" (null + manual) survives every run.
export async function applyCatalogRules() {
  const rules = (await listCatalogRules()) as CatalogRuleLike[];
  if (rules.length === 0) return { scanned: 0, changed: 0 };

  const db = getDatabase();
  let cursor: string | null = null;
  let scanned = 0;
  let changed = 0;

  for (;;) {
    const batch = await db
      .select({
        id: products.id,
        name: products.name,
        vendorCode: products.vendorCode,
        operator: products.operator,
        vendor: products.vendor,
        subgroupId: products.subgroupId,
      })
      .from(products)
      .where(and(
        eq(products.subgroupSource, 'rule'),
        cursor ? gt(products.id, cursor) : undefined,
      ))
      .orderBy(asc(products.id))
      .limit(applyBatchSize);
    if (batch.length === 0) break;

    for (const product of batch) {
      scanned += 1;
      const next = matchSubgroup(product, rules);
      if (next === product.subgroupId) continue;
      await db
        .update(products)
        .set({ subgroupId: next, updatedAt: new Date() })
        .where(eq(products.id, product.id));
      changed += 1;
    }
    cursor = batch[batch.length - 1].id;
  }

  return { scanned, changed };
}
