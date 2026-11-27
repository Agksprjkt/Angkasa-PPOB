'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePPOB } from '@/context/PPOBContext';
import {
  catalogAccents,
  catalogGroupKinds,
  catalogRuleMatchTypes,
  catalogVendors,
  normalizeCatalogSlug,
} from '@/lib/catalog-admin-core';
import type {
  CatalogGroup,
  CatalogGroupKind,
  CatalogRule,
  CatalogRuleMatchType,
  CatalogSubgroup,
  ProductVendor,
} from '@/types/ppob';

type Tab = 'groups' | 'subgroups' | 'rules';

const kindLabels: Record<CatalogGroupKind, string> = {
  prepaid: 'Prabayar (pilih nominal)',
  postpaid: 'Pascabayar (cek tagihan dulu)',
};

const matchTypeLabels: Record<CatalogRuleMatchType, string> = {
  operator: 'Operator sama dengan',
  vendorCode: 'Kode produk sama dengan',
  prefix: 'Kode produk diawali',
  name: 'Nama produk mengandung',
};

const iconKeys = ['smartphone', 'wifi', 'ticket', 'zap', 'wallet', 'gamepad', 'filetext', 'grid'];
const productCategoryOptions = [
  { value: 'pulsa', label: 'Pulsa' },
  { value: 'data', label: 'Paket data' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'game', label: 'Game / top up' },
  { value: 'pln', label: 'PLN' },
  { value: 'tagihan', label: 'Tagihan' },
];
const selectClass = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm';

