import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import { promotionalBanners } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

type BannerInput = Omit<
  typeof promotionalBanners.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// A banner may be image-only, so a title is optional. What is required is
// something to show and somewhere to go.
function isSafePath(value: string) {
  if (/^#[A-Za-z0-9_-]+$/.test(value)) return true;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return false;
  }
  try {
    return new URL(value, 'https://store.invalid').origin === 'https://store.invalid';
  } catch {
    return false;
  }
}

function isSafeTarget(value: string) {
  if (isSafePath(value)) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafeImageUrl(value: string) {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return true;
  }
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function parseBanner(value: unknown): BannerInput | null {
  if (!isRecord(value)) return null;
  const allowedFields = new Set([
    'title',
    'description',
    'imageUrl',
    'targetPath',
    'buttonLabel',
    'sortOrder',
    'startsAt',
    'endsAt',
    'enabled',
  ]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) return null;

  const startsAt = parseDate(value.startsAt);
  const endsAt = parseDate(value.endsAt);
  const title = typeof value.title === 'string' ? value.title.trim() : null;
  const description = typeof value.description === 'string' ? value.description.trim() : null;
  const imageUrl = typeof value.imageUrl === 'string' ? value.imageUrl.trim() : null;
  const buttonLabel = typeof value.buttonLabel === 'string' ? value.buttonLabel.trim() : null;
  if (
    title === null ||
    title.length > 120 ||
    description === null ||
    description.length > 500 ||
    imageUrl === null ||
    !isSafeImageUrl(imageUrl) ||
    buttonLabel === null ||
    buttonLabel.length > 40 ||
    typeof value.targetPath !== 'string' ||
    !isSafeTarget(value.targetPath) ||
    !Number.isSafeInteger(value.sortOrder) ||
    Number(value.sortOrder) < 0 ||
    startsAt === undefined ||
    endsAt === undefined ||
    (startsAt && endsAt && startsAt >= endsAt) ||
    typeof value.enabled !== 'boolean'
  ) {
    return null;
  }
  // Nothing to render and nothing to click is not a banner.
  if (!imageUrl && !title) return null;

  return {
    title,
    description,
    imageUrl,
    targetPath: value.targetPath,
    buttonLabel,
    sortOrder: Number(value.sortOrder),
    startsAt,
    endsAt,
    enabled: value.enabled,
  };
}

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const banners = await getDatabase()
      .select()
      .from(promotionalBanners)
      .orderBy(asc(promotionalBanners.sortOrder), asc(promotionalBanners.createdAt));
    return NextResponse.json({ banners }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(
      '[ADMIN_PROMOTIONS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'PROMOTIONS_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const banner = parseBanner(payload);
  if (!banner) {
    return NextResponse.json({ error: 'INVALID_PROMOTION' }, { status: 400 });
  }

  try {
    const [created] = await getDatabase()
      .insert(promotionalBanners)
      .values({ ...banner, id: randomUUID() })
      .returning();
    return NextResponse.json({ banner: created }, { status: 201 });
  } catch (error) {
    console.error(
      '[ADMIN_PROMOTION_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'PROMOTION_COULD_NOT_BE_CREATED' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (
    !isRecord(payload) ||
    typeof payload.id !== 'string' ||
    !isRecord(payload.updates)
  ) {
    return NextResponse.json({ error: 'INVALID_PROMOTION_UPDATE' }, { status: 400 });
  }

  const db = getDatabase();
  try {
    const current = await db
      .select()
      .from(promotionalBanners)
      .where(eq(promotionalBanners.id, payload.id))
      .limit(1)
      .then((rows) => rows[0]);
    if (!current) return NextResponse.json({ error: 'PROMOTION_NOT_FOUND' }, { status: 404 });

    // Only the editable columns may be merged: the stored row also carries id and
    // the timestamps, which parseBanner rejects as unknown fields.
    const { id: currentId, createdAt, updatedAt, ...editable } = current;
    void currentId;
    void createdAt;
    void updatedAt;
    const merged = parseBanner({ ...editable, ...payload.updates });
    if (!merged) {
      return NextResponse.json({ error: 'INVALID_PROMOTION_UPDATE' }, { status: 400 });
    }
    const [banner] = await db
      .update(promotionalBanners)
      .set({ ...merged, updatedAt: new Date() })
      .where(eq(promotionalBanners.id, current.id))
      .returning();
    return NextResponse.json({ banner });
  } catch (error) {
    console.error(
      '[ADMIN_PROMOTION_UPDATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'PROMOTION_COULD_NOT_BE_UPDATED' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'PROMOTION_ID_REQUIRED' }, { status: 400 });
  try {
    const [deleted] = await getDatabase()
      .delete(promotionalBanners)
      .where(eq(promotionalBanners.id, id))
      .returning({ id: promotionalBanners.id });
    return deleted
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: 'PROMOTION_NOT_FOUND' }, { status: 404 });
  } catch (error) {
    console.error(
      '[ADMIN_PROMOTION_DELETE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'PROMOTION_COULD_NOT_BE_DELETED' }, { status: 503 });
  }
}
