'use client';

import React, { useEffect, useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { ClipboardCheck, Home, Megaphone, Plus, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { footerVisibilityEvent } from '@/components/StoreFooter';

type ActiveTab = 'home' | 'promo' | 'orders' | 'account';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenDeposit: () => void;
  onOpenAuth: () => void;
  onOpenHome?: () => void;
  onOpenPromo?: () => void;
  onOpenOrders?: () => void;
  onOpenAccount?: () => void;
  className?: string;
  dark?: boolean;
}

export default function BottomNav({
  activeTab,
  setActiveTab,
  onOpenDeposit,
  onOpenAuth,
  onOpenHome,
  onOpenPromo,
  onOpenOrders,
  onOpenAccount,
  className,
  dark = false,
}: BottomNavProps) {
  const { isGuest, authPending } = usePPOB();
  // The footer announces when it scrolls into view; the nav then slides out of the
  // way so it never covers the footer links, and slides back when it leaves.
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setFooterVisible(detail === true);
    };
    window.addEventListener(footerVisibilityEvent, handler);
    return () => window.removeEventListener(footerVisibilityEvent, handler);
  }, []);

  const itemClass = 'liquid-glass-nav-item flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:text-[11px]';

  return (
    <nav
      aria-label="Navigasi utama"
      aria-hidden={footerVisible || undefined}
      inert={footerVisible || undefined}
      className={cn(
        // Docked flush on mobile; still floating from sm: upwards.
        'liquid-glass-nav fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-none transition-[transform,opacity] duration-300 sm:inset-x-6 sm:bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-xl',
        footerVisible
          ? 'pointer-events-none translate-y-[130%] opacity-0'
          : 'translate-y-0 opacity-100',
        dark ? 'liquid-glass-nav-dark' : '',
        className,
      )}
    >
      <div className="grid h-[3.75rem] w-full grid-cols-5 items-center gap-0.5 sm:h-16 sm:gap-1">
        <button
          type="button"
          aria-current={activeTab === 'home' ? 'page' : undefined}
          aria-label="Beranda"
          title="Beranda"
          onClick={() => {
            setActiveTab('home');
            onOpenHome?.();
          }}
          className={itemClass}
        >
          <Home className="h-[19px] w-[19px]" aria-hidden="true" />
          <span>Beranda</span>
        </button>

        <button
          type="button"
          aria-current={activeTab === 'promo' ? 'page' : undefined}
          aria-label="Promo"
          title="Promo"
          onClick={() => {
            setActiveTab('promo');
            onOpenPromo?.();
          }}
          className={itemClass}
        >
          <Megaphone className="h-[19px] w-[19px]" aria-hidden="true" />
          <span>Promo</span>
        </button>

        <button
          type="button"
          aria-label={isGuest || authPending ? 'Masuk untuk top up' : 'Top up saldo'}
          title={isGuest || authPending ? 'Masuk untuk top up' : 'Top up saldo'}
          onClick={isGuest || authPending ? onOpenAuth : onOpenDeposit}
          className={cn(itemClass, 'liquid-glass-nav-accent h-full w-full justify-center')}
        >
          <Plus className="h-[19px] w-[19px]" aria-hidden="true" />
          <span className="text-[9px] font-semibold leading-none sm:text-[10px]">
            {isGuest || authPending ? 'Masuk' : 'Isi saldo'}
          </span>
        </button>

        <button
          type="button"
          aria-current={activeTab === 'orders' ? 'page' : undefined}
          aria-label="Cek pesanan"
          title="Cek pesanan"
          onClick={() => onOpenOrders?.()}
          className={itemClass}
        >
          <ClipboardCheck className="h-[19px] w-[19px]" aria-hidden="true" />
          <span>Pesanan</span>
        </button>

        <button
          type="button"
          aria-current={activeTab === 'account' ? 'page' : undefined}
          aria-label={isGuest ? 'Masuk ke akun' : 'Akun saya'}
          title={isGuest ? 'Masuk ke akun' : 'Akun saya'}
          onClick={() => {
            if (isGuest || authPending) {
              onOpenAuth();
              return;
            }
            onOpenAccount?.();
          }}
          className={itemClass}
        >
          <UserRound className="h-[19px] w-[19px]" aria-hidden="true" />
          <span>Akun</span>
        </button>
      </div>
    </nav>
  );
}
