'use client';

import { useEffect, useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type StoreSettings = {
  storeName: string;
  tagline: string;
  description: string;
  supportPhone: string;
  logoFile: string | null;
  seoTitle: string;
  seoDescription: string;
  googleSiteVerification: string;
  bingSiteVerification: string;
  indexNowKey: string | null;
};

type StoreSettingsView = 'profile' | 'seo';

const emptySettings: StoreSettings = {
  storeName: '',
  tagline: '',
  description: '',
  supportPhone: '',
  logoFile: null,
  seoTitle: '',
  seoDescription: '',
  googleSiteVerification: '',
  bingSiteVerification: '',
  indexNowKey: null,
};

export default function StoreSettingsPanel({ view }: { view: StoreSettingsView }) {
  const { addToast, updateStoreName } = usePPOB();
  const [settings, setSettings] = useState<StoreSettings>(emptySettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isSubmittingIndexNow, setIsSubmittingIndexNow] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/store-settings')
      .then(async (response) => {
        const body = await response.json() as { settings?: StoreSettings; error?: string };
        if (!response.ok || !body.settings) {
          throw new Error(body.error ?? 'Pengaturan toko gagal dimuat.');
        }
        return body.settings;
      })
      .then((result) => {
        if (active) setSettings(result);
      })
      .catch((error: unknown) => {
        if (active) {
          addToast(
            'Pengaturan toko gagal dimuat',
            error instanceof Error ? error.message : 'Silakan muat ulang halaman.',
            'error',
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [addToast]);

  const updateSetting = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = async (fields: Array<keyof StoreSettings>) => {
    setIsSaving(true);
    try {
      const values = Object.fromEntries(fields.map((field) => [field, settings[field] ?? '']));
      const response = await fetch('/api/admin/store-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await response.json() as { settings?: StoreSettings; error?: string };
      if (!response.ok || !body.settings) {
        throw new Error(body.error ?? 'Pengaturan gagal disimpan.');
      }
      setSettings(body.settings);
      if (fields.includes('storeName')) updateStoreName(body.settings.storeName);
      addToast('Pengaturan tersimpan', 'Perubahan berhasil diterapkan.', 'success');
    } catch (error) {
      addToast(
        'Pengaturan gagal disimpan',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/admin/store-settings/logo', {
        method: 'POST',
        body: form,
      });
      const body = await response.json() as { logoUrl?: string; error?: string };
      if (!response.ok || !body.logoUrl) {
        throw new Error(body.error ?? 'Logo toko gagal diunggah.');
      }
      const filename = body.logoUrl.split('/').pop();
      if (!filename) throw new Error('Logo berhasil diunggah, tetapi lokasinya tidak valid.');
      updateSetting('logoFile', decodeURIComponent(filename));
      addToast('Logo diperbarui', 'Logo toko berhasil diunggah.', 'success');
    } catch (error) {
      addToast(
        'Logo gagal diunggah',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const generateIndexNowKey = async () => {
    setIsGeneratingKey(true);
    try {
      const response = await fetch('/api/admin/store-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-indexnow-key' }),
      });
      const body = await response.json() as { indexNowKey?: string; error?: string };
      if (!response.ok || !body.indexNowKey) {
        throw new Error(body.error ?? 'Kunci IndexNow gagal dibuat.');
      }
      updateSetting('indexNowKey', body.indexNowKey);
      addToast('Kunci IndexNow dibuat', 'File verifikasi IndexNow sudah aktif.', 'success');
    } catch (error) {
      addToast(
        'Kunci IndexNow gagal dibuat',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const submitIndexNow = async () => {
    setIsSubmittingIndexNow(true);
    try {
      const response = await fetch('/api/admin/store-settings/indexnow', { method: 'POST' });
      const body = await response.json() as { submitted?: number; error?: string };
      if (!response.ok || body.submitted === undefined) {
        throw new Error(body.error ?? 'Halaman gagal dikirim ke IndexNow.');
      }
      addToast(
        'IndexNow menerima permintaan',
        `${body.submitted} URL toko dikirim untuk diproses mesin pencari yang mendukung IndexNow.`,
        'success',
      );
    } catch (error) {
      addToast(
        'Pengiriman IndexNow gagal',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsSubmittingIndexNow(false);
    }
  };

  if (view === 'profile') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil Toko</CardTitle>
          <CardDescription>
            Identitas yang ditampilkan kepada pelanggan dan digunakan pada judul aplikasi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <p className="text-sm text-slate-500">Memuat profil toko…</p>
          ) : (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {settings.logoFile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/store-assets/${encodeURIComponent(settings.logoFile)}`}
                      alt={`Logo ${settings.storeName}`}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">Belum ada logo</span>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store-logo">Logo toko</Label>
                  <Input
                    id="store-logo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isUploading}
                    onChange={(event) => {
                      void uploadLogo(event.target.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                    className="max-w-sm"
                  />
                  <p className="text-xs text-slate-500">
                    PNG, JPG, atau WebP. Maksimal 1 MB.
                    {isUploading ? ' Mengunggah…' : ''}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="store-name">Nama toko</Label>
                  <Input
                    id="store-name"
                    maxLength={100}
                    value={settings.storeName}
                    onChange={(event) => updateSetting('storeName', event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="store-tagline">Tagline</Label>
                  <Input
                    id="store-tagline"
                    maxLength={160}
                    value={settings.tagline}
                    onChange={(event) => updateSetting('tagline', event.target.value)}
                    placeholder="Contoh: Semua kebutuhan digital, satu tempat"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="store-description">Deskripsi toko</Label>
                  <textarea
                    id="store-description"
                    rows={4}
                    maxLength={2000}
                    value={settings.description}
                    onChange={(event) => updateSetting('description', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="store-support-phone">Nomor WhatsApp/bantuan</Label>
                  <Input
                    id="store-support-phone"
                    type="tel"
                    maxLength={40}
                    value={settings.supportPhone}
                    onChange={(event) => updateSetting('supportPhone', event.target.value)}
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
              </div>
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button
                  type="button"
                  onClick={() => void save(['storeName', 'tagline', 'description', 'supportPhone'])}
                  disabled={isSaving || isLoading}
                >
                  {isSaving ? 'Menyimpan…' : 'Simpan Profil Toko'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO & Pencarian</CardTitle>
          <CardDescription>
            Atur metadata hasil pencarian dan verifikasi webmaster. Alamat situs tidak disimpan di sini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Memuat pengaturan SEO…</p>
          ) : (
            <>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="seo-title">Judul hasil pencarian</Label>
                  <Input
                    id="seo-title"
                    maxLength={70}
                    value={settings.seoTitle}
                    onChange={(event) => updateSetting('seoTitle', event.target.value)}
                    placeholder={settings.storeName || 'Nama toko'}
                  />
                  <p className="text-xs text-slate-500">Disarankan maksimal 60–70 karakter.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="seo-description">Deskripsi hasil pencarian</Label>
                  <textarea
                    id="seo-description"
                    rows={3}
                    maxLength={320}
                    value={settings.seoDescription}
                    onChange={(event) => updateSetting('seoDescription', event.target.value)}
                    placeholder={settings.description || 'Jelaskan layanan toko untuk hasil pencarian.'}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                  <p className="text-xs text-slate-500">Disarankan sekitar 150–160 karakter.</p>
                </div>
              </div>
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button
                  type="button"
                  onClick={() => void save(['seoTitle', 'seoDescription'])}
                  disabled={isSaving || isLoading}
                >
                  {isSaving ? 'Menyimpan…' : 'Simpan SEO'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Webmaster & pengindeksan</CardTitle>
              <CardDescription>
                Verifikasi kepemilikan situs dan kirim URL ke mesin pencari yang mendukung IndexNow.
              </CardDescription>
            </div>
            <Badge variant={settings.indexNowKey ? 'success' : 'outline'}>
              {settings.indexNowKey ? 'IndexNow siap' : 'Belum dikonfigurasi'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="google-site-verification">Google Search Console verification</Label>
              <Input
                id="google-site-verification"
                maxLength={200}
                value={settings.googleSiteVerification}
                onChange={(event) => updateSetting('googleSiteVerification', event.target.value)}
                placeholder="Token dari meta tag HTML Google"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bing-site-verification">Bing Webmaster verification</Label>
              <Input
                id="bing-site-verification"
                maxLength={200}
                value={settings.bingSiteVerification}
                onChange={(event) => updateSetting('bingSiteVerification', event.target.value)}
                placeholder="Token dari Bing Webmaster Tools"
              />
            </div>
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => void save(['googleSiteVerification', 'bingSiteVerification'])}
              disabled={isSaving || isLoading}
            >
              {isSaving ? 'Menyimpan…' : 'Simpan Verifikasi'}
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">IndexNow</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Mengirim daftar halaman aktif ke Bing dan mesin pencari lain yang mendukung IndexNow. Ini bukan jaminan halaman langsung terindeks; Google menggunakan sitemap dan Search Console.
            </p>
            {settings.indexNowKey ? (
              <code className="mt-3 block break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                {settings.indexNowKey}
              </code>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void generateIndexNowKey()}
                disabled={isGeneratingKey}
              >
                {isGeneratingKey
                  ? 'Membuat kunci…'
                  : settings.indexNowKey ? 'Buat ulang kunci' : 'Aktifkan IndexNow'}
              </Button>
              <Button
                type="button"
                onClick={() => void submitIndexNow()}
                disabled={!settings.indexNowKey || isSubmittingIndexNow}
              >
                {isSubmittingIndexNow ? 'Mengirim URL…' : 'Kirim URL sekarang'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900">
            Sitemap otomatis tersedia di <code>/sitemap.xml</code>, robots.txt di <code>/robots.txt</code>, dan token verifikasi ditempatkan pada metadata halaman.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
