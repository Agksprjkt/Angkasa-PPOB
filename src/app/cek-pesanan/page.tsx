'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ClipboardCheck } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingOverlay } from '@/components/ui/crystal-loader';

interface OrderSummary {
  id: string;
  invoiceNumber: string;
  productName: string;
  destination: string;
  totalPay: number;
  paymentStatus: 'unpaid' | 'paid' | 'expired' | 'review';
  transactionStatus: 'pending' | 'processing' | 'success' | 'failed';
  createdAt: string;
  expiresAt: string | null;
}

function orderStatus(order: OrderSummary) {
  if (order.paymentStatus === 'unpaid') return 'Menunggu pembayaran';
  if (order.paymentStatus === 'expired') return 'Kedaluwarsa';
  if (order.transactionStatus === 'failed') return 'Gagal';
  if (order.paymentStatus === 'review') return 'Perlu diperiksa';
  if (order.transactionStatus === 'success') return 'Berhasil';
  return 'Sedang diproses';
}

function orderNote(order: OrderSummary) {
  if (order.transactionStatus === 'failed') {
    return order.paymentStatus === 'unpaid'
      ? 'Pesanan tidak dapat diproses. Buat pesanan baru atau hubungi admin.'
      : 'Pembayaran sudah diterima, tetapi pesanan gagal diproses penyedia. Hubungi admin untuk pengembalian dana.';
  }
  if (order.paymentStatus === 'review') {
    return 'Pembayaran sudah diterima dan sedang diperiksa admin. Hubungi admin bila belum ada kabar.';
  }
  if (order.paymentStatus === 'unpaid') {
    return 'Selesaikan pembayaran QRIS sebelum batas waktu. QRIS hanya dapat dibuka dari perangkat yang membuat pesanan.';
  }
  if (order.paymentStatus === 'expired') {
    return 'Batas pembayaran sudah lewat. Silakan buat pesanan baru.';
  }
  if (order.transactionStatus === 'success') {
    return 'Pesanan sudah selesai diproses penyedia.';
  }
  return 'Pesanan sedang diproses penyedia layanan. Status akan diperbarui otomatis.';
}

