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
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/crystal-loader';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ProductCategory } from '@/types/ppob';

type FeaturedRow = {
  id: string;
  category: ProductCategory;
  operator: string;
  sortOrder: number;
  enabled: boolean;
};

const categoryLabels: Record<ProductCategory, string> = {
  pulsa: 'Pulsa',
  data: 'Paket Data',
  voucher: 'Voucher',
  pln: 'Token Listrik',
  tagihan: 'Tagihan',
  ewallet: 'E-Wallet',
  game: 'Game',
};

const categoryOrder: ProductCategory[] = [
  'game',
  'pulsa',
  'data',
  'ewallet',
  'voucher',
  'pln',
  'tagihan',
];

export default function FeaturedProductsPanel() {
  const { addToast, products } = usePPOB();
  const [rows, setRows] = useState<FeaturedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [category, setCategory] = useState<ProductCategory>('game');
  const [operator, setOperator] = useState('');

  const providers = useMemo(() => {
    const map = new Map<string, string>();
    products
      .filter((product) => product.category === category && product.status === 'active')
      .forEach((product) => map.set(product.operator.trim(), product.operator.trim()));
    return [...map.values()].sort((a, b) => a.localeCompare(b, 'id'));
  }, [category, products]);

  const fetchFeatured = useCallback(async () => {
    const response = await fetch('/api/admin/featured-products', { cache: 'no-store' });
    const body = await response.json() as { featured?: FeaturedRow[]; error?: string };
    if (!response.ok || !Array.isArray(body.featured)) {
      throw new Error(body.error ?? 'Produk unggulan gagal dimuat.');
    }
    return body.featured;
  }, []);

  const load = useCallback(async () => {
    try {
      setRows(await fetchFeatured());
    } catch (error) {
      addToast(
        'Produk unggulan gagal dimuat',
        error instanceof Error ? error.message : 'Silakan muat ulang halaman.',
        'error',
      );
    } finally {
      setIsLoading(false);
    }
  }, [addToast, fetchFeatured]);

  useEffect(() => {
    let active = true;
    void fetchFeatured()
      .then((result) => {
        if (active) setRows(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        addToast(
          'Produk unggulan gagal dimuat',
          error instanceof Error ? error.message : 'Silakan muat ulang halaman.',
          'error',
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [addToast, fetchFeatured]);

  const add = async () => {
    if (!operator.trim()) {
      addToast('Pilih layanan', 'Tentukan layanan yang ingin diunggulkan.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/featured-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          operator,
          sortOrder: rows.length,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error === 'FEATURED_ALREADY_EXISTS'
            ? 'Layanan ini sudah ada di daftar unggulan.'
            : body.error ?? 'Gagal menambahkan produk unggulan.',
        );
      }
      addToast('Ditambahkan', `${operator} masuk daftar produk unggulan.`, 'success');
      setOperator('');
      await load();
    } catch (error) {
      addToast(
        'Gagal menambahkan',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const patch = async (row: FeaturedRow, updates: { enabled?: boolean; sortOrder?: number }) => {
    try {
      const response = await fetch('/api/admin/featured-products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...updates }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Gagal memperbarui.');
      await load();
    } catch (error) {
      addToast(
        'Gagal memperbarui',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    }
  };

  const move = async (row: FeaturedRow, direction: -1 | 1) => {
    const index = rows.findIndex((item) => item.id === row.id);
    const target = rows[index + direction];
    if (!target) return;
    await patch(row, { sortOrder: target.sortOrder });
    await patch(target, { sortOrder: row.sortOrder });
  };

  const remove = async (row: FeaturedRow) => {
    if (!window.confirm(`Hapus ${row.operator} dari produk unggulan?`)) return;
    try {
      const response = await fetch(
        `/api/admin/featured-products?id=${encodeURIComponent(row.id)}`,
        { method: 'DELETE' },
      );
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Gagal menghapus.');
      addToast('Dihapus', `${row.operator} keluar dari daftar unggulan.`, 'success');
      await load();
    } catch (error) {
      addToast(
        'Gagal menghapus',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produk Unggulan</CardTitle>
          <CardDescription>
            Layanan yang tampil di bagian &ldquo;Produk Populer&rdquo; pada beranda. Urutan menentukan posisi tampil.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="featured-category">Kategori</Label>
              <select
                id="featured-category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as ProductCategory);
                  setOperator('');
                }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                {categoryOrder.map((id) => (
                  <option key={id} value={id}>{categoryLabels[id]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="featured-operator">Layanan</Label>
              <select
                id="featured-operator"
                value={operator}
                onChange={(event) => setOperator(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Pilih layanan…</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={() => void add()} disabled={isSaving || !operator}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Tambah
            </Button>
          </div>

          {isLoading ? (
            <LoadingState message="Memuat produk unggulan…" />
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
              Belum ada produk unggulan. Beranda akan memakai urutan otomatis dari katalog.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{row.operator}</p>
                      <p className="text-xs text-slate-500">{categoryLabels[row.category]}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={row.enabled ? 'success' : 'secondary'}>
                      {row.enabled ? 'Tampil' : 'Disembunyikan'}
                    </Badge>
                    <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => void move(row, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={index === rows.length - 1} onClick={() => void move(row, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void patch(row, { enabled: !row.enabled })}>
                      {row.enabled ? 'Sembunyikan' : 'Tampilkan'}
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
    </div>
  );
}
