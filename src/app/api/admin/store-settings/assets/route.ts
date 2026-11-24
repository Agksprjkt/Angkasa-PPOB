import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { storeSettings } from '@/lib/server/db/schema';
import { getStoreSettings } from '@/lib/server/store-settings';
import { deleteUploadedImage, saveUploadedImage } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

// Logo, app icon, and favicon are separate files: the logo shows in the header,
// the icon is used by the PWA manifest and apple-touch-icon, and the favicon is
// the browser tab image.
const assets = {
  logo: { column: 'logoFile', label: 'logoUrl' },
  icon: { column: 'iconFile', label: 'iconUrl' },
  favicon: { column: 'faviconFile', label: 'faviconUrl' },
} as const;

type AssetKind = keyof typeof assets;

function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === 'string' && value in assets;
}

async function requireAdmin(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin';
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_FORM_DATA' }, { status: 400 });
  }
  const kind = form.get('kind');
  const file = form.get('file');
  if (!isAssetKind(kind) || !(file instanceof File) || file.size > 1_000_000) {
    return NextResponse.json({ error: 'ASSET_REQUIRED_OR_TOO_LARGE' }, { status: 400 });
  }

  try {
    const { filename } = await saveUploadedImage(file, 'store-profile', randomUUID());
    const previous = await getStoreSettings();
    const column = assets[kind].column;
    await getDatabase()
      .update(storeSettings)
      .set({ [column]: filename, updatedAt: new Date() })
      .where(eq(storeSettings.id, 'default'));

    const previousFile = previous[column];
    if (previousFile && previousFile !== filename) {
      await deleteUploadedImage('store-profile', previousFile);
    }
    return NextResponse.json({
      [assets[kind].label]: `/api/store-assets/${encodeURIComponent(filename)}`,
      filename,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'ASSET_UPLOAD_FAILED';
    const status = code === 'IMAGE_SIZE_INVALID' ? 413 : code.startsWith('IMAGE_') ? 400 : 503;
    if (status === 503) console.error('[ADMIN_STORE_ASSET_UPLOAD_FAILED]', code);
    return NextResponse.json({ error: code }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const kind = request.nextUrl.searchParams.get('kind');
  if (!isAssetKind(kind)) {
    return NextResponse.json({ error: 'INVALID_ASSET_KIND' }, { status: 400 });
  }
  try {
    const settings = await getStoreSettings();
    const column = assets[kind].column;
    await getDatabase()
      .update(storeSettings)
      .set({ [column]: null, updatedAt: new Date() })
      .where(eq(storeSettings.id, 'default'));
    if (settings[column]) {
      await deleteUploadedImage('store-profile', settings[column]);
    }
    return NextResponse.json({ [assets[kind].label]: null });
  } catch (error) {
    console.error('[ADMIN_STORE_ASSET_DELETE_FAILED]', error);
    return NextResponse.json({ error: 'ASSET_DELETE_FAILED' }, { status: 503 });
  }
}
