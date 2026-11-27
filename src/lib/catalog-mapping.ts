// Pure and import-free so the vendor sync, the admin "apply rules" action, and
// the test all share one definition.

export type CatalogRuleMatchType = 'operator' | 'vendorCode' | 'prefix' | 'name';

export type CatalogRuleLike = {
  subgroupId: string;
  priority: number;
  vendor: string | null;
  matchType: CatalogRuleMatchType;
  matchValue: string;
};

export type MappableProduct = {
  name: string;
  vendorCode: string;
  operator: string;
  vendor: string;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('id-ID');
}

function matches(rule: CatalogRuleLike, product: MappableProduct, haystack: string) {
  const value = normalize(rule.matchValue);
  if (!value) return false;
  switch (rule.matchType) {
    case 'operator':
      return normalize(product.operator) === value;
    case 'vendorCode':
      return normalize(product.vendorCode) === value;
    case 'prefix':
      return normalize(product.vendorCode).startsWith(value);
    case 'name':
      return haystack.includes(value);
    default:
      return false;
  }
}

// Lowest priority number wins; equal priorities keep the caller's order. A rule
// scoped to one vendor only applies to that vendor.
export function matchSubgroup(
  product: MappableProduct,
  rules: readonly CatalogRuleLike[],
): string | null {
  const haystack = normalize(product.name);
  let best: CatalogRuleLike | null = null;
  for (const rule of rules) {
    if (rule.vendor && normalize(rule.vendor) !== normalize(product.vendor)) continue;
    if (!matches(rule, product, haystack)) continue;
    if (!best || rule.priority < best.priority) best = rule;
  }
  return best?.subgroupId ?? null;
}
