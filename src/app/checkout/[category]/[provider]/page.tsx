'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import ProductCatalog from '@/components/ProductCatalog';
import DirectOrderModal from '@/components/DirectOrderModal';
import BottomNav from '@/components/BottomNav';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { usePPOB } from '@/context/PPOBContext';
import type { Product, ProductCategory } from '@/types/ppob';

const categories = new Set<ProductCategory>([
  'pulsa',
  'data',
  'voucher',
  'pln',
  'tagihan',
  'ewallet',
  'game',
]);

const categoryLabels: Record<ProductCategory, string> = {
  pulsa: 'Pulsa',
  data: 'Paket Data',
  voucher: 'Voucher',
  pln: 'Token Listrik',
  tagihan: 'Tagihan',
  ewallet: 'E-Wallet',
  game: 'Game',
};

function decodeRouteSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function ProviderCheckoutPage() {
  const params = useParams<{ category: string; provider: string }>();
  const router = useRouter();
  const { products, role } = usePPOB();
  const category = categories.has(params.category as ProductCategory)
    ? params.category as ProductCategory
    : null;
  const providerName = decodeRouteSegment(params.provider);
  const providerProducts = useMemo(
    () => products.filter((product) =>
      product.status === 'active' &&
      product.category === category &&
      product.operator.toLocaleLowerCase('id-ID') === providerName.toLocaleLowerCase('id-ID'),
    ),
    [category, products, providerName],
  );
  const provider = providerProducts[0];
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [destination, setDestination] = useState('');
  const [customerName, setCustomerName] = useState<string | undefined>();
  const [serverZoneId, setServerZoneId] = useState<string | undefined>();
  const [orderOpen, setOrderOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const selectedPrice = selectedProduct
    ? role === 'agent'
      ? selectedProduct.sellPriceAgent
      : selectedProduct.sellPriceUser
    : 0;

  const handleSelectProduct = (
    product: Product,
    target: string,
    customer?: string,
    zone?: string,
  ) => {
    setSelectedProduct(product);
    setDestination(target);
    setCustomerName(customer);
    setServerZoneId(zone);
  };

  if (!category) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Kategori tidak ditemukan</h1>
        <Link href="/" className="mt-4 inline-flex text-sm font-semibold text-violet-700">
          Kembali ke katalog
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f5fb] pb-28">
      <Header
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenHistory={() => router.push('/?tab=history')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal')}
        mobileBack
        onBack={() => router.push('/')}
      />

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Beranda</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/?category=${encodeURIComponent(category)}`}>
                {categoryLabels[category]}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{providerName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {provider?.providerCoverUrl && (
            <div
              role="img"
              aria-label={`Sampul ${providerName}`}
              className="h-36 bg-cover bg-center sm:h-52"
              style={{ backgroundImage: `url("${provider.providerCoverUrl}")` }}
            />
          )}
          <div className="flex items-center gap-3 p-4 sm:p-5">
            {provider?.providerIconUrl ? (
              <span
                role="img"
                aria-label={`Ikon ${providerName}`}
                className="h-12 w-12 shrink-0 rounded-xl bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${provider.providerIconUrl}")` }}
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-medium text-violet-700">{categoryLabels[category]}</p>
              <h1 className="text-xl font-bold text-slate-900">{providerName}</h1>
              {provider?.providerDescription && (
                <p className="mt-1 text-sm text-slate-600">{provider.providerDescription}</p>
              )}
            </div>
          </div>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {providerProducts.length === 0 ? (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="font-semibold text-slate-800">Layanan ini sedang tidak tersedia</p>
                <p className="mt-1 text-sm text-slate-500">
                  Produk {providerName} mungkin dinonaktifkan atau sudah tidak tersedia.
                </p>
                <Button className="mt-4" variant="outline" onClick={() => router.push('/')}>
                  Kembali ke katalog
                </Button>
              </section>
            ) : (
              <ProductCatalog
                key={`${category}:${providerName}`}
                view="provider"
                initialCategory={category}
                initialOperator={providerName}
                onSelectProduct={handleSelectProduct}
              />
            )}
          </div>
          <aside className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-5 lg:block">
            <h2 className="mb-4 text-base font-bold text-slate-900">Detail Pesanan</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{categoryLabels[category]}</dt>
                <dd className="text-right font-semibold text-slate-800">{providerName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Produk</dt>
                <dd className="text-right font-semibold text-slate-800">
                  {selectedProduct?.name ?? 'Pilih nominal terlebih dahulu'}
                </dd>
              </div>
              {destination && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Tujuan</dt>
                  <dd className="max-w-[65%] break-all text-right font-mono text-xs font-medium text-slate-800">
                    {destination}{serverZoneId ? ` (${serverZoneId})` : ''}
                  </dd>
                </div>
              )}
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between gap-3">
                  <dt className="font-semibold text-slate-700">Total Bayar</dt>
                  <dd className="font-bold text-violet-700">
                    Rp {selectedPrice.toLocaleString('id-ID')}
                  </dd>
                </div>
              </div>
            </dl>
            <Button
              className="mt-4 w-full bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => setOrderOpen(true)}
              disabled={!selectedProduct}
            >
              {selectedProduct ? 'Lanjut pembayaran' : 'Lengkapi Data'}
              {selectedProduct && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
              Pastikan data tujuan benar sebelum melanjutkan pesanan.
            </p>
          </aside>
        </div>
      </div>

      {selectedProduct ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-500">{selectedProduct.name}</p>
              <p className="font-bold text-slate-900">
                Rp {selectedPrice.toLocaleString('id-ID')}
              </p>
            </div>
            <Button
              onClick={() => setOrderOpen(true)}
              className="shrink-0 rounded-xl bg-violet-600 px-5 text-white hover:bg-violet-700"
            >
              Bayar
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <BottomNav
          activeTab="home"
          setActiveTab={() => {}}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenDeposit={() => setIsDepositOpen(true)}
          onOpenHome={() => router.push('/')}
          onOpenHistory={() => router.push('/?tab=history')}
          onOpenOrders={() => router.push('/cek-pesanan')}
          onOpenLegal={() => router.push('/legal')}
          className="lg:hidden"
        />
      )}

      <DirectOrderModal
        open={orderOpen}
        onOpenChange={setOrderOpen}
        product={selectedProduct}
        destination={destination}
        customerName={customerName}
        serverZoneId={serverZoneId}
      />
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
    </main>
  );
}
