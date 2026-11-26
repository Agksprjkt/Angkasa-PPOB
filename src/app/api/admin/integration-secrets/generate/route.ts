import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { saveIntegrationSettings } from '@/lib/server/integration-settings';
import {
  generateSecret,
  isSecretTarget,
  isStoredSecretTarget,
} from '@/lib/secret-generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A generated secret is shown once, in this response only. It is never written
// to a log and never returned by the settings snapshot.
const windowMs = 60_000;
const maxPerWindow = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

function overRateLimit(key: string) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > maxPerWindow;
}

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const actorId = session.user.id;
  if (overRateLimit(actorId)) {
    return NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const target = (payload as { target?: unknown } | null)?.target;
  if (!isSecretTarget(target)) {
    return NextResponse.json({ error: 'INVALID_SECRET_TARGET' }, { status: 400 });
  }

  const value = generateSecret(randomBytes);

  // better-auth reads its secret from the environment and every session depends
  // on it, so the dashboard can only hand the value over for the admin to paste.
  if (!isStoredSecretTarget(target)) {
    return NextResponse.json({ target, value, saved: false });
  }

  try {
    await saveIntegrationSettings(actorId, { [target]: value }, []);
    return NextResponse.json({ target, value, saved: true });
  } catch (error) {
    console.error(
      '[ADMIN_SECRET_GENERATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return NextResponse.json({ error: 'SECRET_NOT_SAVED' }, { status: 503 });
  }
}
