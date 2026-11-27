'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChevronDown } from 'lucide-react';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { LoadingState } from '@/components/ui/crystal-loader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePPOB } from '@/context/PPOBContext';
import {
  vendorStatus,
  vendorStatusLabel,
  type VendorStatus,
} from '@/lib/vendor-registry';

type IntegrationSection = 'whatsapp' | 'digiflazz' | 'tokovoucher' | 'qrisly';

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
    enabled: boolean;
    enabledSource: SettingStatus['source'];
    enabledEditable: boolean;
    showProducts: boolean;
    showProductsSource: SettingStatus['source'];
    showProductsEditable: boolean;
    webhookSecret: SettingStatus;
    webhookUrl: string;
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
  tokovoucher: {
    memberCode: string;
    memberCodeSource: SettingStatus['source'];
    memberCodeEditable: boolean;
    secret: SettingStatus;
    defaultSignature: SettingStatus;
    mode: string;
    modeSource: SettingStatus['source'];
    modeEditable: boolean;
    enableRealTransactions: boolean;
    enableRealTransactionsSource: SettingStatus['source'];
    enableRealTransactionsEditable: boolean;
    enabled: boolean;
    enabledSource: SettingStatus['source'];
    enabledEditable: boolean;
    showProducts: boolean;
    showProductsSource: SettingStatus['source'];
    showProductsEditable: boolean;
    webhookUrl: string;
    autoSync: AutoSyncSettings;
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
    'digiflazzEnabled',
    'digiflazzWebhookSecret',
  ],
  qrisly: [
    'qrislyApiKey',
    'qrislyQrisId',
    'qrislyMode',
    'qrislyEnabled',
    'activePaymentGateway',
  ],
  tokovoucher: [
    'tokovoucherMemberCode',
    'tokovoucherSecret',
    'tokovoucherDefaultSignature',
    'tokovoucherMode',
    'tokovoucherEnableRealTransactions',
    'tokovoucherEnabled',
  ],
};

function IntegrationSummary({
  title,
  status,
  actions,
}: {
  title: string;
  status: VendorStatus;
  // Rendered inside the summary so the switches stay reachable while the
  // accordion is collapsed. Clicks are stopped so they never open or close it.
  actions?: React.ReactNode;
}) {
  const tone = status === 'active'
    ? 'rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
    : status === 'disabled'
      ? 'rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800'
      : 'rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600';
  return (
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
      <span className="font-semibold">{title}</span>
      <span className="flex items-center gap-3">
        {actions && (
          <span
            className="flex items-center gap-3"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
            }}
          >
            {actions}
          </span>
        )}
        <span className={tone}>{vendorStatusLabel(status)}</span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180"
        />
      </span>
    </summary>
  );
}

