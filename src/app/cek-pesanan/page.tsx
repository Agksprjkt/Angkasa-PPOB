'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
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

interface OrderSummary {
  id: string;
  invoiceNumber: string;
  productName: string;
  destination: string;
  totalPay: number;
  paymentStatus: 'unpaid' | 'paid' | 'expired' | 'review';
  transactionStatus: 'pending' | 'processing' | 'success' | 'failed';
  createdAt: string;
  accessToken: string;
}

function orderStatus(order: OrderSummary) {
  if (order.paymentStatus === 'unpaid') return 'Menunggu pembayaran';
  if (order.paymentStatus === 'expired') return 'Kedaluwarsa';
  if (order.paymentStatus === 'review') return 'Perlu diperiksa';
  if (order.transactionStatus === 'success') return 'Berhasil';
  if (order.transactionStatus === 'failed') return 'Gagal';
  return 'Sedang diproses';
}

function formatCurrency(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export default function CheckOrderPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  const requestOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setHasSearched(false);
    setOrders([]);
    try {
      const response = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-otp', identifier }),
      });
      const result = await response.json() as { challengeId?: string; error?: string };
      if (!response.ok) {
        throw new Error(result.error === 'INVALID_LOOKUP_DETAILS'
          ? 'Masukkan nomor WhatsApp atau kode pesanan yang valid.'
          : result.error === 'LOOKUP_RATE_LIMITED'
            ? 'Terlalu banyak permintaan. Tunggu beberapa menit sebelum mencoba lagi.'
            : result.error === 'OTP_DELIVERY_FAILED'
              ? 'Kode verifikasi belum dapat dikirim. Coba lagi nanti atau hubungi bantuan.'
              : 'Permintaan verifikasi gagal. Coba lagi.');
      }
      if (!result.challengeId) throw new Error('Verifikasi pesanan belum dapat dimulai.');
      setChallengeId(result.challengeId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Permintaan verifikasi gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-otp',
          identifier,
          challengeId,
          code: otpCode,
        }),
      });
      const result = await response.json() as { orders?: OrderSummary[]; error?: string };
      if (!response.ok) {
        throw new Error(result.error === 'LOOKUP_OTP_INVALID'
          ? 'Kode verifikasi tidak cocok atau sudah kedaluwarsa.'
          : result.error === 'LOOKUP_OTP_ATTEMPTS_EXCEEDED'
            ? 'Batas percobaan kode tercapai. Minta kode baru.'
            : result.error === 'ORDERS_NOT_FOUND'
              ? 'Pesanan tidak ditemukan. Periksa kembali nomor atau kode pesanan.'
              : 'Verifikasi pesanan gagal. Coba lagi.');
      }
      setOrders(result.orders ?? []);
      setHasSearched(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Verifikasi pesanan gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetLookup = () => {
    setChallengeId('');
    setOtpCode('');
    setOrders([]);
    setHasSearched(false);
    setErrorMessage('');
  };

  const openOrder = (order: OrderSummary) => {
    try {
      sessionStorage.setItem('payku:pending-qrisly-order', JSON.stringify({
        id: order.id,
        accessToken: order.accessToken,
      }));
    } catch {
      setErrorMessage('Browser tidak mengizinkan penyimpanan sesi. Aktifkan penyimpanan sesi lalu coba lagi.');
      return;
    }
    router.push(`/invoice/${encodeURIComponent(order.id)}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/70 pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans text-slate-900">
      <Header
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenHistory={() => router.push('/?tab=history')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal')}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-xl">
          <Link href="/" className="mb-5 hidden items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-700 md:inline-flex">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke katalog
          </Link>

          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader className="flex-row items-start gap-3 space-y-0 p-5 sm:p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg">Cek Pesanan</CardTitle>
                <CardDescription className="leading-5">
                  Verifikasi melalui WhatsApp sebelum melihat detail pesanan.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              <form
                onSubmit={(event) =>
                  void (challengeId ? verifyOtp(event) : requestOtp(event))
                }
                className="space-y-4"
              >
                <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                  Nomor WhatsApp atau kode pesanan
                  <Input
                    autoComplete="off"
                    required
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="08xxxxxxxxxx atau INV-XXXXXXXX"
                    disabled={Boolean(challengeId) || isLoading}
                  />
                </label>
                {challengeId && (
                  <>
                    <p className="text-sm text-slate-600">
                      Jika cocok dengan pesanan, kode 6 digit dikirim ke nomor WhatsApp terkait. Kode berlaku 5 menit.
                    </p>
                    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                      Kode verifikasi
                      <Input
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={otpCode}
                        onChange={(event) =>
                          setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="6 digit"
                        disabled={isLoading}
                      />
                    </label>
                  </>
                )}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700"
                >
                  {isLoading
                    ? 'Memproses...'
                    : challengeId
                      ? 'Verifikasi dan lihat pesanan'
                      : 'Kirim kode verifikasi'}
                </Button>
                {challengeId && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={resetLookup}
                    disabled={isLoading}
                  >
                    Ganti nomor atau kode pesanan
                  </Button>
                )}
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
                          Ada beberapa pesanan. Pilih pesanan yang ingin dicek.
                        </h2>
                      )}
                      {orders.map((order) => (
                        <Card
                          key={order.id}
                          className="overflow-hidden rounded-xl transition-colors hover:border-blue-300"
                        >
                          <button
                            type="button"
                            onClick={() => openOrder(order)}
                            className="w-full p-4 text-left transition-colors hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
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
                                  {order.destination} · {new Date(order.createdAt).toLocaleString('id-ID')}
                                </p>
                              </div>
                              <span className="flex shrink-0 items-center justify-between gap-3 text-xs font-semibold text-slate-600 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
                                <span>{orderStatus(order)}</span>
                                <span className="text-sm text-slate-900">
                                  {formatCurrency(order.totalPay)}
                                </span>
                                <span className="text-blue-700">Buka detail</span>
                              </span>
                            </div>
                          </button>
                        </Card>
                      ))}
                      {orders.length === 20 && (
                        <p className="text-center text-xs text-slate-500">
                          Menampilkan 20 pesanan terbaru. Gunakan kode pesanan untuk mencari pesanan yang lebih lama.
                        </p>
                      )}
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
        onOpenHome={() => router.push('/')}
        onOpenHistory={() => router.push('/?tab=history')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal')}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenDeposit={() => setIsDepositOpen(true)}
      />
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
    </div>
  );
}
