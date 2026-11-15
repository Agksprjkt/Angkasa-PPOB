'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown } from 'lucide-react';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePPOB } from '@/context/PPOBContext';

type IntegrationSection = 'whatsapp' | 'digiflazz' | 'qrisly';

type SettingStatus = {
  configured: boolean;
  source: 'environment' | 'dashboard' | 'unset';
  editable: boolean;
};

type AutoSyncSettings = {
  enabled: boolean;
  intervalDays: 7 | 14 | 30;
  enabledSource: SettingStatus['source'];
  intervalSource: SettingStatus['source'];
  enabledEditable: boolean;
  intervalEditable: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastResult: {
    total: number;
    synced: number;
    created: number;
    updated: number;
    skipped: number;
  } | null;
};

type SettingsSnapshot = {
  whatsapp: {
    provider: string;
    providerSource: SettingStatus['source'];
    providerEditable: boolean;
    fonnteToken: SettingStatus;
    openwaApiUrl: string;
    openwaApiUrlSource: SettingStatus['source'];
    openwaApiUrlEditable: boolean;
    openwaApiKey: SettingStatus;
    openwaSessionId: string;
    openwaSessionIdSource: SettingStatus['source'];
    openwaSessionIdEditable: boolean;
  };
  digiflazz: {
    username: string;
    usernameSource: SettingStatus['source'];
    usernameEditable: boolean;
    apiKey: SettingStatus;
    mode: string;
    modeSource: SettingStatus['source'];
    modeEditable: boolean;
    enableRealTransactions: boolean;
    enableRealTransactionsSource: SettingStatus['source'];
    enableRealTransactionsEditable: boolean;
    autoSync: AutoSyncSettings;
  };
  qrisly: {
    apiKey: SettingStatus;
    qrisId: string;
    qrisIdSource: SettingStatus['source'];
    qrisIdEditable: boolean;
    mode: string;
    modeSource: SettingStatus['source'];
    modeEditable: boolean;
    enabled: boolean;
    enabledSource: SettingStatus['source'];
    enabledEditable: boolean;
    activePaymentGateway: string;
    activePaymentGatewaySource: SettingStatus['source'];
    activePaymentGatewayEditable: boolean;
  };
};

const sourceText = (source: SettingStatus['source']) => {
  if (source === 'environment') return 'Dari environment';
  if (source === 'dashboard') return 'Tersimpan terenkripsi';
  return 'Belum diatur';
};

function formatSyncDate(value: string | null) {
  if (!value) return 'Belum pernah';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('id-ID')
    : 'Waktu tidak valid';
}

const sectionSettings: Record<IntegrationSection, string[]> = {
  whatsapp: [
    'whatsappProvider',
    'fonnteToken',
    'openwaApiUrl',
    'openwaApiKey',
    'openwaSessionId',
  ],
  digiflazz: [
    'digiflazzUsername',
    'digiflazzApiKey',
    'digiflazzMode',
    'enableRealTransactions',
  ],
  qrisly: [
    'qrislyApiKey',
    'qrislyQrisId',
    'qrislyMode',
    'qrislyEnabled',
    'activePaymentGateway',
  ],
};

function IntegrationSummary({
  title,
  active,
}: {
  title: string;
  active: boolean;
}) {
  return (
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
      <span className="font-semibold">{title}</span>
      <span className="flex items-center gap-3">
        <span
          className={
            active
              ? 'rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
              : 'rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600'
          }
        >
          {active ? 'Aktif' : 'Nonaktif'}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180"
        />
      </span>
    </summary>
  );
}

