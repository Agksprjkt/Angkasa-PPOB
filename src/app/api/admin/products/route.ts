import { randomUUID } from 'node:crypto';
import { asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { Product, ProductCategory } from '@/types/ppob';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import { productProviderSettings, products } from '@/lib/server/db/schema';
import { getVendorRuntimeConfig } from '@/lib/server/integration-settings';
import { parseBulkStatusInput } from '@/lib/product-bulk-update';

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
    'vendorLabel',
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
    (product.vendorLabel === undefined ||
      product.vendorLabel === null ||
      (typeof product.vendorLabel === 'string' && product.vendorLabel.trim().length <= 40)) &&
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
    (product.vendor === 'Digiflazz' || product.vendor === 'TokoVoucher' || product.vendor === 'Manual')
  );
}

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    // A vendor can be hidden from the dashboard without touching its orders or
    // the storefront catalogue, so the list stays small for big vendors.
    const { digiflazzShowProducts, tokovoucherShowProducts } =
      await getVendorRuntimeConfig();
    const hiddenVendors = [
      ...(digiflazzShowProducts ? [] : (['Digiflazz'] as const)),
      ...(tokovoucherShowProducts ? [] : (['TokoVoucher'] as const)),
    ];
    const sort = request.nextUrl.searchParams.get('sort');
    const direction = request.nextUrl.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
    const sortColumn = sort === 'price' ? products.sellPriceUser : products.name;
    const db = getDatabase();
    const [rows, providers] = await Promise.all([
      db
        .select()
        .from(products)
        .where(hiddenVendors.length ? notInArray(products.vendor, [...hiddenVendors]) : undefined)
        .orderBy(direction === 'desc' ? desc(sortColumn) : asc(sortColumn)),
      db
        .select({
          category: productProviderSettings.category,
          operator: productProviderSettings.operator,
          aliasOf: productProviderSettings.aliasOf,
        })
        .from(productProviderSettings),
    ]);
    // The panel needs the alias to merge two vendors into one provider row.
    const aliasByName = new Map(
      providers
        .filter((provider) => provider.aliasOf?.trim())
        .map((provider) => [
          `${provider.category}:${provider.operator.toLocaleLowerCase('id-ID')}`,
          provider.aliasOf!.trim(),
        ]),
    );
    return NextResponse.json({
      products: rows.map((product) => ({
        ...product,
        providerAlias:
          aliasByName.get(`${product.category}:${product.operator.toLocaleLowerCase('id-ID')}`) ??
          null,
      })),
    });
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

  // Bulk path: flipping a whole provider must be one statement, not one request
  // per product. A 600-product provider used to fire 600 parallel PATCHes.
  if (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    'ids' in payload
  ) {
    const parsed = parseBulkStatusInput(payload);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    try {
      const updated = await getDatabase()
        .update(products)
        .set({ status: parsed.input.status, updatedAt: new Date() })
        .where(inArray(products.id, parsed.input.ids))
        .returning();
      return NextResponse.json({ products: updated });
    } catch (error) {
      console.error(
        '[ADMIN_PRODUCTS_BULK_STATUS_FAILED]',
        error instanceof Error ? error.message : 'Unknown database error',
      );
      return NextResponse.json(
        { error: 'PRODUCT_COULD_NOT_BE_UPDATED' },
        { status: 409 },
      );
    }
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
      'vendorLabel',
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
      vendorLabel: existing.vendorLabel,
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