export default function CatalogAdminPanel() {
  const { products, addToast, refreshProducts } = usePPOB();
  const [tab, setTab] = useState<Tab>('groups');
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [subgroups, setSubgroups] = useState<CatalogSubgroup[]>([]);
  const [rules, setRules] = useState<CatalogRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const [groupDraft, setGroupDraft] = useState({
    slug: '',
    label: '',
    iconKey: 'grid',
    accent: 'sky',
    kind: 'prepaid' as CatalogGroupKind,
    productCategory: '',
    includeUnmapped: false,
    sortOrder: 0,
  });
  const [subgroupDraft, setSubgroupDraft] = useState({
    groupId: '',
    slug: '',
    label: '',
    description: '',
    sortOrder: 0,
  });
  const [ruleDraft, setRuleDraft] = useState({
    subgroupId: '',
    priority: 100,
    vendor: '' as '' | ProductVendor,
    matchType: 'operator' as CatalogRuleMatchType,
    matchValue: '',
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/catalog', { cache: 'no-store' });
      const result = (await response.json()) as {
        groups?: CatalogGroup[];
        subgroups?: CatalogSubgroup[];
        rules?: CatalogRule[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Katalog gagal dimuat.');
      setGroups(result.groups ?? []);
      setSubgroups(result.subgroups ?? []);
      setRules(result.rules ?? []);
    } catch (error) {
      addToast(
        'Katalog gagal dimuat',
        error instanceof Error ? error.message : 'Silakan coba lagi.',
        'error',
      );
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  // Initial load runs through the promise so no setState happens synchronously
  // inside the effect body.
  useEffect(() => {
    let active = true;
    void fetch('/api/admin/catalog', { cache: 'no-store' })
      .then(async (response) => {
        const result = (await response.json()) as {
          groups?: CatalogGroup[];
          subgroups?: CatalogSubgroup[];
          rules?: CatalogRule[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? 'Katalog gagal dimuat.');
        return result;
      })
      .then((result) => {
        if (!active) return;
        setGroups(result.groups ?? []);
        setSubgroups(result.subgroups ?? []);
        setRules(result.rules ?? []);
      })
      .catch((error: unknown) => {
        if (!active) return;
        addToast(
          'Katalog gagal dimuat',
          error instanceof Error ? error.message : 'Silakan coba lagi.',
          'error',
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [addToast]);

  const unmappedCount = useMemo(
    () => products.filter((product) => product.status === 'active' && !product.subgroupId).length,
    [products],
  );

  const send = async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/catalog', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Gagal menyimpan.');
      await load();
      await refreshProducts().catch(() => undefined);
      return true;
    } catch (error) {
      addToast(
        'Gagal menyimpan',
        error instanceof Error ? error.message : 'Silakan coba lagi.',
        'error',
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (resource: Tab, id: string) => {
    if (!window.confirm('Hapus data ini? Produk yang memakainya kembali belum dipetakan.')) return;
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/admin/catalog?resource=${resource}&id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Gagal menghapus.');
      await load();
      await refreshProducts().catch(() => undefined);
    } catch (error) {
      addToast(
        'Gagal menghapus',
        error instanceof Error ? error.message : 'Silakan coba lagi.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const applyRules = async () => {
    setIsApplying(true);
    try {
      const response = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'rules', action: 'apply' }),
      });
      const result = (await response.json()) as {
        scanned?: number;
        changed?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Aturan gagal diterapkan.');
      await refreshProducts().catch(() => undefined);
      addToast(
        'Aturan diterapkan',
        `${result.changed ?? 0} produk dipetakan dari ${result.scanned ?? 0} produk yang diperiksa.`,
        'success',
      );
    } catch (error) {
      addToast(
        'Aturan gagal diterapkan',
        error instanceof Error ? error.message : 'Silakan coba lagi.',
        'error',
      );
    } finally {
      setIsApplying(false);
    }
  };

  const subgroupOptions = subgroups.map((subgroup) => {
    const group = groups.find((row) => row.id === subgroup.groupId);
    return {
      id: subgroup.id,
      label: group ? `${group.label} · ${subgroup.label}` : subgroup.label,
    };
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Katalog &amp; Subkategori</CardTitle>
              <CardDescription>
                Menu storefront diatur di sini. Produk hasil sync vendor tetap masuk database,
                tetapi hanya tampil di toko setelah dipetakan ke subkategori.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Muat ulang
              </Button>
              <Button
                size="sm"
                onClick={() => void applyRules()}
                disabled={isApplying || rules.length === 0}
              >
                {isApplying ? 'Menerapkan...' : 'Terapkan aturan'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {([
              ['groups', `Kategori (${groups.length})`],
              ['subgroups', `Subkategori (${subgroups.length})`],
              ['rules', `Aturan (${rules.length})`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  tab === id
                    ? 'border-sky-600 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {unmappedCount > 0 && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {unmappedCount.toLocaleString('id-ID')} produk aktif belum dipetakan dan tidak tampil di
              storefront. Buat aturan lalu tekan Terapkan aturan, atau petakan per produk di menu Produk.
            </p>
          )}
        </CardContent>
      </Card>

      {tab === 'groups' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kategori</CardTitle>
            <CardDescription>Kelompok teratas di beranda toko.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="group-label" className="mb-1 block text-xs">Nama kategori</Label>
                <Input
                  id="group-label"
                  value={groupDraft.label}
                  onChange={(event) => setGroupDraft((current) => ({
                    ...current,
                    label: event.target.value,
                    slug: current.slug || normalizeCatalogSlug(event.target.value) || '',
                  }))}
                  placeholder="Token Listrik"
                />
              </div>
              <div>
                <Label htmlFor="group-slug" className="mb-1 block text-xs">Slug URL</Label>
                <Input
                  id="group-slug"
                  value={groupDraft.slug}
                  onChange={(event) => setGroupDraft((current) => ({
                    ...current,
                    slug: normalizeCatalogSlug(event.target.value) ?? '',
                  }))}
                  placeholder="token-listrik"
                />
              </div>
              <div>
                <Label htmlFor="group-icon" className="mb-1 block text-xs">Ikon</Label>
                <select
                  id="group-icon"
                  value={groupDraft.iconKey}
                  onChange={(event) => setGroupDraft((current) => ({
                    ...current,
                    iconKey: event.target.value,
                  }))}
                  className={selectClass}
                >
                  {iconKeys.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="group-accent" className="mb-1 block text-xs">Warna aksen</Label>
                <select
                  id="group-accent"
                  value={groupDraft.accent}
                  onChange={(event) => setGroupDraft((current) => ({
                    ...current,
                    accent: event.target.value,
                  }))}
                  className={selectClass}
                >
                  {catalogAccents.map((accent) => <option key={accent} value={accent}>{accent}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="group-kind" className="mb-1 block text-xs">Jenis</Label>
                <select
                  id="group-kind"
                  value={groupDraft.kind}
                  onChange={(event) => setGroupDraft((current) => ({
                    ...current,
                    kind: event.target.value as CatalogGroupKind,
                  }))}
                  className={selectClass}
                >
                  {catalogGroupKinds.map((kind) => (
                    <option key={kind} value={kind}>{kindLabels[kind]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="group-category" className="mb-1 block text-xs">Kategori produk vendor</Label>
                <select
                  id="group-category"
                  value={groupDraft.productCategory}
                  onChange={(event) => setGroupDraft((current) => ({
                    ...current,
                    productCategory: event.target.value,
                  }))}
                  className={selectClass}
                >
                  <option value="">Hanya produk yang dipetakan</option>
                  {productCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="group-unmapped" className="mb-1 block text-xs">
                  Tampilkan produk belum dipetakan
                </Label>
                <select
                  id="group-unmapped"
                  value={groupDraft.includeUnmapped ? 'yes' : 'no'}
                  onChange={(event) => setGroupDraft((current) => ({
                    ...current,
                    includeUnmapped: event.target.value === 'yes',
                  }))}
                  className={selectClass}
                >
                  <option value="no">Tidak (kurasi ketat)</option>
                  <option value="yes">Ya (menu gaya operator)</option>
                </select>
              </div>
              <div>
                <Label htmlFor="group-order" className="mb-1 block text-xs">Urutan</Label>
                <Input
                  id="group-order"
                  type="number"
                  min={0}
                  value={groupDraft.sortOrder}
                  onChange={(event) => setGroupDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value) || 0,
                  }))}
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={isSaving || !groupDraft.label.trim() || !groupDraft.slug}
              onClick={async () => {
                const ok = await send('POST', {
                  resource: 'groups',
                  ...groupDraft,
                  productCategory: groupDraft.productCategory || null,
                  enabled: true,
                });
                if (ok) {
                  setGroupDraft({
                    slug: '',
                    label: '',
                    iconKey: 'grid',
                    accent: 'sky',
                    kind: 'prepaid',
                    productCategory: '',
                    includeUnmapped: false,
                    sortOrder: 0,
                  });
                }
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Tambah kategori
            </Button>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {isLoading ? (
                <p className="p-4 text-sm text-slate-500">Memuat...</p>
              ) : groups.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Belum ada kategori.</p>
              ) : groups.map((group) => (
                <div key={group.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{group.label}</p>
                    <p className="text-xs text-slate-500">
                      {group.slug} · {kindLabels[group.kind]}
                      {group.productCategory ? ` · ${group.productCategory}` : ''}
                      {group.includeUnmapped ? ' · semua produk' : ' · hanya yang dipetakan'}
                      {' · '}{group.enabled ? 'aktif' : 'nonaktif'}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void send('PATCH', {
                        resource: 'groups',
                        id: group.id,
                        enabled: !group.enabled,
                      })}
                      disabled={isSaving}
                    >
                      {group.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void remove('groups', group.id)}
                      disabled={isSaving}
                      aria-label={`Hapus ${group.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'subgroups' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subkategori</CardTitle>
            <CardDescription>
              Contoh: PLN dan PLN Promo berisi produk berbeda dengan harga masing-masing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="subgroup-group" className="mb-1 block text-xs">Kategori induk</Label>
                <select
                  id="subgroup-group"
                  value={subgroupDraft.groupId}
                  onChange={(event) => setSubgroupDraft((current) => ({
                    ...current,
                    groupId: event.target.value,
                  }))}
                  className={selectClass}
                >
                  <option value="">Pilih kategori</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="subgroup-label" className="mb-1 block text-xs">Nama subkategori</Label>
                <Input
                  id="subgroup-label"
                  value={subgroupDraft.label}
                  onChange={(event) => setSubgroupDraft((current) => ({
                    ...current,
                    label: event.target.value,
                    slug: current.slug || normalizeCatalogSlug(event.target.value) || '',
                  }))}
                  placeholder="PLN Promo"
                />
              </div>
              <div>
                <Label htmlFor="subgroup-slug" className="mb-1 block text-xs">Slug URL</Label>
                <Input
                  id="subgroup-slug"
                  value={subgroupDraft.slug}
                  onChange={(event) => setSubgroupDraft((current) => ({
                    ...current,
                    slug: normalizeCatalogSlug(event.target.value) ?? '',
                  }))}
                  placeholder="pln-promo"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="subgroup-description" className="mb-1 block text-xs">Deskripsi</Label>
                <Input
                  id="subgroup-description"
                  value={subgroupDraft.description}
                  onChange={(event) => setSubgroupDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))}
                  placeholder="Produk PLN dengan harga khusus"
                />
              </div>
              <div>
                <Label htmlFor="subgroup-order" className="mb-1 block text-xs">Urutan</Label>
                <Input
                  id="subgroup-order"
                  type="number"
                  min={0}
                  value={subgroupDraft.sortOrder}
                  onChange={(event) => setSubgroupDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value) || 0,
                  }))}
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={
                isSaving ||
                !subgroupDraft.groupId ||
                !subgroupDraft.label.trim() ||
                !subgroupDraft.slug
              }
              onClick={async () => {
                const ok = await send('POST', {
                  resource: 'subgroups',
                  ...subgroupDraft,
                  iconUrl: null,
                  enabled: true,
                });
                if (ok) {
                  setSubgroupDraft({ groupId: '', slug: '', label: '', description: '', sortOrder: 0 });
                }
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Tambah subkategori
            </Button>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {subgroups.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Belum ada subkategori.</p>
              ) : subgroups.map((subgroup) => {
                const parent = groups.find((row) => row.id === subgroup.groupId);
                const count = products.filter((product) => product.subgroupId === subgroup.id).length;
                return (
                  <div key={subgroup.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{subgroup.label}</p>
                      <p className="text-xs text-slate-500">
                        {parent?.label ?? '—'} · {subgroup.slug} · {count} produk ·{' '}
                        {subgroup.enabled ? 'aktif' : 'nonaktif'}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void send('PATCH', {
                          resource: 'subgroups',
                          id: subgroup.id,
                          enabled: !subgroup.enabled,
                        })}
                        disabled={isSaving}
                      >
                        {subgroup.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void remove('subgroups', subgroup.id)}
                        disabled={isSaving}
                        aria-label={`Hapus ${subgroup.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'rules' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aturan pemetaan</CardTitle>
            <CardDescription>
              Aturan hanya mengisi produk yang belum dipetakan. Pemetaan manual di menu Produk tidak
              pernah ditimpa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="rule-subgroup" className="mb-1 block text-xs">Subkategori tujuan</Label>
                <select
                  id="rule-subgroup"
                  value={ruleDraft.subgroupId}
                  onChange={(event) => setRuleDraft((current) => ({
                    ...current,
                    subgroupId: event.target.value,
                  }))}
                  className={selectClass}
                >
                  <option value="">Pilih subkategori</option>
                  {subgroupOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="rule-match" className="mb-1 block text-xs">Cocokkan</Label>
                <select
                  id="rule-match"
                  value={ruleDraft.matchType}
                  onChange={(event) => setRuleDraft((current) => ({
                    ...current,
                    matchType: event.target.value as CatalogRuleMatchType,
                  }))}
                  className={selectClass}
                >
                  {catalogRuleMatchTypes.map((type) => (
                    <option key={type} value={type}>{matchTypeLabels[type]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="rule-value" className="mb-1 block text-xs">Nilai</Label>
                <Input
                  id="rule-value"
                  value={ruleDraft.matchValue}
                  onChange={(event) => setRuleDraft((current) => ({
                    ...current,
                    matchValue: event.target.value,
                  }))}
                  placeholder="PLN"
                />
              </div>
              <div>
                <Label htmlFor="rule-vendor" className="mb-1 block text-xs">Vendor (opsional)</Label>
                <select
                  id="rule-vendor"
                  value={ruleDraft.vendor}
                  onChange={(event) => setRuleDraft((current) => ({
                    ...current,
                    vendor: event.target.value as '' | ProductVendor,
                  }))}
                  className={selectClass}
                >
                  <option value="">Semua vendor</option>
                  {catalogVendors.map((vendor) => (
                    <option key={vendor} value={vendor}>{vendor}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="rule-priority" className="mb-1 block text-xs">
                  Prioritas (angka kecil menang)
                </Label>
                <Input
                  id="rule-priority"
                  type="number"
                  min={0}
                  value={ruleDraft.priority}
                  onChange={(event) => setRuleDraft((current) => ({
                    ...current,
                    priority: Number(event.target.value) || 0,
                  }))}
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={
                isSaving ||
                !ruleDraft.subgroupId ||
                !ruleDraft.matchValue.trim()
              }
              onClick={async () => {
                const ok = await send('POST', {
                  resource: 'rules',
                  subgroupId: ruleDraft.subgroupId,
                  priority: ruleDraft.priority,
                  vendor: ruleDraft.vendor === '' ? null : ruleDraft.vendor,
                  matchType: ruleDraft.matchType,
                  matchValue: ruleDraft.matchValue.trim(),
                });
                if (ok) {
                  setRuleDraft((current) => ({ ...current, matchValue: '' }));
                }
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Tambah aturan
            </Button>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {rules.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Belum ada aturan.</p>
              ) : rules.map((rule) => {
                const target = subgroupOptions.find((option) => option.id === rule.subgroupId);
                return (
                  <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {matchTypeLabels[rule.matchType]} &ldquo;{rule.matchValue}&rdquo;
                      </p>
                      <p className="text-xs text-slate-500">
                        → {target?.label ?? 'subkategori terhapus'} · prioritas {rule.priority}
                        {rule.vendor ? ` · ${rule.vendor}` : ' · semua vendor'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void remove('rules', rule.id)}
                      disabled={isSaving}
                      aria-label="Hapus aturan"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
