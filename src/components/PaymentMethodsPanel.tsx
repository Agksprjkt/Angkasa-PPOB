'use client';

import { useEffect, useState } from 'react';
import type { ManualPaymentMethod } from '@/types/ppob';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { usePPOB } from '@/context/PPOBContext';
import IntegrationSettingsPanel from '@/components/IntegrationSettingsPanel';

type AdminPaymentMethod = ManualPaymentMethod & { qrImageFile: string | null };

function createMethod(type: AdminPaymentMethod['type']): AdminPaymentMethod {
  return {
    id: crypto.randomUUID(),
    type,
    label: type === 'bank_transfer' ? 'Transfer Bank Baru' : 'QRIS Statis Baru',
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
  const [savedMethods, setSavedMethods] = useState<AdminPaymentMethod[]>([]);
  const [methodToDelete, setMethodToDelete] = useState<AdminPaymentMethod | null>(null);
  const [isDeletingMethod, setIsDeletingMethod] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/payment-methods')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Metode pembayaran gagal dimuat.');
        return body as { methods: AdminPaymentMethod[] };
      })
      .then((body) => {
        if (active) {
          setMethods(body.methods);
          setSavedMethods(body.methods);
        }
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

  const updateMethod = (id: string, updates: Partial<AdminPaymentMethod>) => {
    setMethods((current) => current.map((method) =>
      method.id === id ? { ...method, ...updates } : method,
    ));
  };

  const uploadQr = async (id: string, file: File) => {
    setUploadingId(id);
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
      updateMethod(id, { qrImageFile: body.qrImageFile, qrImageUrl: body.qrImageUrl });
    } catch (cause) {
      addToast(
        'QRIS gagal diunggah',
        cause instanceof Error ? cause.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setUploadingId(null);
    }
  };

  const save = async () => {
    if (isDeletingMethod) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/payment-methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methods }),
      });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.methods)) {
        throw new Error(body.error ?? 'Metode pembayaran gagal disimpan.');
      }
      const saved = body.methods as AdminPaymentMethod[];
      setMethods(saved);
      setSavedMethods(saved);
      addToast('Perubahan tersimpan', 'Metode pembayaran berhasil diperbarui.', 'success');
    } catch (cause) {
      addToast(
        'Gagal menyimpan metode pembayaran',
        cause instanceof Error ? cause.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteMethod = async () => {
    if (!methodToDelete || isDeletingMethod) return;
    const method = methodToDelete;
    setIsDeletingMethod(true);
    try {
      if (savedMethods.some((saved) => saved.id === method.id)) {
        const response = await fetch(
          `/api/admin/payment-methods?id=${encodeURIComponent(method.id)}`,
          { method: 'DELETE' },
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? 'Metode pembayaran gagal dihapus.');
        }
        setSavedMethods((current) =>
          current.filter((saved) => saved.id !== method.id),
        );
      }
      setMethods((current) =>
        current.filter((entry) => entry.id !== method.id),
      );
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

  const hasUnsavedChanges = JSON.stringify(methods) !== JSON.stringify(savedMethods);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Pembayaran manual</CardTitle>
              <CardDescription className="mt-1">
                Transfer bank dan QRIS statis ditinjau admin. Saldo baru bertambah setelah bukti pembayaran disetujui.
              </CardDescription>
            </div>
            <Badge variant="warning">Perlu verifikasi admin</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p className="text-sm text-slate-500">Memuat metode pembayaran…</p> : null}
          {!isLoading && methods.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
              Belum ada metode. Tambahkan rekening bank atau QRIS statis.
            </p>
          )}
          {methods.map((method) => (
            <section key={method.id} className="space-y-4 rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant={method.enabled ? 'success' : 'outline'}>
                  {method.type === 'bank_transfer' ? 'Transfer bank' : 'QRIS statis'}
                </Badge>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={method.enabled}
                      onChange={(event) => updateMethod(method.id, { enabled: event.target.checked })}
                    />
                    Aktif
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    aria-label={`Hapus ${method.label}`}
                    disabled={isSaving || uploadingId === method.id}
                    onClick={() => setMethodToDelete(method)}
                  >
                    Hapus
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nama metode</Label>
                  <Input value={method.label} maxLength={80} onChange={(event) => updateMethod(method.id, { label: event.target.value })} />
                </div>
                {method.type === 'bank_transfer' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Nama bank</Label>
                      <Input value={method.bankName ?? ''} maxLength={80} onChange={(event) => updateMethod(method.id, { bankName: event.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nomor rekening</Label>
                      <Input value={method.accountNumber ?? ''} maxLength={50} onChange={(event) => updateMethod(method.id, { accountNumber: event.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nama pemilik rekening</Label>
                      <Input value={method.accountHolder ?? ''} maxLength={100} onChange={(event) => updateMethod(method.id, { accountHolder: event.target.value })} />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Gambar QRIS (JPG/PNG/WebP, maks. 5 MB)</Label>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingId === method.id}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadQr(method.id, file);
                      }}
                    />
                    {method.qrImageUrl && <img src={method.qrImageUrl} alt="Pratinjau QRIS statis" className="mt-2 h-36 w-36 rounded border object-contain" />}
                    {uploadingId === method.id && <p className="text-xs text-slate-500">Mengunggah gambar…</p>}
                  </div>
                )}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Petunjuk pembayaran</Label>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={method.instructions}
                    maxLength={500}
                    onChange={(event) => updateMethod(method.id, { instructions: event.target.value })}
                  />
                </div>
              </div>
            </section>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={isLoading || isSaving || isDeletingMethod} onClick={() => setMethods((current) => [...current, createMethod('bank_transfer')])}>
              Tambah transfer bank
            </Button>
            <Button type="button" variant="outline" disabled={isLoading || isSaving || isDeletingMethod} onClick={() => setMethods((current) => [...current, createMethod('static_qris')])}>
              Tambah QRIS statis
            </Button>
            <Button type="button" onClick={() => void save()} disabled={isLoading || isSaving || isDeletingMethod || uploadingId !== null || !hasUnsavedChanges}>
              {isSaving ? 'Menyimpan…' : hasUnsavedChanges ? 'Simpan perubahan' : 'Tersimpan'}
            </Button>
          </div>
          {hasUnsavedChanges && (
            <p role="status" className="text-sm text-amber-700">
              Ada perubahan yang belum disimpan.
            </p>
          )}
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
            ? savedMethods.some((saved) => saved.id === methodToDelete.id)
              ? `${methodToDelete.label} akan langsung dihapus. Perubahan lain yang belum disimpan tetap ada.`
              : `${methodToDelete.label} adalah item baru dan akan dihapus dari formulir.`
            : ''
        }
        confirmLabel={isDeletingMethod ? 'Menghapus…' : 'Hapus metode'}
        confirmDisabled={isDeletingMethod}
        onConfirm={() => void confirmDeleteMethod()}
      />
    </div>
  );
}
