'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/crystal-loader';
import { Badge } from '@/components/ui/badge';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

type FlashSaleOffer = {
  id: string;
  productId: string;
  title: string;
  salePrice: number;
  startsAt: string;
  endsAt: string;
  quotaLimit: number | null;
  quantitySold: number;
  quantityReserved: number;
  status: 'draft' | 'active' | 'paused';
};

type OfferRow = {
  offer: FlashSaleOffer;
  product: { id: string; name: string; operator: string; sellPriceUser: number; compareAtPrice: number | null };
};

type Draft = {
  productId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  quotaLimit: string;
  status: FlashSaleOffer['status'];
};

const statusLabels: Record<FlashSaleOffer['status'], string> = {
  draft: 'Draf',
  active: 'Aktif',
  paused: 'Dijeda',
};

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyDraft(productId: string): Draft {
  const now = new Date();
  const ends = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    productId,
    title: '',
    startsAt: toLocalInput(now.toISOString()),
    endsAt: toLocalInput(ends.toISOString()),
    quotaLimit: '',
    status: 'draft',
  };
}

export default function FlashSalePanel() {
  const { addToast, products } = usePPOB();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const activeProducts = useMemo(
    () => products.filter((product) => product.status === 'active'),
    [products],
  );
  const selectedProduct = useMemo(
    () => activeProducts.find((product) => product.id === draft?.productId) ?? null,
    [activeProducts, draft?.productId],
  );

  const fetchOffers = useCallback(async () => {
    const response = await fetch('/api/admin/flash-sales', { cache: 'no-store' });
    const body = await response.json() as { offers?: OfferRow[]; error?: string };
    if (!response.ok || !Array.isArray(body.offers)) {
      throw new Error(body.error ?? 'Flash sale gagal dimuat.');
    }
    return body.offers;
  }, []);

  const load = useCallback(async () => {
    try {
      setOffers(await fetchOffers());
    } catch (error) {
      addToast(
        'Flash sale gagal dimuat',
        error instanceof Error ? error.message : 'Silakan muat ulang halaman.',
        'error',
      );
    } finally {
      setIsLoading(false);
    }
  }, [addToast, fetchOffers]);

  useEffect(() => {
    let active = true;
    void fetchOffers()
      .then((result) => {
        if (active) setOffers(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        addToast(
          'Flash sale gagal dimuat',
          error instanceof Error ? error.message : 'Silakan muat ulang halaman.',
          'error',
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [addToast, fetchOffers]);

  const openCreate = () => {
    const first = activeProducts[0];
    if (!first) {
      addToast('Belum ada produk aktif', 'Aktifkan minimal satu produk sebelum membuat flash sale.', 'error');
      return;
    }
    setEditingId(null);
    setDraft(emptyDraft(first.id));
  };

  const openEdit = (row: OfferRow) => {
    setEditingId(row.offer.id);
    setDraft({
      productId: row.offer.productId,
      title: row.offer.title,
      startsAt: toLocalInput(row.offer.startsAt),
      endsAt: toLocalInput(row.offer.endsAt),
      quotaLimit: row.offer.quotaLimit === null ? '' : String(row.offer.quotaLimit),
      status: row.offer.status,
    });
  };

  const submit = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      addToast('Judul wajib diisi', 'Beri nama flash sale agar mudah dikenali.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        productId: draft.productId,
        title: draft.title.trim(),
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        quotaLimit: draft.quotaLimit.trim() ? Number(draft.quotaLimit) : null,
        status: draft.status,
      };
      const response = await fetch('/api/admin/flash-sales', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, updates: payload } : payload),
      });
      const body = await response.json() as { offer?: FlashSaleOffer; error?: string };
      if (!response.ok || !body.offer) {
        throw new Error(body.error ?? 'Flash sale gagal disimpan.');
      }
      addToast(
        editingId ? 'Flash sale diperbarui' : 'Flash sale ditambahkan',
        body.offer.title,
        'success',
      );
      setDraft(null);
      setEditingId(null);
      await load();
    } catch (error) {
      addToast(
        'Flash sale gagal disimpan',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (row: OfferRow) => {
    if (!window.confirm(`Hapus flash sale "${row.offer.title}"?`)) return;
    try {
      const response = await fetch(
        `/api/admin/flash-sales?id=${encodeURIComponent(row.offer.id)}`,
        { method: 'DELETE' },
      );
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Flash sale gagal dihapus.');
      addToast('Flash sale dihapus', row.offer.title, 'success');
      await load();
    } catch (error) {
      addToast(
        'Flash sale gagal dihapus',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Flash Sale</CardTitle>
              <CardDescription>
                Harga spesial dengan jadwal dan kuota. Harga harus di atas modal dan di bawah harga normal.
              </CardDescription>
            </div>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Tambah flash sale
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState message="Memuat flash sale…" />
          ) : offers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
              Belum ada flash sale. Tambahkan penawaran agar tampil di beranda.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {offers.map((row) => (
                <div key={row.offer.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.offer.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {row.product.name} · Rp {row.offer.salePrice.toLocaleString('id-ID')}
                      {row.product.compareAtPrice && row.product.compareAtPrice > row.offer.salePrice && (
                        <span className="ml-1 line-through text-slate-400">
                          Rp {row.product.compareAtPrice.toLocaleString('id-ID')}
                        </span>
                      )}
                      {' · '}
                      {new Date(row.offer.startsAt).toLocaleString('id-ID')} — {new Date(row.offer.endsAt).toLocaleString('id-ID')}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Terjual {row.offer.quantitySold} · Dipesan {row.offer.quantityReserved}
                      {row.offer.quotaLimit !== null ? ` / ${row.offer.quotaLimit}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.offer.status === 'active' ? 'success' : 'secondary'}>
                      {statusLabels[row.offer.status]}
                    </Badge>
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void remove(row)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {editingId ? 'Edit flash sale' : 'Flash sale baru'}
                </CardTitle>
                <CardDescription>Jadwal memakai waktu lokal perangkat Anda.</CardDescription>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="flash-title">Judul</Label>
                <Input
                  id="flash-title"
                  maxLength={120}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="Contoh: Flash Sale Akhir Pekan"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flash-product">Produk</Label>
                <select
                  id="flash-product"
                  value={draft.productId}
                  onChange={(event) => setDraft({ ...draft, productId: event.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {activeProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — {product.operator}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-600">Harga mengikuti pengaturan produk</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {selectedProduct
                    ? `Rp ${selectedProduct.sellPriceUser.toLocaleString('id-ID')}`
                    : 'Pilih produk'}
                  {selectedProduct?.compareAtPrice && selectedProduct.compareAtPrice > selectedProduct.sellPriceUser && (
                    <span className="ml-2 text-xs font-normal text-slate-500 line-through">
                      Rp {selectedProduct.compareAtPrice.toLocaleString('id-ID')}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  {selectedProduct?.compareAtPrice && selectedProduct.compareAtPrice > selectedProduct.sellPriceUser
                    ? `Diskon tampil ${Math.round((1 - selectedProduct.sellPriceUser / selectedProduct.compareAtPrice) * 100)}% (hanya visual).`
                    : 'Produk belum punya harga coret, badge diskon tidak akan tampil. Atur di menu Produk.'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flash-start">Mulai</Label>
                <Input
                  id="flash-start"
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flash-end">Berakhir</Label>
                <Input
                  id="flash-end"
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flash-quota">Kuota (kosongkan untuk tanpa batas)</Label>
                <Input
                  id="flash-quota"
                  type="number"
                  min={1}
                  value={draft.quotaLimit}
                  onChange={(event) => setDraft({ ...draft, quotaLimit: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flash-status">Status</Label>
                <select
                  id="flash-status"
                  value={draft.status}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft['status'] })}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="draft">Draf</option>
                  <option value="active">Aktif</option>
                  <option value="paused">Dijeda</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Batal
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={isSaving}>
                {isSaving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah flash sale'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
