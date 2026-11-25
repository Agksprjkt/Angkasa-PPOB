'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toDataURL } from 'qrcode';
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, Printer, QrCode, RefreshCw, RotateCcw, History, MessageCircleQuestion, XCircle } from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import Header from '@/components/Header';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import { Button } from '@/components/ui/button';
import { CrystalLoader, LoadingOverlay, LoadingState } from '@/components/ui/crystal-loader';
import { usePPOB } from '@/context/PPOBContext';
import { canManageQrislyOrder } from '@/lib/order-actions';
import type { Transaction } from '@/types/ppob';

interface OrderInvoice {
  id: string;
  invoiceNumber: string;
  productName: string;
  destination: string;
  totalPay: number;
  payableAmount: number;
  voucherCode: string | null;
  discountAmount: number;
  paymentStatus: 'unpaid' | 'paid' | 'expired' | 'review';
  transactionStatus: 'pending' | 'processing' | 'success' | 'failed';
  qrString: string | null;
  expiresAt: string;
  createdAt: string;
}

interface OrderAccess {
  id: string;
  accessToken: string | null;
}

function formatCurrency(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

// Guest access token is bound to the invoice id it was issued for, but a renewed
// invoice keeps the same token hash, so the stored token stays valid across renew.
function readStoredOrderAccess(): OrderAccess | null {
  try {
    const saved = sessionStorage.getItem('payku:pending-qrisly-order');
    if (!saved) return null;
    const access = JSON.parse(saved) as Partial<OrderAccess>;
    return typeof access.accessToken === 'string'
      ? { id: typeof access.id === 'string' ? access.id : '', accessToken: access.accessToken }
      : null;
  } catch {
    return null;
  }
}

const paymentStatusLabels: Record<OrderInvoice['paymentStatus'], string> = {
  unpaid: 'Belum dibayar',
  paid: 'Sudah dibayar',
  expired: 'Dibatalkan',
  review: 'Perlu diperiksa',
};

const transactionStatusLabels: Record<OrderInvoice['transactionStatus'], string> = {
  pending: 'Menunggu',
  processing: 'Diproses',
  success: 'Berhasil',
  failed: 'Gagal',
};

export default function OrderInvoicePage() {
  const params = useParams<{ invoiceId: string }>();
  const router = useRouter();
  const { currentUser, addToast } = usePPOB();
  const invoiceId = params.invoiceId;
  const [invoice, setInvoice] = useState<OrderInvoice | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [qrImage, setQrImage] = useState<{ qrString: string; dataUrl: string } | null>(null);
  const [error, setError] = useState('');
  const [paymentCheckError, setPaymentCheckError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [supportPhone, setSupportPhone] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const successNotified = useRef(false);
  const qrSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/store-settings')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { supportPhone?: unknown } | null) => {
        if (active && typeof body?.supportPhone === 'string') setSupportPhone(body.supportPhone.trim());
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const accessHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    const token = readStoredOrderAccess()?.accessToken;
    if (token) headers['X-Order-Access-Token'] = token;
    return headers;
  }, []);

  const refreshOrder = useCallback(async () => {
    const response = await fetch(`/api/orders/${encodeURIComponent(invoiceId)}`, {
      headers: accessHeaders(),
      cache: 'no-store',
    });
    const result = await response.json() as {
      invoice?: OrderInvoice;
      transaction?: Transaction | null;
      paymentCheckError?: string | null;
      error?: string;
    };
    if (!response.ok || (!result.invoice && !result.transaction)) {
      throw new Error(result.error === 'ORDER_NOT_FOUND'
        ? 'Detail pesanan hanya dapat dibuka dari perangkat yang membuat pesanan. Hubungi admin dengan menyertakan kode pesanan.'
        : result.error ?? 'Status pesanan tidak dapat dimuat.');
    }
    setInvoice(result.invoice ?? null);
    setTransaction(result.transaction ?? null);
    setPaymentCheckError(result.paymentCheckError
      ? 'Status pembayaran belum dapat dipastikan. Periksa kembali beberapa saat lagi.'
      : '');
    setError('');
  }, [accessHeaders, invoiceId]);

  const runOrderAction = useCallback(async (action: 'cancel' | 'renew') => {
    if (isActing) return;
    setIsActing(true);
    setActionError('');
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(invoiceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...accessHeaders() },
        body: JSON.stringify({ action }),
      });
      const result = await response.json() as {
        invoice?: OrderInvoice;
        accessToken?: string | null;
        error?: string;
      };
      if (!response.ok || !result.invoice) {
        throw new Error(result.error === 'ORDER_NOT_CANCELLABLE'
          ? 'Pesanan ini sudah tidak dapat dibatalkan.'
          : result.error ?? 'Pesanan tidak dapat diperbarui.');
      }
      if (action === 'renew' && result.invoice.id !== invoiceId) {
        // The renewed invoice reuses the same guest access token hash, so keep the
        // existing token and only point it at the new invoice id.
        const access = {
          id: result.invoice.id,
          accessToken: result.accessToken ?? readStoredOrderAccess()?.accessToken ?? null,
          lookupCode: result.invoice.invoiceNumber,
        };
        try {
          sessionStorage.setItem('payku:pending-qrisly-order', JSON.stringify(access));
        } catch {
          // Storage blocked — the new invoice stays reachable through Cek Pesanan.
        }
        router.replace(`/invoice/${encodeURIComponent(result.invoice.id)}`);
        return;
      }
      setInvoice(result.invoice);
      addToast(
        'Pesanan dibatalkan',
        'Pesanan ini sudah dibatalkan. Silakan buat pesanan baru bila masih dibutuhkan.',
        'success',
      );
      setIsCancelOpen(false);
    } catch (actionFailure) {
      setActionError(
        actionFailure instanceof Error ? actionFailure.message : 'Pesanan tidak dapat diperbarui.',
      );
    } finally {
      setIsActing(false);
    }
  }, [accessHeaders, addToast, invoiceId, isActing, router]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refreshOrder();
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Status pesanan gagal dimuat.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [refreshOrder]);

  const refreshManually = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshOrder();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Status pesanan gagal diperbarui.');
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refreshOrder]);

  const isPending = invoice
    ? invoice.paymentStatus === 'unpaid' ||
      (invoice.paymentStatus === 'paid' &&
        (invoice.transactionStatus === 'pending' || invoice.transactionStatus === 'processing'))
    : transaction?.status === 'pending';

  const pollLimitReached = pollAttempts >= 40;

  useEffect(() => {
    if (!isPending || pollLimitReached) return;
    const expiresAt = invoice?.expiresAt ? new Date(invoice.expiresAt).getTime() : null;
    if (expiresAt !== null && expiresAt < Date.now()) return;
    // Back off after the first 10 attempts so an abandoned tab stops hammering.
    const delay = pollAttempts < 10 ? 8_000 : 20_000;
    const timer = window.setTimeout(() => {
      setPollAttempts((attempts) => attempts + 1);
      void refreshOrder().catch((refreshError: unknown) => {
        setError(refreshError instanceof Error ? refreshError.message : 'Status pesanan gagal diperbarui.');
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [invoice?.expiresAt, isPending, pollAttempts, pollLimitReached, refreshOrder]);

  const orderSucceeded = (invoice?.transactionStatus ?? transaction?.status) === 'success';

  useEffect(() => {
    if (!orderSucceeded || successNotified.current) return;
    successNotified.current = true;
    addToast('Pesanan berhasil', 'Pembayaran dan pemrosesan pesanan telah selesai.', 'success');
  }, [addToast, orderSucceeded]);

  useEffect(() => {
    const qrString = invoice?.qrString;
    if (!qrString || invoice?.paymentStatus !== 'unpaid') {
      return;
    }
    let active = true;
    void toDataURL(qrString, { margin: 2, width: 280 })
      .then((dataUrl) => {
        if (active) setQrImage({ qrString, dataUrl });
      })
      .catch((qrError: unknown) => {
        if (active) {
          setError(qrError instanceof Error ? qrError.message : 'QRIS tidak dapat ditampilkan.');
        }
      });
    return () => {
      active = false;
    };
  }, [invoice?.paymentStatus, invoice?.qrString]);

  const total = invoice
    ? invoice.payableAmount ?? invoice.totalPay
    : transaction?.amount ?? 0;
  const canManagePayment = Boolean(invoice && canManageQrislyOrder(invoice));
  const orderStatus = useMemo(() => {
    const status = invoice?.transactionStatus ?? transaction?.status;
    // Vendor reason is the buyer's own order outcome; hide our internal markers.
    const vendor = transaction?.vendorResponse;
    const vendorReason = vendor?.message && !['OUTCOME_UNCLEAR', 'SUBMITTING'].includes(vendor.rc ?? '')
      ? `${vendor.message}${vendor.rc && vendor.rc !== vendor.message ? ` (kode ${vendor.rc})` : ''}`
      : null;
    if (status === 'failed') {
      return { title: 'Pesanan gagal', needsAdmin: true, icon: XCircle, vendorReason };
    }
    if (invoice?.paymentStatus === 'review') {
      return { title: 'Pembayaran perlu diperiksa', needsAdmin: true, icon: XCircle, vendorReason };
    }
    if (invoice?.paymentStatus === 'expired') {
      return { title: 'Pesanan dibatalkan', needsAdmin: false, icon: XCircle, vendorReason: null };
    }
    if (status === 'success') {
      return { title: 'Pesanan berhasil', needsAdmin: false, icon: CheckCircle2, vendorReason: null };
    }
    if (invoice?.paymentStatus === 'paid') {
      return { title: 'Pesanan diproses', needsAdmin: false, icon: Clock3, vendorReason: null };
    }
    if (invoice?.qrString) {
      return { title: 'Menunggu pembayaran', needsAdmin: false, icon: Clock3, vendorReason: null };
    }
    return { title: 'Menyiapkan pembayaran', needsAdmin: false, icon: Clock3, vendorReason: null };
  }, [invoice, transaction]);
  const StatusIcon = orderStatus.icon;
  const detailRows = useMemo(() => {
    const rows: { label: string; value: string; mono?: boolean }[] = [
      { label: 'Kode pesanan', value: invoice?.invoiceNumber ?? transaction?.referenceId ?? '-', mono: true },
    ];
    if (transaction?.referenceId) {
      rows.push({ label: 'Ref ID', value: transaction.referenceId, mono: true });
    }
    rows.push(
      { label: 'Produk', value: invoice?.productName ?? transaction?.productName ?? '-' },
      { label: 'Tujuan', value: invoice?.destination ?? transaction?.destination ?? '-', mono: true },
    );
    if (invoice?.voucherCode && invoice.discountAmount > 0) {
      rows.push({
        label: `Diskon ${invoice.voucherCode}`,
        value: `- ${formatCurrency(invoice.discountAmount)}`,
      });
    }
    rows.push({ label: 'Total', value: formatCurrency(total) });
    if (transaction?.sn?.trim()) {
      rows.push({ label: 'SN/Token', value: transaction.sn.trim(), mono: true });
    }
    rows.push(
      { label: 'Status pembayaran', value: paymentStatusLabels[invoice?.paymentStatus ?? 'paid'] },
      { label: 'Status pesanan', value: transactionStatusLabels[invoice?.transactionStatus ?? transaction?.status ?? 'pending'] },
    );
    if (orderStatus.vendorReason) {
      rows.push({ label: 'Respons penyedia', value: orderStatus.vendorReason });
    }
    return rows;
  }, [invoice, orderStatus.vendorReason, total, transaction]);

  const adminContact = useMemo(() => {
    const digits = supportPhone.replace(/\D/g, '').replace(/^0/, '62');
    if (!digits) return { href: '/bantuan', external: false };
    const reference = invoice?.invoiceNumber ?? transaction?.referenceId ?? '';
    const text = encodeURIComponent(
      `Halo admin, pesanan ${reference} gagal diproses. Saya ingin mengajukan pengembalian dana atau mencoba ulang pesanan.`,
    );
    return { href: `https://wa.me/${digits}?text=${text}`, external: true };
  }, [invoice?.invoiceNumber, supportPhone, transaction?.referenceId]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f5fb]">
      <Header
        activeTab="orders"
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenHistory={() => router.push('/dashboard/transactions')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal')}
        onOpenDeposit={() => setIsDepositOpen(true)}
        mobileBack
        backFallback="/cek-pesanan"
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mb-5 hidden items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-700 md:inline-flex">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke katalog
        </Link>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              {invoice ? 'Invoice pembayaran' : 'Detail pesanan'}
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              {invoice?.invoiceNumber ?? transaction?.referenceId ?? 'Memuat pesanan...'}
            </h1>
          </div>

          <div className="space-y-5 px-5 py-6 sm:px-7">
            {isLoading ? (
              <LoadingState message="Memuat detail pesanan..." />
            ) : error && !invoice && !transaction ? (
              <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-sky-50 p-4" aria-live="polite">
                  <div className="flex items-center gap-3">
                    <StatusIcon className="h-5 w-5 shrink-0 text-sky-700" />
                    <h2 className="font-bold text-slate-900">{orderStatus.title}</h2>
                  </div>
                </div>

                <dl className="divide-y divide-slate-100 text-sm">
                  {detailRows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 py-2.5 first:pt-0">
                      <dt className="shrink-0 text-slate-500">{row.label}</dt>
                      <dd
                        className={`max-w-[65%] break-all text-right text-slate-900 ${
                          row.mono ? 'font-mono' : ''
                        } ${row.label === 'Total' ? 'font-bold text-sky-700' : 'font-semibold'}`}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {canManagePayment && (
                  <div className="grid gap-2 rounded-2xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Kelola pesanan
                    </p>
                    {invoice?.qrString && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          qrSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          qrSectionRef.current?.focus();
                        }}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        Lanjutkan pembayaran
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setIsCancelOpen(true)}
                      disabled={isActing}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Batalkan pesanan
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void runOrderAction('renew')}
                      disabled={isActing}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Ganti metode bayar
                    </Button>
                  </div>
                )}

                {invoice?.paymentStatus === 'unpaid' && invoice.qrString && (
                  <div
                    ref={qrSectionRef}
                    tabIndex={-1}
                    className="scroll-mt-4 rounded-2xl border border-slate-200 p-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                  >
                    {qrImage?.qrString === invoice.qrString ? (
                      <Image
                      src={qrImage.dataUrl}
                        alt="QRIS pembayaran pesanan"
                        width={280}
                        height={280}
                        unoptimized
                        className="mx-auto h-64 w-64 max-w-full"
                      />
                    ) : (
                      <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-xl bg-slate-50">
                        <CrystalLoader size={120} label="Menyiapkan QRIS" />
                      </div>
                    )}
                    <p className="mt-3 text-sm font-bold text-slate-900">
                      Bayar {formatCurrency(total)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      QRIS berlaku sampai {new Date(invoice.expiresAt).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}

                {paymentCheckError && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2">
                    <p role="status" className="text-sm text-amber-800">{paymentCheckError}</p>
                    <button
                      type="button"
                      onClick={() => void refreshManually()}
                      disabled={isRefreshing}
                      className="text-xs font-semibold text-amber-900 underline disabled:opacity-60"
                    >
                      {isRefreshing ? 'Memeriksa...' : 'Coba lagi'}
                    </button>
                  </div>
                )}
                {error && (
                  <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                )}
                {actionError && (
                  <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {actionError}
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {isPending && (
                    <Button
                      variant="outline"
                      onClick={() => void refreshManually()}
                      disabled={isRefreshing || isLoading}
                      aria-busy={isRefreshing}
                    >
                      {!isRefreshing && <RefreshCw className="mr-2 h-4 w-4" />}
                      {isRefreshing ? 'Memeriksa status...' : 'Cek status'}                    </Button>
                  )}
                  {orderStatus.needsAdmin && (
                    adminContact.external ? (
                      <a
                        href={adminContact.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                      >
                        <MessageCircleQuestion className="mr-2 h-4 w-4" />
                        Hubungi admin
                      </a>
                    ) : (
                      <Button variant="outline" onClick={() => router.push('/bantuan')}>
                        <MessageCircleQuestion className="mr-2 h-4 w-4" />
                        Hubungi admin
                      </Button>
                    )
                  )}
                  {transaction?.status === 'success' && (
                    <Button
                      onClick={() => setIsReceiptOpen(true)}
                      className="bg-sky-600 text-white hover:bg-sky-700"
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Lihat / bagikan struk
                    </Button>
                  )}
                </div>

                {orderSucceeded && (
                  <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                    <Button variant="outline" onClick={() => router.push('/')}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Pesan lagi
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push(
                        currentUser ? '/dashboard/transactions' : '/cek-pesanan',
                      )}
                    >
                      <History className="mr-2 h-4 w-4" />
                      Riwayat transaksi
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
      </main>
      {transaction?.status === 'success' && isReceiptOpen && (
        <ReceiptModal transaction={transaction} onClose={() => setIsReceiptOpen(false)} />
      )}
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
      <ConfirmationDialog
        open={isCancelOpen}
        onOpenChange={setIsCancelOpen}
        title="Batalkan pesanan?"
        description="Pesanan akan dibatalkan dan QRIS ini tidak dapat dibayar lagi. Lanjut?"
        confirmLabel="Ya, batalkan"
        cancelLabel="Tetap di sini"
        confirmDisabled={isActing}
        onConfirm={() => void runOrderAction('cancel')}
      />
      {isRefreshing && <LoadingOverlay message="Memeriksa status pembayaran…" />}
      {isActing && <LoadingOverlay message="Memperbarui pesanan…" />}
    </div>
  );
}
