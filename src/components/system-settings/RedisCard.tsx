'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Field, SwitchRow, type SystemSnapshot } from './shared';
import type { SystemConfig } from '@/lib/system-config-core';

export default function RedisCard({
  draft,
  snapshot,
  onChange,
}: {
  draft: SystemConfig;
  snapshot: SystemSnapshot;
  onChange: (next: SystemConfig) => void;
}) {
  const redis = draft.redis;
  const update = (patch: Partial<typeof redis>) =>
    onChange({ ...draft, redis: { ...redis, ...patch } });
  const locked = snapshot.sources.redisUrl === 'environment';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Redis</h3>
          <p className="text-xs text-slate-500">
            Dipakai untuk rate limit dan koordinasi worker. Tanpa Redis, rate limit tetap jalan lewat tabel database.
          </p>
        </div>
        <Badge variant={snapshot.redisConnected ? 'success' : 'secondary'}>
          {snapshot.redisConnected ? 'Terhubung' : 'Tidak terhubung'}
        </Badge>
      </div>

      <SwitchRow
        title="Aktifkan Redis"
        description="Matikan untuk memakai penyimpanan database sebagai pengganti."
        checked={redis.enabled}
        onChange={(value) => update({ enabled: value })}
      />

      {redis.enabled ? (
        <div className="space-y-3">
          <SwitchRow
            title="Gunakan container Redis bawaan"
            description="Menghubungkan ke layanan redis pada jaringan Compose."
            checked={redis.useBundledContainer}
            onChange={(value) => update({ useBundledContainer: value })}
          />

          {!redis.useBundledContainer ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="URL Redis"
                hint={locked ? 'Ditentukan oleh variabel lingkungan REDIS_URL.' : 'Contoh: redis://127.0.0.1:6379'}
              >
                <Input
                  value={redis.url}
                  disabled={locked}
                  placeholder="redis://127.0.0.1:6379"
                  onChange={(event) => update({ url: event.target.value })}
                />
              </Field>
              <Field
                label="Kata sandi"
                hint={snapshot.secretsPresent.redisPassword ? 'Tersimpan. Kosongkan untuk mempertahankan.' : undefined}
              >
                <Input
                  type="password"
                  value={redis.password}
                  placeholder={snapshot.secretsPresent.redisPassword ? '••••••••' : ''}
                  onChange={(event) => update({ password: event.target.value })}
                />
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
