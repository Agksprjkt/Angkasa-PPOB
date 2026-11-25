'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@base-ui/react/dialog';
import { ArrowRight, CheckCircle2, CreditCard, Tag, UserRound, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TransactionPinPad, PIN_LENGTH } from '@/components/TransactionPinPad';
import { usePPOB } from '@/context/PPOBContext';
import type { Product } from '@/types/ppob';
import { validateOrderDestination } from '@/lib/order-input-validation';
import { vendorLabelOf } from '@/lib/vendor-registry';
import { voucherErrorMessage, type VoucherErrorCode } from '@/lib/voucher-core';

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
    VOUCHER_NOT_FOUND: 'Kode voucher tidak ditemukan.',
    VOUCHER_INACTIVE: 'Kode voucher sedang tidak aktif.',
    VOUCHER_NOT_STARTED: 'Kode voucher belum berlaku.',
    VOUCHER_EXPIRED: 'Kode voucher sudah kedaluwarsa.',
    VOUCHER_QUOTA_EXHAUSTED: 'Kuota kode voucher sudah habis.',
    VOUCHER_MIN_ORDER_NOT_MET: 'Total transaksi belum memenuhi syarat kode voucher.',
    VOUCHER_USER_LIMIT_REACHED: 'Kamu sudah memakai kode ini sampai batasnya.',
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
  const [pinError, setPinError] = useState('');
  const [pinPadOpen, setPinPadOpen] = useState(false);
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [pinStatusUnavailable, setPinStatusUnavailable] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<{
    code: string;
    discountAmount: number;
    finalPrice: number;
  } | null>(null);
  const [voucherError, setVoucherError] = useState('');
  const [isApplyingVoucher, setIsApplyingVoucher] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  // Persist the key so a refresh mid-checkout cannot create a duplicate order.
  const idempotencyStorageKey = product ? `payku:idem:${product.id}` : null;
  const readStoredIdempotencyKey = useCallback(() => {
    if (!idempotencyStorageKey) return null;
    try {
      return sessionStorage.getItem(idempotencyStorageKey);
    } catch {
      return null;
    }
  }, [idempotencyStorageKey]);
  const storeIdempotencyKey = useCallback((key: string | null) => {
    if (!idempotencyStorageKey) return;
    try {
      if (key) sessionStorage.setItem(idempotencyStorageKey, key);
      else sessionStorage.removeItem(idempotencyStorageKey);
    } catch {
      // sessionStorage unavailable — in-memory ref still guards this session
    }
  }, [idempotencyStorageKey]);

  const displayedPrice = role === 'agent'
    ? product?.sellPriceAgent ?? product?.sellPriceUser ?? 0
    : product?.sellPriceUser ?? 0;
  // The voucher prices the order; everything the buyer sees and pays uses it.
  const payablePrice = appliedVoucher ? appliedVoucher.finalPrice : displayedPrice;
  const canPayWithBalance = Boolean(currentUser) && balance >= payablePrice;
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
      setPinError('');
      setPinPadOpen(false);
      setPinConfigured(null);
      setPinStatusUnavailable(false);
      setIsCancelConfirmOpen(false);
      setVoucherInput('');
      setAppliedVoucher(null);
      setVoucherError('');
      idempotencyKey.current = null;
    }
    onOpenChange(nextOpen);
  };

  // Closing the checkout abandons the order, so make the buyer confirm it.
  const requestClose = () => {
    if (isProcessing) return;
    setIsCancelConfirmOpen(true);
  };

  // base-ui handles Escape itself, so intercept it in the capture phase before
  // the drawer can close and drop the order without asking.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isCancelConfirmOpen) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!isProcessing) setIsCancelConfirmOpen(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isCancelConfirmOpen, isProcessing, open]);

  // Restore a pending key after refresh so retrying reuses the same order.
  useEffect(() => {
    if (!open || idempotencyKey.current) return;
    const stored = readStoredIdempotencyKey();
    if (stored) idempotencyKey.current = stored;
  }, [open, readStoredIdempotencyKey]);

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

  const handleBalancePurchase = async (pin?: string) => {
    if (!product) return;
    const pinToUse = pin ?? transactionPin;
    if (requiresTransactionPin && !/^\d{6}$/.test(pinToUse)) {
      setPinError('Masukkan PIN yang terdiri dari 6 angka.');
      return;
    }

    setIsProcessing(true);
    setPinError('');
    try {
      const result = await buyProductWithBalance(
        product.id,
        destination,
        customerName,
        serverZoneId,
        requiresTransactionPin ? pinToUse : undefined,
        appliedVoucher?.code,
      );
      router.push(`/invoice/${encodeURIComponent(result.transaction.id)}`);
      setPinPadOpen(false);
      setDrawerOpen(false);
      storeIdempotencyKey(null);
    } catch (error) {
      setPinError(
        error instanceof Error ? requestError(error.message) : 'Transaksi gagal diproses.',
      );
      // Clear the digits so a retry does not need a manual backspace.
      setTransactionPin('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePinSubmit = (pin: string) => {
    void handleBalancePurchase(pin);
  };

  const pressPinKey = (key: string) => {
    setPinError('');
    setTransactionPin((current) => {
      if (current.length >= PIN_LENGTH) return current;
      const next = current + key;
      // Submit exactly once, when the sixth digit lands.
      if (next.length === PIN_LENGTH) queueMicrotask(() => handlePinSubmit(next));
      return next;
    });
  };

  const removePinDigit = () => {
    setPinError('');
    setTransactionPin((current) => current.slice(0, -1));
  };

  const handleBalancePaymentClick = () => {
    if (!requiresTransactionPin) {
      void handleBalancePurchase();
      return;
    }

    // PIN is managed on its own page; never set it up inside checkout.
    if (pinConfigured === false) {
      setDrawerOpen(false);
      router.push('/dashboard/settings');
      return;
    }

    setTransactionPin('');
    setPinError('');
    setPinPadOpen(true);
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

    setIsProcessing(true);
    setStatusError('');
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      storeIdempotencyKey(idempotencyKey.current);
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
          ...(appliedVoucher ? { voucherCode: appliedVoucher.code } : {}),
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
        if (response.status < 500) {
          idempotencyKey.current = null;
          storeIdempotencyKey(null);
        }
        throw new Error(result.message ?? requestError(result.error));
      }

      const access = {
        id: result.invoice.id,
        accessToken: result.accessToken ?? null,
        lookupCode: result.invoice.invoiceNumber,
        customerPhone: currentUser?.phone ?? customerPhone,
      } satisfies StoredOrderAccess;
      let stored = true;
      try {
        sessionStorage.setItem('payku:pending-qrisly-order', JSON.stringify(access));
      } catch {
        stored = false;
      }
      storeIdempotencyKey(null);
      if (!stored) {
        addToast(
          'Akses invoice disimpan terbatas',
          `Penyimpanan browser diblokir. Buka invoice lewat Cek Pesanan dengan kode ${access.lookupCode}.`,
          'warning',
        );
      }
      router.push(`/invoice/${encodeURIComponent(result.invoice.id)}`);
      setDrawerOpen(false);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Pembayaran QRIS gagal dibuat.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!product) return null;

  const applyVoucher = async () => {
    const code = voucherInput.trim();
    if (!code || isApplyingVoucher) return;
    setIsApplyingVoucher(true);
    setVoucherError('');
    try {
      const response = await fetch('/api/vouchers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, productId: product.id, basePrice: displayedPrice }),
      });
      const result = await response.json() as {
        code?: string;
        discountAmount?: number;
        finalPrice?: number;
        error?: string;
      };
      if (!response.ok || typeof result.discountAmount !== 'number' ||
        typeof result.finalPrice !== 'number' || typeof result.code !== 'string') {
        setAppliedVoucher(null);
        setVoucherError(
          voucherErrorMessage((result.error ?? 'VOUCHER_NOT_FOUND') as VoucherErrorCode),
        );
        return;
      }
      setAppliedVoucher({
        code: result.code,
        discountAmount: result.discountAmount,
        finalPrice: result.finalPrice,
      });
      setVoucherInput(result.code);
    } catch {
      setAppliedVoucher(null);
      setVoucherError('Kode voucher gagal diperiksa. Coba lagi.');
    } finally {
      setIsApplyingVoucher(false);
    }
  };

  const removeVoucher = () => {
    setAppliedVoucher(null);
    setVoucherInput('');
    setVoucherError('');
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] transition-opacity" />
          <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-2xl animate-slideUp flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl outline-none">
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
              onClick={requestClose}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Tutup checkout"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <CreditCard className="h-4 w-4 text-sky-600" />
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
                  <dt className="text-slate-500">Sumber</dt>
                  <dd className="text-right font-semibold text-slate-900">
                    {vendorLabelOf(product)}
                  </dd>
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
                  <dd className="text-base font-bold text-sky-700">
                    Rp {payablePrice.toLocaleString('id-ID')}
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
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    required
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-slate-700">
                  <span className="flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5 text-sky-600" />
                    Nomor WhatsApp <span className="text-rose-600">*</span>
                  </span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    maxLength={24}
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
                      ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center text-blue-700">
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
                    <CheckCircle2 className="h-5 w-5 text-sky-600" />
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
                    ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center text-emerald-700">
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
                  <CheckCircle2 className="h-5 w-5 text-sky-600" />
                )}
              </button>
            </section>

            {statusError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {statusError}
              </p>
            )}

            <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Tag className="h-4 w-4 text-sky-600" />
                Kode promo
              </h3>
              {appliedVoucher ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-emerald-800">
                      {appliedVoucher.code}
                    </p>
                    <p className="text-xs text-emerald-700">
                      Hemat Rp {appliedVoucher.discountAmount.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeVoucher}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 underline hover:text-emerald-950"
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={voucherInput}
                    onChange={(event) => {
                      setVoucherInput(event.target.value.toUpperCase());
                      setVoucherError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void applyVoucher();
                      }
                    }}
                    maxLength={32}
                    placeholder="Contoh: HEMAT5"
                    aria-label="Kode promo"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm uppercase outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    disabled={!voucherInput.trim() || isApplyingVoucher}
                    onClick={() => void applyVoucher()}
                  >
                    {isApplyingVoucher ? 'Memeriksa…' : 'Terapkan'}
                  </Button>
                </div>
              )}
              {voucherError && (
                <p role="alert" className="text-xs text-rose-700">{voucherError}</p>
              )}
            </section>
          </div>

          <footer className="flex gap-3 border-t border-slate-200 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
            <Button
              variant="outline"
              className="flex-1"
              onClick={requestClose}
              disabled={isProcessing}
            >
              Batal
            </Button>
            <Button
              className="flex-1 bg-sky-600 text-white hover:bg-sky-700"
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
                  ? 'Atur PIN di Pengaturan'
                  : `Bayar Rp ${payablePrice.toLocaleString('id-ID')}`}
              {!isProcessing && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
          </footer>
          {/* Rendered inside the popup: base-ui marks everything outside it inert. */}
          {isCancelConfirmOpen && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/97 p-6 text-center backdrop-blur-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <X className="h-6 w-6" />
              </span>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Batalkan pesanan?</h3>
                <p className="text-sm text-slate-600">Pesanan akan dibatalkan, lanjut?</p>
              </div>
              <div className="flex w-full max-w-sm flex-col gap-2">
                <Button
                  className="w-full bg-rose-600 text-white hover:bg-rose-700"
                  onClick={() => {
                    setIsCancelConfirmOpen(false);
                    setDrawerOpen(false);
                  }}
                >
                  Ya, batalkan
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsCancelConfirmOpen(false)}
                >
                  Tetap di sini
                </Button>
              </div>
            </div>
          )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {pinPadOpen && (
        <TransactionPinPad
          productName={product.name}
          amount={payablePrice}
          digits={transactionPin}
          isProcessing={isProcessing}
          error={pinError}
          onKey={pressPinKey}
          onBack={removePinDigit}
          onCancel={() => {
            setPinPadOpen(false);
            setTransactionPin('');
            setPinError('');
          }}
          onGoToSettings={() => {
            setPinPadOpen(false);
            setDrawerOpen(false);
            router.push('/dashboard/settings');
          }}
        />
      )}
    </>
  );
}
