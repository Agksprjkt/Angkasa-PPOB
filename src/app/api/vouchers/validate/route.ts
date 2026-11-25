import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { products } from '@/lib/server/db/schema';
import { validateVoucherCode } from '@/lib/server/vouchers';

export const runtime = 'nodejs';

// Read-only: applying a code at checkout must not spend a quota slot, because the
// buyer may never finish the order. The slot is claimed when the order is created.
export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : '';
  const productId = typeof body.productId === 'string' ? body.productId : '';
  if (!code.trim() || !productId) {
    return NextResponse.json({ error: 'VOUCHER_CODE_REQUIRED' }, { status: 400 });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const product = await getDatabase()
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.status, 'active')))
      .limit(1)
      .then((rows) => rows[0]);
    if (!product) {
      return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
    }

    // The base price must match what the order will charge. A flash sale is
    // applied first in the order path, so the voucher discounts the sale price;
    // the checkout sends the price it is showing so the preview stays honest.
    const role = session?.user.role ?? 'guest';
    const regularPrice = role === 'agent'
      ? product.sellPriceAgent ?? product.sellPriceUser
      : product.sellPriceUser;
    const clientPrice = body.basePrice;
    const basePrice = Number.isSafeInteger(clientPrice) && (clientPrice as number) > 0
      ? (clientPrice as number)
      : regularPrice;
    if (!Number.isSafeInteger(basePrice) || basePrice <= 0) {
      return NextResponse.json({ error: 'INVALID_PRODUCT_PRICE' }, { status: 503 });
    }

    const result = await validateVoucherCode({
      code,
      basePrice,
      userId: session?.user.id ?? null,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      {
        code: result.code,
        discountAmount: result.discountAmount,
        finalPrice: result.finalPrice,
        basePrice,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[VOUCHER_VALIDATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'VOUCHER_VALIDATION_UNAVAILABLE' }, { status: 503 });
  }
}
