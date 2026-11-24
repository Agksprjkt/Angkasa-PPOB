'use client';

import { useEffect, useState } from 'react';
import type { ManualPaymentMethod } from '@/types/ppob';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { LoadingState } from '@/components/ui/crystal-loader';
import { usePPOB } from '@/context/PPOBContext';
import IntegrationSettingsPanel from '@/components/IntegrationSettingsPanel';
import { Banknote, Plus, QrCode, Trash2, Wallet } from 'lucide-react';

type AdminPaymentMethod = ManualPaymentMethod & { qrImageFile: string | null };
type MethodType = AdminPaymentMethod['type'];

const typeMeta: Record<MethodType, {
  label: string;
  short: string;
  description: string;
  icon: typeof Banknote;
}> = {
  bank_transfer: {
    label: 'Transfer bank',
    short: 'Transfer bank',
    description: 'Rekening bank tujuan transfer manual.',
    icon: Banknote,
  },
  ewallet: {
    label: 'E-wallet',
    short: 'E-wallet',
    description: 'DANA, OVO, GoPay, ShopeePay, dan sejenisnya.',
    icon: Wallet,
  },
  static_qris: {
    label: 'QRIS statis',
    short: 'QRIS',
    description: 'Satu gambar QRIS yang dipindai pelanggan.',
    icon: QrCode,
  },
};

const typeOrder: MethodType[] = ['bank_transfer', 'ewallet', 'static_qris'];

const defaultLabel: Record<MethodType, string> = {
  bank_transfer: 'Transfer Bank',
  ewallet: 'E-Wallet',
  static_qris: 'QRIS',
};

function createDraft(type: MethodType): AdminPaymentMethod {
  return {
    id: crypto.randomUUID(),
    type,
    label: defaultLabel[type],
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    qrImageFile: null,
    qrImageUrl: null,
    instructions: '',
    enabled: true,
  };
}

