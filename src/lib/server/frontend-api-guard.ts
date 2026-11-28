import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import {
  frontendApiSecretHeader,
  frontendApiSecretMatches,
  getExternalApiOrigin,
  isInternalOrigin,
} from '@/lib/frontend-integration';
import { getIntegrationConfig } from './integration-settings';
import { getAuthSettings } from './system-config';

export async function guardExternalFrontendApi(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return null;

  const supplied = request.headers.get(frontendApiSecretHeader);
  const observedOrigin =
    request.headers.get('origin')?.trim() ||
    request.headers.get('referer')?.trim();
  const crossSite = request.headers.get('sec-fetch-site') === 'cross-site';
  if (!supplied && !observedOrigin && !crossSite) return null;
  if (!supplied && observedOrigin) {
    try {
      if (new URL(observedOrigin).origin === request.nextUrl.origin) return null;
    } catch {
      // Invalid origin values are handled as external by getExternalApiOrigin.
    }
  }

  let externalOrigin: string | null;

  try {
    const authSettings = getAuthSettings();
    externalOrigin = getExternalApiOrigin(
      request.nextUrl.pathname,
      request.headers,
      request.nextUrl.origin,
      new URL(authSettings.baseUrl).origin,
    );
    // Every trusted origin belongs to this deployment, so it must reach its own
    // login endpoint without the frontend API secret. Comparing only the base URL
    // locked a second host (www) out of its own auth endpoint.
    if (
      externalOrigin &&
      externalOrigin !== 'cross-site' &&
      externalOrigin !== 'invalid-origin' &&
      isInternalOrigin(externalOrigin, authSettings.baseUrl, authSettings.trustedOrigins)
    ) {
      externalOrigin = null;
    }
  } catch (error) {
    console.error(
      '[FRONTEND_API_GUARD_ORIGIN_CONFIG_FAILED]',
      error instanceof Error ? error.message : 'Unknown auth configuration error',
    );
    return NextResponse.json({ error: 'FRONTEND_API_AUTH_UNAVAILABLE' }, { status: 503 });
  }

  if (!externalOrigin && !supplied) return null;

  let expected: string | undefined;
  try {
    const { values } = await getIntegrationConfig();
    expected = values.frontendApiSecret;
  } catch (error) {
    console.error(
      '[FRONTEND_API_GUARD_SECRET_READ_FAILED]',
      error instanceof Error ? error.message : 'Unknown integration settings error',
    );
    return NextResponse.json({ error: 'FRONTEND_API_AUTH_UNAVAILABLE' }, { status: 503 });
  }

  if (!expected) {
    return NextResponse.json(
      { error: 'FRONTEND_API_SECRET_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  if (!supplied || !frontendApiSecretMatches(supplied, expected)) {
    return NextResponse.json({ error: 'INVALID_FRONTEND_API_SECRET' }, { status: 401 });
  }

  return null;
}
