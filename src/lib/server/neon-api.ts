import 'server-only';

import { getSystemConfig } from './system-config';
import type { NeonConfig } from '@/lib/system-config-core';

const neonApiBase = 'https://console.neon.tech/api/v2';
const timeoutMs = 10_000;
const cacheTtlMs = 5 * 60 * 1000;

export type NeonResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'UNAUTHORIZED' | 'UNAVAILABLE' | 'NOT_SUPPORTED' };

type CacheEntry = { expiresAt: number; value: unknown };

const cache = new Map<string, CacheEntry>();

function cached<T>(key: string, load: () => Promise<NeonResult<T>>): Promise<NeonResult<T>> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return Promise.resolve(entry.value as NeonResult<T>);
  }
  return load().then((result) => {
    if (result.ok) cache.set(key, { expiresAt: Date.now() + cacheTtlMs, value: result });
    return result;
  });
}

async function neonRequest(
  apiKey: string,
  path: string,
): Promise<{ ok: boolean; status: number; body: unknown } | null> {
  try {
    const response = await fetch(`${neonApiBase}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = response.ok ? await response.json().catch(() => null) : null;
    return { ok: response.ok, status: response.status, body };
  } catch {
    return null;
  }
}

function neonConfig(): NeonConfig | null {
  const neon = getSystemConfig().database.neon;
  const apiKey = process.env.NEON_API_KEY?.trim() || neon.apiKey;
  if (!apiKey) return null;
  return {
    ...neon,
    apiKey,
    projectId: process.env.NEON_PROJECT_ID?.trim() || neon.projectId,
    orgId: process.env.NEON_ORG_ID?.trim() || neon.orgId,
  };
}

// The returned URIs carry the role password. Callers must strip it before the
// value reaches a browser.
export function fetchNeonConnectionUris() {
  const neon = neonConfig();
  if (!neon) {
    return Promise.resolve<NeonResult<{ pooled: string; direct: string }>>(
      { ok: false, reason: 'NOT_CONFIGURED' },
    );
  }
  const projectId = neon.projectId;
  if (!projectId) {
    return Promise.resolve<NeonResult<{ pooled: string; direct: string }>>(
      { ok: false, reason: 'NOT_CONFIGURED' },
    );
  }

  return cached<{ pooled: string; direct: string }>(`uri:${projectId}`, async () => {
    const query = new URLSearchParams({
      database_name: getSystemConfig().database.database || 'neondb',
      role_name: getSystemConfig().database.user || 'neondb_owner',
      pooled: 'true',
    });
    const pooledResponse = await neonRequest(
      neon.apiKey,
      `/projects/${encodeURIComponent(projectId)}/connection_uri?${query}`,
    );
    if (!pooledResponse) return { ok: false as const, reason: 'UNAVAILABLE' as const };
    if (pooledResponse.status === 401 || pooledResponse.status === 403) {
      return { ok: false as const, reason: 'UNAUTHORIZED' as const };
    }
    if (!pooledResponse.ok) return { ok: false as const, reason: 'UNAVAILABLE' as const };

    const directQuery = new URLSearchParams({
      database_name: getSystemConfig().database.database || 'neondb',
      role_name: getSystemConfig().database.user || 'neondb_owner',
    });
    const directResponse = await neonRequest(
      neon.apiKey,
      `/projects/${encodeURIComponent(projectId)}/connection_uri?${directQuery}`,
    );
    const pooled = (pooledResponse.body as { uri?: unknown })?.uri;
    const direct = directResponse?.ok
      ? (directResponse.body as { uri?: unknown })?.uri
      : pooled;
    if (typeof pooled !== 'string') return { ok: false as const, reason: 'UNAVAILABLE' as const };

    return {
      ok: true as const,
      data: {
        pooled,
        direct: typeof direct === 'string' ? direct : pooled,
      },
    };
  });
}

export type NeonUsage = {
  plan: 'usage-based' | 'legacy';
  from: string;
  to: string;
  computeSeconds: number;
  storageBytes: number;
  transferBytes: number;
};

function dayRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function sumMetric(metrics: unknown, name: string) {
  if (!Array.isArray(metrics)) return 0;
  let total = 0;
  for (const metric of metrics) {
    if (typeof metric !== 'object' || metric === null) continue;
    const entry = metric as { metric_name?: unknown; value?: unknown };
    if (entry.metric_name === name && typeof entry.value === 'number') total += entry.value;
  }
  return total;
}

function collectV2(body: unknown, name: string) {
  const projects = (body as { projects?: unknown })?.projects;
  if (!Array.isArray(projects)) return 0;
  let total = 0;
  for (const project of projects) {
    const periods = (project as { periods?: unknown })?.periods;
    if (!Array.isArray(periods)) continue;
    for (const period of periods) {
      const consumption = (period as { consumption?: unknown })?.consumption;
      if (!Array.isArray(consumption)) continue;
      for (const window of consumption) {
        total += sumMetric((window as { metrics?: unknown })?.metrics, name);
      }
    }
  }
  return total;
}

function collectLegacy(body: unknown, name: string) {
  const projects = (body as { projects?: unknown })?.projects;
  if (!Array.isArray(projects)) return 0;
  let total = 0;
  for (const project of projects) {
    const periods = (project as { periods?: unknown })?.periods;
    if (!Array.isArray(periods)) continue;
    for (const period of periods) {
      const consumption = (period as { consumption?: unknown })?.consumption;
      if (!Array.isArray(consumption)) continue;
      for (const window of consumption) {
        const value = (window as Record<string, unknown>)[name];
        if (typeof value === 'number') total += value;
      }
    }
  }
  return total;
}

export function fetchNeonUsage() {
  const neon = neonConfig();
  if (!neon?.orgId || !neon.projectId) {
    return Promise.resolve<NeonResult<NeonUsage>>({ ok: false, reason: 'NOT_CONFIGURED' });
  }

  return cached<NeonUsage>(`usage:${neon.orgId}:${neon.projectId}`, async () => {
    const range = dayRange(30);
    const v2Query = new URLSearchParams({
      org_id: neon.orgId,
      project_ids: neon.projectId,
      from: range.from,
      to: range.to,
      granularity: 'daily',
      metrics: 'compute_unit_seconds,root_branch_bytes_month,public_network_transfer_bytes',
    });
    const v2 = await neonRequest(neon.apiKey, `/consumption_history/v2/projects?${v2Query}`);
    if (v2?.ok) {
      return {
        ok: true as const,
        data: {
          plan: 'usage-based' as const,
          ...range,
          computeSeconds: collectV2(v2.body, 'compute_unit_seconds'),
          storageBytes: collectV2(v2.body, 'root_branch_bytes_month'),
          transferBytes: collectV2(v2.body, 'public_network_transfer_bytes'),
        },
      };
    }
    if (v2?.status === 401) return { ok: false as const, reason: 'UNAUTHORIZED' as const };

    const legacyQuery = new URLSearchParams({
      project_ids: neon.projectId,
      from: range.from,
      to: range.to,
      granularity: 'daily',
    });
    const legacy = await neonRequest(
      neon.apiKey,
      `/consumption_history/projects?${legacyQuery}`,
    );
    if (!legacy) return { ok: false as const, reason: 'UNAVAILABLE' as const };
    if (legacy.status === 401) return { ok: false as const, reason: 'UNAUTHORIZED' as const };
    // 403 means the account plan does not expose consumption history at all.
    if (legacy.status === 403) return { ok: false as const, reason: 'NOT_SUPPORTED' as const };
    if (!legacy.ok) return { ok: false as const, reason: 'UNAVAILABLE' as const };

    return {
      ok: true as const,
      data: {
        plan: 'legacy' as const,
        ...range,
        computeSeconds: collectLegacy(legacy.body, 'compute_time_seconds'),
        storageBytes: 0,
        transferBytes: 0,
      },
    };
  });
}

export function stripUriPassword(uri: string) {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = 'REDACTED';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function clearNeonCache() {
  cache.clear();
}
