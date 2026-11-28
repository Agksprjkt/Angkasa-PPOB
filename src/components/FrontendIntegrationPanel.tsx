'use client';

import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react';
import { usePPOB } from '@/context/PPOBContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/ui/crystal-loader';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

type FrontendIntegrationSnapshot = {
  backendOrigin: string;
  baseUrl: string;
  baseUrlSource: 'environment' | 'dashboard';
  baseUrlEditable: boolean;
  trustedOrigins: string[];
  trustedOriginsSource: 'environment' | 'dashboard';
  trustedOriginsEditable: boolean;
  secret: {
    configured: boolean;
    enforcementEnabled: boolean;
  };
};

function sourceLabel(source: FrontendIntegrationSnapshot['baseUrlSource']) {
  return source === 'environment' ? 'Dari environment VPS' : 'Tersimpan di dashboard';
}

function errorLabel(error: string) {
  if (error === 'INVALID_AUTH_BASE_URL') {
    return 'URL backend harus berupa origin HTTP/HTTPS tanpa path.';
  }
  if (error === 'INVALID_FRONTEND_ORIGIN') {
    return 'Setiap origin frontend harus berupa URL HTTP/HTTPS tanpa path.';
  }
  if (error === 'TOO_MANY_FRONTEND_ORIGINS') {
    return 'Maksimal 32 origin frontend dapat ditambahkan.';
  }
  if (error === 'SETTING_OVERRIDDEN_BY_ENVIRONMENT') {
    return 'Nilai ini dikunci oleh environment VPS.';
  }
  return 'Pengaturan integrasi frontend gagal diproses.';
}

