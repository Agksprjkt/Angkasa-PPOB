import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { Product, ProductCategory } from '@/types/ppob';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import { products } from '@/lib/server/db/schema';

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

function isProduct(value: unknown): value is Omit<Product, 'id'> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const product = value as Record<string, unknown>;
  const allowedFields = new Set([
    'vendorCode',
    'name',
    'category',
    'operator',
    'variant',
    'description',
    'basePrice',
    'sellPriceUser',
    'sellPriceAgent',
    'compareAtPrice',
    'status',
    'vendor',
  ]);
  if (Object.keys(product).some((key) => !allowedFields.has(key))) return false;
  return (
    typeof product.vendorCode === 'string' &&
    product.vendorCode.trim().length > 0 &&
    product.vendorCode.length <= 100 &&
    typeof product.name === 'string' &&
    product.name.trim().length > 0 &&
    product.name.length <= 200 &&
    typeof product.category === 'string' &&
    categories.includes(product.category as ProductCategory) &&
    typeof product.operator === 'string' &&
    product.operator.trim().length > 0 &&
    (product.variant === undefined ||
      product.variant === null ||
      (typeof product.variant === 'string' && product.variant.trim().length <= 60)) &&
    typeof product.description === 'string' &&
    Number.isSafeInteger(product.basePrice) &&
    Number.isSafeInteger(product.sellPriceUser) &&
    Number.isSafeInteger(product.sellPriceAgent) &&
    Number(product.basePrice) >= 0 &&
    Number(product.sellPriceUser) >= Number(product.basePrice) &&
    Number(product.sellPriceAgent) >= Number(product.basePrice) &&
    (product.compareAtPrice === undefined ||
      product.compareAtPrice === null ||
      (Number.isSafeInteger(product.compareAtPrice) &&
        Number(product.compareAtPrice) > Number(product.sellPriceUser))) &&
    (product.status === 'active' || product.status === 'inactive') &&
    (product.vendor === 'Digiflazz' || product.vendor === 'Manual')
  );
}

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const rows = await getDatabase()
      .select()
      .from(products)
      .orderBy(asc(products.name));
    return NextResponse.json({ products: rows });
  } catch (error) {
    console.error(
      '[ADMIN_PRODUCTS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'PRODUCTS_UNAVAILABLE' }, { status: 503 });
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
  if (!isProduct(payload)) {
    return NextResponse.json({ error: 'INVALID_PRODUCT' }, { status: 400 });
  }

  try {
    const [product] = await getDatabase()
      .insert(products)
      .values({ ...payload, id: randomUUID() })
      .returning();
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error(
      '[ADMIN_PRODUCT_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json(
      { error: 'PRODUCT_COULD_NOT_BE_CREATED' },
      { status: 409 },
    );
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
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    !('id' in payload) ||
    typeof payload.id !== 'string' ||
    !('updates' in payload) ||
    typeof payload.updates !== 'object' ||
    payload.updates === null ||
    Array.isArray(payload.updates)
  ) {
    return NextResponse.json({ error: 'INVALID_PRODUCT_UPDATE' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const [existing] = await db
      .select()
      .from(products)
      .where(eq(products.id, payload.id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
    }

    const updates = payload.updates as Record<string, unknown>;
    const allowedFields = new Set([
      'vendorCode',
      'name',
      'category',
      'operator',
      'variant',
      'description',
      'basePrice',
      'sellPriceUser',
      'sellPriceAgent',
      'compareAtPrice',
      'status',
      'vendor',
    ]);
    const currentProduct = {
      vendorCode: existing.vendorCode,
      name: existing.name,
      category: existing.category,
      operator: existing.operator,
      variant: existing.variant,
      description: existing.description,
      basePrice: existing.basePrice,
      sellPriceUser: existing.sellPriceUser,
      sellPriceAgent: existing.sellPriceAgent,
      compareAtPrice: existing.compareAtPrice,
      status: existing.status,
      vendor: existing.vendor,
    };
    if (
      Object.keys(updates).length === 0 ||
      Object.keys(updates).some((key) => !allowedFields.has(key)) ||
      !isProduct({ ...currentProduct, ...updates })
    ) {
      return NextResponse.json({ error: 'INVALID_PRODUCT_UPDATE' }, { status: 400 });
    }

    // An admin-set type must survive every future Digiflazz sync, so record the
    // manual source. An explicit null hands the type back to the sync.
    const variantUpdate = 'variant' in updates
      ? {
          variant: typeof updates.variant === 'string' && updates.variant.trim()
            ? updates.variant.trim()
            : null,
          variantSource: typeof updates.variant === 'string' && updates.variant.trim()
            ? 'manual' as const
            : 'sync' as const,
        }
      : {};

    const [product] = await db
      .update(products)
      .set({ ...updates, ...variantUpdate, updatedAt: new Date() })
      .where(eq(products.id, payload.id))
      .returning();
    if (!product) {
      return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error) {
    console.error(
      '[ADMIN_PRODUCT_UPDATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json(
      { error: 'PRODUCT_COULD_NOT_BE_UPDATED' },
      { status: 409 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'PRODUCT_ID_REQUIRED' }, { status: 400 });
  }

  const [product] = await getDatabase()
    .update(products)
    .set({ status: 'inactive', updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  if (!product) {
    return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({ product });
}
