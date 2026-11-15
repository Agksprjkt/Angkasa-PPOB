'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toDataURL } from 'qrcode';
import { ArrowLeft, CheckCircle2, Clock3, Printer, RefreshCw, XCircle } from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';
import Header from '@/components/Header';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import { Button } from '@/components/ui/button';
import type { Transaction } from '@/types/ppob';

interface OrderInvoice {
  id: string;
  invoiceNumber: string;
  productName: string;
  destination: string;
  totalPay: number;
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

export default function OrderInvoicePage() {
  const params = useParams<{ invoiceId: string }>();
  const router = useRouter();
  const invoiceId = params.invoiceId;
  const [invoice, setInvoice] = useState<OrderInvoice | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [qrImage, setQrImage] = useState<{ qrString: string; dataUrl: string } | null>(null);
  const [error, setError] = useState('');
  const [paymentCheckError, setPaymentCheckError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  const refreshOrder = useCallback(async () => {
    const headers: Record<string, string> = {};
    const saved = sessionStorage.getItem('payku:pending-qrisly-order');
    if (saved) {
      const access = JSON.parse(saved) as Partial<OrderAccess>;
      if (access.id === invoiceId && typeof access.accessToken === 'string') {
        headers['X-Order-Access-Token'] = access.accessToken;
      }
    }
    const response = await fetch(`/api/orders/${encodeURIComponent(invoiceId)}`, {
      headers,
      cache: 'no-store',
    });
    const result = await response.json() as {
      invoice?: OrderInvoice;
      transaction?: Transaction | null;
      paymentCheckError?: string | null;
      error?: string;
    };
    if (!response.ok || (!result.invoice && !result.transaction)) {
      throw new Error(result.error ?? 'Status pesanan tidak dapat dimuat.');
    }
    setInvoice(result.invoice ?? null);
    setTransaction(result.transaction ?? null);
    setPaymentCheckError(result.paymentCheckError
      ? 'Status pembayaran belum dapat dipastikan. Periksa kembali beberapa saat lagi.'
      : '');
    setError('');
  }, [invoiceId]);

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

  const isPending = invoice
    ? invoice.paymentStatus === 'unpaid' ||
      (invoice.paymentStatus === 'paid' &&
        (invoice.transactionStatus === 'pending' || invoice.transactionStatus === 'processing'))
    : transaction?.status === 'pending';

  useEffect(() => {
    if (!isPending) return;
    const interval = window.setInterval(() => {
      void refreshOrder().catch((refreshError: unknown) => {
        setError(refreshError instanceof Error ? refreshError.message : 'Status pesanan gagal diperbarui.');
      });
    }, 8_000);
    return () => window.clearInterval(interval);
  }, [isPending, refreshOrder]);

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

  const total = invoice?.totalPay ?? transaction?.amount ?? 0;
  const orderStatus = useMemo(() => {
    if (invoice?.paymentStatus === 'review') {
      return { title: 'Pembayaran perlu diperiksa', message: 'Nominal yang diterima berbeda. Hubungi admin sebelum melakukan pembayaran ulang.', icon: XCircle };
    }
    if (invoice?.paymentStatus === 'expired') {
      return { title: 'Invoice kedaluwarsa', message: 'Buat pesanan baru untuk mendapatkan pembayaran baru.', icon: Clock3 };
    }
    const status = invoice?.transactionStatus ?? transaction?.status;
    if (status === 'success') {
      return { title: 'Pesanan berhasil', message: 'Pembayaran dan pemrosesan pesanan telah selesai.', icon: CheckCircle2 };
    }
    if (status === 'failed') {
      return { title: 'Pesanan gagal', message: 'Transaksi tidak berhasil diproses. Periksa riwayat atau hubungi admin.', icon: XCircle };
    }
    if (invoice?.paymentStatus === 'paid') {
      return { title: 'Pembayaran diterima', message: 'Pesanan sedang diproses oleh penyedia layanan.', icon: Clock3 };
    }
    if (invoice?.qrString) {
      return { title: 'Menunggu pembayaran QRIS', message: 'Pindai QRIS berikut sebelum batas waktu pembayaran.', icon: Clock3 };
    }
    return { title: 'Pesanan sedang diproses', message: 'Status terbaru akan diperbarui otomatis.', icon: Clock3 };
  }, [invoice, transaction]);
  const StatusIcon = orderStatus.icon;

  return (
    <main className="min-h-screen bg-[#f7f5fb] px-4 py-8 sm:px-6 sm:py-12">
      <Header
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenHistory={() => router.push('/?tab=history')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal')}
        mobileBack
      />
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mb-5 hidden items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700 md:inline-flex">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke katalog
        </Link>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
              {invoice ? 'Invoice pembayaran' : 'Detail pesanan'}
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              {invoice?.invoiceNumber ?? transaction?.referenceId ?? 'Memuat pesanan...'}
            </h1>
          </div>

          <div className="space-y-5 px-5 py-6 sm:px-7">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Memuat detail pesanan...</p>
            ) : error && !invoice && !transaction ? (
              <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-violet-50 p-4">
                  <div className="flex items-start gap-3">
                    <StatusIcon className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
                    <div>
                      <h2 className="font-bold text-slate-900">{orderStatus.title}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{orderStatus.message}</p>
                    </div>
                  </div>
                </div>

                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Produk</dt>
                    <dd className="text-right font-semibold text-slate-900">
                      {invoice?.productName ?? transaction?.productName ?? '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Tujuan</dt>
                    <dd className="max-w-[65%] break-all text-right font-mono text-slate-900">
                      {invoice?.destination ?? transaction?.destination ?? '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
                    <dt className="font-semibold text-slate-700">Total</dt>
                    <dd className="font-bold text-violet-700">{formatCurrency(total)}</dd>
                  </div>
                </dl>

                {invoice?.paymentStatus === 'unpaid' && invoice.qrString && (
                  <div className="rounded-2xl border border-slate-200 p-4 text-center">
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
                      <div className="mx-auto h-64 w-64 animate-pulse rounded-xl bg-slate-100" />
                    )}
                    <p className="mt-3 text-sm font-bold text-slate-900">
                      Bayar {formatCurrency(invoice.totalPay)}
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
                  <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {paymentCheckError}
                  </p>
                )}
                {error && (
                  <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    onClick={() => void refreshOrder().catch((refreshError: unknown) => {
                      setError(refreshError instanceof Error ? refreshError.message : 'Status pesanan gagal diperbarui.');
                    })}
                    disabled={isLoading}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Cek status
                  </Button>
                  {transaction?.status === 'success' && (
                    <Button
                      onClick={() => setIsReceiptOpen(true)}
                      className="bg-violet-600 text-white hover:bg-violet-700"
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Lihat / bagikan struk
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
      {transaction?.status === 'success' && isReceiptOpen && (
        <ReceiptModal transaction={transaction} onClose={() => setIsReceiptOpen(false)} />
      )}
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
    </main>
  );
}
