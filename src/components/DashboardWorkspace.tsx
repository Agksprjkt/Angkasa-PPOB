'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Home, LayoutDashboard, LogOut, Menu, Moon, PanelLeft, Sun, UserRound, X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { usePPOB } from '@/context/PPOBContext';

type Theme = 'system' | 'light' | 'dark';

export interface DashboardNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface DashboardWorkspaceProps {
  label: string;
  userName: string;
  children: ReactNode;
  navigation?: DashboardNavigationItem[];
}

const themeStorageKey = 'payku-dashboard-theme';

interface DashboardControls {
  resolvedTheme: 'light' | 'dark';
  toggleTheme: () => void;
  handleLogout: () => Promise<void>;
  themeError: string;
  logoutError: string;
}

const DashboardControlsContext = createContext<DashboardControls | null>(null);

export function useDashboardControls() {
  const controls = useContext(DashboardControlsContext);
  if (!controls) {
    throw new Error('Dashboard controls must be used inside DashboardWorkspace.');
  }
  return controls;
}

export default function DashboardWorkspace({
  label,
  userName,
  children,
  navigation,
}: DashboardWorkspaceProps) {
  const router = useRouter();
  const { storeName } = usePPOB();
  const [theme, setTheme] = useState<Theme>('system');
  const [systemIsDark, setSystemIsDark] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemIsDark(media.matches);
    updateSystemTheme();
    media.addEventListener('change', updateSystemTheme);

    try {
      const savedTheme = window.localStorage.getItem(themeStorageKey);
      if (savedTheme === 'light' || savedTheme === 'dark') {
        queueMicrotask(() => setTheme(savedTheme));
      }
    } catch {
      queueMicrotask(() => setThemeError('Preferensi tema tidak dapat dibaca dari browser.'));
    }

    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const menuButton = menuButtonRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    closeButtonRef.current?.focus();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (!window.matchMedia('(min-width: 1024px)').matches) menuButton?.focus();
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setIsSidebarOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const resolvedTheme = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
      setThemeError('');
    } catch {
      setThemeError('Tema berubah, tetapi preferensinya tidak dapat disimpan di browser.');
    }
  };

  const handleLogout = async () => {
    const { error } = await authClient.signOut();
    if (error) {
      setLogoutError(error.message ?? 'Tidak dapat keluar. Silakan coba kembali.');
      return;
    }
    router.replace('/');
  };

  const sidebar = navigation?.length ? (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Tutup navigasi"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
        />
      )}
      <aside
        ref={sidebarRef}
        id="dashboard-navigation"
        role={isSidebarOpen ? 'dialog' : undefined}
        aria-modal={isSidebarOpen || undefined}
        aria-label={`Navigasi ${label}`}
        className={`dashboard-sidebar ${
          isSidebarOpen
            ? 'fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-3rem))] flex-col overflow-y-auto rounded-none'
            : 'hidden'
        } flex-col border-r border-slate-200 bg-slate-50 p-3 text-slate-900 shadow-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-full lg:rounded-none lg:border-y-0 lg:border-l-0 lg:shadow-none`}
      >
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className={`min-w-0 ${isDesktopSidebarCollapsed ? 'lg:hidden' : ''}`}>
              <p className="max-w-40 truncate text-sm font-semibold text-slate-950">{storeName}</p>
              <p className="truncate text-xs text-slate-500">{label}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setIsSidebarOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Workspace
        </p>
        <Link
          href="/"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Kembali ke beranda"
          title="Kembali ke beranda"
          className={`mb-1 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-950 ${
            isDesktopSidebarCollapsed ? 'lg:w-10 lg:justify-center lg:px-0' : ''
          }`}
        >
          <Home className="h-4 w-4 shrink-0" />
          <span className={isDesktopSidebarCollapsed ? 'lg:sr-only' : ''}>Kembali ke Home</span>
        </Link>
        <nav
          className={`flex w-full flex-col gap-1 ${isDesktopSidebarCollapsed ? 'lg:items-center' : ''}`}
          aria-label={`Navigasi ${label}`}
        >
          {navigation.map(({ label: itemLabel, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              aria-label={itemLabel}
              title={itemLabel}
              onClick={() => setIsSidebarOpen(false)}
              className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-950 ${
                isDesktopSidebarCollapsed ? 'lg:w-10 lg:justify-center lg:px-0' : 'w-full'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={isDesktopSidebarCollapsed ? 'lg:sr-only' : ''}>{itemLabel}</span>
            </a>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <div className={`rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 ${
            isDesktopSidebarCollapsed ? 'lg:border-transparent lg:bg-transparent lg:p-0' : ''
          }`}>
            <div className={`flex items-center gap-2 font-medium text-slate-800 ${
              isDesktopSidebarCollapsed ? 'lg:justify-center' : ''
            }`}>
              <UserRound className="h-4 w-4" />
              <span className={isDesktopSidebarCollapsed ? 'lg:hidden' : ''}>Sesi aktif</span>
            </div>
            <p className={`mt-1 truncate ${isDesktopSidebarCollapsed ? 'lg:hidden' : ''}`}>{userName}</p>
          </div>
          <div className={`flex gap-2 ${isDesktopSidebarCollapsed ? 'lg:flex-col lg:items-center' : ''}`}>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'}
              aria-pressed={resolvedTheme === 'dark'}
              title={resolvedTheme === 'dark' ? 'Mode gelap aktif' : 'Mode terang aktif'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className={`flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 ${
                isDesktopSidebarCollapsed ? 'lg:w-9 lg:px-0' : 'flex-1'
              }`}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={isDesktopSidebarCollapsed ? 'lg:hidden' : ''}>Keluar</span>
            </button>
          </div>
          {(themeError || logoutError) && (
            <p className="text-xs text-amber-400" role="alert">
              {themeError || logoutError}
            </p>
          )}
        </div>
      </aside>
    </>
  ) : null;

  return (
    <DashboardControlsContext.Provider
      value={{ resolvedTheme, toggleTheme, handleLogout, themeError, logoutError }}
    >
      <div
        className="dashboard-workspace min-h-screen"
        data-dashboard-theme={theme}
      >
        {navigation?.length ? (
          <>
            <div className={`mx-auto grid min-h-screen w-full max-w-[1600px] ${
              isDesktopSidebarCollapsed
                ? 'lg:grid-cols-[72px_minmax(0,1fr)]'
                : 'lg:grid-cols-[248px_minmax(0,1fr)]'
            }`}>
              {sidebar}
              <main className="dashboard-inset dashboard-content min-h-screen min-w-0 lg:my-2 lg:mr-2 lg:rounded-xl lg:border">
                <header className="dashboard-toolbar sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 sm:px-6">
                  <button
                    ref={menuButtonRef}
                    type="button"
                    aria-label="Buka navigasi"
                    aria-expanded={isSidebarOpen}
                    aria-controls="dashboard-navigation"
                    onClick={() => setIsSidebarOpen(true)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border lg:hidden"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={isDesktopSidebarCollapsed ? 'Perluas navigasi' : 'Ciutkan navigasi'}
                    aria-expanded={!isDesktopSidebarCollapsed}
                    aria-controls="dashboard-navigation"
                    onClick={() => setIsDesktopSidebarCollapsed((collapsed) => !collapsed)}
                    className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border lg:flex"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </button>
                  <span aria-hidden="true" className="hidden h-5 border-l lg:block" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{label}</p>
                  </div>
                  <span className="ml-auto hidden max-w-48 truncate text-sm text-slate-500 sm:block">
                    {userName}
                  </span>
                </header>
                <div className="p-4 sm:p-6">{children}</div>
              </main>
            </div>
          </>
        ) : (
          <main className="min-w-0">{children}</main>
        )}
      </div>
    </DashboardControlsContext.Provider>
  );
}
