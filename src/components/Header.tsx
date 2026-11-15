'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePPOB } from '@/context/PPOBContext';
import {
  ArrowLeft,
  Bell,
  CircleAlert,
  CheckCircle2,
  Download,
  FileText,
  History,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  ClipboardCheck,
  UserRound,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { BeforeInstallPromptEvent } from '@/types/pwa';
import { DEFAULT_STORE_NAME } from '@/lib/store-branding';

interface HeaderProps {
  onOpenAuth: () => void;
  onOpenHistory: () => void;
  onOpenOrders?: () => void;
  onOpenLegal?: () => void;
  mobileBack?: boolean;
  onBack?: () => void;
  mobileMenuMode?: boolean;
  mobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
  pwaInstallPrompt?: BeforeInstallPromptEvent | null;
  onInstallPwa?: () => void;
}

type StoreIdentity = {
  storeName: string;
  logoUrl: string | null;
};

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('id-ID') ?? '')
    .join('') || '?';
}

export default function Header({
  onOpenAuth,
  onOpenHistory,
  onOpenOrders,
  onOpenLegal,
  mobileBack = false,
  onBack,
  mobileMenuMode = false,
  mobileMenuOpen = false,
  onMobileMenuToggle,
  pwaInstallPrompt,
  onInstallPwa,
}: HeaderProps) {
  const { currentUser, role, isGuest, authPending, logout, transactions, storeName } = usePPOB();
  const router = useRouter();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [storeIdentity, setStoreIdentity] = useState<StoreIdentity | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const notifications = transactions
    .filter((transaction) => transaction.status === 'pending' || transaction.status === 'failed')
    .slice(0, 5);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/store-settings', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Partial<StoreIdentity> & { error?: string };
        if (!response.ok || typeof body.storeName !== 'string') {
          throw new Error(body.error ?? 'Identitas toko gagal dimuat.');
        }
        setStoreIdentity({
          storeName: body.storeName,
          logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl : null,
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('[STORE_IDENTITY_HEADER_LOAD_FAILED]', error);
          setStoreIdentity({ storeName: DEFAULT_STORE_NAME, logoUrl: null });
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
        setIsProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="relative z-30 px-4 pt-3 sm:px-6 sm:pt-5">
      <div
        ref={actionsRef}
        className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
      >
        <div className="relative flex items-center gap-2.5">
          <button
            type="button"
            aria-label={currentUser ? `Profil ${currentUser.name}` : 'Profil akun'}
            aria-expanded={isProfileOpen}
            disabled={authPending}
            onClick={() => {
              setIsProfileOpen((open) => !open);
              setIsNotificationsOpen(false);
            }}
            className={`${mobileMenuMode ? 'hidden md:flex' : 'flex'} h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-blue-100 text-xs font-bold text-blue-800 shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:animate-pulse`}
          >
            {currentUser ? getInitials(currentUser.name) : <UserRound className="h-4 w-4" aria-hidden="true" />}
          </button>
          {mobileMenuMode && <button
            type="button"
            aria-label="Navigasi dokumen legal"
            aria-expanded={mobileMenuOpen}
            onClick={() => {
              onMobileMenuToggle?.();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 md:hidden"
          >
            {mobileMenuOpen
              ? <X className="h-5 w-5" aria-hidden="true" />
              : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>}
          {!mobileMenuMode && isProfileOpen && (currentUser || isGuest) && (
            <div className="absolute left-0 top-12 z-50 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="truncate text-sm font-semibold text-slate-900">{currentUser?.name ?? 'Tamu'}</p>
                <p className="mt-0.5 text-xs capitalize text-slate-500">
                  {currentUser ? role === 'agent' ? 'Member' : role === 'user' ? 'Pelanggan' : 'Admin' : 'Belum masuk'}
                </p>
              </div>
              <div className="space-y-1 p-2">
                <Link
                  href="/"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Home className="h-4 w-4" aria-hidden="true" />
                  Beranda
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    onOpenHistory();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                  Riwayat transaksi
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    if (onOpenOrders) onOpenOrders();
                    else router.push('/cek-pesanan');
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  Cek pesanan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    if (onOpenLegal) onOpenLegal();
                    else router.push('/legal');
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Dokumen legal
                </button>
                {isGuest && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      onOpenAuth();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    Masuk / Daftar
                  </button>
                )}
                {(role === 'admin' || role === 'agent') && (
                  <Link
                    href={role === 'admin' ? '/admin' : '/agent'}
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    Dashboard
                  </Link>
                )}
                {pwaInstallPrompt && onInstallPwa && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      onInstallPwa();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Install aplikasi
                  </button>
                )}
                {currentUser && (
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Keluar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <Link
          href="/"
          aria-label={storeName}
          className="col-start-2 flex min-w-0 max-w-[42vw] items-center justify-center px-1"
        >
          {!storeIdentity ? (
            <span
              aria-hidden="true"
              className="h-7 w-28 animate-pulse rounded-md bg-slate-200 sm:w-36"
            />
          ) : storeIdentity.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={storeIdentity.logoUrl}
              alt={storeName}
              onError={() => setStoreIdentity((current) =>
                current ? { ...current, logoUrl: null } : current)}
              className="max-h-10 max-w-full object-contain"
            />
          ) : (
            <span className="font-momo-trust max-w-full truncate text-center text-lg font-normal leading-tight text-slate-900 sm:text-xl">
              {storeName}
            </span>
          )}
        </Link>

        <div className={`relative col-start-3 justify-self-end ${mobileBack ? 'hidden md:block' : ''}`}>
          <button
            type="button"
            aria-label={`Notifikasi${notifications.length ? `, ${notifications.length} transaksi perlu diperhatikan` : ''}`}
            aria-expanded={isNotificationsOpen}
            onClick={() => {
              setIsNotificationsOpen((open) => !open);
              setIsProfileOpen(false);
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {notifications.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white ring-2 ring-slate-50">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
          {isNotificationsOpen && (
            <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Notifikasi</h2>
                <button
                  type="button"
                  aria-label="Tutup notifikasi"
                  onClick={() => setIsNotificationsOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {mobileBack && (
                <button
                  type="button"
                  aria-label="Kembali"
                  title="Kembali"
                  onClick={handleBack}
                  className="col-start-3 flex h-10 w-10 items-center justify-center justify-self-end rounded-full border border-slate-200/80 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 md:hidden"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {notifications.length ? (
                <div className="divide-y divide-slate-100">
                  {notifications.map((transaction) => {
                    const failed = transaction.status === 'failed';
                    return (
                      <button
                        key={transaction.id}
                        type="button"
                        onClick={() => {
                          setIsNotificationsOpen(false);
                          onOpenHistory();
                        }}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                      >
                        <span className={`mt-0.5 rounded-full p-1.5 ${failed ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>
                          <CircleAlert className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-900">
                            {failed ? 'Transaksi gagal' : 'Transaksi diproses'}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-slate-600">
                            {transaction.productName} · {transaction.destination}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setIsNotificationsOpen(false);
                      onOpenHistory();
                    }}
                    className="w-full px-4 py-3 text-center text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Lihat riwayat transaksi
                  </button>
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium text-slate-800">Semua beres</p>
                  <p className="mt-1 text-xs text-slate-500">Belum ada transaksi yang perlu diperhatikan.</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
