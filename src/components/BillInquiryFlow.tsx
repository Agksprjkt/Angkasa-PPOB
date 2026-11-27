'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Receipt, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TransactionPinPad, PIN_LENGTH } from '@/components/TransactionPinPad';
import { usePPOB } from '@/context/PPOBContext';
import type { BillInquiry, CatalogProduct } from '@/types/ppob';

function formatRupiah(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function inquiryError(code?: string) {
  const messages: Record<string, string> = {
    BILL_NOT_FOUND: 'Nomor tagihan tidak ditemukan. Periksa kembali nomor pelanggan.',
    BILL_ALREADY_PAID: 'Tagihan ini sudah dibayar.',
    BILL_EXPIRED: 'Tagihan sudah kedaluwarsa. Ulangi pengecekan.',
    BILL_INQUIRY_REQUIRED: 'Cek tagihan terlebih dahulu sebelum membayar.',
    BILL_INQUIRY_ALREADY_USED: 'Tagihan ini sudah dipakai untuk pesanan lain.',
    BILL_INQUIRY_EXPIRED: 'Masa berlaku tagihan habis. Cek ulang tagihannya.',
    BILL_INQUIRY_NOT_FOUND: 'Data tagihan tidak ditemukan. Cek ulang tagihannya.',
    BILL_INQUIRY_VENDOR_MISMATCH: 'Tagihan ini milik penyedia lain. Cek ulang tagihannya.',
    BILL_PROVIDER_UNAVAILABLE: 'Layanan tagihan sedang tidak tersedia. Coba lagi nanti.',
    BILL_REJECTED: 'Penyedia menolak permintaan tagihan.',
    BILL_INQUIRY_SAVE_FAILED: 'Tagihan gagal disimpan. Coba lagi.',
    NOT_A_BILL_PRODUCT: 'Produk ini bukan layanan pascabayar.',
    PROMOTION_NOT_ALLOWED_FOR_BILL: 'Tagihan tidak bisa memakai voucher atau flash sale.',
    TOO_MANY_REQUESTS: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
    UNAUTHORIZED: 'Masuk terlebih dahulu untuk mengecek tagihan.',
    INSUFFICIENT_BALANCE: 'Saldo tidak mencukupi untuk membayar tagihan ini.',
    TRANSACTION_PIN_NOT_SET: 'Atur PIN transaksi 6 digit terlebih dahulu.',
    TRANSACTION_PIN_LOCKED: 'Terlalu banyak percobaan PIN. Coba lagi dalam 15 menit.',
    INVALID_TRANSACTION_PIN: 'PIN transaksi salah.',
    ORDER_COULD_NOT_BE_CREATED: 'Pesanan gagal dibuat. Coba lagi.',
  };
  return code ? messages[code] ?? code : 'Permintaan gagal.';
}

// The quote is only valid briefly: the biller can change the amount, and
// Digiflazz requires payment on the same day as the inquiry.
function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  return {
    expired: remaining === 0,
    label: `${Math.floor(remaining / 60_000)}:${String(Math.floor((remaining % 60_000) / 1000)).padStart(2, '0')}`,
  };
}

