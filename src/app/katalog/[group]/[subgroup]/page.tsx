'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import ProductCatalog from '@/components/ProductCatalog';
import BillInquiryFlow from '@/components/BillInquiryFlow';
import { usePPOB } from '@/context/PPOBContext';
import type { Product } from '@/types/ppob';

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function CatalogSubgroupPage() {
  const params = useParams<{ group: string; subgroup: string }>();
  const router = useRouter();
  const { catalogGroups, catalogSubgroups, products, catalogPending } = usePPOB();
  const groupSlug = decodeSegment(params.group);
  const subgroupSlug = decodeSegment(params.subgroup);

  const group = catalogGroups.find((row) => row.slug === groupSlug) ?? null;
  const subgroup = catalogSubgroups.find(
    (row) => row.slug === subgroupSlug && (!group || row.groupId === group.id),
  ) ?? null;
  const subgroupProducts = useMemo(
    () => (subgroup
      ? products.filter((product) => product.subgroupId === subgroup.id)
      : []),
    [products, subgroup],
  );

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const dashboardPath = '/dashboard';

  const handleSelectProduct = (
    product: Product,
    destination: string,
    customerName?: string,
    serverZoneId?: string,
  ) => {
    const query = new URLSearchParams({ destination });
    if (customerName) query.set('name', customerName);
    if (serverZoneId) query.set('zone', serverZoneId);
    router.push(`/checkout/${encodeURIComponent(product.category)}/${encodeURIComponent(product.operator)}?${query}`);
  };

  if (catalogPending) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-slate-500">
        Memuat katalog...
      </main>
    );
  }

  if (!group || !subgroup) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Layanan tidak ditemukan</h1>
        <Link href="/" className="mt-4 inline-flex text-sm font-semibold text-sky-700">
          Kembali ke beranda
        </Link>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white pb-28">
      <Header
        activeTab="home"
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenDeposit={() => setIsDepositOpen(true)}
        mobileBack
        backFallback="/"
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <Link href="/" className="hover:text-blue-700">Beranda</Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-slate-700">{group.label}</span>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-slate-900">{subgroup.label}</span>
        </nav>

        <header className="mb-5">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{subgroup.label}</h1>
          {subgroup.description && (
            <p className="mt-1 text-sm text-slate-600">{subgroup.description}</p>
          )}
        </header>

        {subgroupProducts.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-semibold text-slate-800">Belum ada produk aktif di layanan ini</p>
            <p className="mt-1 text-sm text-slate-500">
              Produk subkategori {subgroup.label} ada, tetapi belum ada yang aktif atau belum
              dipetakan. Admin mengaktifkan dan memetakannya di dashboard.
            </p>
          </section>
        ) : group.kind === 'postpaid' ? (
          <BillInquiryFlow
            subgroup={subgroup}
            products={subgroupProducts}
            onRequireAuth={() => setIsAuthOpen(true)}
          />
        ) : (
          <ProductCatalog
            key={`${group.id}:${subgroup.id}`}
            view="provider"
            subgroupId={subgroup.id}
            initialCategory={subgroupProducts[0].category}
            onSelectProduct={handleSelectProduct}
          />
        )}
      </main>

      <BottomNav
        activeTab="home"
        setActiveTab={() => {}}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenDeposit={() => setIsDepositOpen(true)}
        onOpenHome={() => router.push('/')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenAccount={() => router.push(dashboardPath)}
        className="lg:hidden"
      />
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
    </div>
  );
}
