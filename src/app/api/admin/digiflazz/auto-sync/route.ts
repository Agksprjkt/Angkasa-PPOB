import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import {
  getDigiflazzAutoSyncConfig,
  getDigiflazzConfig,
  isIntegrationSettingEnvironmentOverridden,
  saveDigiflazzAutoSyncState,
} from '@/lib/server/integration-settings';

export const runtime = 'nodejs';

const allowedIntervals = [7, 14, 30] as const;
type AllowedInterval = (typeof allowedIntervals)[number];

export async function PUT(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  if (
    isIntegrationSettingEnvironmentOverridden('digiflazzAutoSyncEnabled') ||
    isIntegrationSettingEnvironmentOverridden('digiflazzAutoSyncIntervalDays')
  ) {
    return NextResponse.json(
      { error: 'AUTO_SYNC_OVERRIDDEN_BY_ENVIRONMENT' },
      { status: 409 },
    );
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 2 ||
    !('enabled' in payload) ||
    typeof payload.enabled !== 'boolean' ||
    !('intervalDays' in payload) ||
    typeof payload.intervalDays !== 'number' ||
    !Number.isSafeInteger(payload.intervalDays) ||
    !allowedIntervals.includes(payload.intervalDays as AllowedInterval)
  ) {
    return NextResponse.json({ error: 'INVALID_AUTO_SYNC_SETTINGS' }, { status: 400 });
  }

  const enabled = payload.enabled;
  const intervalDays = payload.intervalDays as AllowedInterval;
  try {
    if (enabled) {
      const config = await getDigiflazzConfig();
      if (
        !config.username ||
        !config.apiKey ||
        (config.mode !== 'sandbox' && config.mode !== 'production')
      ) {
        return NextResponse.json(
          { error: 'DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED' },
          { status: 400 },
        );
      }
    }

    const nextRunAt = enabled
      ? new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
    await saveDigiflazzAutoSyncState({
      enabled,
      intervalDays,
      ...(nextRunAt ? { nextRunAt } : { clearNextRunAt: true }),
    });
    return NextResponse.json({
      autoSync: await getDigiflazzAutoSyncConfig(),
    });
  } catch (error) {
    console.error(
      '[ADMIN_DIGIFLAZZ_AUTO_SYNC_SAVE_FAILED]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return NextResponse.json(
      { error: 'AUTO_SYNC_SETTINGS_COULD_NOT_BE_SAVED' },
      { status: 503 },
    );
  }
}
