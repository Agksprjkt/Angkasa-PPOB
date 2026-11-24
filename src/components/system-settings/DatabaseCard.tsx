'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, SwitchRow, Toggle, errorText, formatBytes, type SystemSnapshot } from './shared';
import type { SystemConfig } from '@/lib/system-config-core';

type NeonInfo = {
  connection: { ok: true; pooled: string; direct: string } | { ok: false; reason: string };
  usage:
    | { ok: true; data: { plan: string; computeSeconds: number; storageBytes: number; transferBytes: number } }
    | { ok: false; reason: string };
};

export default function DatabaseCard({
  draft,
  snapshot,
  onChange,
  onNotice,
  onError,
  onRefresh,
}: {
  draft: SystemConfig;
  snapshot: SystemSnapshot;
  onChange: (next: SystemConfig) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const database = draft.database;
  const [neonInfo, setNeonInfo] = useState<NeonInfo | null>(null);
  const [loadingNeon, setLoadingNeon] = useState(false);

  const update = (patch: Partial<typeof database>) =>
    onChange({ ...draft, database: { ...database, ...patch } });

  const providerLocked = snapshot.sources.databaseProvider === 'environment';
  const urlLocked = snapshot.sources.databaseUrl === 'environment';

  const loadNeon = async () => {
    setLoadingNeon(true);
    setNeonInfo(null);
    try {
      const response = await fetch('/api/admin/system-settings/neon');
      if (!response.ok) throw new Error('NEON_UNAVAILABLE');
      setNeonInfo((await response.json()) as NeonInfo);
    } catch {
      onError(errorText('NEON_UNAVAILABLE'));
    } finally {
      setLoadingNeon(false);
    }
  };

  // The server writes the URIs (with password) so the browser never sees them.
  const applyNeon = async () => {
    setLoadingNeon(true);
    try {
      const response = await fetch('/api/admin/system-settings/neon', { method: 'POST' });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!body.ok) {
        onError(errorText(body.error ?? 'NEON_UNAVAILABLE'));
        return;
      }
      onNotice('URL Neon diterapkan. Migrasi otomatis dimatikan; jalankan migrasi manual saat deploy.');
      await onRefresh();
    } catch {
      onError(errorText('NEON_UNAVAILABLE'));
    } finally {
      setLoadingNeon(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Database</h3>
          <p className="text-xs text-slate-500">Mode database dipilih saat layanan dimulai.</p>
        </div>
        <Badge variant={database.provider === 'postgres' ? 'success' : 'secondary'}>
          {database.provider === 'postgres' ? 'PostgreSQL' : 'SQLite'}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(['sqlite', 'postgres'] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={providerLocked}
            onClick={() => update({ provider })}
            className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${
              database.provider === provider
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{provider === 'sqlite' ? 'SQLite' : 'PostgreSQL'}</p>
            <p className="text-xs text-slate-500">
              {provider === 'sqlite' ? 'Basis data berkas lokal' : 'Siap produksi, termasuk Neon'}
            </p>
          </button>
        ))}
      </div>
      {providerLocked ? (
        <p className="text-[11px] text-slate-500">
          Mode database ditentukan oleh variabel lingkungan DATABASE_PROVIDER.
        </p>
      ) : null}

      {database.provider === 'postgres' ? (
        <div className="space-y-3">
          <SwitchRow
            title="Gunakan container PostgreSQL bawaan"
            description="Menghubungkan ke layanan postgres pada jaringan Compose."
            checked={database.useBundledContainer}
            onChange={(value) => update({ useBundledContainer: value })}
          />

          {!database.useBundledContainer ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Host">
                <Input value={database.host} onChange={(event) => update({ host: event.target.value })} />
              </Field>
              <Field label="Port">
                <Input
                  type="number"
                  value={database.port}
                  onChange={(event) => update({ port: Number(event.target.value) })}
                />
              </Field>
              <Field label="Nama pengguna">
                <Input value={database.user} onChange={(event) => update({ user: event.target.value })} />
              </Field>
              <Field
                label="Kata sandi"
                hint={snapshot.secretsPresent.databasePassword ? 'Tersimpan. Kosongkan untuk mempertahankan.' : undefined}
              >
                <Input
                  type="password"
                  value={database.password}
                  placeholder={snapshot.secretsPresent.databasePassword ? '••••••••' : ''}
                  onChange={(event) => update({ password: event.target.value })}
                />
              </Field>
              <Field label="Nama database">
                <Input value={database.database} onChange={(event) => update({ database: event.target.value })} />
              </Field>
              <Field label="Ukuran pool">
                <Input
                  type="number"
                  value={database.poolMax}
                  onChange={(event) => update({ poolMax: Number(event.target.value) })}
                />
              </Field>
              <Field label="Skema" hint="Default: public. Skema harus sudah ada.">
                <Input value={database.schema} onChange={(event) => update({ schema: event.target.value })} />
              </Field>
              <Field
                label="URL koneksi"
                hint={urlLocked ? 'Ditentukan oleh variabel lingkungan.' : 'Kosongkan untuk memakai field di atas.'}
              >
                <Input
                  value={database.url}
                  disabled={urlLocked}
                  placeholder="postgres://user:pass@host:5432/ppob"
                  onChange={(event) => update({ url: event.target.value })}
                />
              </Field>
            </div>
          ) : null}

          <SwitchRow
            title="Koneksi SSL"
            description="Wajib untuk database terkelola seperti Neon."
            checked={database.ssl}
            onChange={(value) => update({ ssl: value })}
          />
          <SwitchRow
            title="Migrasi otomatis saat startup"
            description={
              database.neon.enabled
                ? 'Dimatikan otomatis untuk Neon. Jalankan migrasi manual saat deploy.'
                : 'Dijalankan sekali saat layanan dimulai.'
            }
            checked={database.migrateOnStartup && !database.neon.enabled}
            disabled={database.neon.enabled}
            onChange={(value) => update({ migrateOnStartup: value })}
          />

          <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Neon</p>
                <p className="text-[11px] text-slate-500">
                  Opsional. Isi API key untuk mengambil URL koneksi dan pemakaian kuota otomatis.
                </p>
              </div>
              <Toggle
                label="Aktifkan Neon"
                checked={database.neon.enabled}
                onChange={(value) =>
                  update({
                    neon: { ...database.neon, enabled: value },
                    migrateOnStartup: value ? false : database.migrateOnStartup,
                  })
                }
              />
            </div>

            {database.neon.enabled ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Project ID">
                    <Input
                      value={database.neon.projectId}
                      onChange={(event) =>
                        update({ neon: { ...database.neon, projectId: event.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Organization ID" hint="Dibutuhkan untuk kartu pemakaian kuota.">
                    <Input
                      value={database.neon.orgId}
                      onChange={(event) => update({ neon: { ...database.neon, orgId: event.target.value } })}
                    />
                  </Field>
                </div>
                <Field
                  label="API key Neon"
                  hint={
                    snapshot.secretsPresent.neonApiKey
                      ? 'Tersimpan terenkripsi. Kosongkan untuk mempertahankan.'
                      : 'Disimpan terenkripsi dan tidak pernah dikirim balik ke browser.'
                  }
                >
                  <Input
                    type="password"
                    value={database.neon.apiKey}
                    placeholder={snapshot.secretsPresent.neonApiKey ? '••••••••' : ''}
                    onChange={(event) => update({ neon: { ...database.neon, apiKey: event.target.value } })}
                  />
                </Field>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadNeon()} disabled={loadingNeon}>
                    {loadingNeon ? 'Menghubungi Neon…' : 'Ambil URL dari Neon'}
                  </Button>
                  <Button type="button" size="sm" onClick={() => void applyNeon()} disabled={loadingNeon}>
                    Terapkan URL Neon
                  </Button>
                </div>

                {neonInfo ? (
                  <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
                    {neonInfo.connection.ok ? (
                      <>
                        <p className="font-semibold text-slate-700">URL koneksi (kata sandi disamarkan)</p>
                        <p className="break-all">Pooled: {neonInfo.connection.pooled}</p>
                        <p className="break-all">Direct: {neonInfo.connection.direct}</p>
                      </>
                    ) : (
                      <p>{errorText(`NEON_${neonInfo.connection.reason}`)}</p>
                    )}

                    {neonInfo.usage.ok ? (
                      <div className="grid gap-2 pt-2 sm:grid-cols-3">
                        <div>
                          <p className="text-slate-500">Compute (30 hari)</p>
                          <p className="font-semibold text-slate-800">{formatBytes(neonInfo.usage.data.computeSeconds * 1024)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Storage</p>
                          <p className="font-semibold text-slate-800">{formatBytes(neonInfo.usage.data.storageBytes)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Transfer</p>
                          <p className="font-semibold text-slate-800">{formatBytes(neonInfo.usage.data.transferBytes)}</p>
                        </div>
                      </div>
                    ) : neonInfo.usage.reason === 'NOT_SUPPORTED' ? (
                      <p>Metrik pemakaian tidak tersedia untuk paket Neon ini.</p>
                    ) : neonInfo.usage.reason === 'NOT_CONFIGURED' ? null : (
                      <p>{errorText(`NEON_${neonInfo.usage.reason}`)}</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
