'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePPOB } from '@/context/PPOBContext';
import { CatalogProduct, Product, ProductCategory } from '@/types/ppob';
import { vendorLabelOf } from '@/lib/vendor-registry';
import { providerGroupKey, resolveProviderName, sameProviderName } from '@/lib/provider-alias';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { gameRequiresServerZone } from '@/lib/order-input-validation';
import {
  Smartphone,
  Wifi,
  Ticket,
  Zap,
  FileText,
  Wallet,
  Gamepad2,
  Search,
  Sparkles,
  HelpCircle,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';

interface ProductCatalogProps {
  view?: 'browse' | 'provider';
  initialCategory?: ProductCategory;
  initialSearch?: string;
  initialOperator?: string;
  onCategoryChange?: (category: ProductCategory) => void;
  onSelectProduct: (
    product: Product,
    destination: string,
    customerName?: string,
    serverZoneId?: string
  ) => void;
}

const categoryLabels: Record<ProductCategory, string> = {
  pulsa: 'Pulsa',
  data: 'Paket Data',
  voucher: 'Voucher',
  ewallet: 'E-Wallet',
  game: 'Game',
  pln: 'Token Listrik',
  tagihan: 'Tagihan',
};

const categoryIcons: Record<ProductCategory, typeof Smartphone> = {
  pulsa: Smartphone,
  data: Wifi,
  voucher: Ticket,
  ewallet: Wallet,
  game: Gamepad2,
  pln: Zap,
  tagihan: FileText,
};

const categoryOrder: ProductCategory[] = [
  'pulsa',
  'data',
  'voucher',
  'ewallet',
  'game',
  'pln',
  'tagihan',
];

const categoryStyles: Record<ProductCategory, { active: string; icon: string }> = {
  pulsa: {
    active: 'border-sky-100 bg-sky-50 text-sky-700',
    icon: 'text-blue-600',
  },
  data: {
    active: 'border-cyan-100 bg-cyan-50 text-cyan-700',
    icon: 'text-cyan-600',
  },
  voucher: {
    active: 'border-sky-100 bg-sky-50 text-sky-700',
    icon: 'text-sky-600',
  },
  ewallet: {
    active: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    icon: 'text-emerald-600',
  },
  game: {
    active: 'border-blue-100 bg-blue-50 text-blue-700',
    icon: 'text-blue-600',
  },
  pln: {
    active: 'border-amber-100 bg-amber-50 text-amber-700',
    icon: 'text-amber-600',
  },
  tagihan: {
    active: 'border-rose-100 bg-rose-50 text-rose-700',
    icon: 'text-rose-600',
  },
};

function getGameProductGroup(product: Pick<Product, 'name' | 'description'>) {
  const text = `${product.name} ${product.description}`.toLocaleLowerCase('id-ID');
  if (text.includes('membership') || text.includes('member') || text.includes('pass')) {
    return 'Membership';
  }
  if (text.includes('promo') || text.includes('event')) return 'Promo';
  return 'Lainnya';
}

export default function ProductCatalog({
  view = 'browse',
  initialCategory = 'pulsa',
  initialSearch = '',
  initialOperator,
  onCategoryChange,
  onSelectProduct,
}: ProductCatalogProps) {
  const { products, role, catalogPending } = usePPOB();
  const router = useRouter();

  const [activeCategory, setActiveCategory] = useState<ProductCategory>(initialCategory);
  const [destinationNumber, setDestinationNumber] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<string>(initialOperator ?? 'All');

  // Game Specific Inputs
  const [gameUserId, setGameUserId] = useState('');
  const [gameZoneId, setGameZoneId] = useState('');
  const [gameInputError, setGameInputError] = useState('');
  const [selectedGame, setSelectedGame] = useState(initialOperator ?? 'All');

  // E-Wallet Specific Inputs
  const [selectedEwallet, setSelectedEwallet] = useState(initialOperator ?? 'All');

  // PLN Inquiry State
  const [plnMeterNumber, setPlnMeterNumber] = useState('');
  const [plnValidatedNumber, setPlnValidatedNumber] = useState('');
  const [plnValidationError, setPlnValidationError] = useState('');
  const [isValidatingPln, setIsValidatingPln] = useState(false);

  // Tagihan is unavailable until a real provider inquiry is connected.
  const [selectedBillType, setSelectedBillType] = useState(initialOperator ?? 'All');
  const [productSearch, setProductSearch] = useState(initialSearch);
  const [selectedGameProductGroup, setSelectedGameProductGroup] = useState('Semua');
  const [selectedVariant, setSelectedVariant] = useState('Semua');

  // Auto-detect Telco Operator from Phone Prefix
  const detectedOperatorFromNumber = useMemo(() => {
    const clean = destinationNumber.replace(/[^0-9]/g, '');
    if (clean.length < 4) return null;
    const prefix = clean.substring(0, 4);

    if (['0811', '0812', '0813', '0821', '0822', '0852', '0853', '0823'].includes(prefix)) {
      return 'Telkomsel';
    }
    if (['0814', '0815', '0816', '0855', '0856', '0857', '0858'].includes(prefix)) {
      return 'Indosat';
    }
    if (['0817', '0818', '0819', '0859', '0877', '0878'].includes(prefix)) {
      return 'XL';
    }
    if (['0895', '0896', '0897', '0898', '0899'].includes(prefix)) {
      return 'Tri';
    }
    if (['0881', '0882', '0883', '0884', '0885', '0886', '0887', '0888', '0889'].includes(prefix)) {
      return 'Smartfren';
    }
    return null;
  }, [destinationNumber]);

  useEffect(() => {
    const meterNumber = plnMeterNumber.trim();
    if (!meterNumber) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsValidatingPln(true);
      setPlnValidatedNumber('');
      setPlnValidationError('');
      void fetch('/api/orders/validate-pln', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meterNumber }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const result = await response.json() as { valid?: boolean; error?: string };
          if (!response.ok || result.valid !== true) {
            setPlnValidationError(
              result.error === 'INVALID_PLN_METER_NUMBER'
                ? 'Nomor meter / ID pelanggan harus terdiri dari 9–16 digit.'
                : 'Validasi nomor PLN gagal. Coba lagi.',
            );
            return;
          }
          setPlnValidatedNumber(meterNumber);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setPlnValidationError('Validasi backend tidak tersedia. Coba lagi.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsValidatingPln(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [plnMeterNumber]);

  const availableOperators = useMemo(
    () => [...new Set(
      products
        .filter((product) => product.status === 'active' && product.category === activeCategory)
        .map((product) => resolveProviderName(product.operator, product.providerAlias))
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, 'id')),
    [products, activeCategory],
  );
  const detectedOperator = availableOperators.find(
    (operator) => operator.toLowerCase() === detectedOperatorFromNumber?.toLowerCase(),
  ) ?? null;
  const activeProvider = activeCategory === 'pulsa' || activeCategory === 'data' || activeCategory === 'voucher'
    ? selectedOperator !== 'All' ? selectedOperator : detectedOperator
    : null;
  const providerPresentation = activeProvider
    ? products.find((product) =>
        product.status === 'active' &&
        product.category === activeCategory &&
        sameProviderName(resolveProviderName(product.operator, product.providerAlias), activeProvider) &&
        (product.providerCoverUrl || product.providerDescription),
      )
    : null;
  const availableEwallets = useMemo(
    () => [...new Set(products
      .filter((product) => product.status === 'active' && product.category === 'ewallet')
      .map((product) => resolveProviderName(product.operator, product.providerAlias))
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')),
    [products],
  );
  const availableGames = useMemo(
    () => [...new Set(products
      .filter((product) => product.status === 'active' && product.category === 'game')
      .map((product) => resolveProviderName(product.operator, product.providerAlias))
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')),
    [products],
  );
  const availableBillTypes = useMemo(
    () => [...new Set(products
      .filter((product) => product.status === 'active' && product.category === 'tagihan')
      .map((product) => resolveProviderName(product.operator, product.providerAlias))
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')),
    [products],
  );

  // Product types ("Combo Lite", "FlexMax", …) come from the Digiflazz price
  // list or an admin override. Only offered when the provider actually has them.
  const variantOptions = useMemo(() => {
    const operator = activeProvider ?? (
      activeCategory === 'ewallet' ? selectedEwallet
        : activeCategory === 'game' ? selectedGame
          : activeCategory === 'tagihan' ? selectedBillType
            : null
    );
    const scoped = products.filter((product) =>
      product.status === 'active' &&
      product.category === activeCategory &&
      (!operator || operator === 'All' ||
        sameProviderName(resolveProviderName(product.operator, product.providerAlias), operator)),
    );
    return [...new Set(
      scoped
        .map((product) => product.variant?.trim())
        .filter((variant): variant is string => Boolean(variant)),
    )].sort((a, b) => a.localeCompare(b, 'id'));
  }, [
    products,
    activeCategory,
    activeProvider,
    selectedEwallet,
    selectedGame,
    selectedBillType,
  ]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.category !== activeCategory) return false;
      if (p.status !== 'active') return false;
      if (productSearch.trim()) {
        const query = productSearch.trim().toLocaleLowerCase('id-ID');
        if (!`${p.name} ${p.description}`.toLocaleLowerCase('id-ID').includes(query)) {
          return false;
        }
      }

      if (activeCategory === 'pulsa' || activeCategory === 'data' || activeCategory === 'voucher') {
        const opToFilter = selectedOperator !== 'All' ? selectedOperator : detectedOperator;
        if (opToFilter && !sameProviderName(resolveProviderName(p.operator, p.providerAlias), opToFilter)) {
          return false;
        }
      }

      if (activeCategory === 'ewallet') {
        if (selectedEwallet !== 'All' && !sameProviderName(resolveProviderName(p.operator, p.providerAlias), selectedEwallet)) {
          return false;
        }
      }

      if (activeCategory === 'game') {
        if (selectedGame !== 'All' && !sameProviderName(resolveProviderName(p.operator, p.providerAlias), selectedGame)) {
          return false;
        }
      }

      if (activeCategory === 'tagihan') {
        if (selectedBillType !== 'All' && !sameProviderName(resolveProviderName(p.operator, p.providerAlias), selectedBillType)) {
          return false;
        }
      }

      if (activeCategory === 'game' && view === 'provider' && selectedGameProductGroup !== 'Semua') {
        if (getGameProductGroup(p) !== selectedGameProductGroup) return false;
      }

      if (selectedVariant !== 'Semua') {
        if ((p.variant ?? '').toLowerCase() !== selectedVariant.toLowerCase()) return false;
      }

      return true;
    });
  }, [
    products,
    activeCategory,
    detectedOperator,
    selectedOperator,
    selectedEwallet,
    selectedGame,
    selectedBillType,
    productSearch,
    selectedGameProductGroup,
    selectedVariant,
    view,
  ]);

  const isTargetReady = (() => {
    if (activeCategory === 'pulsa' || activeCategory === 'data' ||
      activeCategory === 'voucher' || activeCategory === 'ewallet') {
      return destinationNumber.replace(/\D/g, '').length >= 8;
    }
    if (activeCategory === 'game') {
      return /^[a-zA-Z0-9._-]{4,64}$/.test(gameUserId.trim());
    }
    if (activeCategory === 'pln') {
      return plnValidatedNumber === plnMeterNumber.trim() && Boolean(plnValidatedNumber);
    }
    return false;
  })();

  const providerCards = useMemo(() => {
    const groups = new Map<string, { operator: string; product: CatalogProduct; count: number; vendors: string[] }>();
    products
      .filter((product) => product.status === 'active' && product.category === activeCategory)
      .forEach((product) => {
        // An admin alias merges two vendors selling the same brand into one card.
        const key = providerGroupKey(product.category, product.operator, product.providerAlias);
        const existing = groups.get(key);
        if (existing) {
          existing.count += 1;
          if (!existing.vendors.includes(product.vendor)) existing.vendors.push(product.vendor);
          return;
        }
        groups.set(key, {
          operator: resolveProviderName(product.operator, product.providerAlias),
          product,
          count: 1,
          vendors: [product.vendor],
        });
      });
    return [...groups.values()].sort((a, b) => a.operator.localeCompare(b.operator, 'id'));
  }, [products, activeCategory]);
  const gameProductCounts = useMemo(() => {
    const counts: Record<string, number> = { Semua: 0, Promo: 0, Membership: 0, Lainnya: 0 };
    products
      .filter((product) =>
        product.status === 'active' &&
        product.category === activeCategory &&
        (!initialOperator ||
          sameProviderName(resolveProviderName(product.operator, product.providerAlias), initialOperator)),
      )
      .forEach((product) => {
        counts.Semua += 1;
        counts[getGameProductGroup(product)] += 1;
      });
    return counts;
  }, [products, activeCategory, initialOperator]);

  if (view === 'browse') {
    return (
      <Card className="overflow-hidden border-slate-200/80 shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div className="grid grid-cols-4 gap-2 text-center sm:grid-cols-4 lg:grid-cols-8">
            {categoryOrder.map((category) => {
              const Icon = categoryIcons[category];
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category);
                    setSelectedVariant('Semua');
                    onCategoryChange?.(category);
                  }}
                  aria-pressed={isActive}
                  className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? categoryStyles[category].active
                      : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center ${categoryStyles[category].icon}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>{categoryLabels[category]}</span>
                </button>
              );
            })}
            <Link
              href="/produk"
              className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-white px-1.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              <span className="flex h-8 w-8 items-center justify-center text-blue-600">
                <LayoutGrid className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>Produk lainnya</span>
            </Link>
          </div>
        </div>

        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {activeCategory === 'game'
                  ? 'Pilih Game'
                  : activeCategory === 'pulsa'
                    ? 'Pilih Operator'
                    : `Pilih ${categoryLabels[activeCategory]}`}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Pilih layanan untuk melihat produk dan melanjutkan pesanan.
              </p>
            </div>
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
              {providerCards.length} layanan
            </span>
          </div>

          {catalogPending ? (
            <div className={`grid grid-cols-2 gap-3 ${
              activeCategory === 'game'
                ? 'sm:grid-cols-4 lg:grid-cols-6'
                : 'sm:grid-cols-3 lg:grid-cols-4'
            }`}>
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3"
                >
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : providerCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
              <HelpCircle className="mx-auto mb-2 h-8 w-8 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Layanan belum tersedia</p>
              <p className="mt-1 text-xs text-slate-500">
                Layanan aktif akan tampil di sini setelah disiapkan oleh admin.
              </p>
            </div>
          ) : (
            <div className={`grid grid-cols-2 gap-3 ${
              activeCategory === 'game'
                ? 'sm:grid-cols-4 lg:grid-cols-6'
                : 'sm:grid-cols-3 lg:grid-cols-4'
            }`}>
              {providerCards.map(({ operator, product, count, vendors }) => {
                const Icon = categoryIcons[activeCategory];
                const image = product.providerCoverUrl || product.providerIconUrl;
                return (
                  <button
                    key={`${activeCategory}:${operator}`}
                    type="button"
                    onClick={() => {
                      router.push(
                        `/checkout/${encodeURIComponent(activeCategory)}/${encodeURIComponent(operator)}`,
                      );
                    }}
                    className="liquid-product-card group min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white/60 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <div className={`product-well relative flex ${
                      activeCategory === 'game' ? 'aspect-[2/3]' : 'aspect-[1.45/1]'
                    } items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 via-sky-50 to-slate-100`}>
                      {image ? (
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                          style={{ backgroundImage: `url("${image}")` }}
                        />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center text-sky-700">
                          <Icon className="h-7 w-7" />
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/45 to-transparent" />
                      {activeCategory !== 'game' && (
                        <span className="product-well-badge absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {categoryLabels[activeCategory]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">
                          {operator}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">
                          {count} produk tersedia
                          {vendors.length > 1 ? ` · ${vendors.length} vendor` : ''}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-600" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-slate-200/80 overflow-hidden">
      {view !== 'provider' && (
      <div className="grid grid-cols-4 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-center sm:grid-cols-4 lg:grid-cols-8">
        {categoryOrder.map((category) => {
          const Icon = categoryIcons[category];
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              onClick={() => {
                setActiveCategory(category);
                setSelectedOperator('All');
                setSelectedVariant('Semua');
              }}
              className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? categoryStyles[category].active
                  : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center ${categoryStyles[category].icon}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span>{categoryLabels[category]}</span>
            </button>
          );
        })}
        <Link
          href="/produk"
          className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-white px-1.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <span className="flex h-8 w-8 items-center justify-center text-blue-600">
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>Produk lainnya</span>
        </Link>
      </div>
      )}

      <CardContent className="space-y-4 p-3 sm:p-6">
        {/* CASE 1: PULSA / DATA / VOUCHER */}
        {(activeCategory === 'pulsa' || activeCategory === 'data' || activeCategory === 'voucher') && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="telco-phone" className="text-xs uppercase text-slate-500 font-semibold mb-1 block">
                Nomor Handphone Tujuan {activeCategory === 'voucher' ? '(Untuk Notifikasi SN Voucher)' : ''}
              </Label>
              <div className="relative">
                <Input
                  id="telco-phone"
                  type="tel"
                  placeholder="Contoh: 081234567890"
                  value={destinationNumber}
                  onChange={(e) => setDestinationNumber(e.target.value)}
                  className="text-base font-medium tracking-wide h-11"
                />
                {detectedOperator && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{detectedOperator}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Operator Filter Pills */}
            {view !== 'provider' && availableOperators.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {['All', ...availableOperators].map((op) => (
                  <button
                    key={op}
                    onClick={() => {
                      setSelectedOperator(op);
                      setSelectedVariant('Semua');
                    }}
                    aria-pressed={
                      op === 'All'
                        ? selectedOperator === 'All' && !detectedOperator
                        : (selectedOperator !== 'All' ? selectedOperator : detectedOperator) === op
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      (op === 'All'
                        ? selectedOperator === 'All' && !detectedOperator
                        : (selectedOperator !== 'All' ? selectedOperator : detectedOperator) === op)
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {op === 'All' ? 'Semua Operator' : (
                      <span className="inline-flex items-center gap-1.5">
                        {(() => {
                          const providerProduct = products.find((product) =>
                            product.status === 'active' &&
                            product.category === activeCategory &&
                            sameProviderName(resolveProviderName(product.operator, product.providerAlias), op) &&
                            product.providerIconUrl,
                          );
                          return providerProduct?.providerIconUrl ? (
                            <span
                              aria-hidden="true"
                              className="h-4 w-4 rounded-full bg-contain bg-center bg-no-repeat"
                              style={{ backgroundImage: `url("${providerProduct.providerIconUrl}")` }}
                            />
                          ) : null;
                        })()}
                        {op}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {providerPresentation && (
              <div
                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                style={providerPresentation.providerCoverUrl
                  ? {
                      backgroundImage: `linear-gradient(90deg, rgba(15,23,42,.88), rgba(15,23,42,.3)), url("${providerPresentation.providerCoverUrl}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined}
              >
                <div className={`p-3 text-xs ${providerPresentation.providerCoverUrl ? 'text-white' : 'text-slate-600'}`}>
                  <p className="font-semibold">{activeProvider}</p>
                  {providerPresentation.providerDescription && (
                    <p className="mt-1">{providerPresentation.providerDescription}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CASE 2: TOPUP E-WALLET */}
        {activeCategory === 'ewallet' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase text-slate-500 font-semibold mb-1.5 block">
                Pilih E-Wallet
              </Label>
              {view !== 'provider' && availableEwallets.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {['All', ...availableEwallets].map((ew) => (
                  <button
                    key={ew}
                    onClick={() => setSelectedEwallet(ew)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                      selectedEwallet === ew
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {ew === 'All' ? 'Semua E-Wallet' : ew}
                  </button>
                ))}
              </div>}
            </div>

            <div>
              <Label htmlFor="ewallet-phone" className="text-xs uppercase text-slate-500 font-semibold mb-1 block">
                Nomor HP Akun {selectedEwallet === 'All' ? 'E-Wallet' : selectedEwallet}
              </Label>
              <Input
                id="ewallet-phone"
                type="tel"
                placeholder="081234567890"
                value={destinationNumber}
                onChange={(e) => setDestinationNumber(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        )}

        {/* CASE 3: TOPUP GAME */}
        {activeCategory === 'game' && (
          <div className="space-y-3">
            {view !== 'provider' && <div>
              <Label className="text-xs uppercase text-slate-500 font-semibold mb-1.5 block">
                Pilih Game Favorit
              </Label>
              {view !== 'provider' && availableGames.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['All', ...availableGames].map((game) => (
                  <button
                    key={game}
                    onClick={() => setSelectedGame(game)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                      selectedGame === game
                        ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {game === 'All' ? 'Semua Game' : game}
                  </button>
                ))}
              </div>}
            </div>}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <Label htmlFor="game-userid" className="text-xs mb-1 block">
                User ID / Player ID ({selectedGame === 'All' ? 'Game' : selectedGame}) *
                </Label>
                <Input
                  id="game-userid"
                  placeholder="Contoh: 184920194"
                  value={gameUserId}
                  autoComplete="off"
                  maxLength={64}
                  onChange={(e) => {
                    setGameUserId(e.target.value);
                    setGameInputError('');
                  }}
                  className="h-10"
                />
              </div>

              {(gameRequiresServerZone(selectedGame) ||
                (selectedGame === 'All' && availableGames.some(gameRequiresServerZone))) && (
                <div>
                  <Label htmlFor="game-zoneid" className="text-xs mb-1 block">
                    Zone / Server ID{gameRequiresServerZone(selectedGame) ? ' *' : ''}
                  </Label>
                  <Input
                    id="game-zoneid"
                    placeholder="Contoh: 2091"
                    value={gameZoneId}
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(e) => {
                      setGameZoneId(e.target.value);
                      setGameInputError('');
                    }}
                    className="h-10"
                  />
                </div>
              )}
            </div>
            {gameInputError && (
              <p role="alert" className="text-xs text-rose-700">{gameInputError}</p>
            )}
            {gameRequiresServerZone(selectedGame) && (
              <p className="text-xs text-slate-500">
                Mobile Legends memerlukan User ID dan Zone ID. Pastikan keduanya sesuai akun game.
              </p>
            )}
            {gameUserId && !/^[a-zA-Z0-9._-]{4,64}$/.test(gameUserId.trim()) && (
              <p role="alert" className="text-xs text-rose-700">
                User ID harus berisi 4–64 karakter berupa huruf, angka, titik, garis bawah, atau tanda hubung.
              </p>
            )}
            {gameRequiresServerZone(selectedGame) && gameZoneId &&
              !/^\d{1,10}$/.test(gameZoneId.trim()) && (
                <p role="alert" className="text-xs text-rose-700">
                  Zone / Server ID harus berisi angka.
                </p>
              )}
          </div>
        )}

        {/* CASE 4: TOKEN PLN */}
        {activeCategory === 'pln' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="pln-id" className="text-xs uppercase text-slate-500 font-semibold mb-1 block">
                Nomor Meter / ID Pelanggan PLN
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pln-id"
                  placeholder="Contoh: 14283948172"
                  value={plnMeterNumber}
                  onChange={(e) => {
                    setPlnMeterNumber(e.target.value);
                    setPlnValidatedNumber('');
                    setPlnValidationError('');
                    setIsValidatingPln(false);
                  }}
                  inputMode="numeric"
                  maxLength={16}
                  className="h-11"
                />
              </div>
            </div>

            {plnValidationError && (
              <p role="alert" className="text-xs text-rose-700">{plnValidationError}</p>
            )}
            {isValidatingPln && (
              <p role="status" className="text-xs text-slate-500">
                Memvalidasi nomor di server...
              </p>
            )}
            {plnValidatedNumber === plnMeterNumber.trim() && plnValidatedNumber && (
              <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
                <p className="font-semibold">Format nomor valid — produk token PLN tersedia</p>
                <p>
                  Server memeriksa format nomor, tetapi tidak mengonfirmasi ID aktif atau nama pelanggan.
                  Provider memeriksanya saat pesanan diproses.
                </p>
              </div>
            )}
          </div>
        )}

        {/* CASE 5: TAGIHAN */}
        {activeCategory === 'tagihan' && (
          <div className="space-y-3">
            {view !== 'provider' && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {availableBillTypes.length > 0 && ['All', ...availableBillTypes].map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setSelectedBillType(item);
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold border ${
                    selectedBillType === item
                      ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item === 'All' ? 'Semua Tagihan' : item}
                </button>
              ))}
            </div>}

            <div>
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
                Pengecekan dan pembayaran tagihan {selectedBillType === 'All' ? 'belum tersedia' : selectedBillType + ' belum tersedia'} karena integrasi inquiry provider belum dikonfigurasi.
              </p>
            </div>
          </div>
        )}

        {/* DENOMINATION SELECTION GRID */}
        <div className="pt-4 border-t border-slate-100">
          {view === 'provider' && activeCategory === 'game' && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {['Semua', 'Promo', 'Membership', 'Lainnya'].map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setSelectedGameProductGroup(group)}
                  aria-pressed={selectedGameProductGroup === group}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selectedGameProductGroup === group
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {group} ({gameProductCounts[group] ?? 0})
                </button>
              ))}
            </div>
          )}
          {view === 'provider' && variantOptions.length > 1 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {['Semua', ...variantOptions].map((variant) => {
                const count = variant === 'Semua'
                  ? products.filter((product) =>
                      product.status === 'active' &&
                      product.category === activeCategory &&
                      (!initialOperator ||
                        sameProviderName(resolveProviderName(product.operator, product.providerAlias), initialOperator)),
                    ).length
                  : products.filter((product) =>
                      product.status === 'active' &&
                      product.category === activeCategory &&
                      (!initialOperator ||
                        sameProviderName(resolveProviderName(product.operator, product.providerAlias), initialOperator)) &&
                      (product.variant ?? '').toLowerCase() === variant.toLowerCase(),
                    ).length;
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => setSelectedVariant(variant)}
                    aria-pressed={selectedVariant === variant}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selectedVariant === variant
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {variant} ({count})
                  </button>
                );
              })}
            </div>
          )}
          {view === 'provider' && (
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Cari produk..."
                aria-label="Cari produk"
                className="h-10 rounded-xl pl-9"
              />
            </div>
          )}
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {`Pilih nominal & produk (${filteredProducts.length})`}
            </span>
            {role === 'agent' && (
              <Badge variant="success" className="text-[10px]">
                Harga Member Aktif
              </Badge>
            )}
          </div>

          {catalogPending ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex min-h-28 flex-col justify-between rounded-xl border border-slate-200 bg-white/60 p-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Skeleton className="mt-3 h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
              <HelpCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700">
                {products.some((product) => product.status === 'active' && product.category === activeCategory)
                  ? 'Tidak ada produk ditemukan'
                  : 'Produk belum tersedia'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {products.some((product) => product.status === 'active' && product.category === activeCategory)
                  ? 'Periksa nomor atau pilih provider lain.'
                  : 'Produk aktif untuk kategori ini akan tampil setelah dikelola di dashboard.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
              {filteredProducts.map((product) => {
                const userPrice = product.sellPriceUser;
                const memberPrice = product.sellPriceAgent ?? userPrice;
                const activePrice = role === 'agent' ? memberPrice : userPrice;
                const Icon = categoryIcons[product.category];
                const requiresZone = product.category === 'game' &&
                  gameRequiresServerZone(product.operator);
                const validGameInput = /^[a-zA-Z0-9._-]{4,64}$/.test(gameUserId.trim()) &&
                  (!requiresZone || /^\d{1,10}$/.test(gameZoneId.trim()));

                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={!isTargetReady || (product.category === 'game' && !validGameInput)}
                    aria-label={`Pilih ${product.name}, ${activePrice.toLocaleString('id-ID')} rupiah`}
                    onClick={() => {
                      let dest = destinationNumber;
                      let cust: string | undefined;
                      let zone: string | undefined;

                      if (activeCategory === 'pln') {
                        dest = plnMeterNumber;
                      } else if (activeCategory === 'tagihan') {
                        return;
                      } else if (activeCategory === 'game') {
                        if (
                          gameRequiresServerZone(product.operator) &&
                          !/^\d{1,10}$/.test(gameZoneId.trim())
                        ) {
                          setGameInputError('Mobile Legends memerlukan Zone / Server ID numerik.');
                          return;
                        }
                        if (!/^[a-zA-Z0-9._-]{4,64}$/.test(gameUserId.trim())) {
                          setGameInputError('Masukkan User ID game yang valid (4–64 karakter).');
                          return;
                        }
                        dest = gameUserId;
                        zone = gameZoneId.trim() || undefined;
                      }

                      onSelectProduct(
                        { ...product, sellPriceAgent: memberPrice },
                        dest,
                        cust,
                        zone,
                      );
                    }}
                    className="liquid-product-card group flex min-h-28 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white/60 p-3 text-left transition-all hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-55 sm:p-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-slate-500">
                        {product.providerIconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.providerIconUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        )}
                      </span>
                      <h4 className="line-clamp-2 min-w-0 text-xs font-medium leading-snug text-slate-900 transition-colors group-hover:text-blue-600 sm:text-sm">
                        {product.name}
                      </h4>
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                      {product.compareAtPrice && product.compareAtPrice > activePrice && (
                        <span className="text-[10px] text-slate-400 line-through">
                          Rp {product.compareAtPrice.toLocaleString('id-ID')}
                        </span>
                      )}
                      <span className="font-sans text-sm font-bold text-slate-900 sm:text-base">
                        Rp {activePrice.toLocaleString('id-ID')}
                      </span>
                      {/* Two vendors can sell the same nominal, so the source is
                          shown on the card to tell them apart. */}
                      <span className="ml-auto inline-flex shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        {vendorLabelOf(product)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
