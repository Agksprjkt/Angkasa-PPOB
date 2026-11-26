import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { isAdministrator } from '@/lib/server/authorization';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
import { getDatabase } from '@/lib/server/db/client';
import { featuredProducts, products } from '@/lib/server/db/schema';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProvider(value: unknown): value is { category: ProductCategory; operator: string } {
  if (!isRecord(value)) return false;
  return typeof value.category === 'string' &&
    categories.includes(value.category as ProductCategory) &&
    typeof value.operator === 'string' &&
    value.operator.trim().length > 0 &&
    value.operator.length <= 200;
}

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const rows = await getDatabase()
      .select()
      .from(featuredProducts)
      .orderBy(asc(featuredProducts.sortOrder), asc(featuredProducts.createdAt));
    return NextResponse.json({ featured: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[ADMIN_FEATURED_GET_FAILED]', error);
    return NextResponse.json({ error: 'FEATURED_UNAVAILABLE' }, { status: 503 });
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
  if (!isProvider(payload)) {
    return NextResponse.json({ error: 'INVALID_FEATURED_PROVIDER' }, { status: 400 });
  }
  const category = payload.category;
  const operator = payload.operator.trim();
  const rawSortOrder = (payload as { sortOrder?: unknown }).sortOrder;
  const sortOrder = Number.isSafeInteger(rawSortOrder) ? Number(rawSortOrder) : 0;

  try {
    const db = getDatabase();
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.category, category), eq(products.operator, operator)))
      .limit(1);
    if (!product) {
      return NextResponse.json({ error: 'PROVIDER_NOT_FOUND' }, { status: 404 });
    }
    const [existing] = await db
      .select({ id: featuredProducts.id })
      .from(featuredProducts)
      .where(and(eq(featuredProducts.category, category), eq(featuredProducts.operator, operator)))
      .limit(1);
    if (existing) {
      return NextResponse.json({ error: 'FEATURED_ALREADY_EXISTS' }, { status: 409 });
    }
    const [created] = await db
      .insert(featuredProducts)
      .values({ id: randomUUID(), category, operator, sortOrder, enabled: true })
      .returning();
    await invalidateCatalog();
    return NextResponse.json({ featured: created }, { status: 201 });
  } catch (error) {
    console.error('[ADMIN_FEATURED_CREATE_FAILED]', error);
    return NextResponse.json({ error: 'FEATURED_CREATE_FAILED' }, { status: 503 });
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
  if (!isRecord(payload) || typeof payload.id !== 'string') {
    return NextResponse.json({ error: 'INVALID_FEATURED_UPDATE' }, { status: 400 });
  }
  const updates: { sortOrder?: number; enabled?: boolean } = {};
  if (payload.sortOrder !== undefined) {
    if (!Number.isSafeInteger(payload.sortOrder)) {
      return NextResponse.json({ error: 'INVALID_FEATURED_UPDATE' }, { status: 400 });
    }
    updates.sortOrder = Number(payload.sortOrder);
  }
  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') {
      return NextResponse.json({ error: 'INVALID_FEATURED_UPDATE' }, { status: 400 });
    }
    updates.enabled = payload.enabled;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'INVALID_FEATURED_UPDATE' }, { status: 400 });
  }
  try {
    const [updated] = await getDatabase()
      .update(featuredProducts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(featuredProducts.id, payload.id))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: 'FEATURED_NOT_FOUND' }, { status: 404 });
    }
    await invalidateCatalog();
    return NextResponse.json({ featured: updated });
  } catch (error) {
    console.error('[ADMIN_FEATURED_UPDATE_FAILED]', error);
    return NextResponse.json({ error: 'FEATURED_UPDATE_FAILED' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'FEATURED_ID_REQUIRED' }, { status: 400 });
  }
  try {
    const [removed] = await getDatabase()
      .delete(featuredProducts)
      .where(eq(featuredProducts.id, id))
      .returning({ id: featuredProducts.id });
    if (!removed) {
      return NextResponse.json({ error: 'FEATURED_NOT_FOUND' }, { status: 404 });
    }
    await invalidateCatalog();
    return NextResponse.json({ id: removed.id });
  } catch (error) {
    console.error('[ADMIN_FEATURED_DELETE_FAILED]', error);
    return NextResponse.json({ error: 'FEATURED_DELETE_FAILED' }, { status: 503 });
  }
}
