'use client';

import React, { useRef, useState, useMemo } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { Transaction } from '@/types/ppob';
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react';
import type { BalanceMutation } from '@/types/ppob';

interface HistoryViewProps {
  onSelectReceipt: (trx: Transaction) => void;
  onRequireAuth: () => void;
}

type DepositHistoryItem = {
  id: string;
  amount: number;
  type: 'bank_transfer' | 'static_qris' | 'qrisly';
  paymentMethodLabel: string | null;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string | null;
  providerReference?: string | null;
  createdAt: string;
};

export default function HistoryView({ onSelectReceipt, onRequireAuth }: HistoryViewProps) {
  const { currentUser, transactions, transactionTotal, isGuest } = usePPOB();

  const [activeTab, setActiveTab] = useState<'transactions' | 'deposits' | 'mutations'>('transactions');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'pending' | 'failed'>('all');
  const [olderHistory, setOlderHistory] = useState<{
    ownerKey: string;
    transactions: Transaction[];
    nextPage: number;
    hasMore: boolean;
    loading: boolean;
    error: string;
  } | null>(null);
  const [deposits, setDeposits] = useState<DepositHistoryItem[]>([]);
  const [depositHistoryLoading, setDepositHistoryLoading] = useState(false);
  const [depositHistoryError, setDepositHistoryError] = useState('');
  const [depositHistoryLoaded, setDepositHistoryLoaded] = useState(false);
  const depositRequestInFlight = useRef(false);
  const [mutationHistory, setMutationHistory] = useState<{
    ownerKey: string;
    mutations: BalanceMutation[];
    nextPage: number;
    total: number;
    loading: boolean;
    error: string;
  } | null>(null);
  const mutationRequestInFlight = useRef(false);

  const historyOwnerKey = `${currentUser?.id ?? 'guest'}:${transactions[0]?.id ?? 'none'}`;
  const currentOlderHistory = olderHistory?.ownerKey === historyOwnerKey ? olderHistory : null;
  const olderTransactions = useMemo(
    () => currentOlderHistory?.transactions ?? [],
    [currentOlderHistory],
  );
  const nextTransactionPage = currentOlderHistory?.nextPage ?? 2;
  const hasMoreTransactions =
    currentOlderHistory?.hasMore ?? transactionTotal > transactions.length;
  const transactionHistoryLoading = currentOlderHistory?.loading ?? false;
  const transactionHistoryError = currentOlderHistory?.error ?? '';
  const mutationOwnerKey = currentUser?.id ?? 'guest';
  const currentMutationHistory = mutationHistory?.ownerKey === mutationOwnerKey
    ? mutationHistory
    : null;

  const loadMutationPage = async (page: number) => {
    if (isGuest || mutationRequestInFlight.current) return;
    mutationRequestInFlight.current = true;
    const previous = currentMutationHistory;
    setMutationHistory({
      ownerKey: mutationOwnerKey,
      mutations: previous?.mutations ?? [],
      nextPage: previous?.nextPage ?? 1,
      total: previous?.total ?? 0,
      loading: true,
      error: '',
    });
    try {
      const response = await fetch(`/api/user/wallet/ledger?page=${page}`, {
        cache: 'no-store',
      });
      const result = await response.json() as {
        mutations?: BalanceMutation[];
        pageSize?: number;
        total?: number;
        error?: string;
      };
      if (
        !response.ok ||
        !Array.isArray(result.mutations) ||
        typeof result.pageSize !== 'number' ||
        typeof result.total !== 'number'
      ) {
        throw new Error('Riwayat mutasi saldo gagal dimuat. Coba lagi.');
      }

      const existing = page === 1 ? [] : previous?.mutations ?? [];
      const ids = new Set(existing.map((mutation) => mutation.id));
      const nextMutations = [
        ...existing,
        ...result.mutations.filter((mutation) => !ids.has(mutation.id)),
      ];
      setMutationHistory({
        ownerKey: mutationOwnerKey,
        mutations: nextMutations,
        nextPage: page + 1,
        total: result.total,
        loading: false,
        error: '',
      });
    } catch (error) {
      setMutationHistory({
        ownerKey: mutationOwnerKey,
        mutations: previous?.mutations ?? [],
        nextPage: previous?.nextPage ?? page,
        total: previous?.total ?? 0,
        loading: false,
        error: error instanceof Error
          ? error.message
          : 'Riwayat mutasi saldo gagal dimuat. Coba lagi.',
      });
    } finally {
      mutationRequestInFlight.current = false;
    }
  };

  const showMutationHistory = () => {
    setActiveTab('mutations');
    if (isGuest) return;
    if (currentMutationHistory || mutationRequestInFlight.current) return;
    void loadMutationPage(1);
  };

  const loadMoreTransactions = async () => {
    if (transactionHistoryLoading || !hasMoreTransactions) return;
    setOlderHistory({
      ownerKey: historyOwnerKey,
      transactions: olderTransactions,
      nextPage: nextTransactionPage,
      hasMore: hasMoreTransactions,
      loading: true,
      error: '',
    });
    try {
      const response = await fetch(`/api/transactions?page=${nextTransactionPage}`, {
        cache: 'no-store',
      });
      const result = await response.json() as {
        transactions?: Transaction[];
        pageSize?: number;
        total?: number;
        error?: string;
      };
      if (
        !response.ok ||
        !Array.isArray(result.transactions) ||
        typeof result.pageSize !== 'number' ||
        typeof result.total !== 'number'
      ) {
        throw new Error('Riwayat transaksi lama gagal dimuat. Coba lagi.');
      }

      const uniqueOlder = result.transactions.filter((transaction) =>
        !transactions.some((current) => current.id === transaction.id) &&
        !olderTransactions.some((current) => current.id === transaction.id),
      );
      const nextOlder = [...olderTransactions, ...uniqueOlder];
      setOlderHistory({
        ownerKey: historyOwnerKey,
        transactions: nextOlder,
        nextPage: nextTransactionPage + 1,
        hasMore:
          result.transactions.length === result.pageSize &&
          result.total > transactions.length + nextOlder.length,
        loading: false,
        error: '',
      });
    } catch (error) {
      setOlderHistory({
        ownerKey: historyOwnerKey,
        transactions: olderTransactions,
        nextPage: nextTransactionPage,
        hasMore: hasMoreTransactions,
        loading: false,
        error: error instanceof Error
          ? error.message
          : 'Riwayat transaksi lama gagal dimuat. Coba lagi.',
      });
    }
  };

  const showDepositHistory = (force = false) => {
    setActiveTab('deposits');
    if (isGuest) return;
    if ((!force && depositHistoryLoaded) || depositRequestInFlight.current) return;

    depositRequestInFlight.current = true;
    setDepositHistoryLoading(true);
    setDepositHistoryError('');
    void fetch('/api/deposits?view=history', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as {
          deposits?: DepositHistoryItem[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(result.deposits)) {
          throw new Error(
            result.error === 'UNAUTHORIZED'
              ? 'Masuk untuk melihat riwayat isi saldo.'
              : 'Riwayat isi saldo gagal dimuat. Coba lagi.',
          );
        }
        setDeposits(result.deposits);
        setDepositHistoryLoaded(true);
      })
      .catch((error: unknown) => {
        setDepositHistoryError(
          error instanceof Error ? error.message : 'Riwayat isi saldo gagal dimuat. Coba lagi.',
        );
      })
      .finally(() => {
        depositRequestInFlight.current = false;
        setDepositHistoryLoading(false);
      });
  };

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    const allTransactions = [...transactions, ...olderTransactions];
    return allTransactions.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchRef = t.referenceId.toLowerCase().includes(query);
        const matchDest = t.destination.toLowerCase().includes(query);
        const matchProd = t.productName.toLowerCase().includes(query);
        if (!matchRef && !matchDest && !matchProd) return false;
      }
      return true;
    });
  }, [transactions, olderTransactions, statusFilter, searchQuery]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Top Header & Tab Switcher */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-base text-slate-900">Riwayat</h2>
          <p className="text-xs text-slate-500">Lihat transaksi, pengajuan deposit, dan perubahan saldo.</p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/80 p-1">
          <button
            type="button"
            aria-pressed={activeTab === 'transactions'}
            onClick={() => setActiveTab('transactions')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'transactions'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Transaksi ({transactionTotal.toLocaleString('id-ID')})
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'deposits'}
            onClick={() => showDepositHistory()}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'deposits'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Isi saldo
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'mutations'}
            onClick={showMutationHistory}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'mutations'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mutasi saldo
          </button>
        </div>
      </div>

      {/* TAB 1: TRANSAKSI PRODUK */}
      {activeTab === 'transactions' && (
        <div className="p-4 sm:p-6 space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari ID Referensi, nomor tujuan, atau produk..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(['all', 'success', 'pending', 'failed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st === 'all'
                    ? 'Semua'
                    : st === 'success'
                    ? 'Sukses'
                    : st === 'pending'
                    ? 'Pending'
                    : 'Gagal'}
                </button>
              ))}
            </div>
          </div>

          {/* List of Transactions */}
          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
              <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Tidak ada riwayat transaksi</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {searchQuery && hasMoreTransactions
                  ? 'Belum ada yang cocok pada data yang dimuat. Muat riwayat lama untuk mencari transaksi sebelumnya.'
                  : 'Transaksi pembelian pulsa atau tagihan Anda akan muncul di sini.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((trx) => {
                let statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Sukses
                  </span>
                );

                if (trx.status === 'pending') {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Pending
                    </span>
                  );
                } else if (trx.status === 'failed') {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                      <XCircle className="w-3 h-3 text-rose-600" />
                      Gagal
                    </span>
                  );
                }

                return (
                  <button
                    type="button"
                    key={trx.id}
                    onClick={() => onSelectReceipt(trx)}
                    aria-label={`Lihat detail transaksi ${trx.referenceId}`}
                    className="w-full rounded-xl border border-slate-200 p-4 text-left transition-all hover:border-blue-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            {trx.referenceId}
                          </span>
                          {statusBadge}
                        </div>

                        <h4 className="font-bold text-sm text-slate-900">{trx.productName}</h4>
                        <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                          <span>
                            Tujuan: <span className="font-mono font-medium">{trx.destination}</span>
                          </span>
                          <span>•</span>
                          <span>{new Date(trx.createdAt).toLocaleString('id-ID')}</span>
                        </div>

                        {trx.sn && (
                          <div className="mt-2 text-[11px] font-mono text-slate-700 bg-slate-50 p-1.5 rounded-lg border border-slate-200 inline-block">
                            SN: {trx.sn}
                          </div>
                        )}
                      </div>

                      <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 flex sm:flex-col justify-between sm:justify-center items-center sm:items-end">
                        <div className="text-sm sm:text-base font-bold text-slate-900 font-sans">
                          Rp {trx.amount.toLocaleString('id-ID')}
                        </div>
                        <span className="mt-0.5 text-[11px] font-semibold text-blue-600">
                          Lihat detail →
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {(hasMoreTransactions || transactionHistoryLoading || transactionHistoryError) && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {transactionHistoryError && (
                <p className="text-center text-xs text-rose-700" role="alert">
                  {transactionHistoryError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void loadMoreTransactions()}
                disabled={transactionHistoryLoading || !hasMoreTransactions}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {transactionHistoryLoading
                  ? 'Memuat riwayat…'
                  : transactionHistoryError
                    ? 'Coba lagi'
                    : 'Muat riwayat lebih lama'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RIWAYAT ISI SALDO */}
      {activeTab === 'deposits' && (
        <div className="p-4 sm:p-6">
          {isGuest ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <Wallet className="mx-auto mb-2 h-7 w-7 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-700">Masuk untuk melihat riwayat isi saldo</p>
              <p className="mt-1 text-xs text-slate-500">Riwayat pengajuan saldo tersedia di akun Anda.</p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Masuk / Daftar
              </button>
            </div>
          ) : depositHistoryLoading ? (
            <p className="py-6 text-center text-sm text-slate-500" role="status">Memuat riwayat isi saldo…</p>
          ) : depositHistoryError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
              <p className="text-sm text-rose-700" role="alert">{depositHistoryError}</p>
              <button
                type="button"
                onClick={() => showDepositHistory(true)}
                className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Coba lagi
              </button>
            </div>
          ) : deposits.length === 0 ? (
            <div className="py-6 text-center">
              <Wallet className="mx-auto mb-2 h-7 w-7 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-700">Belum ada riwayat isi saldo</p>
              <p className="mt-1 text-xs text-slate-500">Pengajuan isi saldo Anda akan tampil di sini.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {deposits.map((deposit) => {
                const status = deposit.status === 'approved'
                  ? { label: 'Disetujui', className: 'bg-emerald-100 text-emerald-800' }
                  : deposit.status === 'rejected'
                    ? { label: 'Ditolak', className: 'bg-rose-100 text-rose-800' }
                    : { label: 'Menunggu', className: 'bg-amber-100 text-amber-800' };
                return (
                  <div key={deposit.id} className="flex items-start justify-between gap-3 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                        <Wallet className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs sm:text-sm text-slate-900">
                          {deposit.paymentMethodLabel || (
                            deposit.type === 'qrisly' ? 'QRIS otomatis' : 'Isi saldo'
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {new Date(deposit.createdAt).toLocaleString('id-ID')}
                        </div>
                        {deposit.adminNote && (
                          <p className="mt-1 text-xs text-slate-500">{deposit.adminNote}</p>
                        )}
                        {deposit.status === 'approved' && (
                          <p className="mt-1 text-xs text-emerald-700">Saldo sudah diperbarui.</p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                        {status.label}
                      </span>
                      <div className="mt-1 font-sans text-xs font-bold text-slate-900 sm:text-sm">
                        Rp {deposit.amount.toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mutations' && (
            <div className="p-4 sm:p-6">
              {isGuest ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                  <Wallet className="mx-auto mb-2 h-7 w-7 text-slate-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-700">Masuk untuk melihat mutasi saldo</p>
                  <button
                    type="button"
                    onClick={onRequireAuth}
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    Masuk / Daftar
                  </button>
                </div>
              ) : !currentMutationHistory?.mutations.length && currentMutationHistory?.loading ? (
                <p className="py-6 text-center text-sm text-slate-500" role="status">Memuat mutasi saldo…</p>
              ) : currentMutationHistory?.error && !currentMutationHistory.mutations.length ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
                  <p className="text-sm text-rose-700" role="alert">{currentMutationHistory.error}</p>
                  <button
                    type="button"
                    onClick={() => void loadMutationPage(1)}
                    className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Coba lagi
                  </button>
                </div>
              ) : !currentMutationHistory?.mutations.length ? (
                <div className="py-6 text-center">
                  <Wallet className="mx-auto mb-2 h-7 w-7 text-slate-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-700">Belum ada mutasi saldo</p>
                  <p className="mt-1 text-xs text-slate-500">Deposit, pembayaran, dan refund akan tercatat di sini.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {currentMutationHistory.mutations.map((mutation) => (
                    <div key={mutation.id} className="flex items-start justify-between gap-3 py-3.5">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          mutation.type === 'credit'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {mutation.type === 'credit'
                            ? <ArrowDownCircle className="h-4 w-4" aria-hidden="true" />
                            : <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-slate-900 sm:text-sm">{mutation.note}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {new Date(mutation.createdAt).toLocaleString('id-ID')}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Saldo setelah transaksi: Rp {mutation.balanceAfter.toLocaleString('id-ID')}
                          </div>
                        </div>
                      </div>
                      <div className={`shrink-0 font-sans text-xs font-bold sm:text-sm ${
                        mutation.type === 'credit' ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {mutation.type === 'credit' ? '+' : '-'}Rp {mutation.amount.toLocaleString('id-ID')}
                      </div>
                    </div>
                  ))}
                </div>
                    )}
              {currentMutationHistory?.error && currentMutationHistory.mutations.length > 0 && (
                <p className="mt-3 text-center text-xs text-rose-700" role="alert">
                  {currentMutationHistory.error}
                </p>
              )}
              {currentMutationHistory &&
                currentMutationHistory.mutations.length < currentMutationHistory.total && (
                  <div className="flex justify-center pt-3">
                    <button
                      type="button"
                      disabled={currentMutationHistory.loading}
                      onClick={() => void loadMutationPage(currentMutationHistory.nextPage)}
                      className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {currentMutationHistory.loading ? 'Memuat mutasi…' : 'Muat mutasi lebih lama'}
                    </button>
                  </div>
          )}
        </div>
      )}
    </div>
  );
}
