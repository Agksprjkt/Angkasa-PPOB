import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { storeSettings } from '@/lib/server/db/schema';
import { getStoreSettings } from '@/lib/server/store-settings';

export const runtime = 'nodejs';

const textLimits = {
  storeName: 100,
  tagline: 160,
  description: 2000,
  supportPhone: 40,
  seoTitle: 70,
  seoDescription: 320,
  googleSiteVerification: 200,
  bingSiteVerification: 200,
} as const;

const editableFields = Object.keys(textLimits);
type EditableField = keyof typeof textLimits;

async function isAdmin(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin';
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    return NextResponse.json({ settings: await getStoreSettings() });
  } catch (error) {
    console.error('[ADMIN_STORE_SETTINGS_GET_FAILED]', error);
    return NextResponse.json({ error: 'STORE_SETTINGS_UNAVAILABLE' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'INVALID_SETTINGS_BODY' }, { status: 400 });
  }

  const input = payload as Record<string, unknown>;
  if (Object.keys(input).some((key) => !editableFields.includes(key))) {
    return NextResponse.json({ error: 'UNKNOWN_SETTING' }, { status: 400 });
  }
  const updates: Partial<Record<EditableField, string>> = {};
  for (const [field, rawValue] of Object.entries(input)) {
    if (typeof rawValue !== 'string' || rawValue.length > textLimits[field as EditableField]) {
      return NextResponse.json({ error: 'INVALID_SETTING_VALUE', field }, { status: 400 });
    }
    updates[field as EditableField] = rawValue.trim();
  }
  if ('storeName' in updates && !updates.storeName) {
    return NextResponse.json({ error: 'STORE_NAME_REQUIRED' }, { status: 400 });
  }
  if ('supportPhone' in updates && updates.supportPhone && !/^[+\d() .-]{6,40}$/.test(updates.supportPhone)) {
    return NextResponse.json({ error: 'INVALID_SUPPORT_PHONE' }, { status: 400 });
  }

  try {
    await getStoreSettings();
    await getDatabase()
      .update(storeSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(storeSettings.id, 'default'));
    return NextResponse.json({ settings: await getStoreSettings() });
  } catch (error) {
    console.error('[ADMIN_STORE_SETTINGS_SAVE_FAILED]', error);
    return NextResponse.json({ error: 'STORE_SETTINGS_COULD_NOT_BE_SAVED' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    (payload as { action?: unknown }).action !== 'generate-indexnow-key'
  ) {
    return NextResponse.json({ error: 'INVALID_SETTINGS_ACTION' }, { status: 400 });
  }
  try {
    const indexNowKey = randomBytes(16).toString('hex');
    await getStoreSettings();
    await getDatabase()
      .update(storeSettings)
      .set({ indexNowKey, updatedAt: new Date() })
      .where(eq(storeSettings.id, 'default'));
    return NextResponse.json({ indexNowKey });
  } catch (error) {
    console.error('[ADMIN_INDEXNOW_KEY_GENERATION_FAILED]', error);
    return NextResponse.json({ error: 'INDEXNOW_KEY_COULD_NOT_BE_GENERATED' }, { status: 503 });
  }
}