function formatCurrency(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

const paymentStatusLabel: Record<string, string> = {
  unpaid: 'Belum dibayar',
  paid: 'Sudah dibayar',
  expired: 'Kedaluwarsa',
  review: 'Perlu diperiksa',
};

const transactionStatusLabel: Record<string, string> = {
  pending: 'Menunggu',
  processing: 'Diproses',
  success: 'Berhasil',
  failed: 'Gagal',
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const statusTone: Record<string, string> = {
  Berhasil: 'text-emerald-700',
  Gagal: 'text-rose-700',
  Kedaluwarsa: 'text-slate-500',
  'Perlu diperiksa': 'text-amber-700',
  'Menunggu pembayaran': 'text-amber-700',
};

export default function CheckOrderPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  const searchOrders = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setHasSearched(false);
    setOrders([]);
    setExpandedId(null);
    try {
      const response = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const result = await response.json() as { orders?: OrderSummary[]; error?: string };
      if (!response.ok) {
        throw new Error(result.error === 'INVALID_LOOKUP_DETAILS'
          ? 'Masukkan nomor WhatsApp atau kode pesanan yang valid.'
          : result.error === 'LOOKUP_RATE_LIMITED'
            ? 'Terlalu banyak permintaan. Tunggu beberapa menit sebelum mencoba lagi.'
            : result.error === 'ORDERS_NOT_FOUND'
              ? 'Pesanan tidak ditemukan. Periksa kembali nomor atau kode pesanan.'
              : 'Pencarian pesanan gagal. Coba lagi.');
      }
      setOrders(result.orders ?? []);
      setHasSearched(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Pencarian pesanan gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/70 pb-[calc(4.75rem+env(safe-area-inset-bottom))] font-sans text-slate-900">
      <Header
        activeTab="orders"
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenDeposit={() => setIsDepositOpen(true)}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-xl">
          <Link href="/" className="mb-5 hidden items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-700 md:inline-flex">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke katalog
          </Link>

          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader className="flex-row items-start gap-3 space-y-0 p-5 sm:p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center text-blue-700">
                <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg">Cek Pesanan</CardTitle>
                <CardDescription className="leading-5">
                  Masukkan nomor WhatsApp atau kode pesanan untuk melihat status pesanan.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              <form onSubmit={(event) => void searchOrders(event)} className="space-y-4">
                <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                  Nomor WhatsApp atau kode pesanan
                  <Input
                    autoComplete="off"
                    required
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="08xxxxxxxxxx atau INV-XXXXXXXX"
                    disabled={isLoading}
                  />
                </label>
                <Button
                  type="submit"
                  disabled={isLoading}
                  aria-busy={isLoading}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700"
                >
                  {isLoading ? 'Mencari pesanan...' : 'Cari pesanan'}
                </Button>
              </form>

              {errorMessage && (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                >
                  {errorMessage}
                </p>
              )}

              {hasSearched && (
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  {orders.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-600">
                      Pesanan tidak ditemukan. Periksa kembali nomor WhatsApp atau kode pesanan.
                    </p>
                  ) : (
                    <>
                      {orders.length > 1 && (
                        <h2 className="text-sm font-semibold text-slate-800">
                          Ditemukan {orders.length} pesanan terbaru.
                        </h2>
                      )}
                      {orders.map((order) => {
                        const expanded = expandedId === order.id;
                        const status = orderStatus(order);
                        return (
                          <Card key={order.id} className="overflow-hidden rounded-xl">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={`order-detail-${order.id}`}
                              onClick={() => setExpandedId(expanded ? null : order.id)}
                              className="w-full p-4 text-left transition hover:bg-slate-50/80 focus-visible:bg-slate-50/80 focus-visible:outline-none"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="break-all font-mono text-sm font-bold text-blue-700">
                                    {order.invoiceNumber}
                                  </p>
                                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                                    {order.productName}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {order.destination} · {formatDateTime(order.createdAt)}
                                  </p>
                                </div>
                                <span className="flex shrink-0 items-center justify-between gap-3 text-xs font-semibold text-slate-600 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
                                  <span className={statusTone[status] ?? 'text-slate-700'}>{status}</span>
                                  <span className="text-sm text-slate-900">
                                    {formatCurrency(order.totalPay)}
                                  </span>
                                </span>
                              </div>
                              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                                {expanded ? 'Sembunyikan detail' : 'Lihat detail'}
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                  aria-hidden="true"
                                />
                              </span>
                            </button>
                            {expanded && (
                              <div
                                id={`order-detail-${order.id}`}
                                className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm"
                              >
                                <dl className="space-y-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500">Tujuan</dt>
                                    <dd className="break-all text-right font-medium text-slate-900">
                                      {order.destination}
                                    </dd>
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500">Status pembayaran</dt>
                                    <dd className="text-right font-medium text-slate-900">
                                      {paymentStatusLabel[order.paymentStatus] ?? order.paymentStatus}
                                    </dd>
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500">Status pesanan</dt>
                                    <dd className="text-right font-medium text-slate-900">
                                      {transactionStatusLabel[order.transactionStatus] ?? order.transactionStatus}
                                    </dd>
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500">Dibuat</dt>
                                    <dd className="text-right font-medium text-slate-900">
                                      {formatDateTime(order.createdAt)}
                                    </dd>
                                  </div>
                                  {order.expiresAt && (
                                    <div className="flex items-start justify-between gap-3">
                                      <dt className="text-slate-500">Batas bayar</dt>
                                      <dd className="text-right font-medium text-slate-900">
                                        {formatDateTime(order.expiresAt)}
                                      </dd>
                                    </div>
                                  )}
                                </dl>
                                <p className="rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
                                  {orderNote(order)}
                                </p>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                      {orders.length === 20 && (
                        <p className="text-center text-xs text-slate-500">
                          Menampilkan 20 pesanan terbaru. Gunakan kode pesanan untuk mencari pesanan yang lebih lama.
                        </p>
                      )}
                      <p className="text-center text-xs leading-relaxed text-slate-500">
                        Nomor tujuan disamarkan untuk keamanan. Halaman pembayaran hanya dapat dibuka dari perangkat yang membuat pesanan. Butuh bantuan?
                        {' '}
                        <Link href="/bantuan" className="font-semibold text-blue-700 underline">
                          Hubungi admin
                        </Link>
                        .
                      </p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <BottomNav
        activeTab="orders"
        setActiveTab={() => {}}
        className="lg:hidden"
        onOpenHome={() => router.push('/')}
        onOpenPromo={() => router.push('/promo')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenDeposit={() => setIsDepositOpen(true)}
      />
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
      {isLoading && <LoadingOverlay message="Mencari pesanan…" />}
    </div>
  );
}
