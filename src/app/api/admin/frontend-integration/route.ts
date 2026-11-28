import { NextRequest, NextResponse } from 'next/server';
import { parseFrontendOrigins, normalizeAuthBaseUrl } from '@/lib/frontend-integration';
import { getAuth, refreshAuthConfig } from '@/lib/server/auth';
import { getIntegrationConfig } from '@/lib/server/integration-settings';
import {
  getAuthSettings,
  getSystemConfigSnapshot,
  saveSystemConfig,
} from '@/lib/server/system-config';
import { databaseMode } from '@/lib/server/db/database-mode';
import { readSystemConfig } from '@/lib/server/system-config-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin';
}

async function snapshotResponse() {
  const [integrationConfig] = await Promise.all([getIntegrationConfig()]);
  const settings = getAuthSettings();
  const sources = getSystemConfigSnapshot({
    provider: databaseMode,
    storageDriver: readSystemConfig().storage.driver,
  }).sources;

  return {
    backendOrigin: new URL(settings.baseUrl).origin,
    baseUrl: settings.baseUrl,
    baseUrlSource: sources.authBaseUrl,
    baseUrlEditable: sources.authBaseUrl !== 'environment',
    trustedOrigins: settings.trustedOrigins,
    trustedOriginsSource: sources.trustedOrigins,
    trustedOriginsEditable: sources.trustedOrigins !== 'environment',
    secret: {
      configured: Boolean(integrationConfig.values.frontendApiSecret),
      enforcementEnabled: true,
    },
  };
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    return NextResponse.json(await snapshotResponse());
  } catch (error) {
    console.error(
      '[ADMIN_FRONTEND_INTEGRATION_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown frontend integration error',
    );
    return NextResponse.json(
      { error: 'FRONTEND_INTEGRATION_UNAVAILABLE' },
      { status: 503 },
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) {
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
    Object.keys(payload).some((key) => key !== 'baseUrl' && key !== 'trustedOrigins') ||
    Object.keys(payload).length === 0
  ) {
    return NextResponse.json({ error: 'INVALID_SETTINGS_BODY' }, { status: 400 });
  }

  const input = payload as Record<string, unknown>;
  const currentSettings = getAuthSettings();
  const storedConfig = readSystemConfig();
  const nextAuth = { ...storedConfig.auth };
  let baseUrlChanged = false;

  if ('baseUrl' in input) {
    if (typeof input.baseUrl !== 'string' || input.baseUrl.length > 2048) {
      return NextResponse.json({ error: 'INVALID_AUTH_BASE_URL' }, { status: 400 });
    }

    let normalized: string;
    try {
      normalized = normalizeAuthBaseUrl(input.baseUrl);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'INVALID_AUTH_BASE_URL' },
        { status: 400 },
      );
    }

    if (process.env.BETTER_AUTH_URL?.trim()) {
      let environmentBaseUrl: string;
      try {
        environmentBaseUrl = normalizeAuthBaseUrl(currentSettings.baseUrl);
      } catch {
        return NextResponse.json(
          { error: 'BETTER_AUTH_URL_ENV_INVALID' },
          { status: 503 },
        );
      }
      if (normalized !== environmentBaseUrl) {
        return NextResponse.json(
          { error: 'SETTING_OVERRIDDEN_BY_ENVIRONMENT', setting: 'BETTER_AUTH_URL' },
          { status: 409 },
        );
      }
    } else {
      baseUrlChanged = normalized !== storedConfig.auth.baseUrl;
      nextAuth.baseUrl = normalized;
    }
  }

  if ('trustedOrigins' in input) {
    if (typeof input.trustedOrigins !== 'string' || input.trustedOrigins.length > 8192) {
      return NextResponse.json({ error: 'INVALID_FRONTEND_ORIGINS' }, { status: 400 });
    }

    if (process.env.BETTER_AUTH_TRUSTED_ORIGINS?.trim()) {
      const currentValue = currentSettings.trustedOrigins.join('\n');
      if (input.trustedOrigins.trim() !== currentValue) {
        return NextResponse.json(
          {
            error: 'SETTING_OVERRIDDEN_BY_ENVIRONMENT',
            setting: 'BETTER_AUTH_TRUSTED_ORIGINS',
          },
          { status: 409 },
        );
      }
    } else {
      try {
        nextAuth.trustedOrigins = parseFrontendOrigins(input.trustedOrigins);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'INVALID_FRONTEND_ORIGINS' },
          { status: 400 },
        );
      }
    }
  }

  try {
    saveSystemConfig({ ...storedConfig, auth: nextAuth });
    if (baseUrlChanged) refreshAuthConfig();
    return NextResponse.json(await snapshotResponse());
  } catch (error) {
    console.error(
      '[ADMIN_FRONTEND_INTEGRATION_SAVE_FAILED]',
      error instanceof Error ? error.message : 'Unknown frontend integration error',
    );
    return NextResponse.json(
      { error: 'FRONTEND_INTEGRATION_COULD_NOT_BE_SAVED' },
      { status: 503 },
    );
  }
}
