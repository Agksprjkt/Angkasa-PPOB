// Two vendors can sell the same brand under different operator names, e.g.
// Digiflazz "AXIS" and TokoVoucher "DATA AXIS". The names are not close enough
// to merge automatically (TokoVoucher also has "VOUCHER AXIS", a different
// product), so the admin decides by pointing one operator at another with
// aliasOf. Empty alias means "stand alone".
export function resolveProviderName(
  operator: string,
  aliasOf?: string | null,
): string {
  const alias = aliasOf?.trim();
  return alias ? alias : operator.trim();
}

export function providerGroupKey(
  category: string,
  operator: string,
  aliasOf?: string | null,
): string {
  return `${category}:${resolveProviderName(operator, aliasOf).toLocaleLowerCase('id-ID')}`;
}

// Case-insensitive equality used when matching a route segment or a filter value
// against the resolved provider name.
export function sameProviderName(a: string, b: string) {
  return a.trim().toLocaleLowerCase('id-ID') === b.trim().toLocaleLowerCase('id-ID');
}
