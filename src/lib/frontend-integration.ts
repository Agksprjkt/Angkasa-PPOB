import { createHash, timingSafeEqual } from 'node:crypto';

export const frontendApiSecretHeader = 'x-frontend-api-secret';

function normalizeOrigin(value: string, errorCode: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(errorCode);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error(errorCode);
  }

  return url.origin;
}

export function normalizeAuthBaseUrl(value: string) {
  return normalizeOrigin(value, 'INVALID_AUTH_BASE_URL');
}

export function parseFrontendOrigins(value: string) {
  const entries = value
    .split(/[,\r\n]/)
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (entries.length > 32) throw new Error('TOO_MANY_FRONTEND_ORIGINS');

  return [...new Set(entries.map((origin) =>
    normalizeOrigin(origin, 'INVALID_FRONTEND_ORIGIN'),
  ))];
}

export function getExternalApiOrigin(
  pathname: string,
  headers: Headers,
  requestOrigin: string,
  backendOrigin: string,
) {
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return null;

  const originValue = headers.get('origin')?.trim();
  const refererValue = headers.get('referer')?.trim();
  const value = originValue || refererValue;
  if (!value) {
    return headers.get('sec-fetch-site') === 'cross-site' ? 'cross-site' : null;
  }

  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    return 'invalid-origin';
  }

  if (origin === requestOrigin || origin === backendOrigin) return null;
  return origin;
}

export function frontendApiSecretMatches(actual: string, expected: string) {
  if (!expected || actual.length > 512) return false;
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}
