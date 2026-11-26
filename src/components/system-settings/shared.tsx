'use client';

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { SystemConfig } from '@/lib/system-config-core';

export type SystemSnapshot = {
  config: SystemConfig;
  secretsPresent: Record<
    'databasePassword' | 'neonApiKey' | 'redisPassword' | 's3AccessKeyId' | 's3SecretAccessKey',
    boolean
  >;
  sources: Record<'databaseProvider' | 'databaseUrl' | 'redisUrl' | 'storageDriver', 'environment' | 'dashboard'>;
  running: { provider: 'sqlite' | 'postgres'; storageDriver: 'local' | 's3' };
  restartRequired: boolean;
  redisConnected?: boolean | null;
};

const errorLabels: Record<string, string> = {
  INVALID_DATABASE_SCHEMA: 'Skema database tidak valid. Gunakan huruf, angka, dan garis bawah.',
  INVALID_DATABASE_URL: 'URL database harus diawali postgres:// atau postgresql://.',
  INVALID_DATABASE_URL_DIRECT: 'URL migrasi harus diawali postgres:// atau postgresql://.',
  INVALID_REDIS_URL: 'URL Redis harus diawali redis:// atau rediss://.',
  INVALID_S3_REQUIRED_FIELDS: 'Endpoint dan bucket S3 wajib diisi.',
  INVALID_S3_ENDPOINT: 'Endpoint S3 tidak valid.',
  INVALID_S3_ENDPOINT_PROTOCOL: 'Endpoint S3 wajib https (http hanya untuk host lokal).',
  INVALID_STORAGE_PATH: 'Path penyimpanan tidak boleh mengandung "..".',
  STORAGE_S3_NOT_CONFIGURED: 'Lengkapi endpoint, bucket, access key, dan secret key.',
  STORAGE_TEST_FAILED: 'Uji koneksi penyimpanan gagal.',
  NEON_NOT_CONFIGURED: 'Isi API key dan project ID Neon terlebih dahulu.',
  NEON_UNAUTHORIZED: 'API key Neon ditolak.',
  NEON_UNAVAILABLE: 'API Neon tidak dapat dihubungi.',
};

export const errorText = (code: string) => errorLabels[code] ?? code;

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      disabled={disabled}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div>
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500">{description}</p>
      </div>
      <Toggle label={title} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
