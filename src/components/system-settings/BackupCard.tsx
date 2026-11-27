'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorText } from './shared';

const CONFIRM_PHRASE = 'RESTORE';

export default function BackupCard({
  addToast,
}: {
  addToast?: (title: string, message: string, tone: 'success' | 'warning' | 'error') => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const download = async () => {
    setDownloading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/backup');
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'BACKUP_FAILED');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'ppob-backup.json.gz';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`Backup terunduh (${name}, ${(blob.size / 1024).toFixed(0)} KB).`);
    } catch (cause) {
      setError(errorText(cause instanceof Error ? cause.message : 'BACKUP_FAILED'));
    } finally {
      setDownloading(false);
    }
  };

  const restore = async () => {
    if (!file || confirm.trim() !== CONFIRM_PHRASE) return;
    setRestoring(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('confirm', confirm.trim());
      const response = await fetch('/api/admin/backup', { method: 'POST', body: form });
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        tables?: Record<string, number>;
      };
      if (!response.ok) throw new Error(body.error ?? 'RESTORE_FAILED');
      const total = Object.values(body.tables ?? {}).reduce((sum, count) => sum + count, 0);
      setNotice(`Restore selesai: ${total} baris pada ${Object.keys(body.tables ?? {}).length} tabel.`);
      addToast?.('Restore selesai', 'Muat ulang halaman dan login kembali.', 'success');
      setFile(null);
      setConfirm('');
      if (fileInput.current) fileInput.current.value = '';
    } catch (cause) {
      setError(errorText(cause instanceof Error ? cause.message : 'RESTORE_FAILED'));
    } finally {
      setRestoring(false);
    }
  };

  const ready = Boolean(file) && confirm.trim() === CONFIRM_PHRASE;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Backup &amp; restore database</h3>
        <p className="text-xs text-slate-500">
          Berisi seluruh tabel (user, produk, transaksi, deposit, pengaturan). File upload di
          <code className="mx-1 rounded bg-slate-100 px-1">.data/uploads</code>
          tidak ikut; pakai <code className="rounded bg-slate-100 px-1">backup.sh</code> di VPS untuk itu.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void download()} disabled={downloading}>
          {downloading ? 'Menyiapkan…' : 'Unduh backup (.json.gz)'}
        </Button>
        <p className="text-[11px] text-slate-500">Ambil backup sebelum melakukan restore.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
        <p className="text-xs font-semibold text-rose-900">Restore menimpa semua data saat ini</p>
        <ul className="list-disc space-y-1 pl-4 text-[11px] text-rose-800">
          <li>Seluruh tabel dikosongkan lalu diisi ulang dari file. Tidak ada tombol batal.</li>
          <li>Tabel <code className="rounded bg-white px-1">session</code> ikut dipulihkan, jadi semua
            sesi login — termasuk sesi ini — menjadi tidak berlaku.</li>
          <li>Pengaturan di <code className="rounded bg-white px-1">.env</code> dan file upload tidak berubah.</li>
        </ul>

        <Input
          ref={fileInput}
          type="file"
          accept=".gz,.json,application/gzip,application/json"
          aria-label="File backup"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError('');
            setNotice('');
          }}
          className="bg-white text-xs"
        />

        <div className="space-y-1.5">
          <p className="text-[11px] text-rose-900">
            Ketik <strong>{CONFIRM_PHRASE}</strong> untuk mengaktifkan tombol.
          </p>
          <Input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={CONFIRM_PHRASE}
            aria-label="Konfirmasi restore"
            className="bg-white font-mono text-xs"
          />
        </div>

        <Button type="button" variant="destructive" disabled={!ready || restoring} onClick={() => void restore()}>
          {restoring ? 'Memulihkan…' : 'Restore sekarang'}
        </Button>
      </div>
    </div>
  );
}
