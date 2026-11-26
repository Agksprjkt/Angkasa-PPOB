'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/crystal-loader';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { usePPOB } from '@/context/PPOBContext';
import type { Transaction } from '@/types/ppob';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileCode2,
  RotateCw,
  Search,
} from 'lucide-react';

interface AdminTransaction extends Omit<Transaction, 'userId'> {
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
}

interface TransactionPage {
  transactions: AdminTransaction[];
  page: number;
  pageSize: number;
  total: number;
}

const retryErrorMessages: Record<string, string> = {
  FORBIDDEN: 'Akses admin diperlukan.',
  TRANSACTION_NOT_FOUND: 'Transaksi tidak ditemukan.',
  ONLY_FAILED_TRANSACTIONS_CAN_BE_RETRIED: 'Hanya transaksi gagal yang dapat dicoba ulang.',
  RETRY_REQUIRES_A_WALLET_TRANSACTION: 'Retry hanya didukung untuk transaksi saldo user.',
  VENDOR_SETTINGS_UNAVAILABLE: 'Pengaturan vendor tidak dapat dibaca.',
  VENDOR_NOT_CONFIGURED: 'Kredensial Digiflazz belum dikonfigurasi.',
  PRODUCTION_TRANSACTIONS_DISABLED: 'Transaksi production belum diaktifkan.',
  RETRY_PRODUCT_UNAVAILABLE: 'Produk sudah tidak aktif atau bukan produk Digiflazz.',
  INVALID_TRANSACTION_AMOUNT: 'Nominal transaksi tidak valid.',
  TRANSACTION_STATE_CHANGED: 'Status transaksi berubah. Muat ulang daftar.',
  INSUFFICIENT_USER_BALANCE: 'Saldo user tidak cukup untuk mengirim ulang transaksi.',
  RETRY_OUTCOME_UNCLEAR: 'Hasil dari vendor belum pasti. Jangan retry lagi sebelum rekonsiliasi.',
};

const reviewErrorMessages: Record<string, string> = {
  FORBIDDEN: 'Akses admin diperlukan.',
  TRANSACTION_NOT_FOUND: 'Transaksi tidak ditemukan.',
  TRANSACTION_NOT_REVIEWABLE: 'Hanya transaksi saldo yang masih menunggu yang dapat diperiksa.',
  TRANSACTION_STATE_CHANGED: 'Status transaksi berubah. Muat ulang daftar.',
  MANUAL_REVIEW_REQUIRED: 'Tandai transaksi untuk pemeriksaan sebelum menyelesaikan refund.',
  REFUND_ALREADY_RECORDED: 'Refund transaksi ini sudah tercatat.',
  USER_NOT_FOUND: 'Akun pemilik transaksi tidak ditemukan.',
  BALANCE_OUT_OF_RANGE: 'Saldo hasil refund di luar batas yang aman.',
};

