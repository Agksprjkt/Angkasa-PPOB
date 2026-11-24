'use client';

import { Badge } from '@/components/ui/badge';
import { SwitchRow, type SystemSnapshot } from './shared';
import type { SystemConfig } from '@/lib/system-config-core';

export default function StorefrontCard({
  draft,
  snapshot,
  onChange,
}: {
  draft: SystemConfig;
  snapshot: SystemSnapshot;
  onChange: (next: SystemConfig) => void;
}) {
  const { storefront } = draft;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Storefront</h3>
          <p className="text-xs text-slate-500">
            Storefront build-in adalah halaman toko yang berjalan di aplikasi ini.
          </p>
        </div>
        <Badge variant={storefront.enabled ? 'success' : 'secondary'}>
          {storefront.enabled ? 'Aktif' : 'Nonaktif'}
        </Badge>
      </div>

      <SwitchRow
        title="Aktifkan storefront build-in"
        description="Berlaku langsung tanpa restart."
        checked={storefront.enabled}
        onChange={(value) =>
          onChange({ ...draft, storefront: { ...storefront, enabled: value } })
        }
      />

      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-600">
        {storefront.enabled ? (
          <p>
            Semua halaman toko dapat diakses publik. API tetap terbuka untuk frontend eksternal.
          </p>
        ) : (
          <>
            <p className="font-semibold text-slate-800">
              Hanya halaman login dashboard yang dapat diakses.
            </p>
            <p>
              Pengunjung lain dialihkan ke <code className="rounded bg-slate-100 px-1">/admin/login</code>.
              Halaman admin, seluruh <code className="rounded bg-slate-100 px-1">/api</code>, dan
              aset statis tetap dilayani, sehingga frontend eksternal tidak terpengaruh.
            </p>
          </>
        )}
        {snapshot.config.storefront.enabled !== storefront.enabled ? (
          <p className="font-medium text-amber-700">
            Tekan Simpan Konfigurasi untuk menerapkan perubahan ini.
          </p>
        ) : null}
      </div>
    </div>
  );
}
