'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Clock3,
  Flame,
  FileText,
  Gamepad2,
  Smartphone,
  Ticket,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePPOB } from '@/context/PPOBContext';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogProduct, FlashSaleOffer, ProductCategory } from '@/types/ppob';

interface FeaturedProvider {
  category: ProductCategory;
  operator: string;
  product: CatalogProduct;
  productCount: number;
  fromPrice: number;
}

const categoryOrder: ProductCategory[] = [
  'game',
  'pulsa',
  'data',
  'ewallet',
  'voucher',
  'pln',
  'tagihan',
];

const categoryIcons: Record<ProductCategory, LucideIcon> = {
  pulsa: Smartphone,
  data: Wifi,
  voucher: Ticket,
  ewallet: Wallet,
  game: Gamepad2,
  pln: Zap,
  tagihan: FileText,
};

function formatCurrency(amount: number) {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function isFlashSaleOffer(value: unknown): value is FlashSaleOffer {
  if (typeof value !== 'object' || value === null) return false;
  const offer = value as Record<string, unknown>;
  if (
    typeof offer.id !== 'string' ||
    typeof offer.salePrice !== 'number' ||
    typeof offer.endsAt !== 'string' ||
    typeof offer.product !== 'object' ||
    offer.product === null
  ) {
    return false;
  }
  const product = offer.product as Record<string, unknown>;
  return typeof product.id === 'string' &&
    typeof product.name === 'string' &&
    typeof product.category === 'string' &&
    categoryOrder.includes(product.category as ProductCategory) &&
    typeof product.operator === 'string' &&
    typeof product.sellPriceUser === 'number' &&
    Number.isFinite(product.sellPriceUser) &&
    typeof offer.quantitySold === 'number' &&
    Number.isSafeInteger(offer.quantitySold) &&
    offer.quantitySold >= 0 &&
    typeof offer.quantityReserved === 'number' &&
    Number.isSafeInteger(offer.quantityReserved) &&
    offer.quantityReserved >= 0 &&
    (offer.quotaLimit === null ||
      (typeof offer.quotaLimit === 'number' &&
        Number.isSafeInteger(offer.quotaLimit) &&
        offer.quotaLimit > 0)) &&
    !Number.isNaN(new Date(offer.endsAt).getTime());
}

export default function StorefrontSections() {
  const { products, role, catalogPending } = usePPOB();
  const router = useRouter();
  const [offers, setOffers] = useState<FlashSaleOffer[]>([]);
  const [flashSaleError, setFlashSaleError] = useState('');
  const [featured, setFeatured] = useState<Array<{ category: ProductCategory; operator: string }>>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/featured-products', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { featured?: unknown; error?: string };
        if (!response.ok || !Array.isArray(body.featured)) {
          throw new Error(body.error ?? 'Produk unggulan gagal dimuat.');
        }
        return body.featured.filter((row): row is { category: ProductCategory; operator: string } =>
          typeof row === 'object' &&
          row !== null &&
          categoryOrder.includes((row as { category?: unknown }).category as ProductCategory) &&
          typeof (row as { operator?: unknown }).operator === 'string',
        );
      })
      .then((rows) => {
        if (!controller.signal.aborted) setFeatured(rows);
      })
      .catch(() => {
        // fallback ke urutan otomatis katalog
      });
    return () => controller.abort();
  }, []);

  const featuredProviders = useMemo(() => {
    const grouped = new Map<string, FeaturedProvider>();
    products
      .filter((product) => product.status === 'active')
      .forEach((product) => {
        const key = `${product.category}:${product.operator.trim().toLocaleLowerCase('id-ID')}`;
        const price = role === 'agent'
          ? product.sellPriceAgent ?? product.sellPriceUser
          : product.sellPriceUser;
        const existing = grouped.get(key);
        if (existing) {
          existing.productCount += 1;
          if (price < existing.fromPrice) {
            existing.product = product;
            existing.fromPrice = price;
          }
          return;
        }
        grouped.set(key, {
          category: product.category,
          operator: product.operator.trim(),
          product,
          productCount: 1,
          fromPrice: price,
        });
      });
    const all = [...grouped.values()];
    if (featured.length) {
      const picked: FeaturedProvider[] = [];
      for (const row of featured) {
        const match = all.find((entry) =>
          entry.category === row.category &&
          entry.operator.toLocaleLowerCase('id-ID') === row.operator.toLocaleLowerCase('id-ID'),
        );
        if (match && !picked.includes(match)) picked.push(match);
      }
      if (picked.length) return picked.slice(0, 6);
    }
    return all
      .sort((a, b) =>
        categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) ||
        b.productCount - a.productCount ||
        a.operator.localeCompare(b.operator, 'id'),
      )
      .slice(0, 6);
  }, [featured, products, role]);

  useEffect(() => {
    const controller = new AbortController();
    const loadFlashSales = async () => {
      try {
        const response = await fetch('/api/flash-sales', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== 'object' ||
          result === null ||
          !('offers' in result) ||
          !Array.isArray(result.offers)
        ) {
          throw new Error('Flash sale belum dapat dimuat.');
        }
        setOffers(result.offers.filter(isFlashSaleOffer));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[STOREFRONT_FLASH_SALES_LOAD_FAILED]', error);
          setFlashSaleError('Flash sale belum dapat dimuat saat ini.');
        }
      }
    };

    void loadFlashSales();
    return () => controller.abort();
  }, []);

  const openProvider = (category: ProductCategory, operator: string) => {
    router.push(
      `/checkout/${encodeURIComponent(category)}/${encodeURIComponent(operator)}`,
    );
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="popular-products-heading" className="space-y-4">
        <div>
          <div className="flex items-center gap-2 text-orange-600">
            <Flame className="h-4 w-4" aria-hidden="true" />
            <h2
              id="popular-products-heading"
              className="text-sm font-bold uppercase tracking-[0.16em] text-slate-800"
            >
              Produk Populer
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Sorotan layanan dari katalog aktif.
          </p>
        </div>

        {catalogPending ? (
          <div className="grid auto-rows-fr grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="liquid-surface flex min-h-[7.5rem] flex-col items-start justify-between gap-2 rounded-2xl border border-white/80 bg-white/55 p-3 sm:min-h-[5.5rem] sm:flex-row sm:items-center sm:gap-3"
              >
                <Skeleton className="h-11 w-11 rounded-xl sm:h-14 sm:w-14" />
                <div className="w-full space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : featuredProviders.length ? (
          <div className="grid auto-rows-fr grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
            {featuredProviders.map(({ category, operator, product, productCount, fromPrice }) => {
              const Icon = categoryIcons[category];
              const imageUrl = product.providerIconUrl || product.providerCoverUrl;
              return (
                <button
                  key={`${category}:${operator}`}
                  type="button"
                  onClick={() => openProvider(category, operator)}
                  className="liquid-surface group flex min-h-[7.5rem] w-full min-w-0 flex-col items-start justify-between gap-2 rounded-2xl border border-white/80 bg-white/55 p-3 text-left shadow-[0_12px_35px_-25px_rgba(56,189,248,0.22)] backdrop-blur-xl transition hover:border-blue-200 hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:min-h-[5.5rem] sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-cyan-700 sm:h-14 sm:w-14">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 w-full flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {operator}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-slate-500">
                      {productCount} pilihan · mulai {formatCurrency(fromPrice)}
                    </span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600 sm:block" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="liquid-surface rounded-2xl border border-dashed border-white/80 bg-white/45 p-6 text-center text-sm text-slate-500">
            Produk populer akan tampil setelah layanan aktif tersedia.
          </div>
        )}
      </section>

      {flashSaleError ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
          {flashSaleError}
        </p>
      ) : offers.length > 0 ? (
        <section aria-labelledby="flash-sale-heading" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-rose-600">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <h2
                id="flash-sale-heading"
                className="text-sm font-bold uppercase tracking-[0.16em] text-slate-800"
              >
                Flash Sale
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Harga spesial untuk produk dengan penawaran aktif.
            </p>
          </div>
          <div className="grid auto-rows-fr grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
            {offers.slice(0, 6).map((offer) => {
              const product = offer.product;
              const discount = offer.discountPercent ?? 0;
              const compareAtPrice = offer.compareAtPrice ?? null;
              const progress = offer.quotaLimit && offer.quotaLimit > 0
                ? Math.min(
                    100,
                    ((offer.quantitySold + offer.quantityReserved) / offer.quotaLimit) * 100,
                  )
                : null;
              const imageUrl = product.providerIconUrl || product.providerCoverUrl;
              const Icon = categoryIcons[product.category];
              return (
                <article
                  key={offer.id}
                  className="flash-sale-card liquid-surface w-full overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/70 via-white/60 to-cyan-50/70 shadow-[0_16px_40px_-28px_rgba(251,113,133,0.32)] backdrop-blur-xl"
                >
                  <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-rose-700 sm:h-12 sm:w-12">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900 sm:truncate sm:text-sm">{product.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">{product.operator}</p>
                    </div>
                    {discount > 0 && (
                      <span className="self-start rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        -{discount}%
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 border-t border-slate-200/70 px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:px-4">
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-500 sm:text-[11px]">
                        {new Date(offer.endsAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                      <p className="mt-0.5 font-sans text-sm font-bold text-slate-900 sm:text-base">
                        {formatCurrency(offer.salePrice)}
                      </p>
                      {compareAtPrice !== null && (
                        <p className="text-[10px] text-slate-400 line-through sm:text-[11px]">
                          {formatCurrency(compareAtPrice)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openProvider(product.category, product.operator)}
                      className="min-h-9 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 sm:min-h-11 sm:w-auto sm:rounded-xl sm:text-xs"
                    >
                      Ambil promo
                    </button>
                  </div>
                  {progress !== null && (
                    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Kuota terbatas</span>
                        <span>{offer.quantitySold + offer.quantityReserved}/{offer.quotaLimit}</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`Kuota ${product.name}`}
                        aria-valuemin={0}
                        aria-valuemax={offer.quotaLimit ?? 0}
                        aria-valuenow={Math.min(
                          offer.quotaLimit ?? 0,
                          offer.quantitySold + offer.quantityReserved,
                        )}
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rose-100"
                      >
                        <span
                          className="flash-sale-progress block h-full rounded-full bg-gradient-to-r from-rose-300 to-cyan-200"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
