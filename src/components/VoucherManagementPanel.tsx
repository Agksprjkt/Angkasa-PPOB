'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, Pencil, Plus, RefreshCw, Ticket, Trash2 } from 'lucide-react';
import type { Voucher, VoucherDiscountType } from '@/types/ppob';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/crystal-loader';

type VoucherFormState = {
  code: string;
  description: string;
  discountType: VoucherDiscountType;
  discountValue: string;
  maxDiscount: string;
  minOrder: string;
  quotaLimit: string;
  perUserLimit: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

function emptyForm(): VoucherFormState {
  return {
    code: '',
    description: '',
    discountType: 'percent',
    discountValue: '5',
    maxDiscount: '',
    minOrder: '0',
    quotaLimit: '',
    perUserLimit: '',
    startsAt: '',
    endsAt: '',
    enabled: true,
  };
}

function toDateTimeInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function isVoucher(value: unknown): value is Voucher {
  if (typeof value !== 'object' || value === null) return false;
  const voucher = value as Record<string, unknown>;
  return typeof voucher.id === 'string' &&
    typeof voucher.code === 'string' &&
    typeof voucher.description === 'string' &&
    (voucher.discountType === 'percent' || voucher.discountType === 'fixed') &&
    typeof voucher.discountValue === 'number' &&
    (voucher.maxDiscount === null || typeof voucher.maxDiscount === 'number') &&
    typeof voucher.minOrder === 'number' &&
    (voucher.quotaLimit === null || typeof voucher.quotaLimit === 'number') &&
    typeof voucher.quantityUsed === 'number' &&
    (voucher.perUserLimit === null || typeof voucher.perUserLimit === 'number') &&
    (voucher.startsAt === null || typeof voucher.startsAt === 'string') &&
    (voucher.endsAt === null || typeof voucher.endsAt === 'string') &&
    typeof voucher.enabled === 'boolean';
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  switch (message) {
    case 'INVALID_VOUCHER':
    case 'INVALID_VOUCHER_UPDATE':
      return 'Periksa kode, nilai diskon, kuota, dan masa aktif.';
    case 'VOUCHER_CODE_EXISTS':
      return 'Kode voucher itu sudah dipakai. Pilih kode lain.';
    case 'VOUCHER_NOT_FOUND':
      return 'Voucher sudah tidak tersedia. Muat ulang daftar.';
    case 'VOUCHER_HAS_REDEMPTIONS':
      return 'Voucher sudah pernah dipakai, jadi tidak bisa dihapus. Nonaktifkan saja.';
    default:
      return message || 'Permintaan voucher gagal. Coba lagi.';
  }
}

function describeDiscount(voucher: Voucher) {
  if (voucher.discountType === 'percent') {
    const cap = voucher.maxDiscount
      ? `, maks Rp ${voucher.maxDiscount.toLocaleString('id-ID')}`
      : '';
    return `${voucher.discountValue}%${cap}`;
  }
  return `Rp ${voucher.discountValue.toLocaleString('id-ID')}`;
}

function describeQuota(voucher: Voucher) {
  const total = voucher.quotaLimit === null
    ? 'tanpa batas'
    : `${voucher.quantityUsed}/${voucher.quotaLimit}`;
  const perUser = voucher.perUserLimit === null
    ? 'tanpa batas per akun'
    : `${voucher.perUserLimit}x per akun`;
  return `Kuota ${total} · ${perUser}`;
}

async function fetchVouchers(signal?: AbortSignal) {
  const response = await fetch('/api/admin/vouchers', { cache: 'no-store', signal });
  const result = await response.json() as { vouchers?: unknown; error?: string };
  if (!response.ok || !Array.isArray(result.vouchers) || !result.vouchers.every(isVoucher)) {
    throw new Error(result.error ?? 'Daftar voucher tidak valid.');
  }
  return result.vouchers;
}

export default function VoucherManagementPanel() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [form, setForm] = useState<VoucherFormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadVouchers = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setVouchers(await fetchVouchers());
    } catch (error) {
      console.error('[ADMIN_VOUCHERS_LOAD_FAILED]', error);
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchVouchers(controller.signal)
      .then(setVouchers)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('[ADMIN_VOUCHERS_LOAD_FAILED]', error);
          setLoadError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const openNewForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setActionError('');
    setSuccessMessage('');
    setIsFormOpen(true);
  };

  const openEditForm = (voucher: Voucher) => {
    setEditingId(voucher.id);
    setForm({
      code: voucher.code,
      description: voucher.description,
      discountType: voucher.discountType,
      discountValue: String(voucher.discountValue),
      maxDiscount: voucher.maxDiscount === null ? '' : String(voucher.maxDiscount),
      minOrder: String(voucher.minOrder),
      quotaLimit: voucher.quotaLimit === null ? '' : String(voucher.quotaLimit),
      perUserLimit: voucher.perUserLimit === null ? '' : String(voucher.perUserLimit),
      startsAt: toDateTimeInput(voucher.startsAt),
      endsAt: toDateTimeInput(voucher.endsAt),
      enabled: voucher.enabled,
    });
    setActionError('');
    setSuccessMessage('');
    setIsFormOpen(true);
  };

  const optionalNumber = (value: string) => (value.trim() ? Number(value) : null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError('');
    setSuccessMessage('');

    const discountValue = Number(form.discountValue);
    const minOrder = Number(form.minOrder || '0');
    if (!Number.isSafeInteger(discountValue) || discountValue <= 0) {
      setActionError('Nilai diskon harus bilangan bulat lebih dari nol.');
      return;
    }
    if (form.discountType === 'percent' && discountValue > 100) {
      setActionError('Diskon persen tidak boleh lebih dari 100.');
      return;
    }
    if (!Number.isSafeInteger(minOrder) || minOrder < 0) {
      setActionError('Minimal order harus bilangan bulat nol atau lebih.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        description: form.description.trim(),
        discountType: form.discountType,
        discountValue,
        maxDiscount: optionalNumber(form.maxDiscount),
        minOrder,
        quotaLimit: optionalNumber(form.quotaLimit),
        perUserLimit: optionalNumber(form.perUserLimit),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        enabled: form.enabled,
      };
      const response = await fetch('/api/admin/vouchers', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, updates: payload } : payload),
      });
      const result = await response.json() as { voucher?: unknown; error?: string };
      if (!response.ok || !isVoucher(result.voucher)) {
        throw new Error(result.error ?? 'Voucher tidak dapat disimpan.');
      }

      const saved = result.voucher;
      setVouchers((current) => editingId
        ? current.map((item) => item.id === editingId ? saved : item)
        : [saved, ...current]);
      setIsFormOpen(false);
      setSuccessMessage(editingId ? 'Voucher berhasil diperbarui.' : 'Voucher berhasil dibuat.');
    } catch (error) {
      console.error('[ADMIN_VOUCHER_SAVE_FAILED]', error);
      setActionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleVoucher = async (voucher: Voucher) => {
    setBusyId(voucher.id);
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await fetch('/api/admin/vouchers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: voucher.id, updates: { enabled: !voucher.enabled } }),
      });
      const result = await response.json() as { voucher?: unknown; error?: string };
      if (!response.ok || !isVoucher(result.voucher)) {
        throw new Error(result.error ?? 'Status voucher tidak dapat diperbarui.');
      }
      const updated = result.voucher;
      setVouchers((current) => current.map((item) => item.id === voucher.id ? updated : item));
      setSuccessMessage(updated.enabled ? 'Voucher diaktifkan.' : 'Voucher dinonaktifkan.');
    } catch (error) {
      console.error('[ADMIN_VOUCHER_STATUS_UPDATE_FAILED]', error);
      setActionError(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const deleteVoucher = async (voucher: Voucher) => {
    if (!window.confirm(`Hapus voucher "${voucher.code}"?`)) return;
    setBusyId(voucher.id);
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await fetch(
        `/api/admin/vouchers?id=${encodeURIComponent(voucher.id)}`,
        { method: 'DELETE' },
      );
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || result.success !== true) {
        throw new Error(result.error ?? 'Voucher tidak dapat dihapus.');
      }
      setVouchers((current) => current.filter((item) => item.id !== voucher.id));
      setSuccessMessage('Voucher berhasil dihapus.');
    } catch (error) {
      console.error('[ADMIN_VOUCHER_DELETE_FAILED]', error);
      setActionError(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setSuccessMessage(`Kode ${code} disalin.`);
    } catch {
      setActionError('Browser menolak akses clipboard. Salin kodenya manual.');
    }
  };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Kode Voucher</CardTitle>
            <CardDescription className="mt-1">
              Kode promo yang bisa dipakai pembeli di halaman checkout.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => void loadVouchers()}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Muat ulang
            </Button>
            <Button type="button" onClick={openNewForm}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah voucher
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Diskon persen bisa dibatasi dengan maksimal diskon. Kuota dan batas per akun
            boleh dikosongkan untuk tanpa batas. Kuota dikembalikan bila pesanan gagal.
          </p>
          {loadError && <p role="alert" className="text-sm text-rose-700">{loadError}</p>}
          {actionError && <p role="alert" className="text-sm text-rose-700">{actionError}</p>}
          {successMessage && <p role="status" className="text-sm text-emerald-700">{successMessage}</p>}
        </CardContent>
      </Card>

      {isFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? 'Edit voucher' : 'Tambah voucher'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="voucher-code">Kode</Label>
                  <Input
                    id="voucher-code"
                    value={form.code}
                    maxLength={32}
                    required
                    placeholder="HEMAT5"
                    className="uppercase"
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase(),
                    }))}
                  />
                  <p className="text-xs text-slate-500">
                    Huruf besar, angka, tanda hubung, atau garis bawah. 3-32 karakter.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-type">Tipe diskon</Label>
                  <select
                    id="voucher-type"
                    value={form.discountType}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      discountType: event.target.value as VoucherDiscountType,
                    }))}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <option value="percent">Persen (%)</option>
                    <option value="fixed">Nominal (Rp)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-value">
                    {form.discountType === 'percent' ? 'Diskon (%)' : 'Diskon (Rp)'}
                  </Label>
                  <Input
                    id="voucher-value"
                    type="number"
                    min="1"
                    max={form.discountType === 'percent' ? 100 : undefined}
                    step="1"
                    value={form.discountValue}
                    required
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      discountValue: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-max">Maksimal diskon (Rp, opsional)</Label>
                  <Input
                    id="voucher-max"
                    type="number"
                    min="1"
                    step="1"
                    value={form.maxDiscount}
                    disabled={form.discountType !== 'percent'}
                    placeholder="Kosongkan untuk tanpa batas"
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      maxDiscount: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-min">Minimal order (Rp)</Label>
                  <Input
                    id="voucher-min"
                    type="number"
                    min="0"
                    step="1"
                    value={form.minOrder}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      minOrder: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-quota">Kuota total (opsional)</Label>
                  <Input
                    id="voucher-quota"
                    type="number"
                    min="1"
                    step="1"
                    value={form.quotaLimit}
                    placeholder="Kosongkan untuk tanpa batas"
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      quotaLimit: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-per-user">Batas per akun (opsional)</Label>
                  <Input
                    id="voucher-per-user"
                    type="number"
                    min="1"
                    step="1"
                    value={form.perUserLimit}
                    placeholder="Contoh: 1, 2, 3"
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      perUserLimit: event.target.value,
                    }))}
                  />
                  <p className="text-xs text-slate-500">
                    Kosongkan bila satu akun boleh memakai kode ini berkali-kali.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="voucher-description">Keterangan (opsional)</Label>
                  <Input
                    id="voucher-description"
                    value={form.description}
                    maxLength={200}
                    placeholder="Muncul sebagai catatan internal"
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-starts">Mulai berlaku (opsional)</Label>
                  <Input
                    id="voucher-starts"
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      startsAt: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-ends">Berakhir (opsional)</Label>
                  <Input
                    id="voucher-ends"
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      endsAt: event.target.value,
                    }))}
                  />
                </div>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                Aktifkan voucher
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Tambah voucher'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => setIsFormOpen(false)}
                >
                  Batal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingState message="Memuat voucher..." />
      ) : vouchers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Ticket className="h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="text-sm text-slate-500">
              Belum ada voucher. Buat kode pertama agar pembeli bisa memakai diskon.
            </p>
            {!isFormOpen && (
              <Button type="button" variant="outline" onClick={openNewForm}>
                Tambah voucher pertama
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vouchers.map((voucher) => (
            <Card key={voucher.id} className="flex min-w-0 flex-col">
              <CardHeader className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 font-mono text-base">
                      {voucher.code}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {voucher.description || 'Tanpa keterangan'}
                    </CardDescription>
                  </div>
                  <Badge variant={voucher.enabled ? 'blue' : 'outline'}>
                    {voucher.enabled ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-xs text-slate-500">
                  <p>Diskon: {describeDiscount(voucher)}</p>
                  <p>Min. order: Rp {voucher.minOrder.toLocaleString('id-ID')}</p>
                  <p>{describeQuota(voucher)}</p>
                  {(voucher.startsAt || voucher.endsAt) && (
                    <p>
                      Jadwal:{' '}
                      {voucher.startsAt
                        ? new Date(voucher.startsAt).toLocaleString('id-ID')
                        : 'segera'}
                      {' - '}
                      {voucher.endsAt
                        ? new Date(voucher.endsAt).toLocaleString('id-ID')
                        : 'tanpa batas'}
                    </p>
                  )}
                </div>
                {busyId === voucher.id && (
                  <p role="status" className="text-xs text-slate-500">Memproses voucher...</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyCode(voucher.code)}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Salin
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEditForm(voucher)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === voucher.id}
                    onClick={() => void toggleVoucher(voucher)}
                  >
                    {voucher.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === voucher.id}
                    onClick={() => void deleteVoucher(voucher)}
                    className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}