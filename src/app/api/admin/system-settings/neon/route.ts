import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import {
  fetchNeonConnectionUris,
  fetchNeonUsage,
  stripUriPassword,
  clearNeonCache,
} from '@/lib/server/neon-api';
import { getSystemConfig, saveSystemConfig } from '@/lib/server/system-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const [uris, usage] = await Promise.all([
    fetchNeonConnectionUris(),
    fetchNeonUsage(),
  ]);

  return NextResponse.json({
    connection: uris.ok
      ? {
          ok: true,
          pooled: stripUriPassword(uris.data.pooled),
          direct: stripUriPassword(uris.data.direct),
          passwordIncluded: false,
        }
      : { ok: false, reason: uris.reason },
    usage,
  });
}

// Applying the URIs server-side keeps the role password out of the browser.
export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const uris = await fetchNeonConnectionUris();
  if (!uris.ok) {
    return NextResponse.json({ error: 'NEON_' + uris.reason }, { status: 400 });
  }

  try {
    const config = getSystemConfig();
    config.database.neon.enabled = true;
    config.database.neon.urlPooled = uris.data.pooled;
    config.database.neon.urlDirect = uris.data.direct;
    config.database.migrateOnStartup = false;
    saveSystemConfig(config);
    clearNeonCache();
    return NextResponse.json({
      ok: true,
      pooled: stripUriPassword(uris.data.pooled),
      direct: stripUriPassword(uris.data.direct),
    });
  } catch (error) {
    console.error(
      '[ADMIN_NEON_APPLY_FAILED]',
      error instanceof Error ? error.message : 'Unknown Neon error',
    );
    return NextResponse.json({ error: 'NEON_APPLY_FAILED' }, { status: 503 });
  }
}
