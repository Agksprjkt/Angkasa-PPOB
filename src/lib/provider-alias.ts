// Two vendors can sell the same brand under different operator names, e.g.
// Digiflazz "AXIS" and TokoVoucher "DATA AXIS". The names are not close enough
// to merge automatically (TokoVoucher also has "VOUCHER AXIS", a different
// product), so the admin decides by pointing one operator at another with
// aliasOf. Empty alias means "stand alone".
export function resolveProviderName(
  operator: string,
  aliasOf?: string | null,
  storefrontGroup?: string | null,
): string {
  const manualGroup = storefrontGroup?.trim();
  if (manualGroup) return manualGroup;
  const alias = aliasOf?.trim();
  return alias ? alias : operator.trim();
}

export function providerGroupKey(
  category: string,
  operator: string,
  aliasOf?: string | null,
  storefrontGroup?: string | null,
): string {
  return `${category}:${resolveProviderName(operator, aliasOf, storefrontGroup).toLocaleLowerCase('id-ID')}`;
}

// Case-insensitive equality used when matching a route segment or a filter value
// against the resolved provider name.
export function sameProviderName(a: string, b: string) {
  return a.trim().toLocaleLowerCase('id-ID') === b.trim().toLocaleLowerCase('id-ID');
}

export function isProductInProviderGroup(
  product: {
    category: string;
    operator: string;
    providerAlias?: string | null;
    storefrontGroup?: string | null;
  },
  category: string,
  providerName: string,
) {
  return product.category === category && sameProviderName(
    resolveProviderName(product.operator, product.providerAlias, product.storefrontGroup),
    providerName,
  );
}

export function getStorefrontGroupOptions(
  products: readonly { category: string; storefrontGroup?: string | null }[],
  category: string,
) {
  const labels = new Map<string, string>();
  for (const product of products) {
    if (product.category !== category) continue;
    const label = product.storefrontGroup?.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase('id-ID');
    if (!labels.has(key)) labels.set(key, label);
  }
  return [...labels.values()].sort((a, b) => a.localeCompare(b, 'id'));
}
