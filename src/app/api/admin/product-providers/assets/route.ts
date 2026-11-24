import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import { productProviderSettings } from '@/lib/server/db/schema';
import { deleteUploadedImage, saveUploadedImage } from '@/lib/server/uploaded-image';
import type { ProductCategory } from '@/types/ppob';

export const runtime = 'nodejs';

const categories: ProductCategory[] = [
  'pulsa',
  'data',
  'voucher',
  'pln',
  'tagihan',
  'ewallet',
  'game',
];

export async function DELETE(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  const category = params.get('category');
  const operator = params.get('operator');
  const kind = params.get('kind');
  if (
    typeof category !== 'string' || !categories.includes(category as ProductCategory) ||
    typeof operator !== 'string' || !operator.trim() || operator.length > 200 ||
    (kind !== 'icon' && kind !== 'cover')
  ) {
    return NextResponse.json({ error: 'INVALID_PROVIDER_ASSET' }, { status: 400 });
  }

  const column = kind === 'icon' ? 'iconUrl' : 'coverUrl';
  try {
    const [existing] = await getDatabase()
      .select()
      .from(productProviderSettings)
      .where(and(
        eq(productProviderSettings.category, category as ProductCategory),
        eq(productProviderSettings.operator, operator.trim()),
      ))
      .limit(1);
    const currentUrl = existing?.[column] ?? null;
    if (existing) {
      await getDatabase()
        .update(productProviderSettings)
        .set({ [column]: null, updatedAt: new Date() })
        .where(eq(productProviderSettings.id, existing.id));
    }
    const filename = currentUrl?.split('/').pop();
    if (filename) {
      await deleteUploadedImage('product-providers', decodeURIComponent(filename));
    }
    return NextResponse.json({ assetUrl: null });
  } catch (error) {
    console.error('[ADMIN_PROVIDER_ASSET_DELETE_FAILED]', error);
    return NextResponse.json({ error: 'PROVIDER_ASSET_DELETE_FAILED' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 1_100_000) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_FORM_DATA' }, { status: 400 });
  }
  const category = form.get('category');
  const operator = form.get('operator');
  const kind = form.get('kind');
  const file = form.get('file');
  if (
    typeof category !== 'string' || !categories.includes(category as ProductCategory) ||
    typeof operator !== 'string' || !operator.trim() || operator.length > 200 ||
    (kind !== 'icon' && kind !== 'cover') ||
    !(file instanceof File) || file.size > 1_000_000
  ) {
    return NextResponse.json({ error: 'INVALID_PROVIDER_ASSET' }, { status: 400 });
  }

  try {
    const { filename } = await saveUploadedImage(file, 'product-providers', randomUUID());
    const assetUrl = `/api/product-provider-assets/${filename}`;
    const db = getDatabase();
    await db
      .insert(productProviderSettings)
      .values({
        id: randomUUID(),
        category: category as ProductCategory,
        operator: operator.trim(),
        description: '',
        iconUrl: kind === 'icon' ? assetUrl : null,
        coverUrl: kind === 'cover' ? assetUrl : null,
      })
      .onConflictDoUpdate({
        target: [productProviderSettings.category, productProviderSettings.operator],
        set: {
          [kind === 'icon' ? 'iconUrl' : 'coverUrl']: assetUrl,
          updatedAt: new Date(),
        },
      });
    return NextResponse.json({ assetUrl });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'IMAGE_UPLOAD_FAILED';
    const status = code === 'IMAGE_SIZE_INVALID' ? 413 : code.startsWith('IMAGE_') ? 400 : 500;
    if (status === 500) console.error('[ADMIN_PROVIDER_ASSET_UPLOAD_FAILED]', code);
    return NextResponse.json({ error: code }, { status });
  }
}
