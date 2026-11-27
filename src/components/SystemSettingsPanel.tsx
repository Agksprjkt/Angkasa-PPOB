'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/crystal-loader';
import { usePPOB } from '@/context/PPOBContext';
import BackupCard from './system-settings/BackupCard';
import DatabaseCard from './system-settings/DatabaseCard';
import RedisCard from './system-settings/RedisCard';
import StorageCard from './system-settings/StorageCard';
import StorefrontCard from './system-settings/StorefrontCard';
import SecurityCard from './system-settings/SecurityCard';
import { errorText, type SystemSnapshot } from './system-settings/shared';
import type { SystemConfig } from '@/lib/system-config-core';

export default function SystemSettingsPanel() {
  const { addToast } = usePPOB();
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [draft, setDraft] = useState<SystemConfig | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const applySnapshot = (next: SystemSnapshot) => {
    setSnapshot(next);
    setDraft(next.config);
  };

  const refresh = async () => {
    const response = await fetch('/api/admin/system-settings');
    if (!response.ok) throw new Error('SYSTEM_SETTINGS_UNAVAILABLE');
    applySnapshot((await response.json()) as SystemSnapshot);
  };

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/system-settings')
      .then(async (response) => {
        if (!response.ok) throw new Error('SYSTEM_SETTINGS_UNAVAILABLE');
        return (await response.json()) as SystemSnapshot;
      })
      .then((body) => {
        if (active) applySnapshot(body);
      })
      .catch(() => {
        if (active) setError('Gagal memuat konfigurasi sistem.');
      });
    return () => { active = false; };
  }, []);

  if (!draft || !snapshot) {
    return error
      ? <p className="text-sm text-rose-600">{error}</p>
      : <LoadingState message="Memuat konfigurasi sistem…" />;
  }

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: draft }),
      });
      const body = (await response.json()) as SystemSnapshot & { error?: string };
      if (!response.ok) {
        setError(errorText(body.error ?? 'SYSTEM_SETTINGS_COULD_NOT_BE_SAVED'));
        return;
      }
      applySnapshot(body);
      setNotice(
        body.restartRequired
          ? 'Konfigurasi tersimpan. Perubahan database berlaku setelah layanan di-restart.'
          : 'Konfigurasi tersimpan.',
      );
    } catch {
      setError('Gagal menyimpan konfigurasi sistem.');
    } finally {
      setSaving(false);
    }
  };

  const testStorage = async () => {
    setTesting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: draft, action: 'test-storage' }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (body.ok) setNotice('Koneksi penyimpanan berhasil: objek uji ditulis lalu dihapus.');
      else setError(errorText(body.error ?? 'STORAGE_TEST_FAILED'));
    } catch {
      setError('Uji koneksi penyimpanan gagal.');
    } finally {
      setTesting(false);
    }
  };

  const change = (next: SystemConfig) => {
    setDraft(next);
    setNotice('');
    setError('');
  };

  return (
    <div className="space-y-5">
      {snapshot.restartRequired ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Perubahan belum aktif. Database berjalan: <strong>{snapshot.running.provider}</strong>.
          Restart layanan agar mode baru dipakai. Data tidak dipindahkan otomatis.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
      ) : null}

      <Card>
        <CardContent className="p-5">
          <DatabaseCard
            draft={draft}
            snapshot={snapshot}
            onChange={change}
            onNotice={setNotice}
            onError={setError}
            onRefresh={refresh}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <RedisCard draft={draft} snapshot={snapshot} onChange={change} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <StorageCard
            draft={draft}
            snapshot={snapshot}
            onChange={change}
            onTest={() => void testStorage()}
            testing={testing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <StorefrontCard draft={draft} snapshot={snapshot} onChange={change} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <BackupCard addToast={addToast} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <SecurityCard addToast={addToast} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Konfigurasi'}
        </Button>
      </div>
    </div>
  );
}
