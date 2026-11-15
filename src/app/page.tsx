'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePPOB } from '@/context/PPOBContext';
import { Product, ProductCategory, Transaction } from '@/types/ppob';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import BalanceCard from '@/components/BalanceCard';
import ProductCatalog from '@/components/ProductCatalog';
import DirectOrderModal from '@/components/DirectOrderModal';
import ReceiptModal from '@/components/ReceiptModal';
import DepositModal from '@/components/DepositModal';
import AuthModal from '@/components/AuthModal';
import HistoryView from '@/components/HistoryView';
import type { BeforeInstallPromptEvent } from '@/types/pwa';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Receipt,
  Headphones,
} from 'lucide-react';

const productCategories: ProductCategory[] = [
  'pulsa',
  'data',
  'voucher',
  'pln',
  'tagihan',
  'ewallet',
  'game',
];

const productCategoryLabels: Record<ProductCategory, string> = {
  pulsa: 'Pulsa',
  data: 'Paket Data',
  voucher: 'Voucher',
  pln: 'Token Listrik',
  tagihan: 'Tagihan',
  ewallet: 'E-Wallet',
  game: 'Game',
};

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, isGuest, authPending, transactions, addToast } = usePPOB();

  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'orders' | 'legal'>('home');
  const requestedCategory = searchParams.get('category');
  const homeCategory =
    requestedCategory && productCategories.includes(requestedCategory as ProductCategory)
      ? requestedCategory as ProductCategory
      : 'pulsa';
  const isCategoryMenu = Boolean(
    requestedCategory && productCategories.includes(requestedCategory as ProductCategory),
  );

  // Modals state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [destinationNumber, setDestinationNumber] = useState<string>('');
  const [customerName, setCustomerName] = useState<string | undefined>(undefined);
  const [serverZoneId, setServerZoneId] = useState<string | undefined>(undefined);
  const [activeReceipt, setActiveReceipt] = useState<Transaction | null>(null);

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [supportPhone, setSupportPhone] = useState('');

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const timeoutId = window.setTimeout(() => {
      if (searchParams.get('tab') === 'history') setActiveTab('history');
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/store-settings', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return '';
        const settings = await response.json() as { supportPhone?: unknown };
        const phone = typeof settings.supportPhone === 'string'
          ? settings.supportPhone.trim()
          : '';
        const digits = phone.replace(/\D/g, '');
        return digits.length >= 8 ? phone : '';
      })
      .then(setSupportPhone)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setSupportPhone('');
        }
      });
    return () => controller.abort();
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA install outcome: ${outcome}`);
    setDeferredPrompt(null);
  };

  const handleSelectProduct = (
    product: Product,
    destination: string,
    custName?: string,
    zoneId?: string
  ) => {
    setSelectedProduct(product);
    setDestinationNumber(destination);
    setCustomerName(custName);
    setServerZoneId(zoneId);
    setIsOrderModalOpen(true);
  };

  const handleSelectReceipt = (transaction: Transaction) => {
    setActiveReceipt(transaction);
    void fetch(`/api/orders/${encodeURIComponent(transaction.id)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json() as {
          transaction?: Transaction;
          error?: string;
        };
        if (!response.ok || !result.transaction || result.transaction.id !== transaction.id) {
          throw new Error(result.error ?? 'Detail transaksi gagal dimuat.');
        }
        setActiveReceipt((current) =>
          current?.id === transaction.id ? result.transaction ?? current : current,
        );
      })
      .catch((error: unknown) => {
        addToast(
          'Detail Belum Diperbarui',
          error instanceof Error
            ? `${error.message} Data terakhir yang tersedia tetap ditampilkan.`
            : 'Data terakhir yang tersedia tetap ditampilkan.',
          'warning',
        );
      });
  };

  const recentTransactions = transactions.slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Top Navigation */}
      <Header
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenHistory={() => setActiveTab('history')}
        pwaInstallPrompt={deferredPrompt}
        onInstallPwa={handleInstallPwa}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        {/* VIEW 3: RIWAYAT TRANSAKSI & MUTASI */}
        {activeTab === 'history' && !authPending && (
          <div className="space-y-6 animate-fadeIn">
            <HistoryView
              key={currentUser?.id ?? 'guest'}
              onSelectReceipt={handleSelectReceipt}
              onRequireAuth={() => setIsAuthModalOpen(true)}
            />
          </div>
        )}

        {/* VIEW 4: HOME (USER & GUEST STOREFRONT) */}
        {activeTab === 'home' && (
          <div className={`grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6 items-start animate-fadeIn ${
            isCategoryMenu ? 'max-w-6xl mx-auto' : ''
          }`}>
            {/* Left Primary Column: Balance Card & Catalog */}
            <div className={`${isCategoryMenu ? 'lg:col-span-12' : 'lg:col-span-8'} min-w-0 space-y-5`}>
              {/* Balance Card or Guest Banner */}
              {!isCategoryMenu && authPending ? (
                <div
                  aria-label="Memuat akun"
                  className="h-40 animate-pulse rounded-3xl border border-slate-200 bg-white"
                />
              ) : !isCategoryMenu && !isGuest ? (
                <BalanceCard
                  onOpenDeposit={() => setIsDepositModalOpen(true)}
                  onOpenMutations={() => setActiveTab('history')}
                />
              ) : !isCategoryMenu ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Belanja tanpa harus masuk
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Buat akun jika ingin menyimpan saldo dan melihat riwayat transaksi.
                    </p>
                  </div>

                  <Button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="h-9 shrink-0 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Masuk / Daftar
                  </Button>
                </div>
              ) : null}

              {/* Product Catalog */}
              {isCategoryMenu && (
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="/">Beranda</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{productCategoryLabels[homeCategory]}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              )}
              <ProductCatalog
                key={homeCategory}
                initialCategory={homeCategory}
                onCategoryChange={isCategoryMenu
                  ? (category) => router.push(`/?category=${encodeURIComponent(category)}`)
                  : undefined}
                onSelectProduct={handleSelectProduct}
              />
            </div>

            {/* Right Secondary Column: Quick Sidebar for Desktop */}
            {!isCategoryMenu && <div className="hidden lg:col-span-4 lg:block space-y-5">
              {/* Recent Transactions Widget */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-sm text-slate-900">Transaksi Terakhir</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="text-xs text-blue-600 hover:underline font-semibold"
                  >
                    Lihat Semua
                  </button>
                </div>

                {recentTransactions.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">Belum ada transaksi</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recentTransactions.map((trx) => (
                      <button
                        type="button"
                        key={trx.id}
                        onClick={() => handleSelectReceipt(trx)}
                        aria-label={`Lihat detail transaksi ${trx.referenceId}`}
                        className="flex w-full items-center justify-between gap-3 py-3 text-left text-xs transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 truncate max-w-[160px]">
                            {trx.productName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {trx.destination}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-slate-900 font-sans">
                            Rp {trx.amount.toLocaleString('id-ID')}
                          </div>
                          <Badge
                            variant={trx.status === 'success' ? 'success' : trx.status === 'pending' ? 'warning' : 'destructive'}
                            className="text-[9px] font-bold"
                          >
                            {trx.status.toUpperCase()}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Help & Support Banner */}
              {supportPhone && (
              <a
                href={`https://wa.me/${supportPhone.replace(/\D/g, '').replace(/^0/, '62')}`}
                target="_blank"
                rel="noreferrer"
                className="p-4 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-between text-xs text-slate-700 transition-colors hover:bg-slate-200/70"
              >
                <div className="flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-blue-600" />
                  <div>
                    <div className="font-bold text-slate-900">Bantuan melalui WhatsApp</div>
                    <div className="text-[11px] text-slate-500">{supportPhone}</div>
                  </div>
                </div>
              </a>
              )}
            </div>}
          </div>
        )}
      </main>

      {/* Direct Order Modal (Anonymous / Direct Payment or Wallet) */}
      <DirectOrderModal
        open={isOrderModalOpen}
        onOpenChange={setIsOrderModalOpen}
        product={selectedProduct}
        destination={destinationNumber}
        customerName={customerName}
        serverZoneId={serverZoneId}
      />

      {/* Auth Modal (Login / Register / Role Switch) */}
      <AuthModal
        open={isAuthModalOpen}
        onOpenChange={setIsAuthModalOpen}
      />

      {/* Digital Receipt Modal */}
      {activeReceipt && (
        <ReceiptModal
          transaction={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}

      {/* Deposit Modal */}
      <DepositModal
        open={isDepositModalOpen}
        onOpenChange={setIsDepositModalOpen}
      />

      {/* PWA Floating Install Prompt */}

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenDeposit={() =>
          isGuest || authPending
            ? setIsAuthModalOpen(true)
            : setIsDepositModalOpen(true)
        }
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal')}
      />
    </div>
  );
}
