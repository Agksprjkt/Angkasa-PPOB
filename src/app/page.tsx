'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePPOB } from '@/context/PPOBContext';
import { Product, ProductCategory } from '@/types/ppob';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import PromotionSlider from '@/components/PromotionSlider';
import StorefrontSections from '@/components/StorefrontSections';
import ProductCatalog from '@/components/ProductCatalog';
import StoreFooter from '@/components/StoreFooter';
import DirectOrderModal from '@/components/DirectOrderModal';
import DepositModal from '@/components/DepositModal';
import AuthModal from '@/components/AuthModal';
import type { BeforeInstallPromptEvent } from '@/types/pwa';

const productCategories: ProductCategory[] = [
  'pulsa',
  'data',
  'voucher',
  'pln',
  'tagihan',
  'ewallet',
  'game',
];

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isGuest, authPending, role, storeName, storeTagline, storeSocialLinks } = usePPOB();

  const [activeTab, setActiveTab] = useState<'home' | 'promo' | 'orders' | 'account'>('home');
  const requestedCategory = searchParams.get('category');
  const catalogSearch = searchParams.get('search')?.trim() ?? '';
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

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [supportPhone, setSupportPhone] = useState('');

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

  return (
    <div className="min-h-screen bg-transparent font-sans text-slate-900 selection:bg-blue-200 selection:text-slate-950">
      <div className="relative flex min-h-screen flex-col lg:pb-0">
        <Header
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onOpenHome={() => {
            setActiveTab('home');
            router.push('/');
          }}
          onOpenHistory={() => router.push('/dashboard/transactions')}
          onOpenOrders={() => {
            setActiveTab('orders');
            router.push('/cek-pesanan');
          }}
          onOpenDeposit={() =>
            isGuest || authPending
              ? setIsAuthModalOpen(true)
              : setIsDepositModalOpen(true)
          }
          showDesktopNavigation
          activeTab="home"
          mobileBack={isCategoryMenu}
          backFallback="/"
          transparentUntilScroll
          pwaInstallPrompt={deferredPrompt}
          onInstallPwa={handleInstallPwa}
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className={`space-y-8 animate-fadeIn ${isCategoryMenu ? 'mx-auto max-w-6xl' : ''}`}>
              {!isCategoryMenu && (
                <div className="mx-auto max-w-7xl">
                  <PromotionSlider />
                </div>
              )}
              {!isCategoryMenu && (
                <div className="mx-auto max-w-6xl">
                  <StorefrontSections />
                </div>
              )}

              <div className="grid grid-cols-1 items-start gap-5">
                <div className="mx-auto w-full max-w-6xl min-w-0 space-y-5">
                  <section id="product-catalog" aria-label="Katalog produk" className="scroll-mt-36">
                    <ProductCatalog
                      key={`${homeCategory}:${catalogSearch}`}
                      initialCategory={homeCategory}
                      initialSearch={catalogSearch}
                      onCategoryChange={isCategoryMenu
                        ? (category) => router.push(`/?category=${encodeURIComponent(category)}`)
                        : undefined}
                      onSelectProduct={handleSelectProduct}
                    />
                  </section>
                </div>
              </div>
          </div>
        </main>

        <StoreFooter
          storeName={storeName}
          tagline={storeTagline}
          socialLinks={storeSocialLinks}
          supportPhone={supportPhone}
        />

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
        onOpenHome={() => {
          setActiveTab('home');
          router.push('/');
        }}
        onOpenPromo={() => {
          setActiveTab('promo');
          router.push('/promo');
        }}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenAccount={() => router.push(
          role === 'admin' ? '/admin' : role === 'agent' ? '/agent' : '/dashboard',
        )}
        className="lg:hidden"
      />
      </div>
    </div>
  );
}
