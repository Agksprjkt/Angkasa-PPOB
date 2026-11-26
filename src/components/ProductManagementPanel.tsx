'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Product, ProductCategory } from '@/types/ppob';
import { vendorLabelOf } from '@/lib/vendor-registry';
import { providerGroupKey, resolveProviderName } from '@/lib/provider-alias';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePPOB } from '@/context/PPOBContext';
import {
  CircleDollarSign,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Gamepad2,
  ReceiptText,
  Pencil,
  ImagePlus,
  Save,
  Search,
  Smartphone,
  Ticket,
  Trash2,
  WalletCards,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

export type ProductAdminView = 'all' | 'pricing' | 'active' | 'inactive';

const categoryLabels: Record<ProductCategory, string> = {
  pulsa: 'Pulsa',
  data: 'Paket data',
  voucher: 'Voucher',
  pln: 'Token listrik',
  tagihan: 'Tagihan',
  ewallet: 'E-Money',
  game: 'Top Up',
};

const categoryOrder: ProductCategory[] = [
  'game',
  'voucher',
  'pulsa',
  'pln',
  'data',
  'tagihan',
  'ewallet',
];

const categoryIcons: Record<ProductCategory, typeof Smartphone> = {
  pulsa: Smartphone,
  data: Wifi,
  voucher: Ticket,
  pln: Zap,
  tagihan: ReceiptText,
  ewallet: WalletCards,
  game: Gamepad2,
};

const formatRupiah = (value: number) =>
  `Rp ${value.toLocaleString('id-ID')}`;

interface ProviderGroup {
  key: string;
  category: ProductCategory;
  operator: string;
  vendors: Product['vendor'][];
  products: Product[];
  allProducts: Product[];
  activeCount: number;
}

interface ProviderSettings {
  description: string;
  iconUrl: string | null;
  coverUrl: string | null;
  pricingType: 'fixed' | 'percent';
  pricingValue: number;
  memberPricingType: 'fixed' | 'percent';
  memberPricingValue: number;
  aliasOf: string | null;
}

function ProviderDetailPanel({
  group,
  products,
  onBack,
  onToggleStatus,
}: {
  group: ProviderGroup;
  products: Product[];
  onBack: () => void;
  onToggleStatus: (product: Product, status: Product['status']) => Promise<boolean>;
}) {
  const { refreshProducts, addToast, updateProduct, bulkUpdateProductStatus, products: catalogProducts } = usePPOB();
  const [settings, setSettings] = useState<ProviderSettings>({
    description: '',
    iconUrl: null,
    coverUrl: null,
    pricingType: 'fixed',
    pricingValue: 0,
    memberPricingType: 'fixed',
    memberPricingValue: 0,
    aliasOf: null,
  });
  const [query, setQuery] = useState('');
  const [productPage, setProductPage] = useState(0);
  const [sortBy, setSortBy] = useState<'name' | 'price'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploading, setIsUploading] = useState<'icon' | 'cover' | null>(null);
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(() => new Set());
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productDraft, setProductDraft] = useState<{
    variant: string;
    vendorLabel: string;
    sellPriceUser: number;
    sellPriceAgent: number;
    compareAtPrice: number | null;
    status: Product['status'];
  } | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ category: group.category, operator: group.operator });
    void fetch(`/api/admin/product-providers?${params}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Pengaturan provider gagal dimuat.');
        return body.settings as ProviderSettings;
      })
      .then((result) => {
        if (active) setSettings(result);
      })
      .catch((error: unknown) => {
        if (active) {
          addToast('Pengaturan provider gagal dimuat', error instanceof Error ? error.message : 'Silakan coba lagi.', 'error');
        }
      })
      .finally(() => {
        if (active) setIsLoadingSettings(false);
      });
    return () => {
      active = false;
    };
  }, [addToast, group.category, group.operator]);

  const filteredProducts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('id-ID');
    const matched = products.filter((product) =>
      !search ||
      product.name.toLocaleLowerCase('id-ID').includes(search) ||
      product.vendorCode.toLocaleLowerCase('id-ID').includes(search) ||
      (product.variant ?? '').toLocaleLowerCase('id-ID').includes(search),
    );
    const direction = sortDirection === 'desc' ? -1 : 1;
    return [...matched].sort((a, b) => {
      if (sortBy === 'price') {
        const diff = a.sellPriceUser - b.sellPriceUser;
        if (diff !== 0) return diff * direction;
        return a.name.localeCompare(b.name, 'id');
      }
      return a.name.localeCompare(b.name, 'id') * direction;
    });
  }, [products, query, sortBy, sortDirection]);
  const allActive = group.allProducts.every((product) => product.status === 'active');
  const activeCount = group.allProducts.filter((product) => product.status === 'active').length;
  const totalCount = group.allProducts.length;

  // Operators in the same category are the only valid merge targets, and the
  // list is small because it is deduplicated by name.
  const aliasOptions = useMemo(() => {
    const names = new Set<string>();
    for (const product of catalogProducts) {
      if (product.category !== group.category) continue;
      const name = product.operator.trim();
      if (name && name.toLocaleLowerCase('id-ID') !== group.operator.toLocaleLowerCase('id-ID')) {
        names.add(name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'id'));
  }, [catalogProducts, group.category, group.operator]);

  // A TokoVoucher provider can hold 600+ rows; rendering them all made the
  // panel crawl, so the table pages through them.
  const productsPerPage = 50;
  const productPageCount = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const currentProductPage = Math.min(productPage, productPageCount - 1);
  const pagedProducts = filteredProducts.slice(
    currentProductPage * productsPerPage,
    currentProductPage * productsPerPage + productsPerPage,
  );

  const saveSettings = async (applyPrices: boolean) => {
    setIsSavingSettings(true);
    try {
      const response = await fetch('/api/admin/product-providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: group.category,
          operator: group.operator,
          ...settings,
          applyPrices,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Pengaturan provider gagal disimpan.');
      addToast(
        applyPrices ? 'Harga otomatis diterapkan' : 'Informasi provider disimpan',
        applyPrices
          ? `Harga jual ${totalCount} produk ${group.operator} telah diperbarui.`
          : `Informasi ${categoryLabels[group.category]} ${group.operator} berhasil disimpan.`,
        'success',
      );
      if (applyPrices) {
        try {
          await refreshProducts();
        } catch (error) {
          addToast(
            'Daftar harga belum diperbarui',
            error instanceof Error ? error.message : 'Muat ulang dashboard untuk melihat harga terbaru.',
            'warning',
          );
        }
      }
    } catch (error) {
      addToast(
        'Pengaturan provider gagal disimpan',
        error instanceof Error ? error.message : 'Silakan coba lagi.',
        'error',
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const uploadAsset = async (kind: 'icon' | 'cover', file?: File) => {
    if (!file) return;
    setIsUploading(kind);
    try {
      const form = new FormData();
      form.set('category', group.category);
      form.set('operator', group.operator);
      form.set('kind', kind);
      form.set('file', file);
      const response = await fetch('/api/admin/product-providers/assets', {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (!response.ok || typeof body.assetUrl !== 'string') {
        throw new Error(body.error ?? 'Gambar provider gagal diunggah.');
      }
      setSettings((current) => ({
        ...current,
        [kind === 'icon' ? 'iconUrl' : 'coverUrl']: body.assetUrl,
      }));
      try {
        await refreshProducts();
      } catch (error) {
        addToast(
          'Gambar diunggah, katalog belum diperbarui',
          error instanceof Error ? error.message : 'Muat ulang dashboard untuk melihat ikon terbaru.',
          'warning',
        );
      }
      addToast(
        'Gambar diunggah',
        kind === 'icon'
          ? 'Ikon provider diperbarui untuk semua produknya.'
          : 'Cover provider berhasil diperbarui.',
        'success',
      );
    } catch (error) {
      addToast('Gambar gagal diunggah', error instanceof Error ? error.message : 'Silakan coba lagi.', 'error');
    } finally {
      setIsUploading(null);
    }
  };

  const removeAsset = async (kind: 'icon' | 'cover') => {
    if (!window.confirm(`Hapus ${kind === 'icon' ? 'ikon' : 'cover'} provider ini?`)) return;
    setIsUploading(kind);
    try {
      const params = new URLSearchParams({
        category: group.category,
        operator: group.operator,
        kind,
      });
      const response = await fetch(`/api/admin/product-providers/assets?${params}`, {
        method: 'DELETE',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Gambar provider gagal dihapus.');
      setSettings((current) => ({
        ...current,
        [kind === 'icon' ? 'iconUrl' : 'coverUrl']: null,
      }));
      try {
        await refreshProducts();
      } catch {
        // catalog refresh is best-effort
      }
      addToast('Gambar dihapus', 'Provider kembali memakai ikon bawaan.', 'success');
    } catch (error) {
      addToast('Gambar gagal dihapus', error instanceof Error ? error.message : 'Silakan coba lagi.', 'error');
    } finally {
      setIsUploading(null);
    }
  };

  const beginProductEdit = (product: Product) => {
    setEditingProductId(product.id);
    setProductDraft({
      variant: product.variant ?? '',
      vendorLabel: product.vendorLabel ?? '',
      sellPriceUser: product.sellPriceUser,
      sellPriceAgent: product.sellPriceAgent,
      compareAtPrice: product.compareAtPrice ?? null,
      status: product.status,
    });
  };

  const saveProductEdit = async (product: Product) => {
    if (!productDraft) return;
    setPendingProductIds((current) => new Set(current).add(product.id));
    try {
      // An empty type hands the product back to the vendor sync.
      const variant = productDraft.variant.trim();
      const vendorLabel = productDraft.vendorLabel.trim();
      const saved = await updateProduct(product.id, {
        variant: variant || null,
        vendorLabel: vendorLabel || null,
        sellPriceUser: productDraft.sellPriceUser,
        sellPriceAgent: productDraft.sellPriceAgent,
        compareAtPrice: productDraft.compareAtPrice,
        status: productDraft.status,
      });
      if (saved) {
        setEditingProductId(null);
        setProductDraft(null);
      }
    } finally {
      setPendingProductIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  };

  const toggleGroupStatus = async () => {
    const nextStatus = allActive ? 'inactive' : 'active';
    const pendingIds = group.allProducts
      .filter((product) => product.status !== nextStatus)
      .map((product) => product.id);
    if (pendingIds.length === 0) return;
    setPendingProductIds(new Set(group.allProducts.map((product) => product.id)));
    try {
      await bulkUpdateProductStatus(pendingIds, nextStatus);
    } finally {
      setPendingProductIds(new Set());
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900 hover:text-sky-700"
      >
        <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        {categoryLabels[group.category]} {group.operator}
      </button>

      <details open className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none border-b border-slate-200 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
          Informasi Produk
        </summary>
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ['icon', 'Ikon', 'Rekomendasi: 256×256 px, PNG transparan.'],
              ['cover', 'Cover', 'Rekomendasi: 1280×720 px, maks. 1 MB.'],
            ] as const).map(([kind, label, recommendation]) => {
              const imageUrl = kind === 'icon' ? settings.iconUrl : settings.coverUrl;
              return (
                <div key={kind} className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{label}</label>
                  <label className={`flex h-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 hover:border-sky-400 ${
                    kind === 'cover' ? 'sm:h-28' : ''
                  }`}>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={`${label} ${group.operator}`} className={kind === 'icon' ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} />
                    ) : (
                      <span className="flex items-center gap-2"><ImagePlus className="h-5 w-5" />Ganti media</span>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        void uploadAsset(kind, event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    {isUploading === kind ? 'Mengunggah…' : recommendation}
                  </p>
                  {imageUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isUploading !== null}
                      onClick={() => void removeAsset(kind)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Hapus {kind === 'icon' ? 'ikon' : 'cover'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            Ikon provider diterapkan otomatis ke seluruh produk provider ini di katalog, jadi tidak perlu mengunggah ikon per produk.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="provider-description" className="text-sm font-medium text-slate-700">Deskripsi</label>
            <textarea
              id="provider-description"
              rows={3}
              maxLength={2000}
              value={settings.description}
              onChange={(event) => setSettings((current) => ({ ...current, description: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="provider-alias" className="text-sm font-medium text-slate-700">
              Gabung ke operator
            </label>
            <input
              id="provider-alias"
              list="provider-alias-options"
              maxLength={200}
              value={settings.aliasOf ?? ''}
              onChange={(event) => setSettings((current) => ({
                ...current,
                aliasOf: event.target.value,
              }))}
              placeholder="Kosongkan bila tampil terpisah"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:max-w-sm"
            />
            <datalist id="provider-alias-options">
              {aliasOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p className="text-xs text-slate-500">
              Isi nama operator lain di kategori ini bila kedua vendor menjual layanan yang sama,
              misalnya DATA AXIS digabung ke AXIS. Kartu toko dan halaman checkout akan memakai satu
              nama dengan produk dari kedua vendor.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <button
                type="button"
                role="switch"
                aria-checked={allActive}
                aria-label={`${allActive ? 'Nonaktifkan' : 'Aktifkan'} seluruh provider`}
                disabled={pendingProductIds.size > 0}
                onClick={() => void toggleGroupStatus()}
                className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                  activeCount ? 'bg-amber-500' : 'bg-slate-300'
                }`}
              >
                <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  activeCount ? 'translate-x-5' : ''
                }`} />
              </button>
              <span className="text-sm text-slate-700">{allActive ? 'Aktif' : activeCount ? `Sebagian aktif (${activeCount}/${totalCount})` : 'Nonaktif'}</span>
            </div>
            <Button type="button" onClick={() => void saveSettings(false)} disabled={isLoadingSettings || isSavingSettings}>
              {isSavingSettings ? 'Menyimpan…' : 'Simpan Informasi'}
            </Button>
          </div>
        </div>
      </details>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Daftar Produk ({products.length})</h2>
            <p className="text-xs text-slate-500">Pilih Edit untuk mengubah ikon, harga, markup, harga coret, dan status produk langsung di baris.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Cari produk provider"
              placeholder="Cari produk…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setProductPage(0);
              }}
              className="h-9 w-full sm:w-48"
            />
            <select
              aria-label="Urutkan produk provider"
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value as 'name' | 'price');
                setProductPage(0);
              }}
            >
              <option value="name">Urutkan: Nama</option>
              <option value="price">Urutkan: Harga</option>
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={sortDirection === 'asc' ? 'Urutan menaik' : 'Urutan menurun'}
              title={sortDirection === 'asc' ? 'Naik' : 'Turun'}
              onClick={() => {
                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                setProductPage(0);
              }}
            >
              {sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void saveSettings(true)}
              disabled={isLoadingSettings || isSavingSettings}
            >
              Set Harga Otomatis
            </Button>
          </div>
        </div>
        <div className="grid gap-4 border-b border-slate-100 bg-slate-50/60 p-4 lg:grid-cols-2">
          {([
            {
              key: 'public',
              title: 'Harga jual',
              type: settings.pricingType,
              value: settings.pricingValue,
            },
            {
              key: 'member',
              title: 'Harga member',
              type: settings.memberPricingType,
              value: settings.memberPricingValue,
            },
          ] as const).map((pricing) => {
            const isMember = pricing.key === 'member';
            return (
              <div key={pricing.key} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-medium text-slate-600">
                  Aturan {pricing.title.toLocaleLowerCase('id-ID')}
                  <select
                    value={pricing.type}
                    onChange={(event) => setSettings((current) => isMember
                      ? { ...current, memberPricingType: event.target.value as ProviderSettings['memberPricingType'] }
                      : { ...current, pricingType: event.target.value as ProviderSettings['pricingType'] })}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                  >
                    <option value="fixed">Markup nominal rupiah</option>
                    <option value="percent">Markup persentase</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium text-slate-600">
                  Nilai markup
                  <Input
                    type="number"
                    min={0}
                    max={pricing.type === 'percent' ? 100 : 1000000}
                    step={1}
                    value={pricing.value}
                    onChange={(event) => setSettings((current) => isMember
                      ? { ...current, memberPricingValue: Number(event.target.value) || 0 }
                      : { ...current, pricingValue: Number(event.target.value) || 0 })}
                    className="h-9"
                  />
                </label>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  {pricing.type === 'percent'
                    ? `${pricing.title} = modal + ${pricing.value}%`
                    : `${pricing.title} = modal + Rp ${pricing.value.toLocaleString('id-ID')}`}
                </p>
              </div>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3 text-right">Modal</th>
                <th className="px-4 py-3 text-right">Harga jual</th>
                <th className="px-4 py-3 text-right">Harga coret</th>
                <th className="px-4 py-3 text-right">Harga member</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedProducts.map((product) => {
                const active = product.status === 'active';
                const pending = pendingProductIds.has(product.id);
                const editing = editingProductId === product.id && productDraft !== null;
                const iconUrl = settings.iconUrl ?? product.providerIconUrl ?? null;
                const invalidCompareAtPrice = Boolean(
                  editing &&
                  productDraft.compareAtPrice !== null &&
                  productDraft.compareAtPrice <= productDraft.sellPriceUser,
                );
                const invalidPrice = Boolean(
                  editing &&
                  (!Number.isSafeInteger(productDraft.sellPriceUser) ||
                    productDraft.sellPriceUser < product.basePrice ||
                    !Number.isSafeInteger(productDraft.sellPriceAgent) ||
                    productDraft.sellPriceAgent < product.basePrice),
                );
                return (
                  <tr key={product.id} className={editing ? 'bg-slate-50/80' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <label className={`group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 ${
                          editing ? 'cursor-pointer hover:border-blue-400' : ''
                        }`} title={editing ? 'Klik untuk mengganti ikon provider' : undefined}>
                          {iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={iconUrl} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-xs font-bold uppercase text-slate-500">
                              {product.operator.slice(0, 2)}
                            </span>
                          )}
                          {editing && (
                            <>
                              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="sr-only"
                                aria-label={`Ganti ikon ${product.name}`}
                                disabled={isUploading === 'icon'}
                                onChange={(event) => {
                                  void uploadAsset('icon', event.target.files?.[0]);
                                  event.currentTarget.value = '';
                                }}
                              />
                            </>
                          )}
                        </label>
                        <div className="min-w-0">
                          <span className="block font-medium text-slate-900">{product.name}</span>
                          <span className="font-mono text-xs text-slate-500">{product.vendorCode}</span>
                          {editing ? (
                            <div className="mt-1 space-y-1">
                              <Input
                                aria-label={`Sumber produk ${product.name}`}
                                placeholder="Sumber (mis. Server 1)"
                                maxLength={40}
                                value={productDraft.vendorLabel}
                                onChange={(event) => setProductDraft((current) => current
                                  ? { ...current, vendorLabel: event.target.value }
                                  : current)}
                                className="h-8 w-44 text-xs"
                              />
                              <span className="block text-[10px] text-slate-500">
                                Tampil sebagai penanda di toko. Kosongkan untuk memakai nama vendor.
                              </span>
                              <Input
                                aria-label={`Tipe produk ${product.name}`}
                                placeholder="Tipe (mis. Combo Lite)"
                                maxLength={60}
                                value={productDraft.variant}
                                onChange={(event) => setProductDraft((current) => current
                                  ? { ...current, variant: event.target.value }
                                  : current)}
                                className="h-8 w-44 text-xs"
                              />
                              <span className="block text-[10px] text-slate-500">
                                Kosongkan agar tipe diambil ulang dari sync vendor.
                              </span>
                            </div>
                          ) : (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                {vendorLabelOf(product)}
                              </span>
                              {product.variant && (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  product.variantSource === 'manual'
                                    ? 'bg-sky-50 text-sky-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {product.variant}
                                  {product.variantSource === 'manual' ? ' · manual' : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatRupiah(product.basePrice)}</td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <div className="ml-auto w-32 space-y-1">
                          <Input
                            aria-label={`Harga jual ${product.name}`}
                            type="number"
                            min={product.basePrice}
                            step={1}
                            value={productDraft.sellPriceUser}
                            onChange={(event) => setProductDraft((current) => current
                              ? { ...current, sellPriceUser: Number(event.target.value) || 0 }
                              : current)}
                            className="h-9 text-right"
                          />
                          <Input
                              aria-label={`Markup jual ${product.name}`}
                              type="number"
                              min={0}
                              step={1}
                              value={productDraft.sellPriceUser - product.basePrice}
                              onChange={(event) => setProductDraft((current) => current
                                ? {
                                    ...current,
                                    sellPriceUser: product.basePrice + (Number(event.target.value) || 0),
                                  }
                                : current)}
                              className="h-8 text-right text-xs"
                          />
                          <span className="block text-right text-[10px] text-slate-500">Markup jual</span>
                        </div>
                      ) : (
                        <>
                          <span className="block font-semibold text-slate-900">{formatRupiah(product.sellPriceUser)}</span>
                          <span className="text-xs text-emerald-600">
                            Markup {formatRupiah(product.sellPriceUser - product.basePrice)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {editing ? (
                        <Input
                          aria-label={`Harga coret ${product.name}`}
                          type="number"
                          min={productDraft.sellPriceUser + 1}
                          step={1}
                          value={productDraft.compareAtPrice ?? ''}
                          onChange={(event) => setProductDraft((current) => current
                            ? {
                                ...current,
                                compareAtPrice: event.target.value ? Number(event.target.value) || 0 : null,
                              }
                            : current)}
                          className="ml-auto h-9 w-32 text-right"
                        />
                      ) : (
                        product.compareAtPrice ? formatRupiah(product.compareAtPrice) : '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {editing ? (
                        <div className="ml-auto w-32 space-y-1">
                          <Input
                            aria-label={`Harga member ${product.name}`}
                            type="number"
                            min={product.basePrice}
                            step={1}
                            value={productDraft.sellPriceAgent}
                            onChange={(event) => setProductDraft((current) => current
                              ? { ...current, sellPriceAgent: Number(event.target.value) || 0 }
                              : current)}
                            className="h-9 text-right"
                          />
                          <Input
                              aria-label={`Markup member ${product.name}`}
                              type="number"
                              min={0}
                              step={1}
                              value={productDraft.sellPriceAgent - product.basePrice}
                              onChange={(event) => setProductDraft((current) => current
                                ? {
                                    ...current,
                                    sellPriceAgent: product.basePrice + (Number(event.target.value) || 0),
                                  }
                                : current)}
                              className="h-8 text-right text-xs"
                          />
                          <span className="block text-right text-[10px] font-normal text-slate-500">Markup member</span>
                        </div>
                      ) : (
                        <>
                          <span className="block">{formatRupiah(product.sellPriceAgent)}</span>
                          <span className="text-xs font-normal text-emerald-600">
                            Markup {formatRupiah(product.sellPriceAgent - product.basePrice)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editing ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={productDraft.status === 'active'}
                          aria-label={`${productDraft.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'} ${product.name}`}
                          disabled={pending}
                          onClick={() => setProductDraft((current) => current
                            ? { ...current, status: current.status === 'active' ? 'inactive' : 'active' }
                            : current)}
                          className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 ${
                            productDraft.status === 'active' ? 'bg-amber-500' : 'bg-slate-300'
                          }`}
                        >
                          <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            productDraft.status === 'active' ? 'translate-x-5' : ''
                          }`} />
                        </button>
                      ) : (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingProductId(null);
                              setProductDraft(null);
                            }}
                            disabled={pending}
                          >
                            <X aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                            Batal
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void saveProductEdit(product)}
                            disabled={pending || invalidCompareAtPrice || invalidPrice}
                          >
                            <Save aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                            {pending ? 'Menyimpan…' : 'Simpan'}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => beginProductEdit(product)}
                          >
                            <Pencil aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          {product.status === 'active' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm(
                                  `Nonaktifkan "${product.name}"? Produk disembunyikan dari katalog, riwayat transaksi tetap tersimpan.`,
                                )) {
                                  void onToggleStatus(product, 'inactive');
                                }
                              }}
                            >
                              <Trash2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                              Hapus
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">Produk tidak ditemukan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {productPageCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <span>
              Produk {currentProductPage * productsPerPage + 1}–
              {Math.min(filteredProducts.length, (currentProductPage + 1) * productsPerPage)} dari{' '}
              {filteredProducts.length.toLocaleString('id-ID')}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentProductPage === 0}
                onClick={() => setProductPage(currentProductPage - 1)}
              >
                Sebelumnya
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentProductPage >= productPageCount - 1}
                onClick={() => setProductPage(currentProductPage + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ProductManagementPanel({
  products,
  view,
  onAdd,
  onToggleStatus,
}: {
  products: Product[];
  view: ProductAdminView;
  onAdd: () => void;
  onToggleStatus: (
    product: Product,
    status: Product['status'],
  ) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [vendor, setVendor] = useState<'all' | Product['vendor']>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [groupPage, setGroupPage] = useState(0);
  const [pricingPage, setPricingPage] = useState(0);
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const { bulkUpdateProductStatus } = usePPOB();

  // Everything below counts only the selected vendor, so a TokoVoucher filter
  // never shows Digiflazz totals.
  const vendorProducts = useMemo(
    () => products.filter((product) => {
      if (vendor !== 'all' && product.vendor !== vendor) return false;
      if (view === 'active' && product.status !== 'active') return false;
      if (view === 'inactive' && product.status !== 'inactive') return false;
      return true;
    }),
    [products, vendor, view],
  );

  const counts = useMemo(() => {
    let active = 0;
    for (const product of vendorProducts) {
      if (product.status === 'active') active += 1;
    }
    return {
      all: vendorProducts.length,
      active,
      inactive: vendorProducts.length - active,
    };
  }, [vendorProducts]);

  const categoryCounts = useMemo(() => {
    const tally = new Map<ProductCategory, number>();
    for (const product of vendorProducts) {
      tally.set(product.category, (tally.get(product.category) ?? 0) + 1);
    }
    return tally;
  }, [vendorProducts]);

  const availableCategories = useMemo(
    () => categoryOrder.filter((item) => categoryCounts.has(item)),
    [categoryCounts],
  );

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('id-ID');
    const filtered = vendorProducts.filter((product) => {
      if (category !== 'all' && product.category !== category) return false;
      if (!normalizedQuery) return true;
      return [
        product.name,
        product.vendorCode,
        product.operator,
        product.variant ?? '',
        product.category,
      ].some((value) => value.toLocaleLowerCase('id-ID').includes(normalizedQuery));
    });
    const direction = sortDirection === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'price') {
        const diff = a.sellPriceUser - b.sellPriceUser;
        if (diff !== 0) return diff * direction;
        return a.name.localeCompare(b.name, 'id');
      }
      return a.name.localeCompare(b.name, 'id') * direction;
    });
  }, [category, query, sortBy, sortDirection, vendorProducts]);

  // One pass over the visible products; the provider's full member list is
  // grouped from the same map instead of re-filtering 10k rows per group.
  // providerAlias lets two vendors selling the same brand share one row.
  const { providerGroups, groupTotal } = useMemo(() => {
    const membersByKey = new Map<string, Product[]>();
    for (const product of vendorProducts) {
      const key = providerGroupKey(product.category, product.operator, product.providerAlias);
      const members = membersByKey.get(key);
      if (members) members.push(product);
      else membersByKey.set(key, [product]);
    }

    const groups = new Map<string, ProviderGroup>();
    for (const product of visibleProducts) {
      const key = providerGroupKey(product.category, product.operator, product.providerAlias);
      const existing = groups.get(key);
      if (existing) {
        existing.products.push(product);
        if (!existing.vendors.includes(product.vendor)) existing.vendors.push(product.vendor);
        continue;
      }
      const allProducts = membersByKey.get(key) ?? [product];
      groups.set(key, {
        key,
        category: product.category,
        operator: resolveProviderName(product.operator, product.providerAlias),
        vendors: [product.vendor],
        products: [product],
        allProducts,
        activeCount: allProducts.filter((item) => item.status === 'active').length,
      });
    }

    const priceOf = (group: ProviderGroup) => {
      let cheapest = Number.POSITIVE_INFINITY;
      for (const product of group.allProducts) {
        if (product.sellPriceUser < cheapest) cheapest = product.sellPriceUser;
      }
      return Number.isFinite(cheapest) ? cheapest : 0;
    };
    const sorted = [...groups.values()].sort((a, b) => {
      const byCategory = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
      if (byCategory !== 0) return byCategory;
      const direction = sortDirection === 'desc' ? -1 : 1;
      if (sortBy === 'price') {
        const diff = priceOf(a) - priceOf(b);
        if (diff !== 0) return diff * direction;
        return a.operator.localeCompare(b.operator, 'id');
      }
      return a.operator.localeCompare(b.operator, 'id') * direction;
    });
    return { providerGroups: sorted, groupTotal: sorted.length };
  }, [sortBy, sortDirection, vendorProducts, visibleProducts]);

  const groupsPerPage = 25;
  const groupPageCount = Math.max(1, Math.ceil(groupTotal / groupsPerPage));
  const currentGroupPage = Math.min(groupPage, groupPageCount - 1);
  const pagedGroups = providerGroups.slice(
    currentGroupPage * groupsPerPage,
    currentGroupPage * groupsPerPage + groupsPerPage,
  );
  // The price table is a flat list, so it pages on its own.
  const pricingPerPage = 100;
  const pricingPageCount = Math.max(1, Math.ceil(visibleProducts.length / pricingPerPage));
  const currentPricingPage = Math.min(pricingPage, pricingPageCount - 1);
  const pagedVisibleProducts = visibleProducts.slice(
    currentPricingPage * pricingPerPage,
    currentPricingPage * pricingPerPage + pricingPerPage,
  );

  const viewDetails: Record<ProductAdminView, { title: string; description: string }> = {
    all: {
      title: 'Semua produk',
      description: 'Kelola katalog, harga, dan status produk.',
    },
    pricing: {
      title: 'Daftar harga & markup',
      description: 'Pengecekan harga modal, harga jual, dan markup produk. Perubahan dilakukan dari menu Kelola Produk.',
    },
    active: {
      title: 'Produk aktif',
      description: 'Produk aktif tersedia di katalog dan dapat dibeli pelanggan.',
    },
    inactive: {
      title: 'Produk nonaktif',
      description: 'Produk nonaktif disimpan, tetapi tidak ditampilkan di katalog publik.',
    },
  };

  const toggleProviderStatus = async (group: ProviderGroup) => {
    const shouldActivate = group.allProducts.some((product) => product.status !== 'active');
    const nextStatus = shouldActivate ? 'active' : 'inactive';
    const pendingIds = group.allProducts
      .filter((product) => product.status !== nextStatus)
      .map((product) => product.id);
    if (pendingIds.length === 0) return;
    setPendingProductIds((current) => new Set([...current, ...pendingIds]));
    try {
      await bulkUpdateProductStatus(pendingIds, nextStatus);
    } finally {
      setPendingProductIds((current) => {
        const next = new Set(current);
        pendingIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const details = viewDetails[view];
  const selectedGroup = providerGroups.find((group) => group.key === selectedGroupKey);

  if (selectedGroup && view !== 'pricing') {
    return (
      <ProviderDetailPanel
        group={selectedGroup}
        products={selectedGroup.allProducts}
        onBack={() => setSelectedGroupKey(null)}
        onToggleStatus={onToggleStatus}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ['Total produk', counts.all, 'text-slate-950'],
          ['Aktif', counts.active, 'text-emerald-700'],
          ['Nonaktif', counts.inactive, 'text-slate-500'],
        ] as const).map(([label, count, color]) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="text-sm text-slate-500">{label}</span>
              <span className={`text-xl font-semibold ${color}`}>
                {count.toLocaleString('id-ID')}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">{details.title}</CardTitle>
              <CardDescription className="mt-1">{details.description}</CardDescription>
            </div>
            {view !== 'pricing' && (
              <Button size="sm" onClick={onAdd}>
                Tambah produk
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="-mx-6 overflow-x-auto px-6 pb-1">
            <div className="flex min-w-max gap-2" role="group" aria-label="Kategori produk">
              {(['all', ...availableCategories] as const).map((item) => {
                const selected = category === item;
                const Icon = item === 'all' ? CircleDollarSign : categoryIcons[item];
                const count = item === 'all'
                  ? vendorProducts.length
                  : categoryCounts.get(item) ?? 0;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(item)}
                    className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      selected
                        ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    <span>{item === 'all' ? 'Semua' : categoryLabels[item]}</span>
                    <span className={`text-xs ${selected ? 'text-amber-200/80' : 'text-slate-400'}`}>
                      {count.toLocaleString('id-ID')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_12rem_auto]">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <Input
                aria-label="Cari produk"
                className="pl-9"
                placeholder="Cari nama, kode vendor, operator, tipe…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select
              aria-label="Filter vendor"
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={vendor}
              onChange={(event) => {
                setVendor(event.target.value as 'all' | Product['vendor']);
                // A category that exists only under the previous vendor would
                // otherwise leave the list empty with no way back.
                setCategory('all');
                setGroupPage(0);
              }}
            >
              <option value="all">Semua vendor</option>
              <option value="Digiflazz">Digiflazz</option>
              <option value="TokoVoucher">TokoVoucher</option>
              <option value="Manual">Manual</option>
            </select>
            <div className="flex gap-2">
              <select
                aria-label="Urutkan produk"
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as 'name' | 'price');
                  setGroupPage(0);
                  setPricingPage(0);
                }}
              >
                <option value="name">Urutkan: Nama</option>
                <option value="price">Urutkan: Harga</option>
              </select>
              <Button
                type="button"
                variant="outline"
                aria-label={sortDirection === 'asc' ? 'Urutan menaik' : 'Urutan menurun'}
                title={sortDirection === 'asc' ? 'Naik' : 'Turun'}
                onClick={() => {
                  setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                  setGroupPage(0);
                  setPricingPage(0);
                }}
              >
                {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Menampilkan {visibleProducts.length.toLocaleString('id-ID')} dari{' '}
              {vendorProducts.length.toLocaleString('id-ID')} produk
              {vendor !== 'all' && ` (${vendor})`}
            </span>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <CircleDollarSign className="h-3.5 w-3.5" />
              {view === 'pricing' ? 'Mode lihat saja' : 'Markup per produk'}
            </span>
          </div>

          {view === 'pricing' ? (
            visibleProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">Tidak ada produk yang cocok</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ubah kata pencarian atau filter kategori/vendor.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Produk</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3 text-right">Modal</th>
                      <th className="px-4 py-3 text-right">Harga Jual</th>
                      <th className="px-4 py-3 text-right">Markup Jual</th>
                      <th className="px-4 py-3 text-right">Harga Member</th>
                      <th className="px-4 py-3 text-right">Markup Member</th>
                      <th className="px-4 py-3 text-right">Harga Coret</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedVisibleProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <span className="block font-medium text-slate-900">{product.name}</span>
                          <span className="font-mono text-xs text-slate-500">{product.vendorCode}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block text-slate-700">{product.operator}</span>
                          <span className="text-xs text-slate-500">{categoryLabels[product.category]}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatRupiah(product.basePrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatRupiah(product.sellPriceUser)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {formatRupiah(product.sellPriceUser - product.basePrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatRupiah(product.sellPriceAgent)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {formatRupiah(product.sellPriceAgent - product.basePrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {product.compareAtPrice
                            ? formatRupiah(product.compareAtPrice)
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            product.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {product.status === 'active' ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pricingPageCount > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                    <span>
                      Produk {currentPricingPage * pricingPerPage + 1}–
                      {Math.min(visibleProducts.length, (currentPricingPage + 1) * pricingPerPage)} dari{' '}
                      {visibleProducts.length.toLocaleString('id-ID')}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={currentPricingPage === 0}
                        onClick={() => setPricingPage(currentPricingPage - 1)}
                      >
                        Sebelumnya
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={currentPricingPage >= pricingPageCount - 1}
                        onClick={() => setPricingPage(currentPricingPage + 1)}
                      >
                        Berikutnya
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : providerGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">
                Tidak ada produk yang cocok
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Ubah kata pencarian atau filter kategori/vendor.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1fr)_5rem_4rem] items-center gap-3 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_5rem]">
                  <span>#</span>
                  <span>Produk / Provider</span>
                  <span className="text-center">Status</span>
                  <span className="text-center">Aksi</span>
                </div>
                {pagedGroups.map((group, index) => {
                  const activeCount = group.activeCount;
                  const allActive = activeCount === group.allProducts.length;
                  const someActive = activeCount > 0;
                  const pending = group.allProducts.some((product) => pendingProductIds.has(product.id));
                  return (
                    <section key={group.key} className="border-t border-slate-200 first:border-t-0">
                      <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_5rem_4rem] items-center gap-3 px-4 py-2 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_5rem]">
                        <span className="text-xs text-slate-500">
                          {currentGroupPage * groupsPerPage + index + 1}
                        </span>
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-50 text-[10px] font-bold uppercase text-sky-700">
                            {group.operator.slice(0, 2)}
                          </span>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-slate-900">
                              {categoryLabels[group.category]} {group.operator}
                            </h3>
                            <p className="text-xs text-slate-500">
                              {group.allProducts.length} produk
                              {activeCount > 0 && activeCount < group.allProducts.length
                                ? ` · ${activeCount} aktif`
                                : ''}
                              {group.vendors.length > 1 ? ` · ${group.vendors.join(' · ')}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={allActive}
                            aria-label={`${allActive ? 'Nonaktifkan' : 'Aktifkan'} semua ${categoryLabels[group.category]} ${group.operator}`}
                            disabled={pending}
                            onClick={() => void toggleProviderStatus(group)}
                            className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                              someActive ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                          >
                            <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              someActive ? 'translate-x-5' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                        <div className="flex justify-center">
                          <button
                            type="button"
                            aria-label={`Edit ${categoryLabels[group.category]} ${group.operator}`}
                            onClick={() => setSelectedGroupKey(group.key)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                          >
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
              {groupPageCount > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                  <span>
                    Provider {currentGroupPage * groupsPerPage + 1}–
                    {Math.min(groupTotal, (currentGroupPage + 1) * groupsPerPage)} dari{' '}
                    {groupTotal.toLocaleString('id-ID')}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={currentGroupPage === 0}
                      onClick={() => setGroupPage(currentGroupPage - 1)}
                    >
                      Sebelumnya
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={currentGroupPage >= groupPageCount - 1}
                      onClick={() => setGroupPage(currentGroupPage + 1)}
                    >
                      Berikutnya
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
