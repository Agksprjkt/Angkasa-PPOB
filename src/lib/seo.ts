// Shared SEO copy resolution so the page metadata, the social preview, and the
// admin form all describe the same store the same way.

export type SeoSource = {
  storeName: string;
  tagline: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImageFile: string | null;
  iconFile: string | null;
  logoFile: string | null;
  // Already-resolved image URL, for callers that do not know file names (the
  // standalone storefront reads them from the backend payload).
  ogImageUrl?: string | null;
};

export type ResolvedSeo = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  imageUrl: string | null;
  imageAlt: string;
};

const defaultDescription =
  'Platform PPOB Lengkap & Cepat. Beli pulsa reguler, paket kuota data, token listrik PLN, dan bayar tagihan.';

export function storeAssetUrl(file: string | null) {
  if (!file) return null;
  // Callers that already hold a resolved URL (the standalone storefront reads
  // them from the backend payload) pass it through unchanged.
  if (file.startsWith('/') || /^https?:\/\//i.test(file)) return file;
  return `/api/store-assets/${encodeURIComponent(file)}`;
}

export function resolveSeo(source: SeoSource): ResolvedSeo {
  const storeName = source.storeName.trim();
  const title = source.seoTitle.trim() || storeName;
  const description = source.seoDescription.trim() ||
    source.description.trim() ||
    source.tagline.trim() ||
    defaultDescription;
  // The social card has its own copy: a title that reads well in a link preview
  // is usually shorter than the search result title.
  const ogTitle = source.ogTitle.trim() || title;
  const ogDescription = source.ogDescription.trim() || description;
  const imageUrl = storeAssetUrl(source.ogImageFile) ??
    storeAssetUrl(source.ogImageUrl ?? null) ??
    storeAssetUrl(source.iconFile) ??
    storeAssetUrl(source.logoFile);
  return {
    title,
    description,
    ogTitle,
    ogDescription,
    imageUrl,
    imageAlt: storeName ? `${storeName} — ${ogTitle}` : ogTitle,
  };
}

// Keep in sync with the admin form maxLength values.
export const seoFieldLimits = {
  seoTitle: 70,
  seoDescription: 320,
  ogTitle: 100,
  ogDescription: 320,
} as const;
