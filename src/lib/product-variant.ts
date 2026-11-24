import type { ProductCategory } from '@/types/ppob';

// Digiflazz returns a `type` field that already names the product series, e.g.
// XL -> "FlexMax", "Xtra Combo Flex", "Combo Lite". That value is the variant.
const GENERIC_TYPES = new Set(['', '-', 'umum', 'general', 'reguler', 'regular']);

// Only used when `type` is missing or generic. Ordered longest-first so
// "Xtra Combo Flex" wins over a bare "Combo".
const NAME_KEYWORDS = [
  'xtra combo vip plus',
  'xtra combo flex',
  'xtra combo',
  'combo lite',
  'combo',
  'flexmax',
  'flex max',
  'flexmini',
  'flex mini',
  'flex',
  'freedom internet',
  'freedom',
  'flash',
  'happy',
  'unlimited',
  'yellow',
  'jawa',
];

export type VariantSource = 'type' | 'name' | 'none';

export type VariantResolution = {
  variant: string | null;
  source: VariantSource;
};

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function clamp(value: string) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 60 ? trimmed.slice(0, 60).trim() : trimmed;
}

// Variants only make sense where one brand is split into series. Pulsa, PLN and
// e-wallet products are a single flat list per provider.
const VARIANT_CATEGORIES = new Set<ProductCategory>(['data', 'voucher']);

export function resolveVariant(input: {
  type?: string | null;
  productName: string;
  category: ProductCategory;
}): VariantResolution {
  if (!VARIANT_CATEGORIES.has(input.category)) {
    return { variant: null, source: 'none' };
  }

  const rawType = (input.type ?? '').trim();
  if (rawType && !GENERIC_TYPES.has(rawType.toLowerCase())) {
    const variant = clamp(rawType);
    if (variant) return { variant, source: 'type' };
  }

  const haystack = input.productName.toLowerCase();
  for (const keyword of NAME_KEYWORDS) {
    if (haystack.includes(keyword)) {
      return { variant: clamp(titleCase(keyword)), source: 'name' };
    }
  }

  return { variant: null, source: 'none' };
}
