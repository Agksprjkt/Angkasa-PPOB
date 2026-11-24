'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlusCircle, ReceiptText, Settings, Wallet } from 'lucide-react';
import { usePPOB } from '@/context/PPOBContext';
import BalanceCard from '@/components/BalanceCard';
import DepositModal from '@/components/DepositModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CustomerDashboardProps {
  userName: string;
}

interface DailyOverview {
  totalTransactions: number;
  successfulTransactions: number;
  pendingTransactions: number;
  failedTransactions: number;
  totalSpent: number;
  generatedAt: string;
}

function isDailyOverview(value: unknown): value is DailyOverview {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return [
    data.totalTransactions,
    data.successfulTransactions,
    data.pendingTransactions,
    data.failedTransactions,
    data.totalSpent,
  ].every((item) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0) &&
    typeof data.generatedAt === 'string' &&
    !Number.isNaN(new Date(data.generatedAt).getTime());
}

const dailyMetrics = [
  { key: 'totalTransactions', label: 'Total transaksi', color: 'text-slate-900', href: '/dashboard/transactions' },
  { key: 'totalSpent', label: 'Total belanja', color: 'text-blue-700', currency: true, href: '/dashboard/transactions' },
  { key: 'pendingTransactions', label: 'Menunggu', color: 'text-amber-700', href: '/dashboard/transactions?status=pending' },
  { key: 'successfulTransactions', label: 'Sukses', color: 'text-emerald-700', href: '/dashboard/transactions?status=success' },
  { key: 'failedTransactions', label: 'Gagal', color: 'text-rose-700', href: '/dashboard/transactions?status=failed' },
] as const;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('id-ID') ?? '')
    .join('') || '?';
}

export default function CustomerDashboard({ userName }: CustomerDashboardProps) {
  const { currentUser } = usePPOB();
  const router = useRouter();
  const [overview, setOverview] = useState<DailyOverview | null>(null);
  const [overviewError, setOverviewError] = useState('');
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const userId = currentUser?.id;

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    setIsLoadingOverview(true);
    setOverviewError('');
    try {
      const response = await fetch('/api/user/overview', {
        cache: 'no-store',
        signal,
      });
      const result: unknown = await response.json();
      if (!response.ok || !isDailyOverview(result)) {
        const errorMessage =
          typeof result === 'object' &&
          result !== null &&
          'error' in result &&
          typeof result.error === 'string'
            ? result.error
            : 'Ringkasan transaksi hari ini gagal dimuat.';
        throw new Error(errorMessage);
      }
      setOverview(result);
    } catch (error) {
      if (!signal?.aborted) {
        setOverviewError(
          error instanceof Error ? error.message : 'Ringkasan transaksi hari ini gagal dimuat.',
        );
      }
    } finally {
      if (!signal?.aborted) setIsLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void loadOverview(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadOverview, userId]);

  return (
    <div className="dashboard-content space-y-6">
      <section
        id="customer-overview"
        className="liquid-surface scroll-mt-24 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-base font-bold text-blue-800"
            >
              {initials(currentUser?.name ?? userName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900">{currentUser?.name ?? userName}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {currentUser?.phone ? currentUser.phone : 'Pelanggan'}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/settings"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-slate-700 transition hover:bg-white"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Pengaturan
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-4">
          {[
            { href: '/dashboard/transactions', label: 'Transaksi', icon: ReceiptText },
            { href: '/dashboard/mutations', label: 'Mutasi', icon: Wallet },
            { href: '/dashboard/settings', label: 'Pengaturan', icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white/70 text-[11px] font-medium text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setIsDepositOpen(true)}
            className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Isi saldo
          </button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <BalanceCard
          onOpenDeposit={() => setIsDepositOpen(true)}
          onOpenMutations={() => router.push('/dashboard/mutations')}
        />
        <Card id="customer-daily" className="scroll-mt-24">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transaksi hari ini</CardTitle>
            <CardDescription>
              Ringkasan aktivitas akun berdasarkan waktu WIB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overviewError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p role="alert" className="text-sm text-rose-700">{overviewError}</p>
                <button
                  type="button"
                  onClick={() => void loadOverview()}
                  className="mt-2 text-xs font-semibold text-rose-700 underline"
                >
                  Coba lagi
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {dailyMetrics.map((metric) => {
                  const value = overview?.[metric.key];
                  const formatted = 'currency' in metric && metric.currency
                    ? `Rp ${(value ?? 0).toLocaleString('id-ID')}`
                    : (value ?? 0).toLocaleString('id-ID');
                  return (
                    <Link
                      key={metric.key}
                      href={metric.href}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-blue-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <p className="text-[11px] text-slate-500">{metric.label}</p>
                      <p className={`mt-1 text-lg font-bold ${metric.color}`}>
                        {isLoadingOverview ? '—' : formatted}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
    </div>
  );
}