export default function FrontendIntegrationPanel() {
  const { addToast } = usePPOB();
  const [snapshot, setSnapshot] = useState<FrontendIntegrationSnapshot | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [trustedOrigins, setTrustedOrigins] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRotation, setConfirmRotation] = useState(false);

  const applySnapshot = (next: FrontendIntegrationSnapshot) => {
    setSnapshot(next);
    setBaseUrl(next.baseUrl);
    setTrustedOrigins(next.trustedOrigins.join('\n'));
  };

  const refresh = async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/frontend-integration');
      const body = await response.json() as FrontendIntegrationSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'FRONTEND_INTEGRATION_UNAVAILABLE');
      applySnapshot(body);
    } catch {
      setError('Gagal memuat ulang pengaturan integrasi frontend.');
    }
  };

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/frontend-integration')
      .then(async (response) => {
        const body = await response.json() as FrontendIntegrationSnapshot & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'FRONTEND_INTEGRATION_UNAVAILABLE');
        return body;
      })
      .then((body) => {
        if (active) applySnapshot(body);
      })
      .catch(() => {
        if (active) setError('Gagal memuat pengaturan integrasi frontend.');
      });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!snapshot) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/frontend-integration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, trustedOrigins }),
      });
      const body = await response.json() as FrontendIntegrationSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'FRONTEND_INTEGRATION_COULD_NOT_BE_SAVED');
      applySnapshot(body);
      setNotice('Pengaturan origin tersimpan.');
    } catch (saveError) {
      setError(errorLabel(saveError instanceof Error ? saveError.message : 'UNKNOWN'));
    } finally {
      setSaving(false);
    }
  };

  const generateSecret = async () => {
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/integration-secrets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'frontendApiSecret' }),
      });
      const body = await response.json() as { value?: string; saved?: boolean; error?: string };
      if (!response.ok || typeof body.value !== 'string' || body.saved !== true) {
        throw new Error(body.error ?? 'FRONTEND_SECRET_COULD_NOT_BE_GENERATED');
      }
      setGeneratedSecret(body.value);
      setSecretVisible(false);
      setSnapshot((current) => current
        ? { ...current, secret: { ...current.secret, configured: true } }
        : current);
      setNotice('Secret baru aktif. Simpan di secret store server PPOB-Frontend; nilai ini hanya ditampilkan sekarang.');
    } catch (secretError) {
      setError(errorLabel(secretError instanceof Error ? secretError.message : 'UNKNOWN'));
    } finally {
      setGenerating(false);
      setConfirmRotation(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(generatedSecret);
      addToast('Secret disalin', 'Simpan hanya di secret store server-side frontend.', 'success');
    } catch {
      addToast('Secret tidak dapat disalin', 'Salin nilainya secara manual sebelum meninggalkan halaman.', 'error');
    }
  };

  if (!snapshot) {
    return error
      ? <p role="alert" className="text-sm text-rose-600">{error}</p>
      : <LoadingState message="Memuat integrasi frontend…" />;
  }

  const changed =
    baseUrl !== snapshot.baseUrl ||
    trustedOrigins !== snapshot.trustedOrigins.join('\n');

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Origin Better Auth</h2>
            <p className="mt-1 text-sm text-slate-600">
              Atur URL kanonis backend dan origin browser PPOB-Frontend yang diizinkan.
              Environment VPS selalu menjadi prioritas bila nilainya diisi.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="frontend-backend-origin">BETTER_AUTH_URL · backend API origin</Label>
              <Badge variant={snapshot.baseUrlSource === 'environment' ? 'secondary' : 'outline'}>
                {sourceLabel(snapshot.baseUrlSource)}
              </Badge>
            </div>
            <Input
              id="frontend-backend-origin"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              disabled={!snapshot.baseUrlEditable}
              autoComplete="url"
            />
            <p className="text-xs text-slate-500">
              Origin ini bukan rahasia. Gunakan host backend publik, tanpa path.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="frontend-trusted-origins">BETTER_AUTH_TRUSTED_ORIGINS</Label>
              <Badge variant={snapshot.trustedOriginsSource === 'environment' ? 'secondary' : 'outline'}>
                {sourceLabel(snapshot.trustedOriginsSource)}
              </Badge>
            </div>
            <textarea
              id="frontend-trusted-origins"
              value={trustedOrigins}
              onChange={(event) => setTrustedOrigins(event.target.value)}
              disabled={!snapshot.trustedOriginsEditable}
              rows={4}
              placeholder={'https://shop.example.com\nhttp://localhost:3001'}
              className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              aria-describedby="frontend-trusted-origins-help"
            />
            <p id="frontend-trusted-origins-help" className="text-xs text-slate-500">
              Satu origin tambahan per baris, tanpa path. Origin aplikasi sendiri selalu diizinkan;
              kosong berarti hanya origin itu. Nilai ini bukan pengganti secret API.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Muat ulang
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving || !changed}>
              {saving ? 'Menyimpan…' : 'Simpan origin'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Secret proxy frontend</h2>
              <p className="mt-1 text-sm text-slate-600">
                Backend mewajibkan header <code className="rounded bg-slate-100 px-1">x-frontend-api-secret</code>
                {' '}untuk API browser dari origin eksternal. Secret disimpan terenkripsi dan tidak
                pernah dikirim ke browser.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={snapshot.secret.configured ? 'default' : 'secondary'}>
              {snapshot.secret.configured ? 'Secret aktif' : 'Secret belum dibuat'}
            </Badge>
            <Badge variant={snapshot.secret.enforcementEnabled ? 'outline' : 'secondary'}>
              {snapshot.secret.enforcementEnabled ? 'Enforcement aktif' : 'Enforcement nonaktif'}
            </Badge>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Jangan memasukkan secret ke <code>NEXT_PUBLIC_*</code> atau kode browser.
            PPOB-Frontend saat ini belum mengirim header ini, sehingga akses API dari origin
            frontend eksternal akan gagal sampai proxy server-side frontend diperbarui.
            Membuat ulang secret langsung membatalkan nilai sebelumnya.
          </div>

          {generatedSecret && (
            <div className="space-y-2">
              <Label htmlFor="generated-frontend-secret">Secret baru · salin sekarang</Label>
              <div className="flex gap-2">
                <Input
                  id="generated-frontend-secret"
                  type={secretVisible ? 'text' : 'password'}
                  value={generatedSecret}
                  readOnly
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={secretVisible ? 'Sembunyikan secret' : 'Tampilkan secret'}
                  onClick={() => setSecretVisible((visible) => !visible)}
                >
                  {secretVisible
                    ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                    : <Eye className="h-4 w-4" aria-hidden="true" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Salin secret"
                  onClick={() => void copySecret()}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant={snapshot.secret.configured ? 'outline' : 'default'}
            onClick={() => snapshot.secret.configured
              ? setConfirmRotation(true)
              : void generateSecret()}
            disabled={generating}
          >
            {generating
              ? 'Membuat secret…'
              : snapshot.secret.configured ? 'Rotasi secret' : 'Buat secret'}
          </Button>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={confirmRotation}
        onOpenChange={setConfirmRotation}
        title="Rotasi secret frontend?"
        description="Secret lama langsung tidak berlaku. Proxy PPOB-Frontend perlu diperbarui dengan secret baru agar akses API kembali berjalan."
        confirmLabel="Rotasi secret"
        onConfirm={() => void generateSecret()}
        confirmDisabled={generating}
      />
    </div>
  );
}
