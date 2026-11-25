import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import { vouchers } from '@/lib/server/db/schema';
import { isValidVoucherCode, normalizeVoucherCode } from '@/lib/voucher-core';

export const runtime = 'nodejs';

type VoucherInput = Omit<typeof vouchers.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

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

// null means unlimited; anything else must be a positive integer.
function parseOptionalCount(value: unknown) {
  if (value === null || value === '') return null;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) return undefined;
  return value as number;
}

function parseVoucher(value: unknown): VoucherInput | null {
  if (!isRecord(value)) return null;
  const allowed = new Set([
    'code',
    'description',
    'discountType',
    'discountValue',
    'maxDiscount',
    'minOrder',
    'quotaLimit',
    'perUserLimit',
    'startsAt',
    'endsAt',
    'enabled',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;

  if (typeof value.code !== 'string') return null;
  const code = normalizeVoucherCode(value.code);
  if (!isValidVoucherCode(code)) return null;

  if (value.discountType !== 'percent' && value.discountType !== 'fixed') return null;
  if (!Number.isSafeInteger(value.discountValue)) return null;
  const discountValue = value.discountValue as number;
  if (discountValue <= 0) return null;
  if (value.discountType === 'percent' && discountValue > 100) return null;

  const maxDiscount = parseOptionalCount(value.maxDiscount);
  const quotaLimit = parseOptionalCount(value.quotaLimit);
  const perUserLimit = parseOptionalCount(value.perUserLimit);
  if (maxDiscount === undefined || quotaLimit === undefined || perUserLimit === undefined) {
    return null;
  }

  const minOrder = value.minOrder === undefined ? 0 : value.minOrder;
  if (!Number.isSafeInteger(minOrder) || (minOrder as number) < 0) return null;

  const startsAt = parseDate(value.startsAt ?? null);
  const endsAt = parseDate(value.endsAt ?? null);
  if (startsAt === undefined || endsAt === undefined) return null;
  if (startsAt && endsAt && startsAt >= endsAt) return null;

  if (typeof value.enabled !== 'boolean') return null;
  if (value.description !== undefined && typeof value.description !== 'string') return null;
  if (typeof value.description === 'string' && value.description.length > 200) return null;

  return {
    code,
    description: (value.description as string | undefined)?.trim() ?? '',
    discountType: value.discountType,
    discountValue,
    maxDiscount,
    minOrder: minOrder as number,
    quotaLimit,
    perUserLimit,
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
    const rows = await getDatabase()
      .select()
      .from(vouchers)
      .orderBy(desc(vouchers.enabled), asc(vouchers.code));
    return NextResponse.json({ vouchers: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(
      '[ADMIN_VOUCHERS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'VOUCHERS_UNAVAILABLE' }, { status: 503 });
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
  const voucher = parseVoucher(payload);
  if (!voucher) return NextResponse.json({ error: 'INVALID_VOUCHER' }, { status: 400 });

  try {
    const [created] = await getDatabase()
      .insert(vouchers)
      .values({ ...voucher, id: randomUUID() })
      .returning();
    return NextResponse.json({ voucher: created }, { status: 201 });
  } catch (error) {
    // The unique index on code is the only expected conflict here.
    const message = error instanceof Error ? error.message : '';
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json({ error: 'VOUCHER_CODE_EXISTS' }, { status: 409 });
    }
    console.error('[ADMIN_VOUCHER_CREATE_FAILED]', message || 'Unknown database error');
    return NextResponse.json({ error: 'VOUCHER_COULD_NOT_BE_CREATED' }, { status: 503 });
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
    return NextResponse.json({ error: 'INVALID_VOUCHER_UPDATE' }, { status: 400 });
  }

  const db = getDatabase();
  try {
    const current = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.id, payload.id))
      .limit(1)
      .then((rows) => rows[0]);
    if (!current) return NextResponse.json({ error: 'VOUCHER_NOT_FOUND' }, { status: 404 });

    // Strip the generated columns: parseVoucher rejects unknown fields, so merging
    // the raw row would make every update fail.
    const {
      id: currentId,
      quantityUsed,
      createdAt,
      updatedAt,
      ...editable
    } = current;
    void currentId;
    void quantityUsed;
    void createdAt;
    void updatedAt;
    const merged = parseVoucher({ ...editable, ...payload.updates });
    if (!merged) return NextResponse.json({ error: 'INVALID_VOUCHER_UPDATE' }, { status: 400 });

    const [voucher] = await db
      .update(vouchers)
      .set({ ...merged, updatedAt: new Date() })
      .where(eq(vouchers.id, current.id))
      .returning();
    return NextResponse.json({ voucher });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json({ error: 'VOUCHER_CODE_EXISTS' }, { status: 409 });
    }
    console.error('[ADMIN_VOUCHER_UPDATE_FAILED]', message || 'Unknown database error');
    return NextResponse.json({ error: 'VOUCHER_COULD_NOT_BE_UPDATED' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'VOUCHER_ID_REQUIRED' }, { status: 400 });
  try {
    const [deleted] = await getDatabase()
      .delete(vouchers)
      .where(eq(vouchers.id, id))
      .returning({ id: vouchers.id });
    if (deleted) return NextResponse.json({ success: true });
    return NextResponse.json({ error: 'VOUCHER_NOT_FOUND' }, { status: 404 });
  } catch (error) {
    // A voucher that has been redeemed cannot be deleted without losing history.
    const message = error instanceof Error ? error.message : '';
    if (/foreign key|constraint/i.test(message)) {
      return NextResponse.json({ error: 'VOUCHER_HAS_REDEMPTIONS' }, { status: 409 });
    }
    console.error('[ADMIN_VOUCHER_DELETE_FAILED]', message || 'Unknown database error');
    return NextResponse.json({ error: 'VOUCHER_COULD_NOT_BE_DELETED' }, { status: 503 });
  }
}
