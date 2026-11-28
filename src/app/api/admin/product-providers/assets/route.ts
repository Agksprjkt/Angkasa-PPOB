import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { isAdministrator } from '@/lib/server/authorization';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
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

function assetFilename(assetUrl: string) {
  const prefix = '/api/product-provider-assets/';
  if (!assetUrl.startsWith(prefix)) return null;
  const encodedFilename = assetUrl.slice(prefix.length);
  if (!encodedFilename || encodedFilename.includes('/')) return null;
  try {
    return decodeURIComponent(encodedFilename);
  } catch {
    return null;
  }
}

async function deleteAssetIfUnreferenced(assetUrl: string | null) {
  if (!assetUrl) return;
  const filename = assetFilename(assetUrl);
  if (!filename) return;
  const settings = await getDatabase()
    .select({
      iconUrl: productProviderSettings.iconUrl,
      coverUrl: productProviderSettings.coverUrl,
    })
    .from(productProviderSettings);
  if (settings.some((setting) =>
    setting.iconUrl === assetUrl || setting.coverUrl === assetUrl,
  )) return;
  await deleteUploadedImage('product-providers', filename);
}

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
    await invalidateCatalog();
    await deleteAssetIfUnreferenced(currentUrl);
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
  const operatorsInput = form.get('operators');
  const kind = form.get('kind');
  const file = form.get('file');
  let operators: string[];
  if (typeof operatorsInput === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(operatorsInput);
    } catch {
      return NextResponse.json({ error: 'INVALID_PROVIDER_ASSET' }, { status: 400 });
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length < 1 ||
      parsed.length > 50 ||
      parsed.some((value) =>
        typeof value !== 'string' || !value.trim() || value.length > 200,
      )
    ) {
      return NextResponse.json({ error: 'INVALID_PROVIDER_ASSET' }, { status: 400 });
    }
    operators = [...new Set(parsed.map((value: string) => value.trim()))];
  } else if (typeof operator === 'string' && operator.trim() && operator.length <= 200) {
    operators = [operator.trim()];
  } else {
    operators = [];
  }
  if (
    typeof category !== 'string' || !categories.includes(category as ProductCategory) ||
    operators.length === 0 ||
    (kind !== 'icon' && kind !== 'cover') ||
    !(file instanceof File) || file.size > 1_000_000
  ) {
    return NextResponse.json({ error: 'INVALID_PROVIDER_ASSET' }, { status: 400 });
  }

  let uploadedFilename: string | null = null;
  let settingsUpdated = false;
  try {
    const { filename } = await saveUploadedImage(file, 'product-providers', randomUUID());
    uploadedFilename = filename;
    const assetUrl = `/api/product-provider-assets/${filename}`;
    const db = getDatabase();
    const assetColumn = kind === 'icon' ? 'iconUrl' : 'coverUrl';
    const oldSettings = await db
      .select({
        iconUrl: productProviderSettings.iconUrl,
        coverUrl: productProviderSettings.coverUrl,
      })
      .from(productProviderSettings)
      .where(and(
        eq(productProviderSettings.category, category as ProductCategory),
        inArray(productProviderSettings.operator, operators),
      ));
    const oldAssetUrls = [...new Set(
      oldSettings.map((setting) => setting[assetColumn]).filter(
        (url): url is string => Boolean(url),
      ),
    )];
    await db.transaction(async (tx) => {
      for (const targetOperator of operators) {
        await tx
          .insert(productProviderSettings)
          .values({
            id: randomUUID(),
            category: category as ProductCategory,
            operator: targetOperator,
            description: '',
            iconUrl: kind === 'icon' ? assetUrl : null,
            coverUrl: kind === 'cover' ? assetUrl : null,
          })
          .onConflictDoUpdate({
            target: [productProviderSettings.category, productProviderSettings.operator],
            set: {
              [assetColumn]: assetUrl,
              updatedAt: new Date(),
            },
          });
      }
    });
    settingsUpdated = true;
    await invalidateCatalog();
    for (const oldAssetUrl of oldAssetUrls) {
      await deleteAssetIfUnreferenced(oldAssetUrl);
    }
    return NextResponse.json({ assetUrl });
  } catch (error) {
    if (uploadedFilename && !settingsUpdated) {
      try {
        await deleteUploadedImage('product-providers', uploadedFilename);
      } catch (cleanupError) {
        console.error(
          '[ADMIN_PROVIDER_ASSET_CLEANUP_FAILED]',
          cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error',
        );
      }
    }
    const code = error instanceof Error ? error.message : 'IMAGE_UPLOAD_FAILED';
    const status = code === 'IMAGE_SIZE_INVALID' ? 413 : code.startsWith('IMAGE_') ? 400 : 500;
    if (status === 500) console.error('[ADMIN_PROVIDER_ASSET_UPLOAD_FAILED]', code);
    return NextResponse.json({ error: code }, { status });
  }
}
