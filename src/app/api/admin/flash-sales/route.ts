import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getFlashSalePrice } from '@/lib/flash-sale';
import { isAdministrator } from '@/lib/server/authorization';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
import { getDatabase } from '@/lib/server/db/client';
import { flashSaleOffers, products } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

type FlashSaleInput = {
  productId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  quotaLimit: number | null;
  status: 'draft' | 'active' | 'paused';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOffer(value: unknown): FlashSaleInput | null {
  if (!isRecord(value)) return null;
  const allowedFields = new Set([
    'productId',
    'title',
    'startsAt',
    'endsAt',
    'quotaLimit',
    'status',
  ]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) return null;
  const startsAt = parseDate(value.startsAt);
  const endsAt = parseDate(value.endsAt);
  if (
    typeof value.productId !== 'string' ||
    !value.productId.trim() ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.trim().length > 120 ||
    startsAt === null ||
    endsAt === null ||
    startsAt >= endsAt ||
    !(
      value.quotaLimit === null ||
      (Number.isSafeInteger(value.quotaLimit) && Number(value.quotaLimit) > 0)
    ) ||
    !['draft', 'active', 'paused'].includes(String(value.status))
  ) {
    return null;
  }
  return {
    productId: value.productId,
    title: value.title.trim(),
    startsAt,
    endsAt,
    quotaLimit: value.quotaLimit === null ? null : Number(value.quotaLimit),
    status: value.status as FlashSaleInput['status'],
  };
}

function offerInput(offer: typeof flashSaleOffers.$inferSelect): FlashSaleInput {
  return {
    productId: offer.productId,
    title: offer.title,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    quotaLimit: offer.quotaLimit,
    status: offer.status,
  };
}

async function validateOffer(
  input: FlashSaleInput,
  excludeId?: string,
) {
  const db = getDatabase();
  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!product || product.status !== 'active') return 'FLASH_SALE_PRODUCT_UNAVAILABLE';
  // Price always comes from the product; without a valid selling price the offer
  // would be unusable at checkout.
  if (getFlashSalePrice(product, 'user') === null) return 'FLASH_SALE_PRICE_INVALID';

  const overlapping = await db
    .select({
      id: flashSaleOffers.id,
      startsAt: flashSaleOffers.startsAt,
      endsAt: flashSaleOffers.endsAt,
    })
    .from(flashSaleOffers)
    .where(and(
      eq(flashSaleOffers.productId, input.productId),
      eq(flashSaleOffers.status, 'active'),
    ));
  if (overlapping.some((offer) =>
    offer.id !== excludeId &&
    input.startsAt < offer.endsAt &&
    input.endsAt > offer.startsAt
  )) {
    return 'FLASH_SALE_SCHEDULE_CONFLICT';
  }

  return null;
}

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const offers = await getDatabase()
      .select({ offer: flashSaleOffers, product: products })
      .from(flashSaleOffers)
      .innerJoin(products, eq(flashSaleOffers.productId, products.id))
      .orderBy(asc(flashSaleOffers.startsAt), asc(products.name));
    return NextResponse.json({ offers }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(
      '[ADMIN_FLASH_SALES_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'FLASH_SALES_UNAVAILABLE' }, { status: 503 });
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
  const input = parseOffer(payload);
  if (!input) return NextResponse.json({ error: 'INVALID_FLASH_SALE' }, { status: 400 });

  try {
    const invalid = await validateOffer(input);
    if (invalid) {
      const status = invalid === 'FLASH_SALE_SCHEDULE_CONFLICT' ? 409 : 400;
      return NextResponse.json({ error: invalid }, { status });
    }
    const db = getDatabase();
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    const salePrice = getFlashSalePrice(product, 'user');
    if (salePrice === null) {
      return NextResponse.json({ error: 'FLASH_SALE_PRICE_INVALID' }, { status: 400 });
    }
    const [offer] = await db
      .insert(flashSaleOffers)
      .values({ ...input, salePrice, id: randomUUID() })
      .returning();
    await invalidateCatalog();
    return NextResponse.json({ offer }, { status: 201 });
  } catch (error) {
    console.error(
      '[ADMIN_FLASH_SALE_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'FLASH_SALE_COULD_NOT_BE_CREATED' }, { status: 503 });
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
  if (!isRecord(payload) || typeof payload.id !== 'string' || !isRecord(payload.updates)) {
    return NextResponse.json({ error: 'INVALID_FLASH_SALE_UPDATE' }, { status: 400 });
  }
  const db = getDatabase();
  try {
    const current = await db
      .select()
      .from(flashSaleOffers)
      .where(eq(flashSaleOffers.id, payload.id))
      .limit(1)
      .then((rows) => rows[0]);
    if (!current) return NextResponse.json({ error: 'FLASH_SALE_NOT_FOUND' }, { status: 404 });

    const next = parseOffer({ ...offerInput(current), ...payload.updates });
    if (!next) {
      return NextResponse.json({ error: 'INVALID_FLASH_SALE_UPDATE' }, { status: 400 });
    }
    const saleFieldsChanged =
      next.productId !== current.productId ||
      next.startsAt.getTime() !== current.startsAt.getTime() ||
      next.endsAt.getTime() !== current.endsAt.getTime() ||
      next.quotaLimit !== current.quotaLimit;
    if (current.quantityReserved > 0 && saleFieldsChanged) {
      return NextResponse.json({ error: 'FLASH_SALE_HAS_PENDING_ORDERS' }, { status: 409 });
    }
    if (
      next.quotaLimit !== null &&
      next.quotaLimit < current.quantitySold + current.quantityReserved
    ) {
      return NextResponse.json({ error: 'FLASH_SALE_QUOTA_TOO_LOW' }, { status: 400 });
    }

    const invalid = await validateOffer(next, current.id);
    if (invalid) {
      const status = invalid === 'FLASH_SALE_SCHEDULE_CONFLICT' ? 409 : 400;
      return NextResponse.json({ error: invalid }, { status });
    }
    // Keep the stored price in sync with the product's current selling price.
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, next.productId))
      .limit(1);
    const salePrice = getFlashSalePrice(product, 'user');
    if (salePrice === null) {
      return NextResponse.json({ error: 'FLASH_SALE_PRICE_INVALID' }, { status: 400 });
    }
    const [offer] = await db
      .update(flashSaleOffers)
      .set({ ...next, salePrice, updatedAt: new Date() })
      .where(eq(flashSaleOffers.id, current.id))
      .returning();
    await invalidateCatalog();
    return NextResponse.json({ offer });
  } catch (error) {
    console.error(
      '[ADMIN_FLASH_SALE_UPDATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'FLASH_SALE_COULD_NOT_BE_UPDATED' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'FLASH_SALE_ID_REQUIRED' }, { status: 400 });
  try {
    const current = await getDatabase()
      .select()
      .from(flashSaleOffers)
      .where(eq(flashSaleOffers.id, id))
      .limit(1)
      .then((rows) => rows[0]);
    if (!current) return NextResponse.json({ error: 'FLASH_SALE_NOT_FOUND' }, { status: 404 });
    if (current.quantitySold > 0 || current.quantityReserved > 0) {
      return NextResponse.json({ error: 'FLASH_SALE_HAS_ORDERS' }, { status: 409 });
    }
    await getDatabase().delete(flashSaleOffers).where(eq(flashSaleOffers.id, id));
    await invalidateCatalog();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      '[ADMIN_FLASH_SALE_DELETE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'FLASH_SALE_COULD_NOT_BE_DELETED' }, { status: 503 });
  }
}
