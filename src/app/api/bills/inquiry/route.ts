import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAuth } from '@/lib/server/auth';
import {
  PostpaidProviderError,
  inquiryDigiflazzBill,
} from '@/lib/digiflazz-postpaid';
import { getDatabase } from '@/lib/server/db/client';
import {
  billInquiries,
  catalogGroups,
  catalogSubgroups,
  products,
} from '@/lib/server/db/schema';
import { getDigiflazzConfig } from '@/lib/server/integration-settings';
import { clientAddress, consumeRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

// A bill must be paid shortly after it is read: the amount can change while it
// sits open, and the provider expires its own inquiry.
const inquiryTtlMs = 15 * 60_000;

function errorResponse(code: string, status: number, message?: string) {
  return NextResponse.json(message ? { error: code, message } : { error: code }, { status });
}

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return errorResponse('UNAUTHORIZED', 401);

  // A failed inquiry still costs a provider call, so it is rate limited per user
  // and address.
  const allowed = await consumeRateLimit(
    `bill-inquiry:${session.user.id}:${clientAddress(request)}`,
    10,
    60_000,
  );
  if (!allowed) return errorResponse('TOO_MANY_REQUESTS', 429);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('INVALID_JSON', 400);
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return errorResponse('INVALID_REQUEST_BODY', 400);
  }
  const body = payload as Record<string, unknown>;
  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  const destination = typeof body.destination === 'string' ? body.destination.trim() : '';
  if (
    !productId || productId.length > 128 ||
    destination.length < 3 || destination.length > 64
  ) {
    return errorResponse('INVALID_PRODUCT_OR_DESTINATION', 400);
  }

  const config = await getDigiflazzConfig();
  if (!config.postpaidEnabled) {
    return errorResponse(
      'BILL_PROVIDER_UNAVAILABLE',
      503,
      'Pembayaran tagihan belum diaktifkan oleh admin.',
    );
  }

  const db = getDatabase();
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.status, 'active')))
    .limit(1);
  if (!product) return errorResponse('PRODUCT_NOT_FOUND', 404);
  if (product.vendor !== 'Digiflazz') {
    return errorResponse('BILL_PROVIDER_UNAVAILABLE', 503, 'Produk ini bukan layanan pascabayar Digiflazz.');
  }

  // Only a product an admin placed in a postpaid subgroup may be inquired.
  const [placement] = product.subgroupId
    ? await db
      .select({ kind: catalogGroups.kind })
      .from(catalogSubgroups)
      .innerJoin(catalogGroups, eq(catalogSubgroups.groupId, catalogGroups.id))
      .where(eq(catalogSubgroups.id, product.subgroupId))
      .limit(1)
    : [];
  if (placement?.kind !== 'postpaid') {
    return errorResponse('NOT_A_BILL_PRODUCT', 400);
  }

  const refId = `BILL${Date.now().toString(36)}${randomUUID().slice(0, 8)}`.toUpperCase();

  try {
    const inquiry = await inquiryDigiflazzBill(
      { ...config, mode: config.mode === 'production' ? 'production' : 'sandbox' },
      { skuCode: product.vendorCode, customerNo: destination, refId },
    );

    const expiresAt = new Date(Date.now() + inquiryTtlMs);
    const [saved] = await db
      .insert(billInquiries)
      .values({
        id: randomUUID(),
        userId: session.user.id,
        productId: product.id,
        subgroupId: product.subgroupId ?? null,
        destination,
        customerName: inquiry.customerName.slice(0, 120),
        adminFee: inquiry.adminFee,
        billAmount: inquiry.billAmount,
        totalAmount: inquiry.totalAmount,
        providerRef: refId,
        lines: inquiry.lines,
        status: 'open',
        expiresAt,
      })
      .returning();

    return NextResponse.json({
      inquiry: {
        id: saved.id,
        productId: saved.productId,
        subgroupId: saved.subgroupId,
        destination: saved.destination,
        customerName: saved.customerName,
        adminFee: saved.adminFee,
        billAmount: saved.billAmount,
        totalAmount: saved.totalAmount,
        lines: saved.lines,
        status: saved.status,
        expiresAt: saved.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof PostpaidProviderError) {
      const status = error.code === 'BILL_PROVIDER_UNAVAILABLE' ? 503 : 400;
      return errorResponse(error.code, status, error.message);
    }
    console.error(
      '[BILL_INQUIRY_FAILED]',
      error instanceof Error ? error.message : 'Unknown inquiry error',
    );
    return errorResponse('BILL_PROVIDER_UNAVAILABLE', 503);
  }
}
