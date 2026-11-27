import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { createBalanceOrder } from '@/lib/server/orders/create-balance-order';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!session.user.phoneNumberVerified) {
    return NextResponse.json(
      { error: 'PHONE_VERIFICATION_REQUIRED' },
      { status: 403 },
    );
  }

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return NextResponse.json(
      { error: 'VALID_IDEMPOTENCY_KEY_REQUIRED' },
      { status: 400 },
    );
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  if (!isRecord(payload)) {
    return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
  }

  const productId = typeof payload.productId === 'string' ? payload.productId : '';
  const flashSaleOfferId =
    typeof payload.flashSaleOfferId === 'string' ? payload.flashSaleOfferId : undefined;
  const flashSalePriceExpected = payload.flashSalePriceExpected;
  if (
    ('flashSaleOfferId' in payload && typeof payload.flashSaleOfferId !== 'string') ||
    ('flashSalePriceExpected' in payload &&
      !Number.isSafeInteger(payload.flashSalePriceExpected))
  ) {
    return NextResponse.json({ error: 'INVALID_FLASH_SALE' }, { status: 400 });
  }
  const destination =
    typeof payload.destination === 'string' ? payload.destination.trim() : '';
  const customerName =
    typeof payload.customerName === 'string'
      ? payload.customerName.trim().slice(0, 100)
      : undefined;
  const serverZoneId =
    typeof payload.serverZoneId === 'string'
      ? payload.serverZoneId.trim()
      : undefined;
  if ('serverZoneId' in payload && typeof payload.serverZoneId !== 'string') {
    return NextResponse.json({ error: 'INVALID_GAME_SERVER_ID' }, { status: 400 });
  }
  if ('transactionPin' in payload && typeof payload.transactionPin !== 'string') {
    return NextResponse.json({ error: 'INVALID_TRANSACTION_PIN' }, { status: 400 });
  }
  if ('voucherCode' in payload && typeof payload.voucherCode !== 'string') {
    return NextResponse.json({ error: 'INVALID_VOUCHER' }, { status: 400 });
  }
  const voucherCode =
    typeof payload.voucherCode === 'string' && payload.voucherCode.trim()
      ? payload.voucherCode.trim().slice(0, 32)
      : undefined;
  const transactionPin =
    typeof payload.transactionPin === 'string' ? payload.transactionPin : undefined;
  if ('billInquiryId' in payload && typeof payload.billInquiryId !== 'string') {
    return NextResponse.json({ error: 'INVALID_BILL_INQUIRY' }, { status: 400 });
  }
  const billInquiryId =
    typeof payload.billInquiryId === 'string' && payload.billInquiryId.trim()
      ? payload.billInquiryId.trim().slice(0, 128)
      : undefined;

  if (
    !productId ||
    productId.length > 128 ||
    destination.length < 3 ||
    destination.length > 128
  ) {
    return NextResponse.json(
      { error: 'INVALID_PRODUCT_OR_DESTINATION' },
      { status: 400 },
    );
  }

  if (payload.paymentMethod !== 'balance') {
    return NextResponse.json(
      {
        error: 'PAYMENT_METHOD_NOT_CONFIGURED',
        message: 'Direct payment methods are unavailable until a verified gateway is configured.',
      },
      { status: 503 },
    );
  }

  const result = await createBalanceOrder({
    idempotencyKey,
    productId,
    destination,
    customerName,
    serverZoneId,
    transactionPin,
    flashSaleOfferId,
    flashSalePriceExpected:
      typeof flashSalePriceExpected === 'number' ? flashSalePriceExpected : undefined,
    voucherCode,
    billInquiryId,
    user: {
      id: session.user.id,
      phoneNumber: session.user.phoneNumber,
      role: session.user.role ?? 'user',
    },
  });

  // Store margin is internal; strip the profit column before responding.
  const body = result.body.transaction
    ? {
      ...result.body,
      transaction: (() => {
        const { profit, ...transaction } = result.body.transaction;
        void profit;
        return transaction;
      })(),
    }
    : result.body;

  return NextResponse.json(body, { status: result.status });
}
