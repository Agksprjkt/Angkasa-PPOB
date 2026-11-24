'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, SwitchRow, type SystemSnapshot } from './shared';
import type { SystemConfig } from '@/lib/system-config-core';

export default function StorageCard({
  draft,
  snapshot,
  onChange,
  onTest,
  testing,
}: {
  draft: SystemConfig;
  snapshot: SystemSnapshot;
  onChange: (next: SystemConfig) => void;
  onTest: () => void;
  testing: boolean;
}) {
  const storage = draft.storage;
  const update = (patch: Partial<typeof storage>) =>
    onChange({ ...draft, storage: { ...storage, ...patch } });
  const updateS3 = (patch: Partial<typeof storage.s3>) =>
    update({ s3: { ...storage.s3, ...patch } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Penyimpanan</h3>
          <p className="text-xs text-slate-500">Berlaku langsung untuk upload berikutnya, tanpa restart.</p>
        </div>
        <Badge variant={storage.driver === 's3' ? 'blue' : 'secondary'}>
          {storage.driver === 's3' ? 'S3' : 'Filesystem Lokal'}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(['local', 's3'] as const).map((driver) => (
          <button
            key={driver}
            type="button"
            onClick={() => update({ driver })}
            className={`rounded-xl border p-4 text-left transition-colors ${
              storage.driver === driver
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">
              {driver === 'local' ? 'Filesystem Lokal' : 'Amazon S3'}
            </p>
            <p className="text-xs text-slate-500">
              {driver === 'local' ? 'Simpan berkas media secara lokal' : 'S3-compatible: AWS, R2, MinIO, Supabase'}
            </p>
          </button>
        ))}
      </div>

      {storage.driver === 'local' ? (
        <Field label="Path penyimpanan" hint="Relatif terhadap akar proyek. Default: .data/uploads">
          <Input
            value={storage.localPath}
            onChange={(event) => update({ localPath: event.target.value })}
          />
        </Field>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Endpoint" hint="Contoh: https://<account>.r2.cloudflarestorage.com">
              <Input
                value={storage.s3.endpoint}
                placeholder="https://s3.example.com"
                onChange={(event) => updateS3({ endpoint: event.target.value })}
              />
            </Field>
            <Field label="Region" hint="R2/MinIO umumnya memakai auto.">
              <Input value={storage.s3.region} onChange={(event) => updateS3({ region: event.target.value })} />
            </Field>
            <Field label="Bucket">
              <Input value={storage.s3.bucket} onChange={(event) => updateS3({ bucket: event.target.value })} />
            </Field>
            <Field label="Prefix" hint="Opsional, misalnya ppob/uploads.">
              <Input value={storage.s3.prefix} onChange={(event) => updateS3({ prefix: event.target.value })} />
            </Field>
            <Field
              label="Access key ID"
              hint={snapshot.secretsPresent.s3AccessKeyId ? 'Tersimpan. Kosongkan untuk mempertahankan.' : undefined}
            >
              <Input
                value={storage.s3.accessKeyId}
                placeholder={snapshot.secretsPresent.s3AccessKeyId ? '••••••••' : ''}
                onChange={(event) => updateS3({ accessKeyId: event.target.value })}
              />
            </Field>
            <Field
              label="Secret access key"
              hint={snapshot.secretsPresent.s3SecretAccessKey ? 'Tersimpan. Kosongkan untuk mempertahankan.' : undefined}
            >
              <Input
                type="password"
                value={storage.s3.secretAccessKey}
                placeholder={snapshot.secretsPresent.s3SecretAccessKey ? '••••••••' : ''}
                onChange={(event) => updateS3({ secretAccessKey: event.target.value })}
              />
            </Field>
          </div>
          <SwitchRow
            title="Force path style"
            description="Wajib untuk MinIO dan sebagian penyedia S3-compatible."
            checked={storage.s3.forcePathStyle}
            onChange={(value) => updateS3({ forcePathStyle: value })}
          />
          <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={testing}>
            {testing ? 'Menguji koneksi…' : 'Uji koneksi penyimpanan'}
          </Button>
        </div>
      )}
    </div>
  );
}
