'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@base-ui/react/dialog';
import { ArrowRight, CheckCircle2, CreditCard, LockKeyhole, UserRound, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { usePPOB } from '@/context/PPOBContext';
import type { Product } from '@/types/ppob';
import { validateOrderDestination } from '@/lib/order-input-validation';

interface StoredOrderAccess {
  id: string;
  accessToken: string | null;
  lookupCode?: string;
  customerPhone?: string;
}

interface DirectOrderModalProps {
  product: Product | null;
  destination: string;
  customerName?: string;
  serverZoneId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function requestError(code?: string) {
  const messages: Record<string, string> = {
    QRISLY_NOT_CONFIGURED: 'Pembayaran QRIS belum diaktifkan oleh admin.',
    QRISLY_AMOUNT_OUT_OF_RANGE: 'Nominal produk berada di luar batas pembayaran QRIS.',
    DIGIFLAZZ_NOT_READY: 'Layanan produk belum siap menerima pesanan.',
    VALID_CUSTOMER_NAME_REQUIRED: 'Masukkan nama yang valid.',
    VALID_CUSTOMER_PHONE_REQUIRED: 'Masukkan nomor WhatsApp yang valid.',
    INVALID_CUSTOMER_EMAIL: 'Format email tidak valid.',
    INVALID_ORDER_DESTINATION: 'Masukkan ID tujuan yang valid sebelum melanjutkan.',
    INVALID_GAME_USER_ID: 'Masukkan User ID game yang valid.',
    INVALID_GAME_SERVER_ID: 'Mobile Legends memerlukan Server ID numerik yang valid.',
    INVALID_PLN_METER_NUMBER: 'Nomor meter PLN harus terdiri dari 9–16 digit.',
    INSUFFICIENT_BALANCE: 'Saldo akun tidak mencukupi.',
    INVALID_TRANSACTION_PIN: 'PIN transaksi salah atau belum lengkap.',
    TRANSACTION_PIN_NOT_SET: 'Atur PIN transaksi 6 digit terlebih dahulu.',
    TRANSACTION_PIN_LOCKED: 'Terlalu banyak percobaan PIN. Coba lagi dalam 15 menit.',
    TRANSACTION_PIN_STATUS_UNAVAILABLE: 'Status PIN transaksi gagal dimuat.',
    PAYMENT_CONFIGURATION_UNAVAILABLE: 'Konfigurasi pembayaran sementara tidak tersedia.',
  };
  return code ? messages[code] ?? code : 'Permintaan pembayaran gagal.';
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const normalized = value.trim().startsWith('+')
    ? `+${digits}`
    : digits.startsWith('0')
      ? `+62${digits.slice(1)}`
      : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}

export default function DirectOrderModal({
  product,
  destination,
  customerName,
  serverZoneId,
  open,
  onOpenChange,
}: DirectOrderModalProps) {
  const router = useRouter();
  const { currentUser, role, balance, buyProductWithBalance, addToast } = usePPOB();
  const [isProcessing, setIsProcessing] = useState(false);
  const [qrislyEnabled, setQrislyEnabled] = useState(false);
  const [contactName, setContactName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [statusError, setStatusError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'qris' | null>(null);
  const [transactionPin, setTransactionPin] = useState('');
  const [pinConfirmation, setPinConfirmation] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinDrawerOpen, setPinDrawerOpen] = useState(false);
  const [pinDrawerMode, setPinDrawerMode] = useState<'setup' | 'verify'>('verify');
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [pinStatusUnavailable, setPinStatusUnavailable] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const displayedPrice = role === 'agent'
    ? product?.sellPriceAgent ?? product?.sellPriceUser ?? 0
    : product?.sellPriceUser ?? 0;
  const canPayWithBalance = Boolean(currentUser) && balance >= displayedPrice;
  const requiresTransactionPin =
    currentUser?.role === 'user' || currentUser?.role === 'agent';
  const isPinStatusLoading =
    open && requiresTransactionPin && pinConfigured === null && !pinStatusUnavailable;
  const activePaymentMethod = paymentMethod ?? (canPayWithBalance ? 'balance' : 'qris');
  const fullDestination = serverZoneId
    ? `${destination} (${serverZoneId})`
    : destination;
  const destinationError = product
    ? validateOrderDestination(product.category, product.operator, destination, serverZoneId)
    : 'INVALID_ORDER_DESTINATION';
  const guestContactValid = currentUser || (
    contactName.trim().length >= 2 &&
    isValidPhone(customerPhone) &&
    (!customerEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()))
  );
  const canSubmit = Boolean(
    product &&
    !destinationError &&
    (activePaymentMethod === 'balance'
      ? canPayWithBalance &&
        (!requiresTransactionPin ||
          (!isPinStatusLoading &&
            pinConfigured !== null &&
            !pinStatusUnavailable))
      : qrislyEnabled && guestContactValid && (!currentUser || isValidPhone(currentUser.phone))),
  );

  const setDrawerOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStatusError('');
      setContactName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setPaymentMethod(null);
      setTransactionPin('');
      setPinConfirmation('');
      setPinError('');
      setPinDrawerOpen(false);
      setPinConfigured(null);
      setPinStatusUnavailable(false);
      idempotencyKey.current = null;
    }
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetch('/api/orders/qrisly', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { enabled?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error ?? 'PAYMENT_CONFIGURATION_UNAVAILABLE');
        if (active) setQrislyEnabled(result.enabled === true);
      })
      .catch((error: unknown) => {
        if (active) {
          setQrislyEnabled(false);
          setStatusError(error instanceof Error ? requestError(error.message) : requestError());
        }
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !requiresTransactionPin) return;
    const controller = new AbortController();
    void fetch('/api/user/transaction-pin', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json() as { configured?: boolean; error?: string };
        if (!response.ok || typeof result.configured !== 'boolean') {
          throw new Error(result.error ?? 'TRANSACTION_PIN_STATUS_UNAVAILABLE');
        }
        setPinConfigured(result.configured);
        setPinStatusUnavailable(false);
        if (!result.configured) {
          addToast(
            'PIN Transaksi Belum Diatur',
            'Buat PIN 6 digit sebelum melanjutkan pembayaran dengan saldo.',
            'warning',
          );
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPinStatusUnavailable(true);
          setStatusError(
            error instanceof Error
              ? requestError(error.message)
              : requestError('TRANSACTION_PIN_STATUS_UNAVAILABLE'),
          );
        }
      });

    return () => controller.abort();
  }, [addToast, open, requiresTransactionPin]);

  const handleBalancePurchase = async () => {
    if (!product) return;
    if (requiresTransactionPin && !/^\d{6}$/.test(transactionPin)) {
      setPinError('Masukkan PIN yang terdiri dari 6 angka.');
      return;
    }
    if (
      requiresTransactionPin &&
      pinDrawerMode === 'setup' &&
      pinConfirmation !== transactionPin
    ) {
      setPinError('Konfirmasi PIN tidak cocok.');
      return;
    }

    setIsProcessing(true);
    setPinError('');
    try {
      if (requiresTransactionPin && pinDrawerMode === 'setup') {
        const response = await fetch('/api/user/transaction-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: transactionPin }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'TRANSACTION_PIN_STATUS_UNAVAILABLE');
        setPinConfigured(true);
        setPinDrawerMode('verify');
        setPinConfirmation('');
      }

      const result = await buyProductWithBalance(
        product.id,
        destination,
        customerName,
        serverZoneId,
        requiresTransactionPin ? transactionPin : undefined,
      );
      router.push(`/invoice/${encodeURIComponent(result.transaction.id)}`);
      setPinDrawerOpen(false);
      setDrawerOpen(false);
    } catch (error) {
      setPinError(
        error instanceof Error ? requestError(error.message) : 'Transaksi gagal diproses.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBalancePaymentClick = () => {
    if (!requiresTransactionPin) {
      void handleBalancePurchase();
      return;
    }

    setPinDrawerMode(pinConfigured ? 'verify' : 'setup');
    setTransactionPin('');
    setPinConfirmation('');
    setPinError('');
    setPinDrawerOpen(true);
  };

  const handleQrislyPurchase = async () => {
    if (!product) return;
    if (!currentUser && (contactName.trim().length < 2 || !isValidPhone(customerPhone))) {
      setStatusError('Nama dan nomor WhatsApp wajib diisi dengan benar.');
      return;
    }
    if (!currentUser && customerEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      setStatusError(requestError('INVALID_CUSTOMER_EMAIL'));
      return;
    }

    try {
      sessionStorage.setItem('payku:checkout-storage-check', '1');
      sessionStorage.removeItem('payku:checkout-storage-check');
    } catch {
      setStatusError('Browser tidak mengizinkan penyimpanan akses invoice. Aktifkan penyimpanan sesi lalu coba lagi.');
      return;
    }

    setIsProcessing(true);
    setStatusError('');
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch('/api/orders/qrisly', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({
          productId: product.id,
          destination,
          customerName,
          serverZoneId,
          ...(currentUser
            ? {}
            : {
              purchaserName: contactName.trim(),
              customerPhone,
              customerEmail: customerEmail.trim(),
            }),
        }),
      });
      const result = await response.json() as {
        invoice?: { id: string; invoiceNumber: string };
        accessToken?: string | null;
        error?: string;
        message?: string;
      };
      if (!response.ok || !result.invoice) {
        if (response.status < 500) idempotencyKey.current = null;
        throw new Error(result.message ?? requestError(result.error));
      }

      const access = {
        id: result.invoice.id,
        accessToken: result.accessToken ?? null,
        lookupCode: result.invoice.invoiceNumber,
        customerPhone: currentUser?.phone ?? customerPhone,
      } satisfies StoredOrderAccess;
      sessionStorage.setItem('payku:pending-qrisly-order', JSON.stringify(access));
      router.push(`/invoice/${encodeURIComponent(result.invoice.id)}`);
      setDrawerOpen(false);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Pembayaran QRIS gagal dibuat.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!product) return null;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] transition-opacity" />
          <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-2xl animate-slideUp flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl outline-none">
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-slate-300" />
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 pb-4 pt-3 sm:px-7">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">
                Checkout pesanan
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-slate-500">
                Periksa ringkasan, isi kontak, lalu pilih cara pembayaran.
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Tutup checkout"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <CreditCard className="h-4 w-4 text-violet-600" />
                Ringkasan pesanan
              </h3>
              <dl className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Layanan</dt>
                  <dd className="text-right font-semibold text-slate-900">{product.operator}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Produk</dt>
                  <dd className="text-right font-semibold text-slate-900">{product.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Tujuan</dt>
                  <dd className="max-w-[65%] break-all text-right font-mono text-slate-900">
                    {fullDestination || 'Belum diisi'}
                  </dd>
                </div>
                {customerName && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Nama pelanggan</dt>
                    <dd className="text-right font-medium text-slate-900">{customerName}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-3">
                  <dt className="font-semibold text-slate-700">Total bayar</dt>
                  <dd className="text-base font-bold text-violet-700">
                    Rp {displayedPrice.toLocaleString('id-ID')}
                  </dd>
                </div>
              </dl>
              {product.category === 'pln' && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Nomor PLN hanya divalidasi formatnya. Status pelanggan tidak dicek sebelum transaksi; Digiflazz memeriksanya saat pesanan diproses.
                </p>
              )}
              {destinationError && (
                <p role="alert" className="mt-2 text-xs text-rose-700">
                  {requestError(destinationError)}
                </p>
              )}
            </section>

            {!currentUser && (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Data kontak</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Kontak ini digunakan untuk mengenali dan menghubungi pemesan.
                  </p>
                </div>
                <label className="block space-y-1.5 text-xs font-medium text-slate-700">
                  Nama
                  <input
                    type="text"
                    autoComplete="name"
                    maxLength={100}
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="Nama lengkap"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    required
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-slate-700">
                  <span className="flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5 text-violet-600" />
                    Nomor WhatsApp <span className="text-rose-600">*</span>
                  </span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    maxLength={24}
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    required
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-slate-700">
                  Email <span className="font-normal text-slate-400">(opsional)</span>
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="nama@email.com"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </label>
              </section>
            )}

            {currentUser && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                Data kontak akun digunakan untuk pesanan ini: {currentUser.name}
                {currentUser.phone ? ` · ${currentUser.phone}` : ''}.
              </p>
            )}

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Metode pembayaran</h3>
                <p className="mt-1 text-xs text-slate-500">Pilih metode untuk melanjutkan.</p>
              </div>
              {currentUser && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('balance')}
                  disabled={!canPayWithBalance}
                  aria-pressed={activePaymentMethod === 'balance'}
                  className={`flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                    activePaymentMethod === 'balance'
                      ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                      <Wallet className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">Saldo akun</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Rp {balance.toLocaleString('id-ID')}
                        {!canPayWithBalance && ' · saldo tidak mencukupi'}
                      </span>
                    </span>
                  </span>
                  {activePaymentMethod === 'balance' && (
                    <CheckCircle2 className="h-5 w-5 text-violet-600" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPaymentMethod('qris')}
                disabled={!qrislyEnabled}
                aria-pressed={activePaymentMethod === 'qris'}
                className={`flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                  activePaymentMethod === 'qris'
                    ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">QRIS</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {qrislyEnabled ? 'Pembayaran QRIS otomatis' : 'QRIS otomatis belum tersedia'}
                    </span>
                  </span>
                </span>
                {activePaymentMethod === 'qris' && (
                  <CheckCircle2 className="h-5 w-5 text-violet-600" />
                )}
              </button>
            </section>

            {statusError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {statusError}
              </p>
            )}
          </div>

          <footer className="flex gap-3 border-t border-slate-200 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDrawerOpen(false)}
              disabled={isProcessing}
            >
              Batal
            </Button>
            <Button
              className="flex-1 bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => {
                if (activePaymentMethod === 'balance') {
                  handleBalancePaymentClick();
                } else {
                  void handleQrislyPurchase();
                }
              }}
              disabled={isProcessing || !canSubmit}
            >
              {isProcessing
                ? 'Memproses...'
                : activePaymentMethod === 'balance' &&
                    requiresTransactionPin &&
                    pinConfigured === false
                  ? 'Atur PIN & Bayar'
                  : `Bayar Rp ${displayedPrice.toLocaleString('id-ID')}`}
              {!isProcessing && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
          </footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Drawer
        open={pinDrawerOpen}
        onOpenChange={(nextOpen) => {
          setPinDrawerOpen(nextOpen);
          if (!nextOpen) {
            setTransactionPin('');
            setPinConfirmation('');
            setPinError('');
          }
        }}
      >
        <DrawerContent>
          <DrawerHeader className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <DrawerTitle>
                {pinDrawerMode === 'setup' ? 'Atur PIN transaksi' : 'Masukkan PIN transaksi'}
              </DrawerTitle>
              <DrawerDescription>
                {pinDrawerMode === 'setup'
                  ? 'Buat PIN 6 digit. PIN ini diperlukan setiap kali membayar dengan saldo.'
                  : 'Konfirmasi pembayaran saldo dengan PIN 6 digit Anda.'}
              </DrawerDescription>
            </div>
          </DrawerHeader>

          <div className="space-y-4 px-5 py-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">{product.name}</p>
              <p className="mt-1 font-bold text-violet-700">
                Rp {displayedPrice.toLocaleString('id-ID')}
              </p>
            </div>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              {pinDrawerMode === 'setup' ? 'PIN baru' : 'PIN 6 digit'}
              <input
                type="password"
                inputMode="numeric"
                autoComplete={pinDrawerMode === 'setup' ? 'new-password' : 'current-password'}
                pattern="[0-9]{6}"
                maxLength={6}
                value={transactionPin}
                onChange={(event) => {
                  setTransactionPin(event.target.value.replace(/\D/g, '').slice(0, 6));
                  setPinError('');
                }}
                placeholder="••••••"
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-center text-xl tracking-[0.6em] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                autoFocus
              />
            </label>
            {pinDrawerMode === 'setup' && (
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Konfirmasi PIN baru
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={pinConfirmation}
                  onChange={(event) => {
                    setPinConfirmation(event.target.value.replace(/\D/g, '').slice(0, 6));
                    setPinError('');
                  }}
                  placeholder="Ulangi PIN 6 digit"
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-center text-xl tracking-[0.6em] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </label>
            )}
            {pinError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {pinError}
              </p>
            )}
          </div>

          <DrawerFooter>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setPinDrawerOpen(false)}
              disabled={isProcessing}
            >
              Batal
            </Button>
            <Button
              className="flex-1 bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => void handleBalancePurchase()}
              disabled={
                isProcessing ||
                transactionPin.length !== 6 ||
                (pinDrawerMode === 'setup' &&
                  (pinConfirmation.length !== 6 || pinConfirmation !== transactionPin))
              }
            >
              {isProcessing
                ? 'Memproses...'
                : pinDrawerMode === 'setup'
                  ? 'Simpan PIN & Bayar'
                  : `Bayar Rp ${displayedPrice.toLocaleString('id-ID')}`}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
