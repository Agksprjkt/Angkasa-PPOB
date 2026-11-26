'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// BETTER_AUTH_SECRET lives in the environment, not the database: rotating it
// invalidates every session and every encrypted credential, so the dashboard can
// only hand the new value over for the admin to paste into .env themselves.
export default function SecurityCard({ addToast }: { addToast?: (title: string, message: string, tone: 'success' | 'warning' | 'error') => void }) {
  const [value, setValue] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setGenerating(true);
    setCopied(false);
    try {
      const response = await fetch('/api/admin/integration-secrets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'betterAuthSecret' }),
      });
      const body = await response.json() as { value?: string; error?: string };
      if (!response.ok || typeof body.value !== 'string') {
        throw new Error(body.error ?? 'Secret baru tidak dapat dibuat.');
      }
      setValue(body.value);
    } catch (error) {
      addToast?.(
        'Secret gagal dibuat',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast?.('Clipboard ditolak', 'Salin nilainya secara manual.', 'warning');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Secret autentikasi</h3>
        <p className="text-xs text-slate-500">
          <code className="rounded bg-slate-100 px-1">BETTER_AUTH_SECRET</code> dibaca dari
          environment, bukan dari database. Dashboard hanya membuatkan nilainya untuk Anda
          salin.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
        <p className="font-semibold">Mengganti nilai ini berakibat permanen:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Semua sesi login keluar, termasuk sesi admin ini.</li>
          <li>
            Seluruh kredensial integrasi yang tersimpan (Digiflazz, TokoVoucher, Qrisly,
            OpenWA, password database, kunci S3) tidak dapat didekripsi sampai diisi ulang.
          </li>
          <li>Container harus dijalankan ulang; dashboard tidak bisa restart dirinya sendiri.</li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void generate()} disabled={generating}>
          {generating ? 'Membuat…' : 'Generate secret baru'}
        </Button>
        {value && (
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? 'Tersalin' : 'Salin'}
          </Button>
        )}
      </div>

      {value && (
        <div className="space-y-2">
          <Input readOnly value={value} aria-label="BETTER_AUTH_SECRET baru" className="font-mono text-xs" />
          <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-600">
            <li>Salin nilai di atas.</li>
            <li>
              Tempel ke <code className="rounded bg-slate-100 px-1">BETTER_AUTH_SECRET</code> di
              <code className="rounded bg-slate-100 px-1">/opt/ppob/.env</code> pada VPS.
            </li>
            <li>
              Jalankan <code className="rounded bg-slate-100 px-1">docker compose up -d app</code>,
              lalu isi ulang kredensial integrasi yang ditandai belum dikonfigurasi.
            </li>
          </ol>
          <p className="text-xs font-medium text-amber-700">
            Nilai ini hanya ditampilkan sekali dan tidak disimpan di database.
          </p>
        </div>
      )}
    </div>
  );
}