function SecretField({
  id,
  label,
  status,
  value,
  onChange,
  clear,
  onClearChange,
}: {
  id: string;
  label: string;
  status: SettingStatus;
  value: string;
  onChange: (value: string) => void;
  clear: boolean;
  onClearChange: (checked: boolean) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id}>{label}</Label>
          <span className="text-xs text-slate-500">{sourceText(status.source)}</span>
        </div>
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            if (event.target.value) onClearChange(false);
          }}
          placeholder={
            status.configured ? 'Tersimpan; isi hanya untuk mengganti' : 'Belum diatur'
          }
          disabled={!status.editable}
        />
        {status.configured && status.editable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={() => {
              if (clear) onClearChange(false);
              else setConfirmClear(true);
            }}
          >
            {clear ? 'Batalkan penghapusan' : 'Hapus kredensial'}
          </Button>
        )}
      </div>
      <ConfirmationDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Hapus kredensial?"
        description={`Kredensial ${label} akan dihapus setelah Anda menyimpan integrasi ini.`}
        confirmLabel="Hapus kredensial"
        onConfirm={() => {
          onClearChange(true);
          setConfirmClear(false);
        }}
      />
    </>
  );
}

export default function IntegrationSettingsPanel({
  section = 'integrations',
}: {
  section?: 'integrations' | 'payments';
}) {
  const { addToast, refreshProducts } = usePPOB();
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [provider, setProvider] = useState('fonnte');
  const [fonnteToken, setFonnteToken] = useState('');
  const [openwaApiUrl, setOpenwaApiUrl] = useState('');
  const [openwaApiKey, setOpenwaApiKey] = useState('');
  const [openwaSessionId, setOpenwaSessionId] = useState('');
  const [digiflazzUsername, setDigiflazzUsername] = useState('');
  const [digiflazzApiKey, setDigiflazzApiKey] = useState('');
  const [digiflazzMode, setDigiflazzMode] = useState('sandbox');
  const [enableRealTransactions, setEnableRealTransactions] = useState(false);
  const [autoSyncIntervalDays, setAutoSyncIntervalDays] = useState<7 | 14 | 30>(7);
  const [isAutoSyncDialogOpen, setIsAutoSyncDialogOpen] = useState(false);
  const [isSavingAutoSync, setIsSavingAutoSync] = useState(false);
  const [autoSyncDialogError, setAutoSyncDialogError] = useState('');
  const [qrislyApiKey, setQrislyApiKey] = useState('');
  const [qrislyQrisId, setQrislyQrisId] = useState('');
  const [qrislyMode, setQrislyMode] = useState('sandbox');
  const [qrislyEnabled, setQrislyEnabled] = useState(false);
  const [activePaymentGateway, setActivePaymentGateway] = useState('qrisly');
  const [qrislyName, setQrislyName] = useState('QRIS Merchant');
  const [qrislyQrFile, setQrislyQrFile] = useState<File | null>(null);
  const [isUploadingQrislyQr, setIsUploadingQrislyQr] = useState(false);
  const [priceListData, setPriceListData] = useState<{
    total: number;
    synced: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [isLoadingPriceList, setIsLoadingPriceList] = useState(false);
  const [clearSettings, setClearSettings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingSections, setSavingSections] = useState<IntegrationSection[]>([]);

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/settings')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? 'Pengaturan integrasi tidak dapat dimuat.');
        }
        return body as SettingsSnapshot;
      })
      .then((body) => {
        if (!active) return;
        setSnapshot(body);
        setProvider(body.whatsapp.provider || 'fonnte');
        setOpenwaApiUrl(body.whatsapp.openwaApiUrl);
        setOpenwaSessionId(body.whatsapp.openwaSessionId);
        setDigiflazzUsername(body.digiflazz.username);
        setDigiflazzMode(body.digiflazz.mode || 'sandbox');
        setEnableRealTransactions(body.digiflazz.enableRealTransactions);
        setAutoSyncIntervalDays(body.digiflazz.autoSync.intervalDays);
        setQrislyQrisId(body.qrisly.qrisId);
        setQrislyMode(body.qrisly.mode || 'sandbox');
        setQrislyEnabled(body.qrisly.enabled);
        setActivePaymentGateway(body.qrisly.activePaymentGateway);
      })
      .catch((error: unknown) => {
        if (active) {
          addToast(
            'Pengaturan integrasi gagal dimuat',
            error instanceof Error ? error.message : 'Silakan muat ulang halaman.',
            'error',
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [addToast]);

  const toggleClear = (name: string, checked: boolean) => {
    setClearSettings((current) =>
      checked
        ? [...new Set([...current, name])]
        : current.filter((value) => value !== name),
    );
  };

  const handleSave = (section: IntegrationSection) =>
    async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!snapshot || savingSections.includes(section)) return;
    setSavingSections((current) => [...current, section]);

    const values: Record<string, string> = {};
    if (section === 'whatsapp') {
      if (snapshot.whatsapp.providerEditable) values.whatsappProvider = provider;
      if (provider === 'fonnte' && fonnteToken) values.fonnteToken = fonnteToken;
      if (provider === 'openwa') {
        if (snapshot.whatsapp.openwaApiUrlEditable) {
          values.openwaApiUrl = openwaApiUrl;
        }
        if (openwaApiKey) values.openwaApiKey = openwaApiKey;
        if (snapshot.whatsapp.openwaSessionIdEditable) {
          values.openwaSessionId = openwaSessionId;
        }
      }
    } else if (section === 'digiflazz') {
      if (snapshot.digiflazz.usernameEditable) {
        values.digiflazzUsername = digiflazzUsername;
      }
      if (digiflazzApiKey) values.digiflazzApiKey = digiflazzApiKey;
      if (snapshot.digiflazz.modeEditable) values.digiflazzMode = digiflazzMode;
      if (snapshot.digiflazz.enableRealTransactionsEditable) {
        values.enableRealTransactions = String(enableRealTransactions);
      }
    } else {
      if (qrislyApiKey) values.qrislyApiKey = qrislyApiKey;
      if (snapshot.qrisly.qrisIdEditable) values.qrislyQrisId = qrislyQrisId;
      if (snapshot.qrisly.modeEditable) values.qrislyMode = qrislyMode;
      if (snapshot.qrisly.enabledEditable) values.qrislyEnabled = String(qrislyEnabled);
      if (snapshot.qrisly.activePaymentGatewayEditable) {
        values.activePaymentGateway = activePaymentGateway;
      }
    }

    const sectionNames = sectionSettings[section];
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values,
          clear: clearSettings.filter(
            (name) => sectionNames.includes(name) && !(name in values),
          ),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Pengaturan integrasi tidak dapat disimpan.');
      }
      const updatedSnapshot = body as SettingsSnapshot;
      setSnapshot((current) =>
        current ? { ...current, [section]: updatedSnapshot[section] } : updatedSnapshot,
      );
      setClearSettings((current) =>
        current.filter((name) => !sectionNames.includes(name)),
      );
      if (section === 'whatsapp') {
        setFonnteToken('');
        setOpenwaApiKey('');
      } else if (section === 'digiflazz') {
        setDigiflazzApiKey('');
      } else {
        setQrislyApiKey('');
      }
      addToast(
        'Pengaturan tersimpan',
        `${section === 'whatsapp' ? 'WhatsApp OTP' : section === 'digiflazz' ? 'Digiflazz' : 'Qrisly'} berhasil diperbarui.`,
        'success',
      );
    } catch (error) {
      addToast(
        'Pengaturan gagal disimpan',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setSavingSections((current) => current.filter((value) => value !== section));
    }
  };

  const handleDigiflazzPriceList = async () => {
    setIsLoadingPriceList(true);
    setPriceListData(null);
    try {
      const response = await fetch('/api/admin/digiflazz/price-list', {
        method: 'POST',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail ?? body.error ?? 'Daftar harga Digiflazz gagal dimuat.');
      }
      const result = body as {
        total: number;
        synced: number;
        created: number;
        updated: number;
        skipped: number;
      };
      setPriceListData(result);
      addToast(
        'Produk Digiflazz tersinkron',
        `${result.created} produk baru, ${result.updated} diperbarui, ${result.skipped} dilewati. Produk baru berstatus nonaktif sampai Anda mengaturnya.`,
        'success',
      );
      try {
        await refreshProducts();
      } catch (error) {
        addToast(
          'Katalog belum diperbarui',
          error instanceof Error ? error.message : 'Muat ulang dashboard untuk melihat produk.',
          'warning',
        );
      }
      try {
        const settingsResponse = await fetch('/api/admin/settings');
        const settingsBody = await settingsResponse.json();
        if (settingsResponse.ok) setSnapshot(settingsBody as SettingsSnapshot);
      } catch {
        addToast(
          'Status sync belum diperbarui',
          'Muat ulang pengaturan integrasi untuk melihat status terakhir.',
          'warning',
        );
      }
    } catch (error) {
      addToast(
        'Daftar harga gagal dimuat',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsLoadingPriceList(false);
    }
  };

  const persistAutoSync = async (enabled: boolean, intervalDays: 7 | 14 | 30) => {
    const response = await fetch('/api/admin/digiflazz/auto-sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, intervalDays }),
    });
    const body = await response.json();
    if (!response.ok || !body.autoSync) {
      throw new Error(body.error ?? 'Jadwal sinkronisasi gagal disimpan.');
    }
    setSnapshot((current) =>
      current
        ? {
            ...current,
            digiflazz: { ...current.digiflazz, autoSync: body.autoSync },
          }
        : current,
    );
    return body.autoSync as AutoSyncSettings;
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    if (!snapshot) return;
    if (enabled) {
      setAutoSyncIntervalDays(snapshot.digiflazz.autoSync.intervalDays);
      setAutoSyncDialogError('');
      setIsAutoSyncDialogOpen(true);
      return;
    }
    setIsSavingAutoSync(true);
    try {
      await persistAutoSync(false, snapshot.digiflazz.autoSync.intervalDays);
      addToast('Sync otomatis dinonaktifkan', 'Sinkronisasi manual tetap tersedia.', 'success');
    } catch (error) {
      addToast(
        'Jadwal sync gagal diubah',
        error instanceof Error ? error.message : 'Silakan coba lagi.',
        'error',
      );
    } finally {
      setIsSavingAutoSync(false);
    }
  };

  const handleConfirmAutoSync = async () => {
    setIsSavingAutoSync(true);
    setAutoSyncDialogError('');
    try {
      await persistAutoSync(true, autoSyncIntervalDays);
      setIsAutoSyncDialogOpen(false);
      addToast(
        'Sync otomatis diaktifkan',
        `Produk dan harga akan disinkronkan setiap ${autoSyncIntervalDays} hari.`,
        'success',
      );
    } catch (error) {
      setAutoSyncDialogError(
        error instanceof Error ? error.message : 'Jadwal sync gagal disimpan.',
      );
    } finally {
      setIsSavingAutoSync(false);
    }
  };

  const handleQrislyQrUpload = async () => {
    if (!qrislyQrFile) return;
    setIsUploadingQrislyQr(true);
    try {
      const form = new FormData();
      form.set('name', qrislyName);
      form.set('file', qrislyQrFile);
      const response = await fetch('/api/admin/qrisly/upload-qr', {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (!response.ok || typeof body.qrisId !== 'string') {
        throw new Error(body.error ?? 'QR merchant gagal diunggah.');
      }
      setQrislyQrisId(body.qrisId);
      addToast(
        'QR merchant diunggah',
        'Simpan pengaturan Qrisly untuk menerapkan ID yang baru.',
        'success',
      );
    } catch (error) {
      addToast(
        'QR merchant gagal diunggah',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsUploadingQrislyQr(false);
    }
  };

  const canFetchDigiflazz = Boolean(
    snapshot &&
      snapshot.digiflazz.username.trim() &&
      snapshot.digiflazz.apiKey.configured &&
      digiflazzUsername === snapshot.digiflazz.username &&
      !digiflazzApiKey &&
    !savingSections.includes('digiflazz'),
  );

  const isWhatsAppActive = snapshot
    ? snapshot.whatsapp.provider === 'openwa'
    ? Boolean(
        snapshot.whatsapp.openwaApiUrl.trim() &&
        snapshot.whatsapp.openwaApiKey.configured &&
        snapshot.whatsapp.openwaSessionId.trim(),
      )
    : snapshot.whatsapp.fonnteToken.configured
    : false;
  const isDigiflazzActive = Boolean(
    snapshot &&
    snapshot.digiflazz.username.trim() &&
    snapshot.digiflazz.apiKey.configured &&
    (snapshot.digiflazz.mode !== 'production' ||
      snapshot.digiflazz.enableRealTransactions),
  );
  const isQrislyActive = Boolean(
    snapshot &&
    snapshot.qrisly.enabled &&
    snapshot.qrisly.apiKey.configured &&
    snapshot.qrisly.qrisId.trim(),
  );

  if (isLoading) {
    return (
      <p className="text-sm text-slate-500">
        {section === 'payments' ? 'Memuat pengaturan Qrisly…' : 'Memuat pengaturan integrasi…'}
      </p>
    );
  }
  if (!snapshot) {
    return null;
  }

  return (
    <div className="space-y-4">
      {section === 'integrations' && (
      <>
      <Card>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Database & penyimpanan</h3>
            <Badge variant="outline">SQLite lokal</Badge>
          </div>
          <p className="text-sm text-slate-600">
            Database dan unggahan aktif disimpan pada folder <code>.data</code>.
            Gunakan volume persisten dan backup rutin saat deploy dengan Docker.
          </p>
          <p className="text-xs text-slate-500">
            Neon, Cloudflare D1, dan R2 belum terhubung ke runtime aplikasi ini.
          </p>
        </div>
      </Card>
      <Card>
        <details className="group">
          <IntegrationSummary title="WhatsApp OTP" active={isWhatsAppActive} />
          <form
            onSubmit={handleSave('whatsapp')}
            className="space-y-5 border-t border-slate-200 p-5"
          >
            <p className="text-sm text-slate-500">
              Pilih provider OTP. Rahasia disimpan terenkripsi dan tidak pernah
              dikirim kembali ke browser.
            </p>
            <CardContent className="space-y-5 p-0">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="whatsapp-provider">Provider aktif</Label>
              <span className="text-xs text-slate-500">
                {sourceText(snapshot.whatsapp.providerSource)}
              </span>
            </div>
            <select
              id="whatsapp-provider"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              disabled={!snapshot.whatsapp.providerEditable}
            >
              <option value="fonnte">Fonnte</option>
              <option value="openwa">OpenWA</option>
            </select>
          </div>

          {provider === 'fonnte' ? (
            <SecretField
              id="fonnte-token"
              label="Fonnte API token"
              status={snapshot.whatsapp.fonnteToken}
              value={fonnteToken}
              onChange={setFonnteToken}
              clear={clearSettings.includes('fonnteToken')}
              onClearChange={(checked) => toggleClear('fonnteToken', checked)}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="openwa-url">OpenWA base URL</Label>
                  <span className="text-xs text-slate-500">
                    {sourceText(snapshot.whatsapp.openwaApiUrlSource)}
                  </span>
                </div>
                <Input
                  id="openwa-url"
                  type="url"
                  placeholder="http://localhost:2785"
                  value={openwaApiUrl}
                  onChange={(event) => setOpenwaApiUrl(event.target.value)}
                  disabled={!snapshot.whatsapp.openwaApiUrlEditable}
                />
              </div>
              <SecretField
                id="openwa-api-key"
                label="OpenWA API key"
                status={snapshot.whatsapp.openwaApiKey}
                value={openwaApiKey}
                onChange={setOpenwaApiKey}
                clear={clearSettings.includes('openwaApiKey')}
                onClearChange={(checked) => toggleClear('openwaApiKey', checked)}
              />
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="openwa-session-id">OpenWA session ID</Label>
                  <span className="text-xs text-slate-500">
                    {sourceText(snapshot.whatsapp.openwaSessionIdSource)}
                  </span>
                </div>
                <Input
                  id="openwa-session-id"
                  value={openwaSessionId}
                  onChange={(event) => setOpenwaSessionId(event.target.value)}
                  disabled={!snapshot.whatsapp.openwaSessionIdEditable}
                />
              </div>
            </div>
          )}
            </CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="submit" disabled={savingSections.includes('whatsapp')}>
                {savingSections.includes('whatsapp') ? 'Menyimpan…' : 'Simpan WhatsApp OTP'}
              </Button>
            </div>
          </form>
        </details>
      </Card>

      <Card>
        <details className="group">
          <IntegrationSummary title="Digiflazz" active={isDigiflazzActive} />
          <form
            onSubmit={handleSave('digiflazz')}
            className="space-y-5 border-t border-slate-200 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                Isi kredensial untuk mode terpilih, lalu ambil daftar produk langsung dari Digiflazz.
              </p>
            <Badge variant={digiflazzMode === 'production' ? 'warning' : 'outline'}>
              {digiflazzMode === 'production' ? 'PRODUKSI' : 'SANDBOX'}
            </Badge>
          </div>
        <CardContent className="space-y-4 p-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="digiflazz-username">Username</Label>
                <span className="text-xs text-slate-500">
                  {sourceText(snapshot.digiflazz.usernameSource)}
                </span>
              </div>
              <Input
                id="digiflazz-username"
                autoComplete="off"
                value={digiflazzUsername}
                onChange={(event) => setDigiflazzUsername(event.target.value)}
                disabled={!snapshot.digiflazz.usernameEditable}
              />
            </div>
            <SecretField
              id="digiflazz-api-key"
              label={`API key ${digiflazzMode === 'production' ? 'produksi' : 'development'}`}
              status={snapshot.digiflazz.apiKey}
              value={digiflazzApiKey}
              onChange={setDigiflazzApiKey}
              clear={clearSettings.includes('digiflazzApiKey')}
              onClearChange={(checked) =>
                toggleClear('digiflazzApiKey', checked)
              }
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="digiflazz-mode">Mode</Label>
                <span className="text-xs text-slate-500">
                  {sourceText(snapshot.digiflazz.modeSource)}
                </span>
              </div>
              <select
                id="digiflazz-mode"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={digiflazzMode}
                onChange={(event) => setDigiflazzMode(event.target.value)}
                disabled={!snapshot.digiflazz.modeEditable}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Produksi</option>
              </select>
              <p className="text-xs text-slate-500">
                Gunakan API key yang sesuai dengan mode. Cukup simpan key untuk mode aktif; ganti key saat berpindah mode.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <input
              type="checkbox"
              className="mt-1"
              checked={enableRealTransactions}
              onChange={(event) =>
                setEnableRealTransactions(event.target.checked)
              }
              disabled={!snapshot.digiflazz.enableRealTransactionsEditable}
            />
            <span>
              <span className="block font-medium">Izinkan transaksi produksi</span>
              <span className="mt-0.5 block text-xs">
                Pesanan dapat memicu transaksi vendor nyata.
              </span>
              <span className="mt-1 block text-xs text-slate-600">
                {sourceText(snapshot.digiflazz.enableRealTransactionsSource)}
              </span>
            </span>
          </label>

          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold">Daftar produk Digiflazz</h4>
              <p className="mt-1 text-xs text-slate-500">
                Sinkronkan produk prepaid dari Digiflazz ke database. Produk baru masuk nonaktif agar dapat diatur sebelum dijual.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleDigiflazzPriceList}
              disabled={isLoadingPriceList || !canFetchDigiflazz}
            >
              {isLoadingPriceList ? 'Menyinkronkan…' : 'Sinkronkan produk'}
            </Button>
            {!canFetchDigiflazz && (
              <p className="text-xs text-amber-700">
                Simpan username dan API key untuk mode terpilih terlebih dahulu.
              </p>
            )}
            {priceListData && (
              <div role="status" className="space-y-2">
                <p className="text-sm font-medium">
                  {priceListData.synced} dari {priceListData.total} produk tersinkron.
                </p>
                <p className="text-xs text-slate-500">
                  Baru: {priceListData.created} · Diperbarui: {priceListData.updated} · Dilewati: {priceListData.skipped}
                </p>
              </div>
            )}
          </div>
          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={snapshot.digiflazz.autoSync.enabled}
                  onChange={(event) => void handleAutoSyncToggle(event.target.checked)}
                  disabled={
                    isSavingAutoSync ||
                    !snapshot.digiflazz.autoSync.enabledEditable ||
                    !snapshot.digiflazz.autoSync.intervalEditable
                  }
                />
                <span>
                  <span className="block font-medium">Sync produk otomatis</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Memperbarui produk, harga jual, dan harga Member dari Digiflazz.
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {sourceText(snapshot.digiflazz.autoSync.enabledSource)}
                  </span>
                </span>
              </label>
              {snapshot.digiflazz.autoSync.enabled &&
                snapshot.digiflazz.autoSync.intervalEditable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAutoSyncIntervalDays(snapshot.digiflazz.autoSync.intervalDays);
                      setAutoSyncDialogError('');
                      setIsAutoSyncDialogOpen(true);
                    }}
                    disabled={isSavingAutoSync}
                  >
                    Ubah interval
                  </Button>
                )}
            </div>
            <p className="text-xs text-slate-600">
              {snapshot.digiflazz.autoSync.enabled
                ? `Berjalan setiap ${snapshot.digiflazz.autoSync.intervalDays} hari. Sync berikutnya: ${formatSyncDate(snapshot.digiflazz.autoSync.nextRunAt)}.`
                : 'Jadwal nonaktif. Sync manual tetap tersedia.'}
            </p>
            <p className="text-xs text-slate-500">
              Sync terakhir: {formatSyncDate(snapshot.digiflazz.autoSync.lastRunAt)}
              {snapshot.digiflazz.autoSync.lastStatus &&
                ` · Status: ${
                  snapshot.digiflazz.autoSync.lastStatus === 'success'
                    ? 'berhasil'
                    : snapshot.digiflazz.autoSync.lastStatus === 'failed'
                      ? 'gagal'
                      : snapshot.digiflazz.autoSync.lastStatus
                }`}
            </p>
            {snapshot.digiflazz.autoSync.lastResult && (
              <p className="text-xs text-slate-500">
                {snapshot.digiflazz.autoSync.lastResult.synced} tersinkron ·{' '}
                {snapshot.digiflazz.autoSync.lastResult.created} baru ·{' '}
                {snapshot.digiflazz.autoSync.lastResult.updated} diperbarui ·{' '}
                {snapshot.digiflazz.autoSync.lastResult.skipped} dilewati
              </p>
            )}
            {snapshot.digiflazz.autoSync.lastError && (
              <p role="status" className="text-xs text-rose-700">
                Sync terakhir gagal: {snapshot.digiflazz.autoSync.lastError}
              </p>
            )}
          </div>
        </CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={savingSections.includes('digiflazz')}>
            {savingSections.includes('digiflazz') ? 'Menyimpan…' : 'Simpan Digiflazz'}
          </Button>
        </div>
          </form>
        </details>
      </Card>
      <Dialog
        open={isAutoSyncDialogOpen}
        onOpenChange={(open) => {
          if (!isSavingAutoSync) setIsAutoSyncDialogOpen(open);
        }}
      >
        <DialogContent role="dialog" aria-modal="true">
          <DialogHeader>
            <DialogTitle>Konfirmasi jadwal sync otomatis</DialogTitle>
            <DialogDescription>
              Pilih frekuensi pembaruan produk dan harga Digiflazz, termasuk harga Member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="digiflazz-auto-sync-interval">Sinkronkan setiap</Label>
            <select
              id="digiflazz-auto-sync-interval"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={autoSyncIntervalDays}
              onChange={(event) =>
                setAutoSyncIntervalDays(Number(event.target.value) as 7 | 14 | 30)
              }
            >
              <option value={7}>7 hari</option>
              <option value={14}>14 hari</option>
              <option value={30}>30 hari</option>
            </select>
            {autoSyncDialogError && (
              <p role="alert" className="text-sm text-rose-700">
                {autoSyncDialogError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAutoSyncDialogOpen(false)}
              disabled={isSavingAutoSync}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmAutoSync()}
              disabled={isSavingAutoSync}
            >
              {isSavingAutoSync ? 'Menyimpan…' : 'Konfirmasi jadwal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}

      {section === 'payments' && (
      <Card>
        <details className="group">
          <IntegrationSummary
            title="Qrisly QRIS otomatis"
            active={isQrislyActive}
          />
          <form
            onSubmit={handleSave('qrisly')}
            className="space-y-5 border-t border-slate-200 p-5"
          >
            <p className="text-sm text-slate-500">
              Pembayaran dipastikan melalui polling server Qrisly dan nominalnya
              harus cocok. Webhook tetap nonaktif sampai autentikasinya
              diverifikasi.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="active-payment-gateway">Gateway pembayaran online untuk checkout</Label>
              <span className="block text-xs text-slate-500">
                Pilih satu gateway aktif. DOKU, Midtrans, dan Xendit belum tersedia untuk transaksi.
              </span>
              <select
                id="active-payment-gateway"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={activePaymentGateway}
                onChange={(event) => setActivePaymentGateway(event.target.value)}
                disabled={!snapshot.qrisly.activePaymentGatewayEditable}
              >
                <option value="none">Tidak ada (checkout online nonaktif)</option>
                <option value="qrisly">Qrisly</option>
                <option value="doku" disabled>DOKU (belum tersedia)</option>
                <option value="midtrans" disabled>Midtrans (belum tersedia)</option>
                <option value="xendit" disabled>Xendit (belum tersedia)</option>
              </select>
              <p className="text-xs text-slate-500">
                {sourceText(snapshot.qrisly.activePaymentGatewaySource)}
              </p>
            </div>
            <CardContent className="space-y-5 p-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <SecretField
              id="qrisly-api-key"
              label="Qrisly API key"
              status={snapshot.qrisly.apiKey}
              value={qrislyApiKey}
              onChange={setQrislyApiKey}
              clear={clearSettings.includes('qrislyApiKey')}
              onClearChange={(checked) => toggleClear('qrislyApiKey', checked)}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="qrisly-id">QR merchant ID</Label>
                <span className="text-xs text-slate-500">{sourceText(snapshot.qrisly.qrisIdSource)}</span>
              </div>
              <Input
                id="qrisly-id"
                value={qrislyQrisId}
                onChange={(event) => setQrislyQrisId(event.target.value)}
                maxLength={200}
                disabled={!snapshot.qrisly.qrisIdEditable}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qrisly-mode">Mode Qrisly</Label>
              <span className="block text-xs text-slate-500">{sourceText(snapshot.qrisly.modeSource)}</span>
              <select
                id="qrisly-mode"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={qrislyMode}
                onChange={(event) => setQrislyMode(event.target.value)}
                disabled={!snapshot.qrisly.modeEditable}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Produksi</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={qrislyEnabled}
                onChange={(event) => setQrislyEnabled(event.target.checked)}
                disabled={!snapshot.qrisly.enabledEditable}
              />
              Aktifkan Qrisly untuk deposit
            </label>
            <p className="text-xs text-slate-500">{sourceText(snapshot.qrisly.enabledSource)}</p>
          </div>
          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold">Unggah QR merchant ke Qrisly</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="qrisly-qr-name">Nama QR</Label>
                <Input id="qrisly-qr-name" value={qrislyName} onChange={(event) => setQrislyName(event.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qrisly-qr-file">Gambar QR (JPG/PNG/WebP, maks. 5 MB)</Label>
                <Input id="qrisly-qr-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setQrislyQrFile(event.target.files?.[0] ?? null)} />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleQrislyQrUpload}
              disabled={!qrislyQrFile || !qrislyName.trim() || !snapshot.qrisly.apiKey.configured || isUploadingQrislyQr}
            >
              {isUploadingQrislyQr ? 'Mengunggah…' : 'Unggah QR merchant'}
            </Button>
            </div>
            </CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="submit" disabled={savingSections.includes('qrisly')}>
                {savingSections.includes('qrisly') ? 'Menyimpan…' : 'Simpan Qrisly'}
              </Button>
            </div>
          </form>
        </details>
      </Card>
      )}

      {section === 'integrations' && (
        <p className="text-xs text-slate-500">
          Nilai environment server selalu mengalahkan nilai dashboard. Database
          menyimpan rahasia dengan enkripsi AES-256-GCM yang kuncinya diturunkan
          dari BETTER_AUTH_SECRET; jaga dan pertahankan secret tersebut agar
          konfigurasi tersimpan tetap dapat dibaca.
        </p>
      )}
    </div>
  );
}
