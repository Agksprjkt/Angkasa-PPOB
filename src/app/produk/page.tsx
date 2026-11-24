'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight,
  FileText,
  Gamepad2,
  Smartphone,
  Ticket,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import { Skeleton } from '@/components/ui/skeleton';
import { usePPOB } from '@/context/PPOBContext';
import type { ProductCategory } from '@/types/ppob';

const categoryOrder: ProductCategory[] = [
  'game',
  'voucher',
  'pulsa',
  'data',
  'pln',
  'tagihan',
  'ewallet',
];

const categoryLabels: Record<ProductCategory, string> = {
  pulsa: 'Pulsa',
  data: 'Paket Data',
  voucher: 'Voucher',
  ewallet: 'E-Wallet',
  game: 'Top Up',
  pln: 'Token Listrik',
  tagihan: 'Tagihan',
};

const categoryIcons: Record<ProductCategory, LucideIcon> = {
  pulsa: Smartphone,
  data: Wifi,
  voucher: Ticket,
  ewallet: Wallet,
  game: Gamepad2,
  pln: Zap,
  tagihan: FileText,
};

const PAGE_SIZE = 12;

type Provider = {
  key: string;
  category: ProductCategory;
  operator: string;
  count: number;
  fromPrice: number;
  iconUrl: string | null;
};

function formatCurrency(amount: number) {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Navigasi halaman">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition enabled:hover:border-blue-200 enabled:hover:text-blue-700 disabled:opacity-40"
      >
        Sebelumnya
      </button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
        <button
          key={number}
          type="button"
          onClick={() => onChange(number)}
          aria-current={number === page ? 'page' : undefined}
          className={`min-h-9 min-w-9 rounded-lg border px-2 text-xs font-semibold transition ${
            number === page
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
          }`}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition enabled:hover:border-blue-200 enabled:hover:text-blue-700 disabled:opacity-40"
      >
        Berikutnya
      </button>
    </nav>
  );
}

export default function AllProductsPage() {
  const router = useRouter();
  const { products, role, catalogPending, isGuest, authPending } = usePPOB();
  const [pages, setPages] = useState<Record<string, number>>({});
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  const sections = useMemo(() => {
    const groups = new Map<string, Provider>();
    products
      .filter((product) => product.status === 'active')
      .forEach((product) => {
        const operator = product.operator.trim();
        const key = `${product.category}:${operator.toLocaleLowerCase('id-ID')}`;
        const price = role === 'agent'
          ? product.sellPriceAgent ?? product.sellPriceUser
          : product.sellPriceUser;
        const existing = groups.get(key);
        if (existing) {
          existing.count += 1;
          existing.fromPrice = Math.min(existing.fromPrice, price);
          existing.iconUrl ??= product.providerIconUrl ?? product.providerCoverUrl ?? null;
          return;
        }
        groups.set(key, {
          key,
          category: product.category,
          operator,
          count: 1,
          fromPrice: price,
          iconUrl: product.providerIconUrl ?? product.providerCoverUrl ?? null,
        });
      });

    return categoryOrder
      .map((category) => ({
        category,
        label: categoryLabels[category],
        items: [...groups.values()]
          .filter((group) => group.category === category)
          .sort((a, b) => a.operator.localeCompare(b.operator, 'id')),
      }))
      .filter((section) => section.items.length > 0);
  }, [products, role]);

  const dashboardPath = role === 'admin'
    ? '/admin'
    : role === 'agent'
      ? '/agent'
      : '/dashboard';

  return (
    <div className="min-h-screen bg-transparent font-sans text-slate-900">
      <div className="relative flex min-h-screen flex-col pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-10">
        <Header
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenHome={() => router.push('/')}
          onOpenOrders={() => router.push('/cek-pesanan')}
          onOpenLegal={() => router.push('/legal')}
          onOpenDeposit={() =>
            isGuest || authPending ? setIsAuthOpen(true) : setIsDepositOpen(true)
          }
          showDesktopNavigation
          activeTab="home"
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Semua produk</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Semua layanan aktif, dikelompokkan per kategori.
                </p>
              </div>
              <Link href="/" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
                Kembali ke beranda
              </Link>
            </div>

            {catalogPending ? (
              <div className="space-y-8">
                {Array.from({ length: 2 }).map((_, sectionIndex) => (
                  <section key={sectionIndex} className="space-y-4">
                    <Skeleton className="h-5 w-32" />
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                      {Array.from({ length: 4 }).map((__, index) => (
                        <div
                          key={index}
                          className="liquid-surface flex min-h-[7.5rem] flex-col justify-between gap-2 rounded-2xl border border-white/80 bg-white/55 p-3"
                        >
                          <Skeleton className="h-11 w-11 rounded-xl" />
                          <div className="space-y-2">
                            <Skeleton className="h-3.5 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : sections.length === 0 ? (
              <div className="liquid-surface rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
                <p className="text-sm font-semibold text-slate-700">Belum ada layanan</p>
                <p className="mt-1 text-xs text-slate-500">
                  Layanan aktif akan tampil di sini setelah disiapkan admin.
                </p>
              </div>
            ) : (
              sections.map(({ category, label, items }) => {
                const Icon = categoryIcons[category];
                const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
                const page = Math.min(Math.max(pages[category] ?? 1, 1), totalPages);
                const shown = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
                const changePage = (next: number) => {
                  const target = Math.min(Math.max(next, 1), totalPages);
                  setPages((current) => ({ ...current, [category]: target }));
                  document
                    .getElementById(`section-${category}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                };
                return (
                  <section
                    key={category}
                    aria-labelledby={`section-${category}`}
                    className="scroll-mt-24 space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <h2
                        id={`section-${category}`}
                        className="text-base font-bold text-slate-900 sm:text-lg"
                      >
                        {label}
                      </h2>
                      <span className="ml-auto text-xs text-slate-500">
                        {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + shown.length} dari {items.length}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                      {shown.map(({ key, operator, count, fromPrice, iconUrl }) => (
                        <Link
                          key={key}
                          href={`/checkout/${encodeURIComponent(category)}/${encodeURIComponent(operator)}`}
                          className="liquid-surface group flex min-h-[7.5rem] flex-col justify-between gap-2 rounded-2xl border border-white/80 bg-white/55 p-3 transition hover:border-blue-200 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl text-cyan-700">
                            {iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={iconUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Icon className="h-6 w-6" aria-hidden="true" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {operator}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                              {count} produk
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-1">
                              <span className="text-[11px] font-semibold text-blue-700">
                                mulai {formatCurrency(fromPrice)}
                              </span>
                              <ChevronRight
                                className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
                                aria-hidden="true"
                              />
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <Pagination page={page} totalPages={totalPages} onChange={changePage} />
                    )}
                  </section>
                );
              })
            )}
          </div>
        </main>

        <BottomNav
          activeTab="home"
          setActiveTab={() => {}}
          className="lg:hidden"
          onOpenHome={() => router.push('/')}
          onOpenPromo={() => router.push('/promo')}
          onOpenOrders={() => router.push('/cek-pesanan')}
          onOpenAccount={() => router.push(dashboardPath)}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenDeposit={() => setIsDepositOpen(true)}
        />
        <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
        <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
      </div>
    </div>
  );
}
