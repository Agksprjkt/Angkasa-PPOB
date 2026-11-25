'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { PromotionalBanner } from '@/types/ppob';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/crystal-loader';

type PromotionFormState = {
  title: string;
  description: string;
  imageUrl: string;
  targetPath: string;
  buttonLabel: string;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

function emptyForm(sortOrder = 0): PromotionFormState {
  return {
    title: '',
    description: '',
    imageUrl: '',
    targetPath: '#product-catalog',
    buttonLabel: 'Jelajahi produk',
    sortOrder: String(sortOrder),
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

function isPromotionalBanner(value: unknown): value is PromotionalBanner {
  if (typeof value !== 'object' || value === null) return false;
  const banner = value as Record<string, unknown>;
  return typeof banner.id === 'string' &&
    typeof banner.title === 'string' &&
    typeof banner.description === 'string' &&
    typeof banner.imageUrl === 'string' &&
    typeof banner.targetPath === 'string' &&
    typeof banner.buttonLabel === 'string' &&
    typeof banner.sortOrder === 'number' &&
    (banner.startsAt === null || typeof banner.startsAt === 'string') &&
    (banner.endsAt === null || typeof banner.endsAt === 'string') &&
    typeof banner.enabled === 'boolean';
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'INVALID_PROMOTION') {
    return 'Periksa tautan, urutan, dan waktu promosi. Banner harus punya judul atau gambar.';
  }
  if (message === 'INVALID_PROMOTION_UPDATE') {
    return 'Perubahan ditolak. Banner harus tetap punya judul atau gambar.';
  }
  if (message === 'PROMOTION_NOT_FOUND') {
    return 'Banner promosi sudah tidak tersedia. Muat ulang daftar.';
  }
  return message || 'Permintaan promosi gagal. Coba lagi.';
}

function sortBanners(items: PromotionalBanner[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'id'));
}

async function fetchPromotionalBanners(signal?: AbortSignal) {
  const response = await fetch('/api/admin/promotions', {
    cache: 'no-store',
    signal,
  });
  const result = await response.json() as { banners?: unknown; error?: string };
  if (!response.ok || !Array.isArray(result.banners) || !result.banners.every(isPromotionalBanner)) {
    throw new Error(result.error ?? 'Daftar promosi tidak valid.');
  }
  return sortBanners(result.banners);
}

export default function PromotionManagementPanel() {
  const [banners, setBanners] = useState<PromotionalBanner[]>([]);
  const [form, setForm] = useState<PromotionFormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBanners = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setBanners(await fetchPromotionalBanners());
    } catch (error) {
      console.error('[ADMIN_PROMOTIONS_LOAD_FAILED]', error);
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPromotionalBanners(controller.signal)
      .then(setBanners)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('[ADMIN_PROMOTIONS_LOAD_FAILED]', error);
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
    setForm(emptyForm(banners.length));
    setActionError('');
    setSuccessMessage('');
    setIsFormOpen(true);
  };

  const openEditForm = (banner: PromotionalBanner) => {
    setEditingId(banner.id);
    setForm({
      title: banner.title,
      description: banner.description,
      imageUrl: banner.imageUrl,
      targetPath: banner.targetPath,
      buttonLabel: banner.buttonLabel,
      sortOrder: String(banner.sortOrder),
      startsAt: toDateTimeInput(banner.startsAt),
      endsAt: toDateTimeInput(banner.endsAt),
      enabled: banner.enabled,
    });
    setActionError('');
    setSuccessMessage('');
    setIsFormOpen(true);
  };

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Let the same file be chosen again after a failed upload.
    event.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) {
      setActionError('Gambar terlalu besar. Maksimal 5 MB.');
      return;
    }

    setIsUploadingImage(true);
    setActionError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/admin/promotions/assets', { method: 'POST', body });
      const result = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || typeof result.imageUrl !== 'string') {
        throw new Error(result.error ?? 'Gambar banner gagal diunggah.');
      }
      const previous = form.imageUrl;
      setForm((current) => ({ ...current, imageUrl: result.imageUrl as string }));
      // Drop the replaced file so storage does not fill up with orphans.
      if (previous.startsWith('/api/promotion-assets/')) {
        void fetch(`/api/admin/promotions/assets?url=${encodeURIComponent(previous)}`, {
          method: 'DELETE',
        }).catch(() => undefined);
      }
    } catch (error) {
      console.error('[ADMIN_BANNER_IMAGE_UPLOAD_FAILED]', error);
      setActionError(error instanceof Error ? error.message : 'Gambar banner gagal diunggah.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const removeFormImage = async () => {
    const current = form.imageUrl;
    setForm((state) => ({ ...state, imageUrl: '' }));
    if (!current.startsWith('/api/promotion-assets/')) return;
    try {
      await fetch(`/api/admin/promotions/assets?url=${encodeURIComponent(current)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('[ADMIN_BANNER_IMAGE_DELETE_FAILED]', error);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError('');
    setSuccessMessage('');
    const sortOrder = Number(form.sortOrder);
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
      setActionError('Urutan harus berupa bilangan bulat nol atau lebih.');
      return;
    }
    // The API accepts an empty title only when there is an image to show.
    if (!form.title.trim() && !form.imageUrl.trim()) {
      setActionError('Isi judul atau unggah gambar banner terlebih dahulu.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim(),
        targetPath: form.targetPath.trim(),
        buttonLabel: form.buttonLabel.trim(),
        sortOrder,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        enabled: form.enabled,
      };
      const response = await fetch('/api/admin/promotions', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingId ? { id: editingId, updates: payload } : payload,
        ),
      });
      const result = await response.json() as {
        banner?: unknown;
        error?: string;
      };
      if (!response.ok || !isPromotionalBanner(result.banner)) {
        throw new Error(result.error ?? 'Banner tidak dapat disimpan.');
      }

      const savedBanner = result.banner;
      setBanners((current) => sortBanners(
        editingId
          ? current.map((banner) => banner.id === editingId ? savedBanner : banner)
          : [...current, savedBanner],
      ));
      setIsFormOpen(false);
      setSuccessMessage(editingId ? 'Banner promosi berhasil diperbarui.' : 'Banner promosi berhasil ditambahkan.');
    } catch (error) {
      console.error('[ADMIN_PROMOTION_SAVE_FAILED]', error);
      setActionError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleBanner = async (banner: PromotionalBanner) => {
    setBusyId(banner.id);
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await fetch('/api/admin/promotions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: banner.id,
          updates: { enabled: !banner.enabled },
        }),
      });
      const result = await response.json() as { banner?: unknown; error?: string };
      if (!response.ok || !isPromotionalBanner(result.banner)) {
        throw new Error(result.error ?? 'Status banner tidak dapat diperbarui.');
      }
      const updatedBanner = result.banner;
      setBanners((current) => sortBanners(
        current.map((item) => item.id === banner.id ? updatedBanner : item),
      ));
      setSuccessMessage(updatedBanner.enabled ? 'Banner promosi diaktifkan.' : 'Banner promosi dinonaktifkan.');
    } catch (error) {
      console.error('[ADMIN_PROMOTION_STATUS_UPDATE_FAILED]', error);
      setActionError(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const deleteBanner = async (banner: PromotionalBanner) => {
    if (!window.confirm(`Hapus banner "${banner.title}"?`)) return;
    setBusyId(banner.id);
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await fetch(`/api/admin/promotions?id=${encodeURIComponent(banner.id)}`, {
        method: 'DELETE',
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || result.success !== true) {
        throw new Error(result.error ?? 'Banner tidak dapat dihapus.');
      }
      setBanners((current) => current.filter((item) => item.id !== banner.id));
      setSuccessMessage('Banner promosi berhasil dihapus.');
    } catch (error) {
      console.error('[ADMIN_PROMOTION_DELETE_FAILED]', error);
      setActionError(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const deleteBannerImage = async (banner: PromotionalBanner) => {
    // A banner with no image and no title has nothing to show, and the API
    // rejects that state. Explain it instead of firing a request that fails.
    if (!banner.title.trim()) {
      setActionError(
        'Banner ini hanya berisi gambar. Isi judul dulu lewat Edit, baru gambar bisa dihapus.',
      );
      setSuccessMessage('');
      return;
    }
    if (!window.confirm('Hapus gambar banner ini?')) return;
    setBusyId(banner.id);
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await fetch('/api/admin/promotions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: banner.id, updates: { imageUrl: '' } }),
      });
      const result = await response.json() as { banner?: unknown; error?: string };
      if (!response.ok || !isPromotionalBanner(result.banner)) {
        throw new Error(result.error ?? 'Gambar banner tidak dapat dihapus.');
      }
      const updated = result.banner;
      setBanners((current) => sortBanners(
        current.map((item) => item.id === banner.id ? updated : item),
      ));
      await fetch(`/api/admin/promotions/assets?url=${encodeURIComponent(banner.imageUrl)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
      setSuccessMessage('Gambar banner dihapus.');
    } catch (error) {
      console.error('[ADMIN_BANNER_IMAGE_REMOVE_FAILED]', error);
      setActionError(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Slider Promosi</CardTitle>
            <CardDescription className="mt-1">
              Atur materi slider, tautan tombol, urutan, dan jadwal tampil di beranda.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => {
                void loadBanners();
              }}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Muat ulang
            </Button>
            <Button type="button" onClick={openNewForm}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah banner
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Gambar boleh dikosongkan. Tautan tujuan gunakan path internal seperti /checkout/game/FREE%20FIRE
            atau anchor #product-catalog.
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
              {editingId ? 'Edit banner promosi' : 'Tambah banner promosi'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="promotion-title">Judul (opsional)</Label>
                  <Input
                    id="promotion-title"
                    value={form.title}
                    maxLength={120}
                    placeholder="Kosongkan bila banner hanya gambar"
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promotion-button">Teks tombol (opsional)</Label>
                  <Input
                    id="promotion-button"
                    value={form.buttonLabel}
                    maxLength={40}
                    placeholder="Kosongkan bila tidak perlu"
                    onChange={(event) => setForm((current) => ({ ...current, buttonLabel: event.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="promotion-description">Deskripsi (opsional)</Label>
                  <textarea
                    id="promotion-description"
                    value={form.description}
                    maxLength={500}
                    rows={3}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    className="flex min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-600"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Gambar banner</Label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="relative flex h-32 w-full max-w-xs items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                      {form.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={form.imageUrl}
                          alt="Pratinjau banner"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="px-3 text-center text-xs text-slate-500">
                          Belum ada gambar
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(event) => void handleImageSelected(event)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploadingImage}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {isUploadingImage
                          ? 'Mengunggah...'
                          : form.imageUrl ? 'Ganti gambar' : 'Unggah gambar'}
                      </Button>
                      {form.imageUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isUploadingImage}
                          onClick={() => void removeFormImage()}
                          className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Hapus gambar
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    PNG, JPG, atau WebP, maksimal 5 MB. Disarankan lanskap 16:7.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="promotion-image">Atau tempel URL gambar</Label>
                  <Input
                    id="promotion-image"
                    value={form.imageUrl}
                    placeholder="https://... atau /api/promotion-assets/..."
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      imageUrl: event.target.value,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promotion-target">Path, anchor, atau URL tujuan</Label>
                  <Input
                    id="promotion-target"
                    value={form.targetPath}
                    required
                    placeholder="/checkout/game/FREE%20FIRE atau https://..."
                    onChange={(event) => setForm((current) => ({ ...current, targetPath: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promotion-order">Urutan tampil</Label>
                  <Input
                    id="promotion-order"
                    type="number"
                    min="0"
                    step="1"
                    value={form.sortOrder}
                    required
                    onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promotion-starts">Mulai tampil (opsional)</Label>
                  <Input
                    id="promotion-starts"
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promotion-ends">Berakhir (opsional)</Label>
                  <Input
                    id="promotion-ends"
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                  />
                </div>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                Aktifkan banner
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah banner'}
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
        <LoadingState message="Memuat banner promosi…" />
      ) : banners.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ImagePlus className="h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="text-sm text-slate-500">Belum ada banner. Tambahkan banner agar slider beranda dapat dikonfigurasi.</p>
            {!isFormOpen && (
              <Button type="button" variant="outline" onClick={openNewForm}>
                Tambah banner pertama
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
          {banners.map((banner) => (
            <Card key={banner.id} className="flex min-w-0 flex-col overflow-hidden">
              {banner.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={banner.imageUrl}
                  alt=""
                  className="h-36 w-full object-cover"
                />
              )}
              <CardHeader className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="line-clamp-2 text-base">
                      {banner.title || 'Banner tanpa judul'}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">{banner.description || 'Tanpa deskripsi'}</CardDescription>
                  </div>
                  <Badge variant={banner.enabled ? 'blue' : 'outline'}>
                    {banner.enabled ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-xs text-slate-500">
                  <p className="break-all">Tujuan: {banner.targetPath}</p>
                  <p>Urutan: {banner.sortOrder}</p>
                  {(banner.startsAt || banner.endsAt) && (
                    <p>
                      Jadwal: {banner.startsAt ? new Date(banner.startsAt).toLocaleString('id-ID') : 'segera'}
                      {' – '}
                      {banner.endsAt ? new Date(banner.endsAt).toLocaleString('id-ID') : 'tanpa batas'}
                    </p>
                  )}
                </div>
                {busyId === banner.id && (
                  <p role="status" className="text-xs text-slate-500">Memproses banner…</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEditForm(banner)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === banner.id}
                    onClick={() => void toggleBanner(banner)}
                  >
                    {banner.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                  {banner.imageUrl.startsWith('/api/promotion-assets/') && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === banner.id}
                      onClick={() => void deleteBannerImage(banner)}
                      className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Hapus gambar
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === banner.id}
                    onClick={() => void deleteBanner(banner)}
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
