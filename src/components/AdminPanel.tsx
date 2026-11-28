'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePPOB } from '@/context/PPOBContext';
import { Product, ProductCategory } from '@/types/ppob';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/crystal-loader';
import IntegrationSettingsPanel from '@/components/IntegrationSettingsPanel';
import FrontendIntegrationPanel from '@/components/FrontendIntegrationPanel';
import PaymentMethodsPanel from '@/components/PaymentMethodsPanel';
import StoreSettingsPanel from '@/components/StoreSettingsPanel';
import SystemSettingsPanel from '@/components/SystemSettingsPanel';
import StoreLogo from '@/components/StoreLogo';
import AdminTransactionsPanel from '@/components/AdminTransactionsPanel';
import PromotionManagementPanel from '@/components/PromotionManagementPanel';
import VoucherManagementPanel from '@/components/VoucherManagementPanel';
import FlashSalePanel from '@/components/FlashSalePanel';
import FeaturedProductsPanel from '@/components/FeaturedProductsPanel';
import LegalDocumentsPanel from '@/components/LegalDocumentsPanel';
import ProductManagementPanel, {
  type ProductAdminView,
} from '@/components/ProductManagementPanel';
import { calculateMarkup } from '@/lib/product-pricing';
import {
  Activity,
  Boxes,
  Ban,
  Check,
  ChevronDown,
  CreditCard,
  CircleAlert,
  Database,
  Flame,
  LayoutDashboard,
  Menu,
  Plug,
  PanelLeft,
  QrCode,
  ReceiptText,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  X,
  Eye,
  Home,
  Tags,
  LogOut,
  Moon,
  Sun,
  Settings,
  Store,
  Search,
  Wallet,
  RefreshCw,
  MessageCircle,
  Megaphone,
  Ticket,
  Zap,
  FileText,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useDashboardControls } from '@/components/DashboardWorkspace';

function formatMarkupText(markup: ReturnType<typeof calculateMarkup>) {
  const percentage =
    markup.percentage === null
      ? ''
      : ` (${new Intl.NumberFormat('id-ID', {
          maximumFractionDigits: 1,
        }).format(markup.percentage)}%)`;
  return `Rp ${markup.amount.toLocaleString('id-ID')}${percentage}`;
}

type ProviderBalance = {
  id: string;
  name: string;
  mode: string;
  balance: number | null;
  status: 'available' | 'unavailable';
  error?: string;
  checkedAt: string;
  fetchedAt?: string;
};

type TransactionMetrics = {
  totalTransactions: number;
  successfulCount: number;
  failedCount?: number;
  totalRevenue: number;
  totalProfit: number;
  pendingCount?: number;
  overduePendingCount?: number;
  oldestPendingAt?: string | null;
};

const metricsPeriodLabels = {
  '7d': '7 hari terakhir',
  '30d': '30 hari terakhir',
  all: 'semua waktu',
} as const;

type DashboardTransaction = {
  id: string;
  productName: string;
  destination: string;
  amount: number;
  profit: number;
  status: 'pending' | 'success' | 'failed';
  paymentMethod: string;
  createdAt: string;
  userName: string | null;
};

type DashboardMutation = {
  id: string;
  userName: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reference: string;
  note: string;
  createdAt: string;
};

function formatPeriodChange(current: number, previous: number | undefined) {
  if (previous === undefined) return null;
  if (previous === 0) {
    return current === 0 ? 'Sama dengan periode sebelumnya' : 'Baru pada periode ini';
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (change === 0) return 'Sama dengan periode sebelumnya';
  return `${change > 0 ? 'Naik' : 'Turun'} ${new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 1,
  }).format(Math.abs(change))}% dari periode sebelumnya`;
}

function formatDashboardDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('id-ID');
}

function formatPendingAge(value: string | null | undefined, now: number) {
  if (!value || now <= 0) return null;
  const ageMinutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
  if (ageMinutes < 1) return 'kurang dari 1 menit';
  if (ageMinutes < 60) return `${ageMinutes} menit`;
  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  if (hours < 24) return `${hours} jam ${minutes} menit`;
  return `${Math.floor(hours / 24)} hari ${hours % 24} jam`;
}

function SidebarGroup({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      <p className={`px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 ${
        collapsed ? 'lg:hidden' : ''
      }`}>
        {label}
      </p>
      {children}
    </div>
  );
}

function SidebarNavButton({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
  count,
  expanded,
  small = false,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  count?: number;
  expanded?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 text-left transition-colors ${
        small ? 'min-h-9 text-xs' : 'min-h-10 text-sm'
      } ${
        active
          ? 'bg-white font-medium text-slate-950 shadow-sm'
          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-950'
      } ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
    >
      <Icon className={`shrink-0 ${small ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} aria-hidden="true" />
      <span className={collapsed ? 'lg:sr-only' : ''}>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          active ? 'bg-slate-200 text-slate-700' : 'bg-rose-500/15 text-rose-600'
        } ${collapsed ? 'lg:hidden' : ''}`}>
          {count}
        </span>
      )}
      {expanded !== undefined && (
        <ChevronDown
          aria-hidden="true"
          className={`ml-auto h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''} ${
            collapsed ? 'lg:hidden' : ''
          }`}
        />
      )}
    </button>
  );
}

