import type {
  CatalogGroupKind,
  CatalogRuleMatchType,
  ProductCategory,
  ProductVendor,
} from '@/types/ppob';

// Pure and import-free so the admin routes and the test share one definition.

export const catalogGroupKinds: CatalogGroupKind[] = ['prepaid', 'postpaid'];
export const catalogRuleMatchTypes: CatalogRuleMatchType[] = [
  'operator',
  'vendorCode',
  'prefix',
  'name',
];
export const catalogVendors: ProductVendor[] = ['Digiflazz', 'TokoVoucher', 'Manual'];
export const catalogAccents = ['sky', 'cyan', 'emerald', 'amber', 'rose', 'blue', 'slate'];

export function normalizeCatalogSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const slug = value.trim().toLocaleLowerCase('id-ID').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug && slug.length <= 60 ? slug : null;
}

function isBool(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isOrder(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000;
}

function isText(value: unknown, max: number, allowEmpty = false) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (allowEmpty || trimmed.length > 0) && value.length <= max;
}

export type GroupInput = {
  slug: string;
  label: string;
  iconKey: string;
  accent: string;
  kind: CatalogGroupKind;
  productCategory: ProductCategory | null;
  includeUnmapped: boolean;
  sortOrder: number;
  enabled: boolean;
};

const productCategories: ProductCategory[] = [
  'pulsa',
  'data',
  'voucher',
  'pln',
  'tagihan',
  'ewallet',
  'game',
];

export function parseGroupInput(value: unknown): GroupInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const slug = normalizeCatalogSlug(input.slug);
  const rawCategory = input.productCategory ?? null;
  if (
    !slug ||
    !isText(input.label, 80) ||
    !isText(input.iconKey, 40) ||
    typeof input.accent !== 'string' ||
    !catalogAccents.includes(input.accent) ||
    typeof input.kind !== 'string' ||
    !catalogGroupKinds.includes(input.kind as CatalogGroupKind) ||
    (rawCategory !== null &&
      (typeof rawCategory !== 'string' ||
        !productCategories.includes(rawCategory as ProductCategory))) ||
    !isBool(input.includeUnmapped ?? false) ||
    !isOrder(input.sortOrder ?? 0) ||
    !isBool(input.enabled ?? true)
  ) {
    return null;
  }
  return {
    slug,
    label: (input.label as string).trim(),
    iconKey: (input.iconKey as string).trim(),
    accent: input.accent,
    kind: input.kind as CatalogGroupKind,
    productCategory: rawCategory === null ? null : (rawCategory as ProductCategory),
    includeUnmapped: Boolean(input.includeUnmapped ?? false),
    sortOrder: Number(input.sortOrder ?? 0),
    enabled: Boolean(input.enabled ?? true),
  };
}

export type SubgroupInput = {
  groupId: string;
  slug: string;
  label: string;
  description: string;
  iconUrl: string | null;
  sortOrder: number;
  enabled: boolean;
};

export function parseSubgroupInput(value: unknown): SubgroupInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const slug = normalizeCatalogSlug(input.slug);
  const iconUrl = input.iconUrl ?? null;
  if (
    !slug ||
    !isText(input.groupId, 128) ||
    !isText(input.label, 80) ||
    !isText(input.description ?? '', 500, true) ||
    (iconUrl !== null && (typeof iconUrl !== 'string' || iconUrl.length > 300)) ||
    !isOrder(input.sortOrder ?? 0) ||
    !isBool(input.enabled ?? true)
  ) {
    return null;
  }
  return {
    groupId: (input.groupId as string).trim(),
    slug,
    label: (input.label as string).trim(),
    description: typeof input.description === 'string' ? input.description.trim() : '',
    iconUrl: iconUrl === null ? null : iconUrl,
    sortOrder: Number(input.sortOrder ?? 0),
    enabled: Boolean(input.enabled ?? true),
  };
}

export type RuleInput = {
  subgroupId: string;
  priority: number;
  vendor: ProductVendor | null;
  matchType: CatalogRuleMatchType;
  matchValue: string;
};

export function parseRuleInput(value: unknown): RuleInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const vendor = input.vendor ?? null;
  if (
    !isText(input.subgroupId, 128) ||
    !isOrder(input.priority ?? 100) ||
    (vendor !== null &&
      (typeof vendor !== 'string' || !catalogVendors.includes(vendor as ProductVendor))) ||
    typeof input.matchType !== 'string' ||
    !catalogRuleMatchTypes.includes(input.matchType as CatalogRuleMatchType) ||
    !isText(input.matchValue, 200)
  ) {
    return null;
  }
  return {
    subgroupId: (input.subgroupId as string).trim(),
    priority: Number(input.priority ?? 100),
    vendor: vendor === null ? null : (vendor as ProductVendor),
    matchType: input.matchType as CatalogRuleMatchType,
    matchValue: (input.matchValue as string).trim(),
  };
}