function formatCurrency(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export default function AdminTransactionsPanel({
  initialStatus = 'all',
}: {
  // Lets the overview KPI cards open this panel already filtered.
  initialStatus?: 'all' | 'pending' | 'success' | 'failed' | 'review';
}) {
  const { addToast } = usePPOB();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<TransactionPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [transactionToRetry, setTransactionToRetry] = useState<AdminTransaction | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [transactionToFlag, setTransactionToFlag] = useState<AdminTransaction | null>(null);
  const [transactionToRefund, setTransactionToRefund] = useState<AdminTransaction | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      status: statusFilter,
    });
    if (query.trim()) params.set('q', query.trim());

    void fetch(`/api/admin/transactions?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as TransactionPage & { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Riwayat transaksi gagal dimuat.');
        return result;
      })
      .then((result) => setData(result))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : 'Riwayat transaksi gagal dimuat.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [page, query, refreshKey, statusFilter]);

  const retryTransaction = async (transaction: AdminTransaction) => {
    setRetryingId(transaction.id);
    try {
      const response = await fetch(
        `/api/admin/transactions/${encodeURIComponent(transaction.id)}/retry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const result = await response.json() as {
        error?: string;
        transaction?: AdminTransaction;
      };
      if (!response.ok && response.status !== 202) {
        const message = result.error
          ? retryErrorMessages[result.error] ?? result.error
          : 'Retry transaksi gagal.';
        throw new Error(message);
      }

      const status = result.transaction?.status;
      addToast(
        status === 'success'
          ? 'Retry Berhasil'
          : status === 'failed'
            ? 'Retry Gagal'
            : 'Retry Menunggu Konfirmasi',
        status === 'success'
          ? 'Transaksi berhasil diproses oleh vendor.'
          : status === 'failed'
            ? 'Vendor menolak transaksi dan saldo user sudah dikembalikan.'
            : retryErrorMessages[result.error ?? ''] ??
              'Hasil belum pasti. Periksa status vendor sebelum tindakan lanjutan.',
        status === 'success' ? 'success' : status === 'failed' ? 'error' : 'warning',
      );
      refresh();
    } catch (error) {
      addToast(
        'Retry Tidak Berhasil',
        error instanceof Error ? error.message : 'Transaksi gagal dikirim ulang.',
        'error',
      );
    } finally {
      setRetryingId(null);
    }
  };

  const updateManualReview = async (
    transaction: AdminTransaction,
    action: 'flag' | 'confirm-failed',
  ) => {
    setReviewingId(transaction.id);
    try {
      const response = await fetch(
        `/api/admin/transactions/${encodeURIComponent(transaction.id)}/manual-review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            action === 'flag' ? { action } : { action, confirm: true },
          ),
        },
      );
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(
          result.error
            ? reviewErrorMessages[result.error] ?? result.error
            : 'Aksi pemeriksaan transaksi gagal.',
        );
      }

      addToast(
        action === 'flag' ? 'Pemeriksaan Ditandai' : 'Refund Tercatat',
        action === 'flag'
          ? 'Transaksi tetap menunggu. Periksa statusnya di Digiflazz; saldo belum dikembalikan.'
          : 'Status transaksi ditandai gagal dan saldo user dikembalikan.',
        action === 'flag' ? 'warning' : 'success',
      );
      refresh();
    } catch (error) {
      addToast(
        'Aksi Pemeriksaan Gagal',
        error instanceof Error ? error.message : 'Silakan muat ulang dan coba kembali.',
        'error',
      );
    } finally {
      setReviewingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50)));
  const refresh = () => {
    setErrorMessage('');
    setIsLoading(true);
    setRefreshKey((value) => value + 1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Riwayat transaksi</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cari transaksi seluruh user dan kirim ulang transaksi gagal yang memenuhi syarat.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-amber-800">
            Transaksi saldo dikirim ke Digiflazz, termasuk dalam mode sandbox. Status menunggu berarti hasil vendor belum final. Tandai untuk pemeriksaan; jangan refund sebelum status gagal dipastikan di Digiflazz.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={refresh}
        >
          <RotateCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Muat ulang
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
              setIsLoading(true);
              setErrorMessage('');
            }}
            placeholder="Cari referensi, user, nomor tujuan, produk..."
            aria-label="Cari transaksi"
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as typeof statusFilter);
            setPage(1);
            setIsLoading(true);
            setErrorMessage('');
          }}
          aria-label="Filter status transaksi"
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="all">Semua status</option>
          <option value="pending">Menunggu</option>
          <option value="success">Berhasil</option>
          <option value="failed">Gagal</option>
          <option value="review">Perlu cek manual</option>
        </select>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* The table is wider than a phone. The first column stays put and a fade
            on the right edge shows there is more, otherwise "Aksi" is invisible. */}
        <div className="relative">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Transaksi</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Produk & tujuan</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && !data ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      <LoadingState message="Memuat riwayat transaksi..." />
                    </td>
                  </tr>
                ) : data?.transactions.length ? data.transactions.map((transaction) => (
                  <tr key={transaction.id} className="align-top hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3">
                      <div className="font-mono text-xs font-semibold text-slate-900">
                        {transaction.referenceId}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {transaction.paymentMethod.replaceAll('_', ' ')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      {transaction.userName ?? 'Tanpa akun'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {transaction.userPhone ?? '—'}
                    </div>
                    {transaction.userEmail && (
                      <div className="mt-1 max-w-[180px] truncate text-xs text-slate-500">
                        {transaction.userEmail}
                      </div>
                    )}
                  </td>
                  <td className="max-w-[260px] px-4 py-3">
                    <div className="font-medium text-slate-800">{transaction.productName}</div>
                    <div className="mt-1 truncate font-mono text-xs text-slate-500">
                      {transaction.destination}
                    </div>
                    {transaction.serverZoneId && (
                      <div className="mt-1 text-xs text-slate-500">
                        Server ID: {transaction.serverZoneId}
                      </div>
                    )}
                    {transaction.sn && (
                      <div className="mt-1 truncate text-xs text-emerald-700">SN: {transaction.sn}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        transaction.status === 'success'
                          ? 'success'
                          : transaction.status === 'pending'
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {transaction.status === 'success'
                        ? 'Berhasil'
                        : transaction.status === 'pending'
                          ? 'Menunggu'
                          : 'Gagal'}
                    </Badge>
                    {transaction.needsManualReview && (
                      <Badge variant="warning" className="mt-1 block w-fit">
                        Perlu cek manual
                      </Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {new Date(transaction.createdAt).toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {transaction.vendorResponse && (
                        <details className="relative">
                          <summary
                            className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            aria-label="Lihat respons vendor"
                            title="Lihat respons vendor"
                          >
                            <FileCode2 className="h-4 w-4" />
                          </summary>
                          <pre className="absolute right-0 z-10 mt-2 max-h-64 w-80 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-[11px] text-slate-700 shadow-xl">
                            {JSON.stringify(transaction.vendorResponse, null, 2)}
                          </pre>
                        </details>
                      )}
                      {transaction.status === 'failed' &&
                        transaction.paymentMethod === 'balance' &&
                        transaction.userId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={retryingId === transaction.id}
                            onClick={() => setTransactionToRetry(transaction)}
                            className="h-8 border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                            aria-label={`Kirim ulang transaksi ${transaction.referenceId}`}
                          >
                            {retryingId === transaction.id
                              ? <RotateCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              : <RotateCw className="mr-1.5 h-3.5 w-3.5" />}
                            Retry
                          </Button>
                        )}
                      {transaction.status === 'pending' &&
                        transaction.paymentMethod === 'balance' &&
                        (transaction.needsManualReview ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={reviewingId === transaction.id}
                            onClick={() => setTransactionToRefund(transaction)}
                            className="h-8 border-rose-300 text-rose-800 hover:bg-rose-50 hover:text-rose-900"
                            aria-label={`Konfirmasi gagal dan refund transaksi ${transaction.referenceId}`}
                          >
                            {reviewingId === transaction.id
                              ? <CircleAlert className="mr-1.5 h-3.5 w-3.5 animate-pulse" />
                              : <CircleAlert className="mr-1.5 h-3.5 w-3.5" />}
                            Gagal + refund
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={reviewingId === transaction.id}
                            onClick={() => setTransactionToFlag(transaction)}
                            className="h-8 border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                            aria-label={`Tandai transaksi ${transaction.referenceId} untuk pemeriksaan manual`}
                          >
                            {reviewingId === transaction.id
                              ? <CircleAlert className="mr-1.5 h-3.5 w-3.5 animate-pulse" />
                              : <CircleAlert className="mr-1.5 h-3.5 w-3.5" />}
                            Cek manual
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    {errorMessage ? 'Data tidak dapat ditampilkan.' : 'Tidak ada transaksi yang cocok.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent sm:hidden"
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500" aria-live="polite">
            {isLoading ? 'Memuat...' : `${data?.total ?? 0} transaksi`}
            {(data?.total ?? 0) > 0 && ` · Halaman ${page} dari ${totalPages}`}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => {
                setIsLoading(true);
                setPage((value) => Math.max(1, value - 1));
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => {
                setIsLoading(true);
                setPage((value) => Math.min(totalPages, value + 1));
              }}
            >
              Berikutnya
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <ConfirmationDialog
        open={transactionToRetry !== null}
        onOpenChange={(open) => {
          if (!open) setTransactionToRetry(null);
        }}
        title="Kirim ulang transaksi?"
        description={
          transactionToRetry
            ? `Saldo user akan didebit kembali sebesar ${formatCurrency(transactionToRetry.amount)}. Jika hasil Digiflazz tidak pasti, transaksi ditahan untuk rekonsiliasi dan tidak boleh dikirim ulang.`
            : ''
        }
        confirmLabel="Kirim ulang"
        onConfirm={() => {
          if (!transactionToRetry) return;
          const transaction = transactionToRetry;
          setTransactionToRetry(null);
          void retryTransaction(transaction);
        }}
      />
      <ConfirmationDialog
        open={transactionToFlag !== null}
        onOpenChange={(open) => {
          if (!open) setTransactionToFlag(null);
        }}
        title="Tandai perlu pemeriksaan?"
        description={
          transactionToFlag
            ? `Transaksi ${transactionToFlag.referenceId} tetap berstatus menunggu. Tindakan ini tidak membatalkan pesanan dan tidak mengembalikan saldo. Periksa status transaksi di Digiflazz.`
            : ''
        }
        confirmLabel="Tandai pemeriksaan"
        confirmDisabled={reviewingId !== null}
        onConfirm={() => {
          if (!transactionToFlag) return;
          const transaction = transactionToFlag;
          setTransactionToFlag(null);
          void updateManualReview(transaction, 'flag');
        }}
      />
      <ConfirmationDialog
        open={transactionToRefund !== null}
        onOpenChange={(open) => {
          if (!open) setTransactionToRefund(null);
        }}
        title="Konfirmasi gagal dan refund?"
        description={
          transactionToRefund
            ? `Lanjutkan hanya jika status ${transactionToRefund.referenceId} sudah Anda pastikan GAGAL di Digiflazz. Status transaksi akan menjadi gagal dan saldo ${formatCurrency(transactionToRefund.amount)} dikembalikan. Jangan lakukan ini jika status vendor masih pending atau tidak diketahui.`
            : ''
        }
        confirmLabel="Saya pastikan gagal — refund"
        confirmDisabled={reviewingId !== null}
        onConfirm={() => {
          if (!transactionToRefund) return;
          const transaction = transactionToRefund;
          setTransactionToRefund(null);
          void updateManualReview(transaction, 'confirm-failed');
        }}
      />
      {retryingId !== null && <LoadingState message="Mengirim ulang transaksi…" />}
      {reviewingId !== null && <LoadingState message="Memperbarui transaksi…" />}
    </div>
  );
}