export default function BillInquiryFlow({
  products,
  onRequireAuth,
}: {
  products: CatalogProduct[];
  onRequireAuth: () => void;
}) {
  const router = useRouter();
  const { currentUser, role, balance, buyProductWithBalance } = usePPOB();
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [destination, setDestination] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [inquiry, setInquiry] = useState<BillInquiry | null>(null);
  const [error, setError] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const countdown = useCountdown(inquiry?.expiresAt ?? null);

  const product = useMemo(
    () => products.find((row) => row.id === productId) ?? products[0] ?? null,
    [productId, products],
  );
  const requiresPin = currentUser?.role === 'user' || currentUser?.role === 'agent';
  const canPay = Boolean(
    inquiry &&
    !countdown?.expired &&
    currentUser &&
    balance >= inquiry.totalAmount,
  );

  const checkBill = async () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!product || destination.trim().length < 3) {
      setError('Masukkan nomor pelanggan terlebih dahulu.');
      return;
    }
    setIsChecking(true);
    setError('');
    setInquiry(null);
    try {
      const response = await fetch('/api/bills/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, destination: destination.trim() }),
      });
      const result = (await response.json()) as {
        inquiry?: BillInquiry;
        error?: string;
        message?: string;
      };
      if (!response.ok || !result.inquiry) {
        throw new Error(result.error ?? 'BILL_PROVIDER_UNAVAILABLE');
      }
      setInquiry(result.inquiry);
    } catch (caught) {
      setError(inquiryError(caught instanceof Error ? caught.message : undefined));
    } finally {
      setIsChecking(false);
    }
  };

  const payBill = async (pinCode?: string) => {
    if (!inquiry || !product) return;
    if (requiresPin && !/^\d{6}$/.test(pinCode ?? pin)) {
      setPinError('Masukkan PIN yang terdiri dari 6 angka.');
      return;
    }
    setIsPaying(true);
    setPinError('');
    try {
      const result = await buyProductWithBalance(
        product.id,
        inquiry.destination,
        inquiry.customerName,
        undefined,
        requiresPin ? (pinCode ?? pin) : undefined,
        undefined,
        inquiry.id,
      );
      setPinOpen(false);
      router.push(`/invoice/${encodeURIComponent(result.transaction.id)}`);
    } catch (caught) {
      const message = inquiryError(caught instanceof Error ? caught.message : 'ORDER_FAILED');
      setPinError(message);
      if (!pinOpen) setError(message);
      setPin('');
    } finally {
      setIsPaying(false);
    }
  };

  const startPayment = () => {
    if (!inquiry) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (requiresPin) {
      setPin('');
      setPinError('');
      setPinOpen(true);
      return;
    }
    void payBill();
  };

  const pressPinKey = (key: string) => {
    setPinError('');
    setPin((current) => {
      if (current.length >= PIN_LENGTH) return current;
      const next = current + key;
      if (next.length === PIN_LENGTH) queueMicrotask(() => void payBill(next));
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="bill-product" className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Jenis tagihan
            </Label>
            <select
              id="bill-product"
              value={product?.id ?? ''}
              onChange={(event) => {
                setProductId(event.target.value);
                setInquiry(null);
                setError('');
              }}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              {products.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="bill-destination" className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Nomor pelanggan
            </Label>
            <Input
              id="bill-destination"
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value);
                setInquiry(null);
                setError('');
              }}
              placeholder="Contoh: 530000000001"
              inputMode="numeric"
              maxLength={64}
              className="h-11"
            />
          </div>
        </div>

        <Button
          className="mt-3 w-full bg-sky-600 text-white hover:bg-sky-700 sm:w-auto"
          onClick={() => void checkBill()}
          disabled={isChecking || destination.trim().length < 3}
        >
          <Search className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {isChecking ? 'Mengecek tagihan...' : 'Cek Tagihan'}
        </Button>

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </section>

      {inquiry && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detail tagihan</p>
              <p className="mt-1 text-base font-bold text-slate-900">
                {inquiry.customerName || 'Pelanggan'}
              </p>
              <p className="text-xs text-slate-500">
                {product?.name} · {inquiry.destination}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              countdown?.expired ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
            }`}>
              {countdown?.expired ? 'Kedaluwarsa' : `Berlaku ${countdown?.label ?? ''}`}
            </span>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            {inquiry.lines.map((line) => (
              <div key={`${line.label}-${line.value}`} className="flex justify-between gap-3">
                <dt className="text-slate-500">{line.label}</dt>
                <dd className="text-right font-medium text-slate-800">{line.value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-2">
              <dt className="text-slate-500">Nilai tagihan</dt>
              <dd className="text-right font-medium text-slate-800">{formatRupiah(inquiry.billAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Biaya admin</dt>
              <dd className="text-right font-medium text-slate-800">{formatRupiah(inquiry.adminFee)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-700">Total bayar</dt>
              <dd className="text-right font-bold text-sky-700">{formatRupiah(inquiry.totalAmount)}</dd>
            </div>
          </dl>

          {currentUser && balance < inquiry.totalAmount && (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Saldo {formatRupiah(balance)} belum cukup untuk tagihan ini.
            </p>
          )}

          <Button
            className="mt-4 w-full bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={startPayment}
            disabled={!canPay || isPaying}
          >
            {isPaying ? 'Memproses pembayaran...' : 'Bayar tagihan'}
          </Button>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Nominal tagihan bisa berubah setelah masa berlaku habis; cek ulang bila kedaluwarsa.
          </p>
        </section>
      )}

      {!inquiry && !error && (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 p-3 text-xs text-slate-500">
          <Receipt className="h-4 w-4" aria-hidden="true" />
          Masukkan nomor pelanggan, lalu cek tagihan sebelum membayar.
        </p>
      )}

      {inquiry && !countdown?.expired && currentUser && balance >= inquiry.totalAmount && (
        <p className="flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Saldo cukup. Pembayaran langsung memotong saldo {role === 'agent' ? 'agen' : 'akun'} kamu.
        </p>
      )}

      {pinOpen && inquiry && product && (
        <TransactionPinPad
          productName={`${product.name} ${inquiry.destination}`}
          amount={inquiry.totalAmount}
          digits={pin}
          isProcessing={isPaying}
          error={pinError}
          onKey={pressPinKey}
          onBack={() => setPin((current) => current.slice(0, -1))}
          onCancel={() => {
            setPinOpen(false);
            setPin('');
            setPinError('');
          }}
          onGoToSettings={() => router.push('/dashboard/settings')}
        />
      )}
    </div>
  );
}
