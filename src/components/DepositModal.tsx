'use client';

import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toDataURL } from 'qrcode';
import { usePPOB } from '@/context/PPOBContext';
import type { ManualPaymentMethod } from '@/types/ppob';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizePhone } from '@/lib/phone';

type DepositItem = {
  id: string;
  amount: number;
  type: 'bank_transfer' | 'static_qris' | 'qrisly';
  paymentMethodLabel: string | null;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string | null;
  providerReference?: string | null;
  qrString?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
};

function requestError(code: string) {
  if (code === 'PHONE_VERIFICATION_REQUIRED') {
    return 'Verifikasi nomor HP melalui OTP sebelum mengajukan deposit.';
  }
  if (code === 'QRISLY_NOT_CONFIGURED') return 'Qrisly belum dikonfigurasi oleh admin.';
  if (code === 'PAYMENT_METHOD_UNAVAILABLE') return 'Metode pembayaran ini sudah tidak aktif.';
  return code || 'Permintaan deposit gagal.';
}

export default function DepositModal({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentUser, refreshBalance } = usePPOB();
  const userId = currentUser?.id;
  const [methods, setMethods] = useState<ManualPaymentMethod[]>([]);
  const [qrislyEnabled, setQrislyEnabled] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [amount, setAmount] = useState('10000');
  const [supportPhone, setSupportPhone] = useState('');
  const [activeDepositState, setActiveDepositState] = useState<{
    userId: string;
    deposit: DepositItem | null;
  } | null>(null);
  const activeDeposit = activeDepositState?.userId === userId
    ? activeDepositState?.deposit ?? null
    : null;
  const updateActiveDeposit = useCallback((deposit: DepositItem | null) => {
    if (userId) setActiveDepositState({ userId, deposit });
  }, [userId]);
  const [qrImage, setQrImage] = useState<{ qrString: string; dataUrl: string } | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const isLoading = open && !hasLoaded;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const requestKey = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    void Promise.all([
      fetch('/api/payment-methods').then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Metode pembayaran gagal dimuat.');
        return body as { methods: ManualPaymentMethod[]; qrislyEnabled: boolean };
      }),
      fetch('/api/deposits?view=active').then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Riwayat deposit gagal dimuat.');
        return body as { deposits: DepositItem[] };
      }),
    ])
      .then(([paymentConfig, depositResult]) => {
        if (!active) return;
        setMethods(paymentConfig.methods);
        setQrislyEnabled(paymentConfig.qrislyEnabled);
        setSelectedMethodId((current) =>
          paymentConfig.methods.some((method) => method.id === current)
            ? current
            : paymentConfig.methods[0]?.id ?? '',
        );
        updateActiveDeposit(depositResult.deposits[0] ?? null);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Deposit gagal dimuat.');
      })
      .finally(() => {
        if (active) setHasLoaded(true);
      });
    void refreshBalance().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Saldo gagal diperbarui.');
    });
    return () => { active = false; };
  }, [open, userId, refreshBalance, updateActiveDeposit]);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    void fetch('/api/store-settings', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { supportPhone?: unknown; error?: string };
        if (!response.ok || typeof body.supportPhone !== 'string') {
          throw new Error(body.error ?? 'Nomor WhatsApp admin gagal dimuat.');
        }
        return body.supportPhone;
      })
      .then((phone) => {
        if (active) setSupportPhone(phone);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error
            ? cause.message
            : 'Nomor WhatsApp admin gagal dimuat.');
        }
      });
    return () => { active = false; };
  }, [open, userId]);

  const qrString = activeDeposit?.qrString;
  useEffect(() => {
    if (!qrString) return;
    let active = true;
    void toDataURL(qrString, { margin: 2, width: 280 })
      .then((dataUrl) => { if (active) setQrImage({ qrString, dataUrl }); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'QRIS tidak dapat ditampilkan.');
      });
    return () => { active = false; };
  }, [qrString]);

  const activeDepositId = activeDeposit?.id;
  const activeDepositStatus = activeDeposit?.status;
  useEffect(() => {
    if (!open || !activeDepositId || activeDepositStatus !== 'pending') return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/deposits/${encodeURIComponent(activeDepositId)}`);
        const body = await response.json();
        if (!response.ok || !body.deposit) {
          throw new Error(body.error ?? 'Status deposit gagal diperiksa.');
        }
        if (!active) return;
        const deposit = body.deposit as DepositItem;
        updateActiveDeposit(deposit.status === 'pending' ? deposit : null);
        if (deposit.status === 'approved') {
          await refreshBalance();
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Status deposit gagal diperiksa.');
      }
    };
    const intervalId = window.setInterval(() => void refresh(), 5_000);
    void refresh();
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [open, activeDepositId, activeDepositStatus, refreshBalance, updateActiveDeposit]);

  const createQrislyDeposit = async () => {
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount < 1_000 || numericAmount > 100_000_000) {
      setError('Nominal harus antara Rp 1.000 dan Rp 100.000.000.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      requestKey.current ??= crypto.randomUUID();
      const response = await fetch('/api/deposits/qrisly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numericAmount, idempotencyKey: requestKey.current }),
      });
      const body = await response.json();
      if (!response.ok || !body.deposit) throw new Error(requestError(body.error));
      updateActiveDeposit(body.deposit as DepositItem);
      requestKey.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pembayaran Qrisly gagal dibuat.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitManualDeposit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount < 1_000 || numericAmount > 100_000_000) {
      setError('Nominal harus antara Rp 1.000 dan Rp 100.000.000.');
      return;
    }
    if (!selectedMethodId) {
      setError('Pilih metode pembayaran.');
      return;
    }
    if (!normalizePhone(supportPhone)) {
      setError('Nomor WhatsApp admin belum diatur. Hubungi admin.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      requestKey.current ??= crypto.randomUUID();
      const response = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numericAmount,
          methodId: selectedMethodId,
          idempotencyKey: requestKey.current,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.deposit) throw new Error(requestError(body.error));
      updateActiveDeposit(body.deposit as DepositItem);
      requestKey.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pengajuan deposit gagal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedMethod = methods.find((method) => method.id === selectedMethodId);
  const adminWhatsappDigits = normalizePhone(supportPhone)?.replace(/\D/g, '');
  const activeDepositWhatsappLink = activeDeposit &&
    activeDeposit.status === 'pending' &&
    activeDeposit.type !== 'qrisly' &&
    adminWhatsappDigits
    ? `https://wa.me/${adminWhatsappDigits}?text=${encodeURIComponent(
        `Halo Admin, saya ingin konfirmasi deposit.\nID Deposit: ${activeDeposit.id}\nNominal: Rp ${activeDeposit.amount.toLocaleString('id-ID')}\nMetode: ${activeDeposit.paymentMethodLabel ?? 'Transfer / QRIS Statis'}\nSaya akan melampirkan bukti pembayaran di chat ini.`,
      )}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} drawer>
      <DialogContent
        onClose={() => onOpenChange(false)}
        className="max-h-[90vh] rounded-t-3xl rounded-b-none p-5 sm:rounded-2xl sm:p-6"
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <DialogHeader className="mb-4">
          <DialogTitle>Isi saldo</DialogTitle>
          <DialogDescription>
            Deposit manual menunggu verifikasi admin melalui WhatsApp. QRIS Qrisly dikreditkan setelah server memverifikasi status dan nominal.
          </DialogDescription>
        </DialogHeader>

        {!currentUser ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Masuk ke akun terlebih dahulu untuk mengajukan deposit.
          </p>
        ) : (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {isLoading ? <p className="text-sm text-slate-500">Memuat metode pembayaran…</p> : null}
            {activeDeposit && (
              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Deposit menunggu · {activeDeposit.paymentMethodLabel}</p>
                  <Badge variant={activeDeposit.status === 'approved' ? 'success' : activeDeposit.status === 'pending' ? 'warning' : 'destructive'}>
                    {activeDeposit.status === 'pending' ? 'Menunggu' : activeDeposit.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                  </Badge>
                </div>
                <p className="text-sm">Rp {activeDeposit.amount.toLocaleString('id-ID')}</p>
                {activeDeposit.type === 'qrisly' && activeDeposit.qrString && activeDeposit.status === 'pending' && (
                  <div className="text-center">
                    {qrImage?.qrString === activeDeposit.qrString && <img src={qrImage.dataUrl} alt="QR pembayaran Qrisly" className="mx-auto w-64 max-w-full" />}
                    {activeDeposit.expiresAt && (
                      <p className="mt-2 text-xs text-slate-500">
                        Kedaluwarsa {new Date(activeDeposit.expiresAt).toLocaleString('id-ID')}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-500">Server memeriksa status berkala. Dialog ini juga memperbarui status tiap 5 detik saat terbuka.</p>
                  </div>
                )}
                {activeDeposit.adminNote && <p className="text-sm text-amber-800">{activeDeposit.adminNote}</p>}
                {activeDeposit.status === 'pending' && activeDeposit.type !== 'qrisly' && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">
                      Saldo belum bertambah. Kirim bukti pembayaran melalui WhatsApp admin dengan ID deposit ini.
                    </p>
                    {activeDepositWhatsappLink ? (
                      <a
                        href={activeDepositWhatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                      >
                        Konfirmasi via WhatsApp
                      </a>
                    ) : (
                      <p role="alert" className="text-xs text-rose-700">
                        Nomor WhatsApp admin belum tersedia. Hubungi admin sebelum melakukan pembayaran.
                      </p>
                    )}
                  </div>
                )}
                {activeDeposit.status === 'approved' && <p className="text-xs text-emerald-700">Saldo sudah diperbarui.</p>}
              </section>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="deposit-amount">Nominal deposit (Rp)</Label>
              <Input
                id="deposit-amount"
                type="number"
                min={1000}
                max={100000000}
                step={1000}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-slate-500">Minimal Rp 1.000, maksimal Rp 100.000.000.</p>
            </div>

            {qrislyEnabled && (
              <Button type="button" className="w-full" onClick={() => void createQrislyDeposit()} disabled={isSubmitting}>
                {isSubmitting ? 'Membuat QRIS…' : 'Bayar otomatis dengan QRIS'}
              </Button>
            )}

            {methods.length > 0 ? (
              <form onSubmit={(event) => void submitManualDeposit(event)} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="deposit-method">Transfer bank atau QRIS statis</Label>
                  <select
                    id="deposit-method"
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={selectedMethodId}
                    onChange={(event) => setSelectedMethodId(event.target.value)}
                    disabled={isSubmitting}
                  >
                    {methods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}
                  </select>
                </div>
                {selectedMethod?.type === 'bank_transfer' && (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="font-semibold">{selectedMethod.bankName} · {selectedMethod.accountNumber}</p>
                    <p className="text-slate-600">a.n. {selectedMethod.accountHolder}</p>
                  </div>
                )}
                {selectedMethod?.type === 'static_qris' && selectedMethod.qrImageUrl && (
                  <img src={selectedMethod.qrImageUrl} alt={`QRIS ${selectedMethod.label}`} className="mx-auto h-56 w-56 rounded border object-contain" />
                )}
                {selectedMethod?.instructions && <p className="text-sm text-slate-600">{selectedMethod.instructions}</p>}
                <p className="text-xs text-slate-500">
                  Setelah membuat pengajuan, kirim screenshot pembayaran ke WhatsApp admin. Admin akan memeriksa bukti dan mutasi sebelum menambah saldo.
                </p>
                <Button type="submit" variant="outline" className="w-full" disabled={isSubmitting || !selectedMethod}>
                  {isSubmitting ? 'Membuat pengajuan…' : 'Buat pengajuan deposit'}
                </Button>
              </form>
            ) : !qrislyEnabled && !isLoading ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                Belum ada metode pembayaran aktif. Hubungi admin.
              </p>
            ) : null}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