export default function PaymentMethodsPanel() {
  const { addToast } = usePPOB();
  const [methods, setMethods] = useState<AdminPaymentMethod[]>([]);
  const [methodToDelete, setMethodToDelete] = useState<AdminPaymentMethod | null>(null);
  const [isDeletingMethod, setIsDeletingMethod] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [draft, setDraft] = useState<AdminPaymentMethod | null>(null);
  const [draftError, setDraftError] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/payment-methods')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Metode pembayaran gagal dimuat.');
        return body as { methods: AdminPaymentMethod[] };
      })
      .then((body) => {
        if (active) setMethods(body.methods);
      })
      .catch((cause: unknown) => {
        if (active) {
          addToast(
            'Gagal memuat metode pembayaran',
            cause instanceof Error ? cause.message : 'Silakan muat ulang halaman.',
            'error',
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [addToast]);

  const openAdd = (type: MethodType) => {
    setDraft(createDraft(type));
    setDraftError('');
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    if (isSaving || uploadingQr) return;
    setIsDialogOpen(false);
    setDraft(null);
    setDraftError('');
  };

  const uploadQr = async (file: File) => {
    setUploadingQr(true);
    setDraftError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/admin/payment-methods/upload', {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (!response.ok || typeof body.qrImageFile !== 'string') {
        throw new Error(body.error ?? 'QRIS gagal diunggah.');
      }
      setDraft((current) => current
        ? { ...current, qrImageFile: body.qrImageFile, qrImageUrl: body.qrImageUrl }
        : current);
    } catch (cause) {
      setDraftError(cause instanceof Error ? cause.message : 'QRIS gagal diunggah.');
    } finally {
      setUploadingQr(false);
    }
  };

  // Only the new row is sent; the API upserts by id so saved rows stay untouched.
  const saveDraft = async () => {
    if (!draft || isSaving) return;
    setDraftError('');

    const label = draft.label.trim();
    if (!label) {
      setDraftError('Nama metode wajib diisi.');
      return;
    }
    if (draft.type === 'static_qris') {
      if (!draft.qrImageFile) {
        setDraftError('Unggah gambar QRIS terlebih dahulu.');
        return;
      }
    } else if (
      !draft.bankName?.trim() ||
      !draft.accountNumber?.trim() ||
      !draft.accountHolder?.trim()
    ) {
      setDraftError(
        draft.type === 'ewallet'
          ? 'Nama e-wallet, nomor, dan nama pemilik wajib diisi.'
          : 'Nama bank, nomor rekening, dan nama pemilik wajib diisi.',
      );
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/payment-methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methods: [{ ...draft, label }] }),
      });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.methods)) {
        throw new Error(body.error ?? 'Metode pembayaran gagal disimpan.');
      }
      setMethods(body.methods as AdminPaymentMethod[]);
      addToast('Metode ditambahkan', `${label} sekarang tampil di daftar.`, 'success');
      setIsDialogOpen(false);
      setDraft(null);
    } catch (cause) {
      setDraftError(cause instanceof Error ? cause.message : 'Metode pembayaran gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEnabled = async (method: AdminPaymentMethod) => {
    const next = { ...method, enabled: !method.enabled };
    setMethods((current) => current.map((entry) => (entry.id === method.id ? next : entry)));
    try {
      const response = await fetch('/api/admin/payment-methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methods: [next] }),
      });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.methods)) {
        throw new Error(body.error ?? 'Status gagal diubah.');
      }
      setMethods(body.methods as AdminPaymentMethod[]);
    } catch (cause) {
      setMethods((current) => current.map((entry) => (entry.id === method.id ? method : entry)));
      addToast(
        'Status gagal diubah',
        cause instanceof Error ? cause.message : 'Silakan coba kembali.',
        'error',
      );
    }
  };

  const confirmDeleteMethod = async () => {
    if (!methodToDelete || isDeletingMethod) return;
    const method = methodToDelete;
    setIsDeletingMethod(true);
    try {
      const response = await fetch(
        `/api/admin/payment-methods?id=${encodeURIComponent(method.id)}`,
        { method: 'DELETE' },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Metode pembayaran gagal dihapus.');
      setMethods((current) => current.filter((entry) => entry.id !== method.id));
      setMethodToDelete(null);
      addToast('Metode dihapus', `${method.label} berhasil dihapus.`, 'success');
    } catch (cause) {
      setMethodToDelete(null);
      addToast(
        'Gagal menghapus metode',
        cause instanceof Error ? cause.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsDeletingMethod(false);
    }
  };

  const activeCount = methods.filter((method) => method.enabled).length;
  const isQris = draft?.type === 'static_qris';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Pembayaran manual</CardTitle>
              <CardDescription className="mt-1">
                Transfer bank, e-wallet, dan QRIS statis ditinjau admin. Saldo baru bertambah
                setelah bukti pembayaran disetujui.
              </CardDescription>
            </div>
            <Badge variant="warning">Perlu verifikasi admin</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <LoadingState message="Memuat metode pembayaran…" />
          ) : methods.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-slate-800">Belum ada metode pembayaran</p>
              <p className="mt-1 text-xs text-slate-500">
                Tambahkan rekening bank, e-wallet, atau satu gambar QRIS.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                {methods.length} metode · {activeCount} aktif
              </p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {methods.map((method) => {
                  const meta = typeMeta[method.type];
                  const Icon = meta.icon;
                  const detail = method.type === 'static_qris'
                    ? 'Gambar QRIS terpasang'
                    : `${method.bankName ?? ''} · ${method.accountNumber ?? ''} a.n. ${method.accountHolder ?? ''}`;
                  return (
                    <li key={method.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                          {method.label}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {meta.short}
                          </span>
                        </p>
                        <p className="truncate text-xs text-slate-500">{detail}</p>
                        {method.instructions ? (
                          <p className="truncate text-[11px] text-slate-400">{method.instructions}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={method.enabled}
                          aria-label={`${method.enabled ? 'Nonaktifkan' : 'Aktifkan'} ${method.label}`}
                          onClick={() => void toggleEnabled(method)}
                          className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                            method.enabled ? 'bg-sky-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              method.enabled ? 'translate-x-4' : ''
                            }`}
                          />
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Hapus ${method.label}`}
                          className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          onClick={() => setMethodToDelete(method)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <Button type="button" onClick={() => openAdd('bank_transfer')} disabled={isLoading}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Tambah metode bayar
            </Button>
            <p className="mt-1.5 text-xs text-slate-500">
              Pilih transfer bank, e-wallet, atau QRIS di jendela berikutnya.
            </p>
          </div>

          <p className="text-xs text-amber-700">
            Berkas QR dan bukti disimpan di filesystem lokal aplikasi (.data). Gunakan object storage privat sebelum deployment multi-instance/produksi.
          </p>
        </CardContent>
      </Card>

      <IntegrationSettingsPanel section="payments" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gateway lain disiapkan</CardTitle>
          <CardDescription>
            Belum dikonfigurasi dan tidak dapat dipakai untuk menerima pembayaran.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">DOKU · belum aktif</Badge>
          <Badge variant="outline">Duitku · belum aktif</Badge>
          <Badge variant="outline">Xendit · belum aktif</Badge>
          <p className="w-full text-xs text-slate-500">
            Callback gateway umum sengaja tetap nonaktif sampai provider dan verifikasi signature dipilih.
          </p>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={methodToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingMethod) setMethodToDelete(null);
        }}
        title="Hapus metode pembayaran?"
        description={
          methodToDelete
            ? `${methodToDelete.label} akan dihapus dan tidak lagi muncul di halaman deposit.`
            : ''
        }
        confirmLabel={isDeletingMethod ? 'Menghapus…' : 'Hapus metode'}
        confirmDisabled={isDeletingMethod}
        onConfirm={() => void confirmDeleteMethod()}
      />

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent onClose={closeDialog}>
          <DialogHeader>
            <DialogTitle>Tambah metode pembayaran</DialogTitle>
            <DialogDescription>
              Data tersimpan setelah tombol simpan ditekan.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">Jenis metode</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {typeOrder.map((type) => {
                    const meta = typeMeta[type];
                    const Icon = meta.icon;
                    const selected = draft.type === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDraft((current) => current ? {
                          ...current,
                          type,
                          label: current.label === defaultLabel[current.type]
                            ? defaultLabel[type]
                            : current.label,
                          qrImageFile: type === 'static_qris' ? current.qrImageFile : null,
                          qrImageUrl: type === 'static_qris' ? current.qrImageUrl : null,
                        } : current)}
                        className={`rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                          selected
                            ? 'border-sky-500 bg-sky-50 text-sky-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'
                        }`}
                      >
                        <Icon className="mb-1 h-4 w-4" aria-hidden="true" />
                        <span className="block font-semibold">{meta.label}</span>
                        <span className="mt-0.5 block leading-snug">{meta.description}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="method-label">Nama metode</Label>
                  <Input
                    id="method-label"
                    maxLength={80}
                    value={draft.label}
                    onChange={(event) => setDraft((current) => current
                      ? { ...current, label: event.target.value }
                      : current)}
                    placeholder={defaultLabel[draft.type]}
                  />
                </div>

                {isQris ? (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="method-qr">Gambar QRIS (JPG/PNG/WebP, maks. 5 MB)</Label>
                    <Input
                      id="method-qr"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingQr}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadQr(file);
                        event.currentTarget.value = '';
                      }}
                    />
                    {uploadingQr ? <p className="text-xs text-slate-500">Memproses gambar...</p> : null}
                    {draft.qrImageUrl ? (
                      <div className="flex items-start gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={draft.qrImageUrl}
                          alt="Pratinjau QRIS"
                          className="h-40 w-40 rounded-lg border border-slate-200 object-contain"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDraft((current) => current
                            ? { ...current, qrImageFile: null, qrImageUrl: null }
                            : current)}
                        >
                          Ganti gambar
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="method-provider">
                        {draft.type === 'ewallet' ? 'Nama e-wallet' : 'Nama bank'}
                      </Label>
                      <Input
                        id="method-provider"
                        maxLength={80}
                        value={draft.bankName ?? ''}
                        onChange={(event) => setDraft((current) => current
                          ? { ...current, bankName: event.target.value }
                          : current)}
                        placeholder={draft.type === 'ewallet' ? 'DANA' : 'BRI'}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="method-account">
                        {draft.type === 'ewallet' ? 'Nomor e-wallet' : 'Nomor rekening'}
                      </Label>
                      <Input
                        id="method-account"
                        maxLength={50}
                        inputMode="numeric"
                        value={draft.accountNumber ?? ''}
                        onChange={(event) => setDraft((current) => current
                          ? { ...current, accountNumber: event.target.value }
                          : current)}
                        placeholder="081234567890"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="method-holder">Nama pemilik</Label>
                      <Input
                        id="method-holder"
                        maxLength={100}
                        value={draft.accountHolder ?? ''}
                        onChange={(event) => setDraft((current) => current
                          ? { ...current, accountHolder: event.target.value }
                          : current)}
                        placeholder="Nama sesuai rekening atau akun"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="method-instructions">Petunjuk pembayaran (opsional)</Label>
                  <textarea
                    id="method-instructions"
                    rows={3}
                    maxLength={500}
                    value={draft.instructions}
                    onChange={(event) => setDraft((current) => current
                      ? { ...current, instructions: event.target.value }
                      : current)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    placeholder="Contoh: cantumkan kode pesanan pada berita transfer."
                  />
                </div>
              </div>

              {draftError ? (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {draftError}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  disabled={isSaving || uploadingQr}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={isSaving || uploadingQr}
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan metode'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
