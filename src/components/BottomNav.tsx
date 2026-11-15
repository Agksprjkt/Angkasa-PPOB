'use client';

import React from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { ClipboardCheck, FileText, Home, History, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type ActiveTab = 'home' | 'history' | 'orders' | 'legal';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenDeposit: () => void;
  onOpenAuth: () => void;
  onOpenHome?: () => void;
  onOpenHistory?: () => void;
  onOpenOrders?: () => void;
  onOpenLegal?: () => void;
  className?: string;
}

export default function BottomNav({
  activeTab,
  setActiveTab,
  onOpenDeposit,
  onOpenAuth,
  onOpenHome,
  onOpenHistory,
  onOpenOrders,
  onOpenLegal,
  className,
}: BottomNavProps) {
  const { isGuest, authPending } = usePPOB();

  const iconButtonClass = (isActive: boolean) =>
    `flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:text-[11px] ${
      isActive
        ? 'bg-blue-50 text-blue-700'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
    }`;

  return (
    <nav
      aria-label="Navigasi utama"
      className={cn(
        'fixed inset-x-3 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:inset-x-5 sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:p-2',
        className,
      )}
    >
      <div className="grid h-[3.75rem] w-full grid-cols-5 items-center gap-1 sm:h-16 sm:gap-2">
        <button
          type="button"
          aria-current={activeTab === 'home' ? 'page' : undefined}
          aria-label="Beranda"
          title="Beranda"
          onClick={() => {
            setActiveTab('home');
            onOpenHome?.();
          }}
          className={iconButtonClass(activeTab === 'home')}
        >
          <Home className="h-[18px] w-[18px]" aria-hidden="true" />
          <span>Beranda</span>
        </button>

        <button
          type="button"
          aria-current={activeTab === 'history' ? 'page' : undefined}
          aria-label="Riwayat transaksi"
          title="Riwayat transaksi"
          onClick={() => {
            setActiveTab('history');
            onOpenHistory?.();
          }}
          className={iconButtonClass(activeTab === 'history')}
        >
          <History className="h-[18px] w-[18px]" aria-hidden="true" />
          <span>Riwayat</span>
        </button>

        <button
          type="button"
          aria-label={isGuest || authPending ? 'Masuk untuk top up' : 'Top up saldo'}
          title={isGuest || authPending ? 'Masuk untuk top up' : 'Top up saldo'}
          onClick={isGuest || authPending ? onOpenAuth : onOpenDeposit}
          className="mx-auto flex h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-blue-700 px-2 text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:h-12 sm:min-w-20 sm:flex-row sm:gap-1.5 sm:px-3"
        >
          <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="text-[10px] font-semibold leading-none sm:text-[11px]">
            {isGuest || authPending ? 'Masuk' : 'Isi saldo'}
          </span>
        </button>

        <button
          type="button"
          aria-current={activeTab === 'orders' ? 'page' : undefined}
          aria-label="Cek pesanan"
          title="Cek pesanan"
          onClick={onOpenOrders}
          className={iconButtonClass(activeTab === 'orders')}
        >
          <ClipboardCheck className="h-[18px] w-[18px]" aria-hidden="true" />
          <span>Pesanan</span>
        </button>

        <button
          type="button"
          aria-current={activeTab === 'legal' ? 'page' : undefined}
          aria-label="Dokumen legal"
          title="Dokumen legal"
          onClick={onOpenLegal}
          className={iconButtonClass(activeTab === 'legal')}
        >
          <FileText className="h-[18px] w-[18px]" aria-hidden="true" />
          <span>Legal</span>
        </button>
      </div>
    </nav>
  );
}