function WebhookField({
  id,
  url,
  headerHint,
  copied,
  onCopy,
}: {
  id: string;
  url: string;
  headerHint: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>URL webhook</Label>
      <div className="flex gap-2">
        <Input id={id} value={url} readOnly className="font-mono text-xs" />
        <Button type="button" variant="outline" className="shrink-0" onClick={onCopy}>
          {copied ? 'Tersalin' : 'Salin'}
        </Button>
      </div>
      <p className="text-xs text-slate-500">{headerHint}</p>
    </div>
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
  onGenerate,
  generating,
}: {
  id: string;
  label: string;
  status: SettingStatus;
  value: string;
  onChange: (value: string) => void;
  clear: boolean;
  onClearChange: (checked: boolean) => void;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(false);

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
        <div className="flex flex-wrap gap-2">
          {value && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(value);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Tersalin' : 'Salin nilai'}
            </Button>
          )}
          {onGenerate && status.editable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={generating}
              onClick={onGenerate}
            >
              {generating
                ? 'Membuat…'
                : status.configured ? 'Regenerate' : 'Generate'}
            </Button>
          )}
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
  const [tokovoucherMemberCode, setTokovoucherMemberCode] = useState('');
  const [tokovoucherSecret, setTokovoucherSecret] = useState('');
  const [tokovoucherDefaultSignature, setTokovoucherDefaultSignature] = useState('');
  const [tokovoucherMode, setTokovoucherMode] = useState('sandbox');
  const [tokovoucherRealTransactions, setTokovoucherRealTransactions] = useState(false);
  const [tokovoucherAutoSyncInterval, setTokovoucherAutoSyncInterval] = useState<7 | 14 | 30>(7);
  const [digiflazzEnabled, setDigiflazzEnabled] = useState(true);
  const [digiflazzShowProducts, setDigiflazzShowProducts] = useState(true);
  const [digiflazzWebhookSecret, setDigiflazzWebhookSecret] = useState('');
  const [tokovoucherEnabled, setTokovoucherEnabled] = useState(false);
  const [tokovoucherShowProducts, setTokovoucherShowProducts] = useState(true);
  const [pendingDisable, setPendingDisable] = useState<IntegrationSection | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);
  const [tokovoucherPriceList, setTokovoucherPriceList] = useState<{
    total: number;
    synced: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [isLoadingTokoVoucherPriceList, setIsLoadingTokoVoucherPriceList] = useState(false);
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

  // Re-reads the snapshot after a server-side change, so the status badges and
  // the "configured" labels reflect the new secret immediately.
  const refreshSnapshot = async () => {
    const response = await fetch('/api/admin/settings', { cache: 'no-store' });
    if (!response.ok) return;
    setSnapshot((await response.json()) as SettingsSnapshot);
  };

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
        setTokovoucherMemberCode(body.tokovoucher.memberCode);
        setTokovoucherMode(body.tokovoucher.mode || 'sandbox');
        setTokovoucherRealTransactions(body.tokovoucher.enableRealTransactions);
        setTokovoucherAutoSyncInterval(body.tokovoucher.autoSync.intervalDays);
        setDigiflazzEnabled(body.digiflazz.enabled);
        setDigiflazzShowProducts(body.digiflazz.showProducts);
        setTokovoucherEnabled(body.tokovoucher.enabled);
        setTokovoucherShowProducts(body.tokovoucher.showProducts);
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

  // A generated secret is returned once. Stored targets are saved immediately;
  // the auth secret only comes back for the admin to paste into .env.
  const [generatingSecret, setGeneratingSecret] = useState<string | null>(null);
  const generateSecretFor = async (target: string) => {
    setGeneratingSecret(target);
    try {
      const response = await fetch('/api/admin/integration-secrets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const body = await response.json() as { value?: string; saved?: boolean; error?: string };
      if (!response.ok || typeof body.value !== 'string') {
        throw new Error(body.error ?? 'Secret baru tidak dapat dibuat.');
      }
      if (body.saved) {
        await refreshSnapshot();
        addToast(
          'Secret baru aktif',
          'Tempel nilai ini ke panel vendor sekarang; nilainya tidak ditampilkan lagi.',
          'success',
        );
      } else {
        addToast(
          'Secret dibuat',
          'Salin ke BETTER_AUTH_SECRET di .env lalu jalankan ulang container. Semua sesi akan logout.',
          'warning',
        );
      }
      return body.value;
    } catch (error) {
      addToast(
        'Secret gagal dibuat',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
      return null;
    } finally {
      setGeneratingSecret(null);
    }
  };

  // The header switches sit outside the form, so "Tampil" has to save itself
  // instead of waiting for the Simpan button inside the collapsed card.
  const persistShowProducts = async (
    vendor: 'digiflazz' | 'tokovoucher',
    value: boolean,
  ) => {
    const name = vendor === 'digiflazz' ? 'digiflazzShowProducts' : 'tokovoucherShowProducts';
    if (vendor === 'digiflazz') setDigiflazzShowProducts(value);
    else setTokovoucherShowProducts(value);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: { [name]: String(value) } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Preferensi tampil gagal disimpan.');
      addToast(
        value ? 'Produk ditampilkan' : 'Produk disembunyikan',
        value
          ? 'Produk vendor ini muncul lagi di daftar produk dashboard.'
          : 'Produk vendor ini disembunyikan dari daftar produk dashboard.',
        'success',
      );
    } catch (error) {
      if (vendor === 'digiflazz') setDigiflazzShowProducts(!value);
      else setTokovoucherShowProducts(!value);
      addToast(
        'Preferensi gagal disimpan',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    }
  };

  const copyWebhookUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedWebhook(url);
      window.setTimeout(() => setCopiedWebhook((current) => current === url ? null : current), 2000);
    } catch {
      addToast(
        'Clipboard ditolak',
        'Browser menolak akses clipboard. Salin URL-nya manual.',
        'warning',
      );
    }
  };

  // Switching a vendor off stops new orders, so it asks first. Turning it on is
  // harmless and applies immediately.
  const requestVendorToggle = (section: 'digiflazz' | 'tokovoucher', next: boolean) => {
    if (!next) {
      setPendingDisable(section);
      return;
    }
    if (section === 'digiflazz') {
      setDigiflazzEnabled(true);
      void persistVendorEnabled('digiflazz', true);
    } else {
      setTokovoucherEnabled(true);
      void persistVendorEnabled('tokovoucher', true);
    }
  };

  // Header switches live outside the form, so "Aktif" also saves on its own.
  const persistVendorEnabled = async (
    vendor: 'digiflazz' | 'tokovoucher',
    value: boolean,
  ) => {
    const name = vendor === 'digiflazz' ? 'digiflazzEnabled' : 'tokovoucherEnabled';
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: { [name]: String(value) } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Status vendor gagal disimpan.');
      await refreshSnapshot();
      addToast(
        value ? 'Vendor diaktifkan' : 'Vendor dinonaktifkan',
        value
          ? 'Pesanan baru ke vendor ini diterima lagi.'
          : 'Pesanan baru ditolak; pesanan berjalan tetap diselesaikan.',
        'success',
      );
    } catch (error) {
      if (vendor === 'digiflazz') setDigiflazzEnabled(!value);
      else setTokovoucherEnabled(!value);
      addToast(
        'Status vendor gagal disimpan',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    }
  };

  const confirmVendorDisable = () => {
    if (pendingDisable === 'digiflazz') {
      setDigiflazzEnabled(false);
      void persistVendorEnabled('digiflazz', false);
    }
    if (pendingDisable === 'tokovoucher') {
      setTokovoucherEnabled(false);
      void persistVendorEnabled('tokovoucher', false);
    }
    setPendingDisable(null);
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
      if (snapshot.digiflazz.enabledEditable) {
        values.digiflazzEnabled = String(digiflazzEnabled);
      }
      if (snapshot.digiflazz.showProductsEditable) {
        values.digiflazzShowProducts = String(digiflazzShowProducts);
      }
      if (digiflazzWebhookSecret) {
        values.digiflazzWebhookSecret = digiflazzWebhookSecret;
      }
    } else if (section === 'tokovoucher') {
      if (snapshot.tokovoucher.memberCodeEditable) {
        values.tokovoucherMemberCode = tokovoucherMemberCode;
      }
      if (tokovoucherSecret) values.tokovoucherSecret = tokovoucherSecret;
      if (tokovoucherDefaultSignature) {
        values.tokovoucherDefaultSignature = tokovoucherDefaultSignature;
      }
      if (snapshot.tokovoucher.modeEditable) values.tokovoucherMode = tokovoucherMode;
      if (snapshot.tokovoucher.enableRealTransactionsEditable) {
        values.tokovoucherEnableRealTransactions = String(tokovoucherRealTransactions);
      }
      if (snapshot.tokovoucher.enabledEditable) {
        values.tokovoucherEnabled = String(tokovoucherEnabled);
      }
      if (snapshot.tokovoucher.showProductsEditable) {
        values.tokovoucherShowProducts = String(tokovoucherShowProducts);
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
        setDigiflazzWebhookSecret('');
      } else if (section === 'tokovoucher') {
        setTokovoucherSecret('');
        setTokovoucherDefaultSignature('');
      } else {
        setQrislyApiKey('');
      }
      const sectionLabel = section === 'whatsapp'
        ? 'WhatsApp OTP'
        : section === 'digiflazz'
          ? 'Digiflazz'
          : section === 'tokovoucher'
            ? 'TokoVoucher'
            : 'Qrisly';
      addToast(
        'Pengaturan tersimpan',
        `${sectionLabel} berhasil diperbarui.`,
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

  const handleTokoVoucherPriceList = async () => {
    setIsLoadingTokoVoucherPriceList(true);
    setTokovoucherPriceList(null);
    try {
      const response = await fetch('/api/admin/tokovoucher/price-list', {
        method: 'POST',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail ?? body.error ?? 'Daftar produk TokoVoucher gagal dimuat.');
      }
      const result = body as {
        total: number;
        synced: number;
        created: number;
        updated: number;
        skipped: number;
      };
      setTokovoucherPriceList(result);
      addToast(
        'Produk TokoVoucher tersinkron',
        `${result.created} produk baru, ${result.updated} diperbarui, ${result.skipped} dilewati. Produk baru berstatus nonaktif sampai Anda mengaktifkannya.`,
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
        'Daftar produk gagal dimuat',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsLoadingTokoVoucherPriceList(false);
    }
  };

  const persistTokoVoucherAutoSync = async (
    enabled: boolean,
    intervalDays: 7 | 14 | 30,
  ) => {
    try {
      const response = await fetch('/api/admin/tokovoucher/auto-sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, intervalDays }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Jadwal sync TokoVoucher tidak dapat disimpan.');
      }
      setSnapshot((current) => current
        ? { ...current, tokovoucher: { ...current.tokovoucher, autoSync: body.autoSync } }
        : current);
      addToast(
        enabled ? 'Auto sync aktif' : 'Auto sync nonaktif',
        enabled
          ? `Produk akan disinkronkan setiap ${intervalDays} hari.`
          : 'Produk hanya disinkronkan saat Anda menekan tombol.',
        'success',
      );
    } catch (error) {
      addToast(
        'Jadwal sync gagal disimpan',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
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
  const isQrislyActive = Boolean(
    snapshot &&
    snapshot.qrisly.enabled &&
    snapshot.qrisly.apiKey.configured &&
    snapshot.qrisly.qrisId.trim(),
  );
  const isTokoVoucherActive = Boolean(
    snapshot &&
    snapshot.tokovoucher.memberCode.trim() &&
    snapshot.tokovoucher.secret.configured &&
    (snapshot.tokovoucher.mode !== 'production' ||
      snapshot.tokovoucher.enableRealTransactions),
  );
  const digiflazzStatus = vendorStatus({
    enabled: snapshot?.digiflazz.enabled ?? true,
    configured: Boolean(
      snapshot?.digiflazz.username.trim() &&
      snapshot?.digiflazz.apiKey.configured &&
      (snapshot.digiflazz.mode !== 'production' ||
        snapshot.digiflazz.enableRealTransactions),
    ),
  });
  const tokoVoucherStatus = vendorStatus({
    enabled: snapshot?.tokovoucher.enabled ?? false,
    configured: isTokoVoucherActive,
  });

  if (isLoading) {
    return (
      <LoadingState
        message={section === 'payments' ? 'Memuat pengaturan Qrisly…' : 'Memuat pengaturan integrasi…'}

      />
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
        <div className="space-y-2 p-5">
          <h3 className="font-semibold text-slate-900">Webhook H2H</h3>
          <p className="text-sm text-slate-600">
            Satu aplikasi melayani dua endpoint webhook. Masing-masing punya
            autentikasinya sendiri, jadi Digiflazz dan TokoVoucher bisa aktif bersamaan
            tanpa saling mengganggu.
          </p>
          <ul className="space-y-1 text-xs text-slate-500">
            <li>
              <code className="font-mono">/api/digiflazz/webhook</code> — HMAC-SHA1 di
              header <code className="font-mono">X-Hub-Signature</code>
            </li>
            <li>
              <code className="font-mono">/api/tokovoucher/webhook</code> — token di header{' '}
              <code className="font-mono">X-TokoVoucher-Authorization</code>
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            Keduanya idempoten: event ganda diabaikan lewat tabel webhook_events, dan
            status akhir selalu dibaca ulang dari vendor, bukan dari isi body.
          </p>
        </div>
      </Card>
      <Card>
        <details className="group">
          <IntegrationSummary
            title="WhatsApp OTP"
            status={vendorStatus({ enabled: true, configured: isWhatsAppActive })}
          />
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
          <IntegrationSummary
            title="Digiflazz"
            status={digiflazzStatus}
            actions={
              <>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <span>Aktif</span>
                  <Switch
                    checked={digiflazzEnabled}
                    disabled={!snapshot.digiflazz.enabledEditable}
                    onCheckedChange={(value) => requestVendorToggle('digiflazz', value)}
                    aria-label="Aktifkan vendor Digiflazz"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <span>Tampil</span>
                  <Switch
                    checked={digiflazzShowProducts}
                    disabled={!snapshot.digiflazz.showProductsEditable}
                    onCheckedChange={(value) => void persistShowProducts('digiflazz', value)}
                    aria-label="Tampilkan produk Digiflazz di dashboard"
                  />
                </label>
              </>
            }
          />
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

          <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div>
              <p className="font-medium">Izinkan transaksi produksi</p>
              <p className="mt-0.5 text-xs">Pesanan dapat memicu transaksi vendor nyata.</p>
              <p className="mt-1 text-xs text-slate-600">
                {sourceText(snapshot.digiflazz.enableRealTransactionsSource)}
              </p>
            </div>
            <Switch
              checked={enableRealTransactions}
              onCheckedChange={setEnableRealTransactions}
              disabled={!snapshot.digiflazz.enableRealTransactionsEditable}
              aria-label="Izinkan transaksi produksi Digiflazz"
            />
          </div>

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
              <div className="text-sm">
                <p className="font-medium">Sync produk otomatis</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Memperbarui produk, harga jual, dan harga Member dari Digiflazz.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {sourceText(snapshot.digiflazz.autoSync.enabledSource)}
                </p>
              </div>
              <Switch
                checked={snapshot.digiflazz.autoSync.enabled}
                onCheckedChange={(value) => void handleAutoSyncToggle(value)}
                disabled={
                  isSavingAutoSync ||
                  !snapshot.digiflazz.autoSync.enabledEditable ||
                  !snapshot.digiflazz.autoSync.intervalEditable
                }
                aria-label="Sync produk otomatis Digiflazz"
              />
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
        <CardContent className="space-y-4 p-0">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-800">Aktifkan vendor</p>
            <p className="text-xs text-slate-500">
              Saat dimatikan, pesanan baru ditolak. Pesanan yang sudah berjalan tetap
              diselesaikan. Sakelarnya ada di judul kartu ini.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-800">Tampilkan produk di dashboard</p>
            <p className="text-xs text-slate-500">
              Mematikan ini hanya menyembunyikan produk Digiflazz dari daftar produk di
              dashboard. Katalog toko dan pesanan tidak terpengaruh.
            </p>
          </div>
          <WebhookField
            id="digiflazz-webhook"
            url={snapshot.digiflazz.webhookUrl}
            headerHint="Header: X-Hub-Signature (HMAC-SHA1 dari body)"
            copied={copiedWebhook === snapshot.digiflazz.webhookUrl}
            onCopy={() => void copyWebhookUrl(snapshot.digiflazz.webhookUrl)}
          />
          <SecretField
            id="digiflazz-webhook-secret"
            label="Webhook secret"
            status={snapshot.digiflazz.webhookSecret}
            value={digiflazzWebhookSecret}
            onChange={setDigiflazzWebhookSecret}
            clear={clearSettings.includes('digiflazzWebhookSecret')}
            onClearChange={(checked) => toggleClear('digiflazzWebhookSecret', checked)}
            generating={generatingSecret === 'digiflazzWebhookSecret'}
            onGenerate={async () => {
              const value = await generateSecretFor('digiflazzWebhookSecret');
              if (value) setDigiflazzWebhookSecret(value);
            }}
          />
        </CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={savingSections.includes('digiflazz')}>
            {savingSections.includes('digiflazz') ? 'Menyimpan…' : 'Simpan Digiflazz'}
          </Button>
        </div>
          </form>
        </details>
      </Card>

      <Card>
        <details className="group">
          <IntegrationSummary
            title="TokoVoucher"
            status={tokoVoucherStatus}
            actions={
              <>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <span>Aktif</span>
                  <Switch
                    checked={tokovoucherEnabled}
                    disabled={!snapshot.tokovoucher.enabledEditable}
                    onCheckedChange={(value) => requestVendorToggle('tokovoucher', value)}
                    aria-label="Aktifkan vendor TokoVoucher"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <span>Tampil</span>
                  <Switch
                    checked={tokovoucherShowProducts}
                    disabled={!snapshot.tokovoucher.showProductsEditable}
                    onCheckedChange={(value) => void persistShowProducts('tokovoucher', value)}
                    aria-label="Tampilkan produk TokoVoucher di dashboard"
                  />
                </label>
              </>
            }
          />
          <form
            onSubmit={handleSave('tokovoucher')}
            className="space-y-5 border-t border-slate-200 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                Mitra H2H kedua. Ambil kredensial di Member Area TokoVoucher, lalu sinkronkan
                produk secara manual. Produk baru selalu masuk sebagai nonaktif.
              </p>
              <Badge variant={tokovoucherMode === 'production' ? 'warning' : 'outline'}>
                {tokovoucherMode === 'production' ? 'PRODUKSI' : 'SANDBOX'}
              </Badge>
            </div>
            <CardContent className="space-y-5 p-0">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tokovoucher-member-code">Member code</Label>
                  <span className="text-xs text-slate-500">
                    {sourceText(snapshot.tokovoucher.memberCodeSource)}
                  </span>
                </div>
                <Input
                  id="tokovoucher-member-code"
                  value={tokovoucherMemberCode}
                  onChange={(event) => setTokovoucherMemberCode(event.target.value)}
                  disabled={!snapshot.tokovoucher.memberCodeEditable}
                  placeholder="MEMBER20220801UAXH95"
                  autoComplete="off"
                />
              </div>
              <SecretField
                id="tokovoucher-secret"
                label="Secret key"
                status={snapshot.tokovoucher.secret}
                value={tokovoucherSecret}
                onChange={setTokovoucherSecret}
                clear={clearSettings.includes('tokovoucherSecret')}
                onClearChange={(checked) => toggleClear('tokovoucherSecret', checked)}
              />
              <SecretField
                id="tokovoucher-default-signature"
                label="Signature default"
                status={snapshot.tokovoucher.defaultSignature}
                value={tokovoucherDefaultSignature}
                onChange={setTokovoucherDefaultSignature}
                clear={clearSettings.includes('tokovoucherDefaultSignature')}
                onClearChange={(checked) =>
                  toggleClear('tokovoucherDefaultSignature', checked)
                }
              />
              <p className="text-xs text-slate-500">
                Signature default dipakai endpoint /member dan /member/produk/full.
                Transaksi memakai md5(member code:secret:ref id) yang dihitung server.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tokovoucher-mode">Mode</Label>
                    <span className="text-xs text-slate-500">
                      {sourceText(snapshot.tokovoucher.modeSource)}
                    </span>
                  </div>
                  <select
                    id="tokovoucher-mode"
                    value={tokovoucherMode}
                    onChange={(event) => setTokovoucherMode(event.target.value)}
                    disabled={!snapshot.tokovoucher.modeEditable}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <option value="sandbox">Sandbox</option>
                    <option value="production">Produksi</option>
                  </select>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-2 text-sm text-slate-700">
                  <span>Izinkan transaksi nyata</span>
                  <Switch
                    checked={tokovoucherRealTransactions}
                    disabled={!snapshot.tokovoucher.enableRealTransactionsEditable}
                    onCheckedChange={setTokovoucherRealTransactions}
                    aria-label="Izinkan transaksi nyata TokoVoucher"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Sakelar ini terpisah dari Digiflazz. Mengaktifkan salah satu tidak
                mengaktifkan yang lain.
              </p>
            </CardContent>
            <CardContent className="space-y-4 p-0">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-800">Aktifkan vendor</p>
            <p className="text-xs text-slate-500">
              Saat dimatikan, pesanan baru ditolak. Pesanan yang sudah berjalan tetap
              diselesaikan. Sakelarnya ada di judul kartu ini.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-800">Tampilkan produk di dashboard</p>
            <p className="text-xs text-slate-500">
              Mematikan ini hanya menyembunyikan produk TokoVoucher dari daftar produk di
              dashboard. Katalog toko dan pesanan tidak terpengaruh.
            </p>
          </div>
          <WebhookField
            id="tokovoucher-webhook"
            url={snapshot.tokovoucher.webhookUrl}
            headerHint="Header: X-TokoVoucher-Authorization (MD5 member_code:secret:ref_id)"
            copied={copiedWebhook === snapshot.tokovoucher.webhookUrl}
            onCopy={() => void copyWebhookUrl(snapshot.tokovoucher.webhookUrl)}
          />
        </CardContent>
        <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingTokoVoucherPriceList || savingSections.includes('tokovoucher')}
                onClick={() => void handleTokoVoucherPriceList()}
              >
                {isLoadingTokoVoucherPriceList ? 'Menyinkronkan?' : 'Ambil & sinkronkan produk'}
              </Button>
              <Button type="submit" disabled={savingSections.includes('tokovoucher')}>
                {savingSections.includes('tokovoucher') ? 'Menyimpan?' : 'Simpan TokoVoucher'}
              </Button>
            </div>
            {tokovoucherPriceList && (
              <p role="status" className="text-xs text-emerald-700">
                {tokovoucherPriceList.created} produk baru, {tokovoucherPriceList.updated}{' '}
                diperbarui, {tokovoucherPriceList.skipped} dilewati.
              </p>
            )}
            <CardContent className="space-y-3 p-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">Sync otomatis</p>
                <Switch
                  checked={snapshot.tokovoucher.autoSync.enabled}
                  disabled={!snapshot.tokovoucher.autoSync.enabledEditable}
                  onCheckedChange={(value) =>
                    void persistTokoVoucherAutoSync(value, tokovoucherAutoSyncInterval)
                  }
                  aria-label="Sync otomatis TokoVoucher"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tokovoucher-sync-interval">Sinkronkan setiap</Label>
                <select
                  id="tokovoucher-sync-interval"
                  value={tokovoucherAutoSyncInterval}
                  disabled={!snapshot.tokovoucher.autoSync.intervalEditable}
                  onChange={(event) => {
                    const interval = Number(event.target.value) as 7 | 14 | 30;
                    setTokovoucherAutoSyncInterval(interval);
                    if (snapshot.tokovoucher.autoSync.enabled) {
                      void persistTokoVoucherAutoSync(true, interval);
                    }
                  }}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <option value={7}>7 hari</option>
                  <option value={14}>14 hari</option>
                  <option value={30}>30 hari</option>
                </select>
              </div>
              <p className="text-xs text-slate-500">
                Default nonaktif. Produk hanya diperbarui saat Anda menekan tombol atau
                saat jadwal ini dinyalakan.
              </p>
              <div className="space-y-1 text-xs text-slate-500">
                <p>Sync terakhir: {formatSyncDate(snapshot.tokovoucher.autoSync.lastRunAt)}</p>
                <p>Jadwal berikutnya: {formatSyncDate(snapshot.tokovoucher.autoSync.nextRunAt)}</p>
                {snapshot.tokovoucher.autoSync.lastStatus && (
                  <p>Status: {snapshot.tokovoucher.autoSync.lastStatus}</p>
                )}
                {snapshot.tokovoucher.autoSync.lastResult && (
                  <p>
                    Hasil: {snapshot.tokovoucher.autoSync.lastResult.created} baru,{' '}
                    {snapshot.tokovoucher.autoSync.lastResult.updated} diperbarui,{' '}
                    {snapshot.tokovoucher.autoSync.lastResult.skipped} dilewati
                  </p>
                )}
                {snapshot.tokovoucher.autoSync.lastError && (
                  <p role="status" className="text-rose-700">
                    Sync terakhir gagal.
                  </p>
                )}
              </div>
            </CardContent>
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
      <Dialog
        open={pendingDisable !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisable(null);
        }}
      >
        <DialogContent role="dialog" aria-modal="true">
          <DialogHeader>
            <DialogTitle>Nonaktifkan vendor ini?</DialogTitle>
            <DialogDescription>
              Pesanan baru ke vendor ini akan ditolak. Pesanan yang sudah berjalan tetap
              diselesaikan lewat webhook dan reconciler, dan kredensial tidak dihapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDisable(null)}
            >
              Batal
            </Button>
            <Button type="button" onClick={confirmVendorDisable}>
              Ya, nonaktifkan
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
            status={vendorStatus({ enabled: true, configured: isQrislyActive })}
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm">Aktifkan Qrisly untuk deposit</p>
                <p className="text-xs text-slate-500">{sourceText(snapshot.qrisly.enabledSource)}</p>
              </div>
              <Switch
                checked={qrislyEnabled}
                onCheckedChange={setQrislyEnabled}
                disabled={!snapshot.qrisly.enabledEditable}
                aria-label="Aktifkan Qrisly untuk deposit"
              />
            </div>
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