export default function AdminPanel() {
  const { resolvedTheme, toggleTheme, handleLogout, themeError, logoutError } =
    useDashboardControls();
  const {
    currentUser,
    users,
    products,
    transactions,
    deposits,
    depositReviewTotal,
    hasMoreAdminDeposits,
    loadingMoreAdminDeposits,
    loadMoreAdminDeposits,
    updateUserBalance,
    updateUserRole,
    approveDeposit,
    rejectDeposit,
    addProduct,
    updateProduct,
    refreshAdminUsers,
    addToast,
  } = usePPOB();

  const [activeAdminTab, setActiveAdminTab] = useState<
    | 'metrics'
    | 'deposits'
    | 'products'
    | 'users'
    | 'settings'
    | 'transactions'
    | 'digiflazz'
    | 'frontend-integration'
    | 'promotions'
    | 'system'
    | 'flash-sales'
  >('metrics');
  const [productView, setProductView] = useState<ProductAdminView>('all');
  const [promotionView, setPromotionView] = useState<'banners' | 'flash-sales' | 'featured' | 'vouchers'>('banners');
  const [isPromotionMenuOpen, setIsPromotionMenuOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<'profile' | 'seo' | 'payments' | 'legal'>('profile');
  const [isProductMenuOpen, setIsProductMenuOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [serverMetrics, setServerMetrics] = useState<{
    totalTransactions: number;
    successfulCount: number;
    failedCount: number;
    totalRevenue: number;
    totalProfit: number;
    pendingCount: number;
    overduePendingCount: number;
    oldestPendingAt: string | null;
    pendingDepositsCount: number;
    pendingDepositsAmount: number;
    userCount: number;
    activeProductCount: number;
  } | null>(null);
  const [comparisonMetrics, setComparisonMetrics] = useState<TransactionMetrics | null>(null);
  const [metricsPeriod, setMetricsPeriod] = useState<'7d' | '30d' | 'all'>('7d');
  const [metricsDataPeriod, setMetricsDataPeriod] = useState<'7d' | '30d' | 'all' | null>(null);
  const [metricsUpdatedAt, setMetricsUpdatedAt] = useState<string | null>(null);
  const [freshnessNow, setFreshnessNow] = useState(0);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [metricsError, setMetricsError] = useState('');
  const [providerBalances, setProviderBalances] = useState<ProviderBalance[]>([]);
  const [providerBalancesCheckedAt, setProviderBalancesCheckedAt] = useState<string | null>(null);
  const [providerBalancesError, setProviderBalancesError] = useState('');
  const [isLoadingProviderBalances, setIsLoadingProviderBalances] = useState(true);
  const [summaryActivityTab, setSummaryActivityTab] = useState<'transactions' | 'mutations'>('transactions');
  // Set when an overview card opens the transaction list already filtered, so
  // the admin lands on the rows they just clicked on.
  const [transactionsInitialStatus, setTransactionsInitialStatus] = useState<
    'all' | 'pending' | 'success' | 'failed' | 'review'
  >('all');

  const openTransactions = (
    status: 'all' | 'pending' | 'success' | 'failed' | 'review',
  ) => {
    setTransactionsInitialStatus(status);
    setActiveAdminTab('transactions');
  };
  const [recentTransactions, setRecentTransactions] = useState<DashboardTransaction[]>([]);
  const [recentMutations, setRecentMutations] = useState<DashboardMutation[]>([]);
  const [activityError, setActivityError] = useState('');

  const fetchProviderBalances = useCallback(async (signal?: AbortSignal) => {
      const response = await fetch('/api/admin/provider-balances', {
        cache: 'no-store',
        signal,
      });
      const result = await response.json() as {
        providers?: ProviderBalance[];
        checkedAt?: string;
        error?: string;
      };
      if (!response.ok || !Array.isArray(result.providers) || typeof result.checkedAt !== 'string') {
        throw new Error(result.error ?? 'Saldo H2H gagal dimuat.');
      }
      return { providers: result.providers, checkedAt: result.checkedAt };
  }, []);

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    setIsLoadingMetrics(true);
    setMetricsError('');
    try {
      const response = await fetch(`/api/admin/overview?period=${metricsPeriod}`, {
        cache: 'no-store',
        signal,
      });
      const result = await response.json() as {
        totalTransactions?: number;
        successfulCount?: number;
        failedCount?: number;
        totalRevenue?: number;
        totalProfit?: number;
        previousPeriodStats?: TransactionMetrics | null;
        period?: string;
        pendingDepositsCount?: number;
        pendingDepositsAmount?: number;
        pendingCount?: number;
        overduePendingCount?: number;
        oldestPendingAt?: string | null;
        userCount?: number;
        activeProductCount?: number;
        recentTransactions?: DashboardTransaction[];
        recentMutations?: DashboardMutation[];
        generatedAt?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Ringkasan admin gagal dimuat.');
      if (
        typeof result.totalTransactions !== 'number' ||
        typeof result.successfulCount !== 'number' ||
        typeof result.failedCount !== 'number' ||
        typeof result.totalRevenue !== 'number' ||
        typeof result.totalProfit !== 'number' ||
        typeof result.pendingCount !== 'number' ||
        typeof result.overduePendingCount !== 'number' ||
        (result.oldestPendingAt !== null &&
          result.oldestPendingAt !== undefined &&
          (typeof result.oldestPendingAt !== 'string' ||
            Number.isNaN(new Date(result.oldestPendingAt).getTime()))) ||
        typeof result.pendingDepositsCount !== 'number' ||
        typeof result.pendingDepositsAmount !== 'number' ||
        typeof result.userCount !== 'number' ||
        typeof result.activeProductCount !== 'number' ||
        !Array.isArray(result.recentTransactions) ||
        !Array.isArray(result.recentMutations) ||
        result.period !== metricsPeriod ||
        typeof result.generatedAt !== 'string' ||
        Number.isNaN(new Date(result.generatedAt).getTime())
      ) {
        throw new Error('Data ringkasan admin tidak lengkap.');
      }

      const currentMetrics: TransactionMetrics = {
        totalTransactions: result.totalTransactions,
        successfulCount: result.successfulCount,
        failedCount: result.failedCount,
        totalRevenue: result.totalRevenue,
        totalProfit: result.totalProfit,
        pendingCount: result.pendingCount,
        overduePendingCount: result.overduePendingCount,
        oldestPendingAt: result.oldestPendingAt ?? null,
      };
      const previous = result.previousPeriodStats;
      if (
        previous !== null &&
        previous !== undefined &&
        ![
          previous.totalTransactions,
          previous.successfulCount,
          previous.totalRevenue,
          previous.totalProfit,
        ].every((value) => typeof value === 'number' && Number.isFinite(value))
      ) {
        throw new Error('Data perbandingan periode tidak valid.');
      }

      setServerMetrics({
        totalTransactions: currentMetrics.totalTransactions,
        successfulCount: currentMetrics.successfulCount,
        failedCount: result.failedCount,
        totalRevenue: currentMetrics.totalRevenue,
        totalProfit: currentMetrics.totalProfit,
        pendingCount: result.pendingCount,
        overduePendingCount: result.overduePendingCount,
        oldestPendingAt: result.oldestPendingAt ?? null,
        pendingDepositsCount: result.pendingDepositsCount,
        pendingDepositsAmount: result.pendingDepositsAmount,
        userCount: result.userCount,
        activeProductCount: result.activeProductCount,
      });
      setComparisonMetrics(previous ?? null);
      setRecentTransactions(result.recentTransactions);
      setRecentMutations(result.recentMutations);
      setMetricsDataPeriod(metricsPeriod);
      setMetricsUpdatedAt(result.generatedAt);
      setActivityError('');
    } catch (error) {
      if (!signal?.aborted) {
        const message = error instanceof Error ? error.message : 'Ringkasan admin gagal dimuat.';
        setMetricsError(message);
        setActivityError(message);
      }
    } finally {
      if (!signal?.aborted) setIsLoadingMetrics(false);
    }
  }, [metricsPeriod]);

  const loadProviderBalances = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    setIsLoadingProviderBalances(true);
    setProviderBalancesError('');
    try {
      const result = await fetchProviderBalances(signal);
      setProviderBalances((current) => result.providers.map((provider) => {
        const previous = current.find((item) => item.id === provider.id);
        if (
          provider.status === 'unavailable' &&
          previous?.status === 'available' &&
          previous.balance !== null
        ) {
          return { ...provider, balance: previous.balance, fetchedAt: previous.fetchedAt };
        }
        return provider;
      }));
      setProviderBalancesCheckedAt(result.checkedAt);
    } catch (error) {
      if (!signal?.aborted) {
        setProviderBalancesError(error instanceof Error ? error.message : 'Saldo H2H gagal dimuat.');
        setProviderBalancesCheckedAt(new Date().toISOString());
      }
    } finally {
      if (!signal?.aborted) setIsLoadingProviderBalances(false);
    }
  }, [fetchProviderBalances]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;
    const menuButton = menuButtonRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setIsMobileSidebarOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void loadOverview(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadOverview]);

  useEffect(() => {
    if (activeAdminTab !== 'metrics') return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void loadProviderBalances(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activeAdminTab, loadProviderBalances]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setFreshnessNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (activeAdminTab !== 'metrics') return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadOverview();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [activeAdminTab, loadOverview]);

  // Proof Modal
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  // Reject Modal
  const [rejectDepositId, setRejectDepositId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('Bukti transfer tidak valid');
  const [depositMoreError, setDepositMoreError] = useState('');

  // Add Product Modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productForm, setProductForm] = useState<Omit<Product, 'id'>>({
    vendorCode: '',
    name: '',
    category: 'pulsa' as ProductCategory,
    operator: 'Telkomsel',
    description: '',
    basePrice: 10000,
    sellPriceUser: 11500,
    sellPriceAgent: 10700,
    compareAtPrice: null,
    status: 'active' as 'active' | 'inactive',
    vendor: 'Digiflazz' as 'Digiflazz' | 'Manual',
  });

  // User Balance Edit Modal
  const [editingUserBalance, setEditingUserBalance] = useState<{ id: string; name: string; current: number } | null>(null);
  const [balanceAdjustment, setBalanceAdjustment] = useState<number>(50000);
  const [balanceAdjustmentNote, setBalanceAdjustmentNote] = useState('Penyesuaian saldo oleh admin');

  // Metrics Calculations
  const metrics = useMemo(() => {
    const totalTransactions = transactions.length;
    const successfulTrx = transactions.filter((t) => t.status === 'success');
    const pendingTransactions = transactions.filter((t) => t.status === 'pending');
    const totalRevenue = successfulTrx.reduce((acc, t) => acc + t.amount, 0);
    const totalProfit = successfulTrx.reduce((acc, t) => acc + t.profit, 0);
    const pendingDeposits = deposits.filter((d) => d.status === 'pending');
    const pendingDepositsAmount = pendingDeposits.reduce((acc, d) => acc + d.amount, 0);

    return {
      totalTransactions,
      successfulCount: successfulTrx.length,
      failedCount: transactions.filter((t) => t.status === 'failed').length,
      totalRevenue,
      totalProfit,
      pendingCount: pendingTransactions.length,
      overduePendingCount: 0,
      oldestPendingAt: pendingTransactions.reduce<string | null>((oldest, transaction) =>
        !oldest || new Date(transaction.createdAt).getTime() < new Date(oldest).getTime()
          ? transaction.createdAt
          : oldest, null),
      pendingDepositsCount: pendingDeposits.length,
      pendingDepositsAmount,
      userCount: users.length,
      activeProductCount: products.filter((product) => product.status === 'active').length,
    };
  }, [transactions, deposits, users, products]);
  const displayedMetrics = serverMetrics ?? metrics;
  const metricsUpdatedDate = metricsUpdatedAt ? new Date(metricsUpdatedAt) : null;
  const dashboardNow = freshnessNow || metricsUpdatedDate?.getTime() || 0;
  const formattedMetricsUpdatedAt = formatDashboardDate(metricsUpdatedAt);
  const metricsDataIsStale = Boolean(
    metricsUpdatedDate &&
    freshnessNow - metricsUpdatedDate.getTime() > 5 * 60 * 1000,
  );
  const metricsFreshnessLabel = metricsError
    ? metricsUpdatedAt
      ? metricsDataPeriod !== metricsPeriod
        ? 'Pembaruan gagal · periode data lama'
        : 'Pembaruan gagal · menampilkan data terakhir'
      : 'Gagal memuat data'
    : isLoadingMetrics
      ? metricsUpdatedAt ? 'Memperbarui data…' : 'Memuat data…'
      : metricsDataIsStale
        ? 'Data mungkin usang'
        : 'Data terbaru';
  type AdminTab =
    | 'metrics'
    | 'deposits'
    | 'products'
    | 'users'
    | 'settings'
    | 'transactions'
    | 'digiflazz'
    | 'frontend-integration'
    | 'promotions'
    | 'system'
    | 'flash-sales';
  type SidebarNavItem = {
    id: AdminTab;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
  };
  const navigationGroups: { label: string; items: SidebarNavItem[] }[] = [
    {
      label: 'Operasional',
      items: [
        { id: 'metrics', label: 'Ringkasan', icon: LayoutDashboard },
        { id: 'transactions', label: 'Transaksi', icon: ReceiptText },
        { id: 'deposits', label: 'Deposit', icon: CreditCard, count: displayedMetrics.pendingDepositsCount },
      ],
    },
    {
      label: 'Katalog',
      items: [],
    },
    {
      label: 'Pengguna',
      items: [
        { id: 'users', label: 'Pengguna', icon: Users },
      ],
    },
    {
      label: 'Pengaturan',
      items: [
        { id: 'digiflazz', label: 'Integrasi API', icon: Plug },
        { id: 'frontend-integration', label: 'Integrasi Frontend', icon: ExternalLink },
        { id: 'system', label: 'Sistem', icon: Database },
      ],
    },
  ];
  const flatNavigation: SidebarNavItem[] = navigationGroups.flatMap((group) => group.items);
  const activeSection = flatNavigation.find((item) => item.id === activeAdminTab);
  const productViewLabels: Record<ProductAdminView, string> = {
    all: 'Semua Produk',
    pricing: 'Daftar Harga & Markup',
    active: 'Produk Aktif',
    inactive: 'Produk Nonaktif',
  };
  const settingsViewLabels = {
    profile: 'Profil Toko',
    seo: 'SEO & Pencarian',
    payments: 'Metode Pembayaran',
    legal: 'Dokumen Legal',
  } as const;
  const promotionViewLabels = {
    banners: 'Banner Promosi',
    'flash-sales': 'Flash Sale',
    featured: 'Produk Unggulan',
    vouchers: 'Kode Voucher',
  } as const;
  const activeSectionLabel =
    activeAdminTab === 'products'
      ? productViewLabels[productView]
      : activeAdminTab === 'settings'
        ? settingsViewLabels[settingsView]
        : activeAdminTab === 'promotions'
          ? promotionViewLabels[promotionView]
          : activeSection?.label ?? 'Dashboard';

  const deleteUser = async (user: { id: string; name: string }) => {
    if (!window.confirm(
      `Hapus akun "${user.name}"? Akun dengan riwayat transaksi atau deposit tidak dapat dihapus.`,
    )) return;
    try {
      const response = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error === 'USER_HAS_HISTORY'
            ? 'Akun ini memiliki riwayat transaksi/deposit sehingga tidak dapat dihapus.'
            : body.error ?? 'Akun gagal dihapus.',
        );
      }
      addToast('Akun dihapus', `${user.name} telah dihapus.`, 'success');
      await refreshAdminUsers();
    } catch (error) {
      addToast(
        'Akun gagal dihapus',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    }
  };

  const handleOpenAddProduct = () => {    setProductForm({
      vendorCode: 'SKU' + Math.floor(100 + Math.random() * 900),
      name: '',
      category: 'voucher',
      operator: 'Telkomsel',
      description: '',
      basePrice: 10000,
      sellPriceUser: 12000,
      sellPriceAgent: 10800,
      compareAtPrice: null,
      status: 'active',
      vendor: 'Digiflazz',
    });
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    addProduct(productForm);
    setIsProductModalOpen(false);
  };

  const handleToggleProductStatus = (
    product: Product,
    status: Product['status'],
  ) => {
    return updateProduct(product.id, { status });
  };

  return (
    <div className={`relative min-h-screen w-full min-w-0 lg:grid lg:items-stretch ${
      isDesktopSidebarCollapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[248px_minmax(0,1fr)]'
    }`}>
      {isMobileSidebarOpen && (
        <button
          type="button"
          aria-label="Tutup navigasi admin"
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        ref={sidebarRef}
        id="admin-sidebar"
        role={isMobileSidebarOpen ? 'dialog' : undefined}
        aria-modal={isMobileSidebarOpen || undefined}
        aria-label="Navigasi dashboard admin"
        className={`dashboard-sidebar ${
          isMobileSidebarOpen
            ? 'fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-3rem))] flex-col overflow-y-auto rounded-none'
            : 'hidden'
        } flex-col border-r border-slate-200 bg-slate-50 p-3 text-slate-900 shadow-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-full lg:rounded-none lg:border-y-0 lg:border-l-0 lg:shadow-none ${
          isDesktopSidebarCollapsed ? 'lg:items-center lg:px-2' : ''
        }`}
      >
        <div className={`flex items-center justify-between gap-3 px-2 py-2 ${
          isDesktopSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
        }`}>
          <div className={`flex min-w-0 items-center gap-3 ${
            isDesktopSidebarCollapsed ? 'lg:justify-center' : ''
          }`}>
            <StoreLogo
              imageClassName="max-h-9 max-w-40"
              textClassName="max-w-40 text-sm font-semibold text-slate-950"
            />
            <div className={`min-w-0 ${isDesktopSidebarCollapsed ? 'lg:hidden' : ''}`}>
              <p className="truncate text-xs text-slate-500">Kontrol aplikasi</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Tutup navigasi admin"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 ${
          isDesktopSidebarCollapsed ? 'lg:hidden' : ''
        }`}>
          Administrasi
        </div>
        <Link
          href="/"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Kembali ke beranda"
          title="Kembali ke beranda"
          className={`mb-1 flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-950 ${
            isDesktopSidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
          }`}
        >
          <Home className="h-4 w-4 shrink-0" />
          <span className={isDesktopSidebarCollapsed ? 'lg:sr-only' : ''}>Kembali ke Home</span>
        </Link>
        <nav aria-label="Navigasi dashboard admin" className="flex w-full flex-col gap-3">
          <SidebarGroup label="Operasional" collapsed={isDesktopSidebarCollapsed}>
            {navigationGroups[0].items.map((item) => (
              <SidebarNavButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeAdminTab === item.id}
                collapsed={isDesktopSidebarCollapsed}
                count={'count' in item ? item.count : undefined}
                onClick={() => {
                  setActiveAdminTab(item.id);
                  setIsMobileSidebarOpen(false);
                }}
              />
            ))}
          </SidebarGroup>

          <SidebarGroup label="Katalog" collapsed={isDesktopSidebarCollapsed}>
            <SidebarNavButton
              icon={Boxes}
              label="Produk"
              active={activeAdminTab === 'products'}
              collapsed={isDesktopSidebarCollapsed}
              expanded={isProductMenuOpen}
              onClick={() => {
                setActiveAdminTab('products');
                setIsProductMenuOpen((open) => !open);
              }}
            />
            {isProductMenuOpen && (
              <div
                id="admin-product-submenu"
                className={`ml-3 mt-1 flex flex-col gap-1 border-l border-slate-300 pl-3 ${
                  isDesktopSidebarCollapsed ? 'lg:ml-0 lg:border-0 lg:pl-0' : ''
                }`}
              >
                {([
                  { id: 'all', label: 'Semua Produk', icon: Boxes },
                  { id: 'pricing', label: 'Daftar Harga & Markup', icon: Tags },
                  { id: 'active', label: 'Produk Aktif', icon: Check },
                  { id: 'inactive', label: 'Produk Nonaktif', icon: Ban },
                ] as const).map((item) => (
                  <SidebarNavButton
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={activeAdminTab === 'products' && productView === item.id}
                    collapsed={isDesktopSidebarCollapsed}
                    small
                    onClick={() => {
                      setProductView(item.id);
                      setActiveAdminTab('products');
                      setIsMobileSidebarOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
            {navigationGroups[1].items.map((item) => (
              <SidebarNavButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeAdminTab === item.id}
                collapsed={isDesktopSidebarCollapsed}
                onClick={() => {
                  setActiveAdminTab(item.id);
                  setIsMobileSidebarOpen(false);
                }}
              />
            ))}
            <SidebarNavButton
              icon={Megaphone}
              label="Promosi"
              active={activeAdminTab === 'promotions'}
              collapsed={isDesktopSidebarCollapsed}
              expanded={isPromotionMenuOpen}
              onClick={() => {
                setActiveAdminTab('promotions');
                setIsPromotionMenuOpen((open) => !open);
              }}
            />
            {isPromotionMenuOpen && (
              <div
                id="admin-promotion-submenu"
                className={`ml-3 mt-1 flex flex-col gap-1 border-l border-slate-300 pl-3 ${
                  isDesktopSidebarCollapsed ? 'lg:ml-0 lg:border-0 lg:pl-0' : ''
                }`}
              >
                {([
                  { id: 'banners', label: 'Banner', icon: Megaphone },
                  { id: 'flash-sales', label: 'Flash Sale', icon: Zap },
                  { id: 'featured', label: 'Produk Unggulan', icon: Flame },
                  { id: 'vouchers', label: 'Voucher', icon: Ticket },
                ] as const).map((item) => (
                  <SidebarNavButton
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={activeAdminTab === 'promotions' && promotionView === item.id}
                    collapsed={isDesktopSidebarCollapsed}
                    small
                    onClick={() => {
                      setPromotionView(item.id);
                      setActiveAdminTab('promotions');
                      setIsMobileSidebarOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
          </SidebarGroup>

          <SidebarGroup label="Pengguna" collapsed={isDesktopSidebarCollapsed}>
            {navigationGroups[2].items.map((item) => (
              <SidebarNavButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeAdminTab === item.id}
                collapsed={isDesktopSidebarCollapsed}
                onClick={() => {
                  setActiveAdminTab(item.id);
                  setIsMobileSidebarOpen(false);
                }}
              />
            ))}
          </SidebarGroup>

          <SidebarGroup label="Pengaturan" collapsed={isDesktopSidebarCollapsed}>
            <SidebarNavButton
              icon={Settings}
              label="Pengaturan"
              active={activeAdminTab === 'settings'}
              collapsed={isDesktopSidebarCollapsed}
              expanded={isSettingsMenuOpen}
              onClick={() => {
                setActiveAdminTab('settings');
                setIsSettingsMenuOpen((open) => !open);
              }}
            />
            {isSettingsMenuOpen && (
              <div
                id="admin-settings-submenu"
                className={`ml-3 mt-1 flex flex-col gap-1 border-l border-slate-300 pl-3 ${
                  isDesktopSidebarCollapsed ? 'lg:ml-0 lg:border-0 lg:pl-0' : ''
                }`}
              >
                {([
                  { id: 'profile', label: 'Profil Toko', icon: Store },
                  { id: 'seo', label: 'SEO & Pencarian', icon: Search },
                  { id: 'payments', label: 'Metode Pembayaran', icon: QrCode },
                  { id: 'legal', label: 'Dokumen Legal', icon: FileText },
                ] as const).map((item) => (
                  <SidebarNavButton
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={activeAdminTab === 'settings' && settingsView === item.id}
                    collapsed={isDesktopSidebarCollapsed}
                    small
                    onClick={() => {
                      setSettingsView(item.id);
                      setActiveAdminTab('settings');
                      setIsMobileSidebarOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
            {navigationGroups[3].items.map((item) => (
              <SidebarNavButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeAdminTab === item.id}
                collapsed={isDesktopSidebarCollapsed}
                onClick={() => {
                  setActiveAdminTab(item.id);
                  setIsMobileSidebarOpen(false);
                }}
              />
            ))}
          </SidebarGroup>
        </nav>

        <div className={`mt-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 ${
          isDesktopSidebarCollapsed ? 'lg:border-transparent lg:bg-transparent lg:p-0' : ''
        }`}>
          <div className={`flex items-center gap-2 font-medium text-slate-800 ${
            isDesktopSidebarCollapsed ? 'lg:justify-center' : ''
          }`}>
            <Activity className="h-3.5 w-3.5 text-emerald-600" />
            <span className={isDesktopSidebarCollapsed ? 'lg:hidden' : ''}>Sesi administrator</span>
          </div>
          <p className={`mt-1 truncate ${isDesktopSidebarCollapsed ? 'lg:hidden' : ''}`}>
            {currentUser?.name ?? 'Admin'}
          </p>
        </div>
        <div className={`mt-3 flex gap-2 ${isDesktopSidebarCollapsed ? 'lg:flex-col lg:items-center' : ''}`}>
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
          <p role="alert" className="mt-2 text-xs text-amber-700">
            {themeError || logoutError}
          </p>
        )}
      </aside>

      <div className="dashboard-inset dashboard-content min-h-screen w-full min-w-0 space-y-5 p-4 sm:p-6 lg:my-2 lg:mr-2 lg:rounded-xl lg:border">
        <header className="dashboard-toolbar sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b px-1">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Buka navigasi admin"
              aria-expanded={isMobileSidebarOpen}
              aria-controls="admin-sidebar"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={isDesktopSidebarCollapsed ? 'Perluas navigasi admin' : 'Ciutkan navigasi admin'}
              aria-expanded={!isDesktopSidebarCollapsed}
              onClick={() => setIsDesktopSidebarCollapsed((collapsed) => !collapsed)}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:flex"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Administrasi</p>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950">
                {activeSectionLabel}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Lihat toko</span>
            </Link>
            <Badge variant="outline" className="hidden sm:inline-flex">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Admin aktif
            </Badge>
          </div>
        </header>

      {/* TAB 1: METRICS */}
      {activeAdminTab === 'metrics' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <span className={`h-2 w-2 rounded-full ${
                  metricsError ? 'bg-rose-500' : metricsDataIsStale ? 'bg-amber-500' : 'bg-emerald-500'
                }`} />
                {metricsFreshnessLabel}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {formattedMetricsUpdatedAt
                  ? `Data ${metricsDataPeriod ? metricsPeriodLabels[metricsDataPeriod] : ''} terakhir diperbarui ${formattedMetricsUpdatedAt}`
                  : 'Waktu pembaruan akan tampil setelah data berhasil dimuat.'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Periode memfilter KPI transaksi, omzet, dan laba; daftar aktivitas tetap menampilkan yang terbaru. Semua waktu tanpa perbandingan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="metrics-period" className="sr-only">
                Periode ringkasan transaksi
              </label>
              <select
                id="metrics-period"
                value={metricsPeriod}
                onChange={(event) => {
                  const period = event.currentTarget.value;
                  if (period === '7d' || period === '30d' || period === 'all') {
                    setMetricsPeriod(period);
                  }
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <option value="7d">{metricsPeriodLabels['7d']}</option>
                <option value="30d">{metricsPeriodLabels['30d']}</option>
                <option value="all">Semua waktu</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadOverview()}
                disabled={isLoadingMetrics}
              >
                {isLoadingMetrics
                  ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-2 h-4 w-4" />}
                {isLoadingMetrics ? 'Memuat…' : 'Perbarui'}
              </Button>
            </div>
          </div>
          {metricsError && (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {metricsUpdatedAt && metricsDataPeriod !== metricsPeriod
                ? `Pembaruan gagal. Data ${metricsDataPeriod ? metricsPeriodLabels[metricsDataPeriod] : 'periode sebelumnya'} tetap ditampilkan, bukan ${metricsPeriodLabels[metricsPeriod]}: ${metricsError}`
                : metricsUpdatedAt
                  ? `Pembaruan gagal, data terakhir tetap ditampilkan: ${metricsError}`
                  : `Statistik live tidak tersedia: ${metricsError}`}
            </p>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Saldo H2H</CardTitle>
                <CardDescription className="mt-1">
                  Saldo vendor dimuat langsung dari provider yang sudah dikonfigurasi.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadProviderBalances()}
                disabled={isLoadingProviderBalances}
              >
                {isLoadingProviderBalances
                  ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-2 h-4 w-4" />}
                {isLoadingProviderBalances ? 'Memuat…' : 'Perbarui'}
              </Button>
            </CardHeader>
            <CardContent>
              {providerBalancesError && (
                <p role="alert" className="mb-3 text-sm text-rose-700">
                  Pembaruan saldo gagal{providerBalancesCheckedAt
                    ? ` (${formatDashboardDate(providerBalancesCheckedAt)})`
                    : ''}: {providerBalancesError}
                  {providerBalances.length > 0 ? ' Menampilkan hasil terakhir yang tersedia.' : ''}
                </p>
              )}
              {isLoadingProviderBalances && providerBalances.length === 0 ? (
                <p className="text-sm text-slate-500">Mengambil saldo provider…</p>
              ) : providerBalances.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Belum ada H2H dengan kredensial yang dikonfigurasi.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {providerBalances.map((provider) => {
                    const isStale = Boolean(
                      provider.fetchedAt &&
                      freshnessNow - new Date(provider.fetchedAt).getTime() > 5 * 60 * 1000,
                    );
                    const isCurrent = provider.status === 'available' && !isStale;
                    return (
                      <div
                        key={provider.id}
                        className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          isCurrent ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          <Wallet className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">
                            Saldo {provider.name}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {provider.mode}
                            </span>
                          </p>
                          {provider.balance !== null ? (
                            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-950">
                              Rp {provider.balance.toLocaleString('id-ID')}
                            </p>
                          ) : (
                            <p role="alert" className="mt-0.5 text-sm text-rose-700">
                              {provider.error ?? 'Saldo belum pernah dimuat.'}
                            </p>
                          )}
                          <p className={`mt-0.5 text-[11px] ${
                            isCurrent ? 'text-emerald-700' : 'text-amber-700'
                          }`}>
                            {isCurrent
                              ? 'Terkini'
                              : provider.balance !== null
                                ? provider.status === 'unavailable'
                                  ? 'Data terakhir · pembaruan gagal'
                                  : 'Data mungkin usang'
                                : 'Belum tersedia'}
                            {provider.fetchedAt
                              ? ` · saldo diperbarui ${formatDashboardDate(provider.fetchedAt)}`
                              : ''}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Dicek {formatDashboardDate(provider.checkedAt) ?? 'waktu tidak diketahui'}
                          </p>
                          {provider.status === 'unavailable' && provider.error && provider.balance !== null && (
                            <p role="alert" className="mt-1 text-xs text-amber-700">{provider.error}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => openTransactions('success')}
              className="text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 rounded-xl"
              aria-label="Lihat transaksi berhasil"
            >
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs flex justify-between items-center">
                    <span>Omzet berhasil</span>
                    <DollarSign className="w-4 h-4 text-blue-600" />
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold font-sans">
                    Rp {displayedMetrics.totalRevenue.toLocaleString('id-ID')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] text-emerald-600 font-medium">
                    {displayedMetrics.successfulCount} dari {displayedMetrics.totalTransactions} transaksi
                  </p>
                  {formatPeriodChange(displayedMetrics.totalRevenue, comparisonMetrics?.totalRevenue) && (
                    <p className="mt-1 text-[11px] font-medium text-slate-500">
                      {formatPeriodChange(displayedMetrics.totalRevenue, comparisonMetrics?.totalRevenue)}
                    </p>
                  )}
                  {formatPeriodChange(displayedMetrics.totalTransactions, comparisonMetrics?.totalTransactions) && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Transaksi: {formatPeriodChange(
                        displayedMetrics.totalTransactions,
                        comparisonMetrics?.totalTransactions,
                      )}
                    </p>
                  )}
                </CardContent>
              </Card>
            </button>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs flex justify-between items-center">
                  <span>Laba Bersih (Markup)</span>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-emerald-600 font-sans">
                  Rp {displayedMetrics.totalProfit.toLocaleString('id-ID')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-slate-500">
                  Margin keuntungan per transaksi
                </p>
                {formatPeriodChange(displayedMetrics.totalProfit, comparisonMetrics?.totalProfit) && (
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {formatPeriodChange(displayedMetrics.totalProfit, comparisonMetrics?.totalProfit)}
                  </p>
                )}
              </CardContent>
            </Card>

            <button
              type="button"
              onClick={() => setActiveAdminTab('deposits')}
              className="text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 rounded-xl"
              aria-label="Buka antrean verifikasi deposit"
            >
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs flex justify-between items-center">
                    <span>Antrean Deposit Pending</span>
                    <Clock className="w-4 h-4 text-amber-600" />
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold text-amber-600 font-sans">
                    {displayedMetrics.pendingDepositsCount} Pengajuan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] text-slate-500">
                    Total Rp {displayedMetrics.pendingDepositsAmount.toLocaleString('id-ID')}
                  </p>
                </CardContent>
              </Card>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminTab('users')}
              className="text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 rounded-xl"
              aria-label="Buka manajemen pengguna"
            >
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs flex justify-between items-center">
                    <span>Pengguna terdaftar</span>
                    <Users className="w-4 h-4 text-blue-600" />
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold text-slate-900 font-sans">
                    {displayedMetrics.userCount.toLocaleString('id-ID')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {displayedMetrics.activeProductCount.toLocaleString('id-ID')} produk aktif
                  </p>
                </CardContent>
              </Card>
            </button>

            <button
              type="button"
              onClick={() => openTransactions('pending')}
              className="text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 rounded-xl"
              aria-label="Lihat transaksi menunggu"
            >
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs flex justify-between items-center">
                    <span>Transaksi menunggu</span>
                    <Clock className={`w-4 h-4 ${
                      (displayedMetrics.overduePendingCount ?? 0) > 0
                        ? 'text-rose-600'
                        : 'text-amber-600'
                    }`} />
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold font-sans">
                  {(displayedMetrics.pendingCount ?? 0).toLocaleString('id-ID')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(displayedMetrics.overduePendingCount ?? 0) > 0 ? (
                  <p className="text-[11px] font-medium text-rose-700">
                    {displayedMetrics.overduePendingCount} tertahan lebih dari 5 menit
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Tidak ada transaksi pending lebih dari 5 menit
                  </p>
                )}
                {formatPendingAge(displayedMetrics.oldestPendingAt, dashboardNow) && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Pending tertua: {formatPendingAge(
                      displayedMetrics.oldestPendingAt,
                      dashboardNow,
                    )}
                  </p>
                )}
              </CardContent>
              </Card>
            </button>

            <button
              type="button"
              onClick={() => openTransactions('failed')}
              className="text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 rounded-xl"
              aria-label="Lihat transaksi gagal"
            >
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs flex justify-between items-center">
                    <span>Transaksi gagal</span>
                    <CircleAlert className="w-4 h-4 text-rose-600" />
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold font-sans text-rose-700">
                    {(displayedMetrics.failedCount ?? 0).toLocaleString('id-ID')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] text-slate-500">
                    Dalam {metricsPeriodLabels[metricsPeriod]}
                  </p>
                </CardContent>
              </Card>
            </button>
          </div>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    {summaryActivityTab === 'transactions' ? 'Riwayat Transaksi' : 'Mutasi Saldo'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {summaryActivityTab === 'transactions'
                      ? 'Transaksi terbaru seluruh pelanggan.'
                      : 'Perubahan saldo terbaru pada akun pelanggan.'}
                  </CardDescription>
                </div>
                {summaryActivityTab === 'transactions' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveAdminTab('transactions')}
                  >
                    Lihat semua transaksi
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                role="tablist"
                aria-label="Aktivitas dashboard"
                className="grid grid-cols-2 gap-2"
              >
                {([
                  { id: 'transactions', label: 'Transaksi' },
                  { id: 'mutations', label: 'Mutasi' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={summaryActivityTab === tab.id}
                    onClick={() => setSummaryActivityTab(tab.id)}
                    className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition-colors ${
                      summaryActivityTab === tab.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activityError ? (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-4 text-sm text-rose-700">
                  Riwayat aktivitas gagal dimuat: {activityError}
                </p>
              ) : summaryActivityTab === 'transactions' ? (
                recentTransactions.length ? (
                  <div className="divide-y divide-slate-100">
                    {recentTransactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            transaction.status === 'success'
                              ? 'bg-emerald-500'
                              : transaction.status === 'failed'
                                ? 'bg-rose-500'
                                : 'bg-amber-500'
                          }`} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {transaction.productName}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {transaction.destination} · {transaction.userName ?? 'Tamu'} ·{' '}
                              {new Date(transaction.createdAt).toLocaleString('id-ID')}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            Rp {transaction.amount.toLocaleString('id-ID')}
                          </p>
                          <p className={`text-xs ${
                            transaction.status === 'success'
                              ? 'text-emerald-600'
                              : transaction.status === 'failed'
                                ? 'text-rose-600'
                                : 'text-amber-600'
                          }`}>
                            {transaction.status === 'success'
                              ? `+Rp ${transaction.profit.toLocaleString('id-ID')} laba`
                              : transaction.status === 'failed'
                                ? 'Gagal'
                                : 'Diproses'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">Belum ada transaksi.</p>
                )
              ) : recentMutations.length ? (
                <div className="divide-y divide-slate-100">
                  {recentMutations.map((mutation) => (
                    <div
                      key={mutation.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {mutation.userName}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {mutation.note} · {mutation.reference}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(mutation.createdAt).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p className={`text-sm font-semibold tabular-nums ${
                          mutation.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {mutation.type === 'credit' ? '+' : '−'}Rp {mutation.amount.toLocaleString('id-ID')}
                        </p>
                        <p className="text-xs text-slate-500">
                          Saldo: Rp {mutation.balanceAfter.toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">Belum ada mutasi saldo.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: VERIFIKASI DEPOSIT MANUAL & STATIC QRIS */}
      {activeAdminTab === 'deposits' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">Antrean Verifikasi Bukti Deposit</CardTitle>
                <CardDescription>
                  Pemeriksaan manual transfer bank dan pembayaran QRIS Statis Toko
                </CardDescription>
              </div>
              <Badge variant="outline">
                {deposits.length.toLocaleString('id-ID')} / {depositReviewTotal.toLocaleString('id-ID')} pengajuan
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {deposits.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                Belum ada pengajuan deposit untuk ditinjau.
              </p>
            )}
            {deposits.map((dep) => (
              <div
                key={dep.id}
                className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  {dep.proofPath ? (
                    <button
                      type="button"
                      onClick={() => setSelectedProofUrl(dep.proofPath)}
                      className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-300 overflow-hidden flex-shrink-0 cursor-pointer relative group"
                      title="Klik untuk zoom bukti transfer"
                    >
                      <img
                        src={dep.proofPath}
                        alt="Bukti Transfer"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                      />
                      <span className="absolute inset-0 bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                        <Eye className="w-4 h-4" />
                      </span>
                    </button>
                  ) : dep.type === 'qrisly' ? (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-500">
                      QRIS<br />otomatis
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700">
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      WhatsApp
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-slate-900">{dep.id}</span>
                      <Badge variant={dep.type === 'static_qris' || dep.type === 'qrisly' ? 'warning' : 'blue'} className="text-[10px]">
                        {dep.paymentMethodLabel || (dep.type === 'qrisly' ? 'QRIS Qrisly' : dep.type === 'static_qris' ? 'QRIS Statis' : `Bank ${dep.targetBank}`)}
                      </Badge>
                      <Badge
                        variant={
                          dep.status === 'approved' ? 'success' : dep.status === 'pending' ? 'warning' : 'destructive'
                        }
                        className="text-[10px]"
                      >
                        {dep.status.toUpperCase()}
                      </Badge>
                    </div>

                    <h4 className="font-bold text-sm text-slate-900">
                      {dep.userName} ({dep.userPhone})
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Diajukan: {new Date(dep.createdAt).toLocaleString('id-ID')}
                    </p>
                    {dep.adminNote && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-1.5 rounded-lg border border-slate-200 mt-1">
                        Catatan: <span className="font-medium text-slate-900">{dep.adminNote}</span>
                      </p>
                    )}
                    {dep.status === 'pending' && dep.type !== 'qrisly' && !dep.proofPath && (
                      <p className="mt-1 text-xs text-emerald-800">
                        Bukti dikirim langsung ke WhatsApp. Verifikasi chat dan mutasi rekening sebelum menyetujui.
                      </p>
                    )}
                    {dep.type === 'qrisly' && dep.providerReference && (
                      <p className="mt-1 text-xs text-slate-500">Referensi Qrisly: {dep.providerReference}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Nominal Deposit</span>
                    <span className="text-base font-bold text-slate-900 font-sans">
                      Rp {dep.amount.toLocaleString('id-ID')}
                    </span>
                  </div>

                  {dep.status === 'pending' && dep.type !== 'qrisly' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setRejectDepositId(dep.id);
                          setRejectReason('Bukti transfer tidak terbaca / mutasi tidak sesuai');
                        }}
                      >
                        Tolak
                      </Button>
                      <Button
                        size="sm"
                        variant="emerald"
                        onClick={() => approveDeposit(dep.id)}
                      >
                        Setujui (+Saldo)
                      </Button>
                    </div>
                  )}
                  {dep.status === 'pending' && dep.type === 'qrisly' && (
                    <p className="max-w-40 text-right text-xs text-slate-500">
                      Menunggu konfirmasi otomatis dari Qrisly
                    </p>
                  )}
                </div>
              </div>
            ))}
            {depositMoreError && (
              <p role="alert" className="text-center text-sm text-rose-700">
                {depositMoreError}
              </p>
            )}
            {hasMoreAdminDeposits && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMoreAdminDeposits}
                  onClick={() => {
                    setDepositMoreError('');
                    void loadMoreAdminDeposits().catch((error: unknown) => {
                      setDepositMoreError(
                        error instanceof Error
                          ? error.message
                          : 'Riwayat deposit tambahan gagal dimuat.',
                      );
                    });
                  }}
                >
                  {loadingMoreAdminDeposits ? 'Memuat deposit…' : 'Muat deposit lebih lama'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeAdminTab === 'settings' && (
        settingsView === 'payments' ? (
          <PaymentMethodsPanel />
        ) : settingsView === 'legal' ? (
          <LegalDocumentsPanel />
        ) : (
          <StoreSettingsPanel view={settingsView} />
        )
      )}

      {/* TAB 4: PRODUK & CRUD LENGKAP */}
      {activeAdminTab === 'products' && (
        <ProductManagementPanel
          products={products.map((product) => ({
            ...product,
            basePrice: product.basePrice ?? 0,
            sellPriceAgent: product.sellPriceAgent ?? 0,
          }))}
          view={productView}
          onAdd={handleOpenAddProduct}
          onToggleStatus={handleToggleProductStatus}
        />
      )}

      {/* TAB 5: PENGGUNA & CRUD USER */}
      {activeAdminTab === 'users' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">Manajemen Pengguna & Saldo Akun</CardTitle>
                <CardDescription>
                  Pengguna mendaftar mandiri melalui verifikasi OTP. Perubahan saldo dicatat di ledger.
                </CardDescription>
              </div>
              <Badge variant="blue">{users.length} Akun Terdaftar</Badge>
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-3 xl:hidden">
              {users.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  Belum ada akun terdaftar.
                </p>
              )}
              {users.map((u) => (
                <article key={u.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{u.name}</h3>
                    <p className="mt-1 break-all text-xs text-slate-600">{u.email}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{u.phone}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="space-y-1">
                      <Label htmlFor={`mobile-user-role-${u.id}`} className="text-xs text-slate-500">
                        Peran
                      </Label>
                      <select
                        id={`mobile-user-role-${u.id}`}
                        value={u.role}
                        disabled={u.id === currentUser?.id}
                        onChange={(event) => {
                          const nextRole = event.target.value;
                          if (nextRole === 'user' || nextRole === 'agent' || nextRole === 'admin') {
                            updateUserRole(u.id, nextRole);
                          }
                        }}
                        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold uppercase disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="user">User</option>
                        <option value="agent">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="text-right">
                      <span className="block text-xs text-slate-500">Saldo</span>
                      <span className="font-mono font-semibold text-slate-900">
                        Rp {u.balance.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {u.role === 'user' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => updateUserRole(u.id, 'agent')}
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        Upgrade Member
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingUserBalance({
                        id: u.id,
                        name: u.name,
                        current: u.balance,
                      })}
                    >
                      Ubah Saldo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={u.id === currentUser?.id}
                      onClick={() => void deleteUser(u)}
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Hapus
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto border border-slate-200 rounded-xl xl:block">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Nama Pengguna</th>
                    <th className="py-2.5 px-3">Email & No HP</th>
                    <th className="py-2.5 px-3">Peran (Role)</th>
                    <th className="py-2.5 px-3 text-right">Saldo Deposit</th>
                    <th className="py-2.5 px-3 text-center">Aksi Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        Belum ada akun terdaftar.
                      </td>
                    </tr>
                  )}
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{u.name}</td>
                      <td className="py-2.5 px-3">
                        <div>{u.email}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{u.phone}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          aria-label={`Peran ${u.name}`}
                          value={u.role}
                          disabled={u.id === currentUser?.id}
                          onChange={(event) => {
                            const nextRole = event.target.value;
                            if (nextRole === 'user' || nextRole === 'agent' || nextRole === 'admin') {
                              updateUserRole(u.id, nextRole);
                            }
                          }}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold uppercase disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="user">User</option>
                          <option value="agent">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        Rp {u.balance.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {u.role === 'user' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserRole(u.id, 'agent')}
                              className="text-[10px] h-7 text-emerald-700"
                            >
                              Upgrade Member
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingUserBalance({ id: u.id, name: u.name, current: u.balance })}
                            className="text-[10px] h-7"
                          >
                            Ubah Saldo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={u.id === currentUser?.id}
                            onClick={() => void deleteUser(u)}
                            className="text-[10px] h-7 border-rose-200 text-rose-700 hover:bg-rose-50"
                          >
                            Hapus
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeAdminTab === 'transactions' && (
        <AdminTransactionsPanel initialStatus={transactionsInitialStatus} />
      )}

      {activeAdminTab === 'promotions' && (
        promotionView === 'flash-sales' ? (
          <FlashSalePanel />
        ) : promotionView === 'featured' ? (
          <FeaturedProductsPanel />
        ) : promotionView === 'vouchers' ? (
          <VoucherManagementPanel />
        ) : (
          <PromotionManagementPanel />
        )
      )}

      {/* TAB 7: SERVER-SIDE INTEGRATION SETTINGS */}
      {activeAdminTab === 'digiflazz' && (
        <IntegrationSettingsPanel />
      )}

      {activeAdminTab === 'frontend-integration' && (
        <FrontendIntegrationPanel />
      )}

      {activeAdminTab === 'system' && (
        <SystemSettingsPanel />
      )}
      </div>

      {/* MODAL: PROOF ZOOM */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-sm text-slate-900">Detail Bukti Transfer / QRIS</h4>
              <Button size="icon" variant="ghost" onClick={() => setSelectedProofUrl(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <img src={selectedProofUrl} alt="Bukti" className="max-h-[65vh] mx-auto rounded-xl object-contain" />
          </div>
        </div>
      )}

      {/* MODAL: REJECT DEPOSIT */}
      {rejectDepositId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <h4 className="font-bold text-sm text-slate-900">Tolak Deposit</h4>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRejectDepositId(null)} className="flex-1">
                Batal
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  rejectDeposit(rejectDepositId, rejectReason);
                  setRejectDepositId(null);
                }}
                className="flex-1"
              >
                Konfirmasi Tolak
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER BALANCE */}
      {editingUserBalance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl text-xs">
            <h4 className="font-bold text-sm text-slate-900">Penyesuaian Saldo: {editingUserBalance.name}</h4>
            <p className="text-slate-500">Saldo sekarang: Rp {editingUserBalance.current.toLocaleString('id-ID')}</p>
            <div className="space-y-1">
              <Label>Nominal Penyesuaian (Gunakan tanda - untuk kurangi saldo):</Label>
              <Input
                type="number"
                value={balanceAdjustment}
                onChange={(e) => setBalanceAdjustment(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="balance-adjustment-note">Alasan penyesuaian</Label>
              <Input
                id="balance-adjustment-note"
                required
                maxLength={500}
                value={balanceAdjustmentNote}
                onChange={(event) => setBalanceAdjustmentNote(event.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingUserBalance(null)} className="flex-1">
                Batal
              </Button>
              <Button
                variant="emerald"
                onClick={() => {
                  updateUserBalance(
                    editingUserBalance.id,
                    balanceAdjustment,
                    balanceAdjustmentNote,
                  );
                  setEditingUserBalance(null);
                }}
                className="flex-1"
              >
                Simpan Saldo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH / EDIT PRODUK */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <form onSubmit={handleSaveProduct} className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3 shadow-2xl text-xs">
            <h4 className="font-bold text-sm text-slate-900">
              Tambah Produk Baru
            </h4>
            <div className="space-y-2">
              <div>
                <Label>Nama Produk</Label>
                <Input
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Kode Vendor</Label>
                  <Input
                    required
                    value={productForm.vendorCode}
                    onChange={(e) => setProductForm({ ...productForm, vendorCode: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Kategori</Label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value as ProductCategory })}
                    className="w-full h-9 rounded-lg border border-slate-200 px-3 bg-white"
                  >
                    <option value="pulsa">Pulsa</option>
                    <option value="data">Paket Data</option>
                    <option value="voucher">Voucher Data</option>
                    <option value="ewallet">E-Wallet</option>
                    <option value="game">Topup Game</option>
                    <option value="pln">Token PLN</option>
                    <option value="tagihan">Tagihan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Modal Digiflazz</Label>
                  <Input
                    type="number"
                    value={productForm.basePrice}
                    onChange={(e) => setProductForm({ ...productForm, basePrice: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <Label>Harga Jual</Label>
                  <Input
                    type="number"
                    value={productForm.sellPriceUser}
                    onChange={(e) => setProductForm({ ...productForm, sellPriceUser: parseInt(e.target.value, 10) || 0 })}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Markup {formatMarkupText(
                      calculateMarkup(productForm.basePrice, productForm.sellPriceUser),
                    )}
                  </p>
                </div>
                <div>
                  <Label>Harga Member</Label>
                  <Input
                    type="number"
                    value={productForm.sellPriceAgent}
                    onChange={(e) => setProductForm({ ...productForm, sellPriceAgent: parseInt(e.target.value, 10) || 0 })}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Markup {formatMarkupText(
                      calculateMarkup(productForm.basePrice, productForm.sellPriceAgent),
                    )}
                  </p>
                </div>
              </div>

              <div>
                <Label>Harga Coret (opsional)</Label>
                <Input
                  type="number"
                  min={productForm.sellPriceUser + 1}
                  value={productForm.compareAtPrice ?? ''}
                  onChange={(e) => setProductForm({
                    ...productForm,
                    compareAtPrice: e.target.value ? parseInt(e.target.value, 10) : null,
                  })}
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Harus lebih tinggi dari harga jual dan akan tampil dicoret di katalog.
                </p>
              </div>

              <div>
                <Label>Deskripsi</Label>
                <Input
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsProductModalOpen(false)} className="flex-1">
                Batal
              </Button>
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                Simpan
              </Button>
            </div>
          </form>
        </div>
      )}

      {(isLoadingMetrics || isLoadingProviderBalances) && (
        <LoadingState
          message={isLoadingMetrics ? 'Memuat ringkasan admin…' : 'Memuat saldo vendor…'}
        />
      )}
    </div>
  );
}
