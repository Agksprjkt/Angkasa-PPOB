'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import PromotionSlider from '@/components/PromotionSlider';
import StorefrontSections from '@/components/StorefrontSections';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import { usePPOB } from '@/context/PPOBContext';

export default function PromoPage() {
  const router = useRouter();
  const { role, isGuest, authPending } = usePPOB();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);

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
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Promo</h1>
              <p className="mt-1 text-sm text-slate-600">
                Penawaran aktif, flash sale, dan layanan pilihan untukmu.
              </p>
            </div>
            <PromotionSlider />
            <StorefrontSections />
          </div>
        </main>

        <BottomNav
          activeTab="promo"
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
