'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePPOB } from '@/context/PPOBContext';
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  CircleAlert,
  Download,
  FileText,
  Headphones,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme';
import type { BeforeInstallPromptEvent } from '@/types/pwa';
import { DEFAULT_STORE_NAME } from '@/lib/store-branding';
import StoreLogo from '@/components/StoreLogo';

interface HeaderProps {
  onOpenAuth: () => void;
  onOpenHistory?: () => void;
  onOpenHome?: () => void;
  onOpenOrders?: () => void;
  onOpenLegal?: () => void;
  onOpenDeposit?: () => void;
  showDesktopNavigation?: boolean;
  activeTab?: 'home' | 'orders' | 'help';
  dark?: boolean;
  mobileBack?: boolean;
  onBack?: () => void;
  // Route used only when the browser has no in-app history to step back to.
  backFallback?: string;
  mobileMenuMode?: boolean;
  mobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
  // Mobile-only: header starts transparent and turns into a glass card once scrolled.
  transparentUntilScroll?: boolean;
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
  onOpenHome,
  onOpenOrders,
  onOpenLegal,
  onOpenDeposit,
  showDesktopNavigation = true,
  activeTab,
  dark = false,
  mobileBack = false,
  onBack,
  backFallback = '/',
  mobileMenuMode = false,
  mobileMenuOpen = false,
  onMobileMenuToggle,
  transparentUntilScroll = false,
  pwaInstallPrompt,
  onInstallPwa,
}: HeaderProps) {
  const { currentUser, role, authPending, logout, transactions, products, storeName } =
    usePPOB();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDesktopSearchOpen, setIsDesktopSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsExpanded, setIsNotificationsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [storeIdentity, setStoreIdentity] = useState<StoreIdentity | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);

  const notifications = transactions
    .filter((transaction) => transaction.status === 'pending' || transaction.status === 'failed')
    .slice(0, 5);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('id-ID');
    if (!query) return [];
    return products
      .filter((product) =>
        product.status === 'active' &&
        `${product.name} ${product.operator} ${product.description}`
          .toLocaleLowerCase('id-ID')
          .includes(query),
      )
      .slice(0, 6);
  }, [products, searchQuery]);

  const dashboardPath = role === 'admin'
    ? '/admin'
    : role === 'agent'
      ? '/agent'
      : '/dashboard';

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    // Next's App Router keeps its position in `history.state.idx`. Using it means
    // one tap steps back exactly one page instead of jumping to the home page,
    // while a deep link (idx 0) still lands on the fallback route.
    const depth = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (depth > 0) {
      router.back();
    } else {
      router.push(backFallback);
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
    if (!isSearchOpen) return;
    searchInputRef.current?.focus();
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isDesktopSearchOpen) return;
    desktopSearchInputRef.current?.focus();
  }, [isDesktopSearchOpen]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setIsScrolled(window.scrollY > 8);
    };
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setIsSearchOpen(false);
        setIsDesktopSearchOpen(false);
        setIsProfileOpen(false);
        setIsNotificationsExpanded(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSearchOpen(false);
        setIsDesktopSearchOpen(false);
        setIsProfileOpen(false);
        setIsNotificationsExpanded(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleProductSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    const firstResult = searchResults[0];
    if (!query || !firstResult) {
      setSearchError(query ? 'Produk tidak ditemukan.' : 'Masukkan nama produk yang ingin dicari.');
      return;
    }
    setSearchError('');
    setIsSearchOpen(false);
    setIsDesktopSearchOpen(false);
    router.push(
      `/?category=${encodeURIComponent(firstResult.category)}&search=${encodeURIComponent(query)}`,
    );
  };

  const selectSearchResult = (category: string) => {
    const query = searchQuery.trim();
    setSearchError('');
    setIsSearchOpen(false);
    setIsDesktopSearchOpen(false);
    router.push(`/?category=${encodeURIComponent(category)}&search=${encodeURIComponent(query)}`);
  };

  const openHistory = () => {
    setIsProfileOpen(false);
    setIsNotificationsExpanded(false);
    if (onOpenHistory) {
      onOpenHistory();
      return;
    }
    router.push(dashboardPath === '/dashboard' ? '/dashboard/transactions' : dashboardPath);
  };

  const roleLabel = currentUser
    ? role === 'agent'
      ? 'Member'
      : role === 'admin'
        ? 'Admin'
        : 'Pelanggan'
    : 'Belum masuk';
  const controlClass = 'liquid-glass-control text-slate-800 hover:text-slate-950';
  const desktopNavButtonClass = (active = false) =>
    `flex min-h-10 items-center gap-2 px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 ${
        dark
          ? active
            ? 'border-b-2 border-cyan-300 text-white focus-visible:ring-cyan-200'
            : 'border-b-0 text-slate-400 hover:text-white focus-visible:ring-cyan-200'
          : active
            ? 'border-b-2 border-blue-700 text-blue-700 focus-visible:ring-blue-600'
            : 'border-b-0 text-slate-600 hover:text-slate-950 focus-visible:ring-blue-600'
    }`;

  return (
    <header
      className="liquid-glass-header"
      data-transparent={transparentUntilScroll ? 'true' : undefined}
      data-scrolled={transparentUntilScroll && isScrolled ? 'true' : 'false'}
    >
      <div
        ref={actionsRef}
        className={`relative mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-2.5 sm:h-16 sm:gap-3 sm:px-4 lg:px-6 ${
          dark ? 'border-slate-800' : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {mobileMenuMode && (
            <button
              type="button"
              aria-label="Navigasi dokumen legal"
              aria-expanded={mobileMenuOpen}
              onClick={() => onMobileMenuToggle?.()}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-600 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 md:hidden"
            >
              {mobileMenuOpen
                ? <X className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
                : <Menu className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />}
            </button>
          )}
          {mobileBack && (
            <button
              type="button"
              aria-label="Kembali"
              title="Kembali"
              onClick={handleBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-600 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
          <Link
            href="/"
            aria-label={storeName}
            className="flex min-w-0 items-center"
          >
            {!storeIdentity ? (
              <span
                aria-hidden="true"
                className="h-7 w-28 animate-pulse rounded-md bg-slate-200 sm:w-36"
              />
            ) : (
              <StoreLogo
                imageClassName="max-h-9 max-w-[42vw] sm:max-w-56"
                textClassName={`max-w-[42vw] truncate font-momo-trust text-base font-normal leading-tight sm:max-w-56 sm:text-lg ${
                  dark ? 'text-white' : 'text-slate-900'
                }`}
              />
            )}
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            aria-label={theme === 'dark' ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Mode gelap aktif' : 'Mode terang aktif'}
            onClick={toggleTheme}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${controlClass}`}
          >
            {theme === 'dark'
              ? <Sun className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
              : <Moon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />}
          </button>
          <div className="relative hidden lg:block">
            <button
              type="button"
              aria-label={isDesktopSearchOpen ? 'Tutup pencarian' : 'Cari produk'}
              aria-expanded={isDesktopSearchOpen}
              aria-controls="header-product-search-desktop"
              onClick={() => {
                setIsDesktopSearchOpen((open) => !open);
                setIsSearchOpen(false);
                setIsProfileOpen(false);
                setIsNotificationsExpanded(false);
                setSearchError('');
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${controlClass}`}
            >
              {isDesktopSearchOpen
                ? <X className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
                : <Search className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />}
            </button>
            <form
              onSubmit={handleProductSearch}
              aria-hidden={!isDesktopSearchOpen}
              style={{ width: isDesktopSearchOpen ? '18rem' : '0px' }}
              className={`absolute right-full top-1/2 mr-2 -translate-y-1/2 overflow-hidden transition-[width,opacity] duration-300 ease-out ${
                isDesktopSearchOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <label htmlFor="header-product-search-desktop" className="sr-only">
                Cari game atau voucher
              </label>
              <div className={`flex h-11 w-full items-center gap-2 rounded-full border px-3 ${
                dark
                  ? 'border-slate-700 bg-slate-800 text-slate-300'
                  : 'border-slate-200 bg-slate-100 text-slate-600'
              }`}>
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <input
                  ref={desktopSearchInputRef}
                  id="header-product-search-desktop"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchError('');
                  }}
                  placeholder="Cari game atau voucher"
                  autoComplete="off"
                  disabled={!isDesktopSearchOpen}
                  className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 ${
                    dark ? 'text-white' : 'text-slate-900'
                  }`}
                />
              </div>
              {searchError && (
                <p role="alert" className="absolute left-0 top-full mt-1 text-xs text-rose-500">
                  {searchError}
                </p>
              )}
            </form>
          </div>
          <button
            type="button"
            aria-label="Cari produk"
            aria-expanded={isSearchOpen}
            onClick={() => {
              setIsSearchOpen((open) => !open);
              setIsDesktopSearchOpen(false);
              setIsProfileOpen(false);
              setIsNotificationsExpanded(false);
              setSearchError('');
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 lg:hidden ${controlClass}`}
          >
            <Search className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={currentUser ? `Profil ${currentUser.name}` : 'Profil akun'}
            aria-expanded={isProfileOpen}
            disabled={authPending}
            onClick={() => {
              setIsProfileOpen((open) => !open);
              setIsSearchOpen(false);
              setIsDesktopSearchOpen(false);
              setIsNotificationsExpanded(false);
            }}
            className={`liquid-glass-control-strong flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-bold ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 disabled:animate-pulse ${
              dark
                ? 'text-slate-900 ring-slate-700 focus-visible:ring-cyan-200'
                : 'text-blue-800 ring-slate-200 focus-visible:ring-blue-600'
            }`}
          >
            {currentUser ? getInitials(currentUser.name) : <UserRound className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />}
          </button>
        </div>

        {isSearchOpen && (
          <div className="absolute right-2 top-[calc(100%+0.5rem)] z-50 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:hidden">
            <form onSubmit={handleProductSearch} className="border-b border-slate-100 p-3">
              <label htmlFor="header-product-search" className="sr-only">Cari produk</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  id="header-product-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchError('');
                  }}
                  placeholder="Cari pulsa, paket data, game..."
                  autoComplete="off"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {searchError && <p role="alert" className="mt-2 text-xs text-rose-700">{searchError}</p>}
            </form>
            {searchQuery.trim() && (
              searchResults.length ? (
                <div className="max-h-72 overflow-y-auto p-2">
                  {searchResults.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => selectSearchResult(product.category)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{product.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{product.operator}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] capitalize text-slate-600">
                        {product.category}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-center text-sm text-slate-500">Produk tidak ditemukan.</p>
              )
            )}
          </div>
        )}

        {isProfileOpen && (
          <div className="absolute right-2 top-[calc(100%+0.5rem)] z-50 w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-[11px] font-medium text-slate-500">Telah masuk sebagai</p>
              <p className="mt-0.5 truncate text-sm font-semibold uppercase text-slate-900">
                {currentUser?.name ?? 'Tamu'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{roleLabel}</p>
            </div>
            {currentUser && (
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <Wallet className="h-4 w-4 text-amber-500" aria-hidden="true" />
                  Saldo akun
                </span>
                <span className="text-sm font-bold text-slate-900">
                  Rp {currentUser.balance.toLocaleString('id-ID')}
                </span>
              </div>
            )}
            <div className="space-y-1 p-2">
              {currentUser ? (
                <>
                  <Link
                    href={dashboardPath}
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    Dashboard
                  </Link>
                  {role === 'user' && (
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <Settings className="h-4 w-4" aria-hidden="true" />
                      Pengaturan akun
                    </Link>
                  )}
                  <Link
                    href="/legal/tentang"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Dokumen legal
                  </Link>
                  <button
                    type="button"
                    aria-expanded={isNotificationsExpanded}
                    onClick={() => setIsNotificationsExpanded((expanded) => !expanded)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <Bell className="h-4 w-4" aria-hidden="true" />
                      Notifikasi
                    </span>
                    {notifications.length > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                        {notifications.length > 9 ? '9+' : notifications.length}
                      </span>
                    )}
                  </button>
                  {isNotificationsExpanded && (
                    notifications.length ? (
                      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70">
                        {notifications.map((transaction) => {
                          const failed = transaction.status === 'failed';
                          return (
                            <button
                              key={transaction.id}
                              type="button"
                              onClick={openHistory}
                              className="flex w-full items-start gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-white"
                            >
                              <span className={`mt-0.5 rounded-full p-1 ${failed ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>
                                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-xs font-semibold text-slate-900">
                                  {failed ? 'Transaksi gagal' : 'Transaksi diproses'}
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-slate-600">
                                  {transaction.productName} · {transaction.destination}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={openHistory}
                          className="w-full px-3 py-2 text-center text-xs font-semibold text-blue-700 hover:bg-white"
                        >
                          Lihat riwayat transaksi
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                        Belum ada transaksi yang perlu diperhatikan.
                      </div>
                    )
                  )}
                </>
              ) : null}
              {pwaInstallPrompt && onInstallPwa && (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    onInstallPwa();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Install aplikasi
                </button>
              )}
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-700 transition hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Keluar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    onOpenAuth();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Masuk / Daftar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {showDesktopNavigation && (
        <nav
          aria-label="Navigasi utama"
          className={`mx-auto hidden min-h-11 w-full max-w-7xl items-center justify-between gap-4 border-t px-3 py-1 sm:px-6 lg:flex ${
            dark
              ? 'border-slate-800'
              : 'border-slate-200'
          }`}
        >
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              aria-current={activeTab === 'home' ? 'page' : undefined}
              onClick={() => (onOpenHome ?? (() => router.push('/')))()}
              className={desktopNavButtonClass(activeTab === 'home')}
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Top up
            </button>
            <button
              type="button"
              aria-current={activeTab === 'orders' ? 'page' : undefined}
              onClick={() => (onOpenOrders ?? (() => router.push('/cek-pesanan')))()}
              className={desktopNavButtonClass(activeTab === 'orders')}
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Pesanan
            </button>
            <button
              type="button"
              aria-current={activeTab === 'help' ? 'page' : undefined}
              onClick={() => router.push('/bantuan')}
              className={desktopNavButtonClass(activeTab === 'help')}
            >
              <Headphones className="h-4 w-4" aria-hidden="true" />
              Bantuan
            </button>
            <button
              type="button"
              onClick={() => (onOpenLegal ?? (() => router.push('/legal')))()}
              className={desktopNavButtonClass()}
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Legal
            </button>
          </div>
          <button
            type="button"
            disabled={authPending}
            onClick={() => {
              if (onOpenDeposit) {
                onOpenDeposit();
              } else if (currentUser) {
                router.push(dashboardPath);
              } else {
                onOpenAuth();
              }
            }}
            className={`flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              dark
                ? 'border-slate-700 text-slate-200 hover:bg-slate-800 focus-visible:ring-cyan-200'
                : 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-600'
            }`}
          >
            {currentUser ? (
              <>
                <Wallet className="h-4 w-4" aria-hidden="true" />
                Isi saldo
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Daftar dan Masuk
              </>
            )}
          </button>
        </nav>
      )}
    </header>
  );
}
