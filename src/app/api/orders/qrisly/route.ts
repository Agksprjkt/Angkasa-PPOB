import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { getActivePaymentGateway, getDigiflazzConfig, getQrislyConfig, getVendorRuntimeConfig } from '@/lib/server/integration-settings';
import { createQrislyPayment, type QrislyConfig } from '@/lib/server/qrisly';
import { isValidQrislyAmount } from '@/lib/deposit-validation';
import { normalizePhone } from '@/lib/phone';
import { invoices, products } from '@/lib/server/db/schema';
import { createOrderCode } from '@/lib/order-codes';
import { validateOrderDestination } from '@/lib/order-input-validation';
import { isOrderableVendor, isVendorEnabled } from '@/lib/vendor-registry';
import {
  createFlashSaleReservation,
  releaseFlashSaleCapacity,
  reserveFlashSaleCapacity,
} from '@/lib/server/flash-sales';
import { clientAddress, consumeRateLimit } from '@/lib/server/rate-limit';
import { claimVoucherSlot, previewVoucherForOrder } from '@/lib/server/vouchers';
import { flashSaleReservations } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

// Guards invoice creation so an anonymous caller cannot burn vendor API quota.
const orderCreateRateLimit = 10;
const orderCreateRateWindowMs = 10 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function presentInvoice(invoice: typeof invoices.$inferSelect) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    productName: invoice.productName,
    destination: invoice.serverZoneId
      ? `${invoice.destination} (${invoice.serverZoneId})`
      : invoice.destination,
    totalPay: invoice.totalPay,
    payableAmount: invoice.payableAmount ?? invoice.totalPay,
    paymentStatus: invoice.paymentStatus,
    transactionStatus: invoice.transactionStatus,
    qrString: invoice.qrString,
    expiresAt: invoice.expiresAt,
    createdAt: invoice.createdAt,
  };
}

// Generates the QRIS and records the amount the buyer must actually pay.
// Guarded on providerReference so a concurrent request cannot double-generate.
async function attachQrislyPayment(
  invoice: typeof invoices.$inferSelect,
  amount: number,
  config: QrislyConfig,
  fallbackExpiresAt: Date,
) {
  const payment = await createQrislyPayment(config, amount);
  if (payment.payableAmount === null) {
    throw new Error('QRISLY_PAYABLE_AMOUNT_INVALID');
  }
  const paymentExpiresAt = payment.expiresAt && payment.expiresAt > new Date()
    ? payment.expiresAt
    : fallbackExpiresAt;
  const [updated] = await getDatabase()
    .update(invoices)
    .set({
      providerReference: payment.historyId,
      qrString: payment.qrString,
      payableAmount: payment.payableAmount,
      expiresAt: paymentExpiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, invoice.id), isNull(invoices.providerReference)))
    .returning();
  if (updated) return updated;
  const current = await getDatabase()
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoice.id))
    .limit(1)
    .then((rows) => rows[0]);
  if (!current?.qrString) throw new Error('ORDER_INVOICE_SAVE_FAILED');
  return current;
}

export async function GET() {
  try {
    const [config, vendor, activeGateway] = await Promise.all([
      getQrislyConfig(),
      getDigiflazzConfig(),
      getActivePaymentGateway(),
    ]);
    return NextResponse.json({
      enabled:
        activeGateway === 'qrisly' &&
        config.enabled &&
        Boolean(config.apiKey && config.qrisId) &&
        Boolean(vendor.username && vendor.apiKey) &&
        (vendor.mode === 'sandbox' ||
          (vendor.mode === 'production' && vendor.enableRealTransactions)),
    });
  } catch (error) {
    console.error(
      '[QRISLY_ORDER_AVAILABILITY_FAILED]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return NextResponse.json({ error: 'PAYMENT_CONFIGURATION_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') ?? 0) > 8_192) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  const rawIdempotencyKey = request.headers.get('Idempotency-Key')?.trim() ?? '';
  if (!uuidPattern.test(rawIdempotencyKey)) {
    return NextResponse.json({ error: 'VALID_IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 });
  }

  const rateLimitOk = await consumeRateLimit(
    `ppob:rate:order-create:ip:${clientAddress(request)}`,
    orderCreateRateLimit,
    orderCreateRateWindowMs,
  );
  if (rateLimitOk === false) {
    return NextResponse.json({ error: 'ORDER_RATE_LIMITED' }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (
    !isRecord(payload) ||
    Object.keys(payload).some((key) =>
      ![
        'productId',
        'destination',
        'customerName',
        'serverZoneId',
        'customerPhone',
        'purchaserName',
        'customerEmail',
        'flashSaleOfferId',
        'flashSalePriceExpected',
        'voucherCode',
      ].includes(key),
    )
  ) {
    return NextResponse.json({ error: 'INVALID_ORDER_REQUEST' }, { status: 400 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  let activeGateway: Awaited<ReturnType<typeof getActivePaymentGateway>>;
  try {
    activeGateway = await getActivePaymentGateway();
  } catch (error) {
    console.error(
      '[QRISLY_ORDER_GATEWAY_SETTINGS_FAILED]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return NextResponse.json({ error: 'PAYMENT_CONFIGURATION_UNAVAILABLE' }, { status: 503 });
  }
  if (activeGateway !== 'qrisly') {
    return NextResponse.json({ error: 'PAYMENT_GATEWAY_NOT_ACTIVE' }, { status: 503 });
  }
  const productId = typeof payload.productId === 'string' ? payload.productId.trim() : '';
  const flashSaleOfferId = typeof payload.flashSaleOfferId === 'string'
    ? payload.flashSaleOfferId.trim()
    : undefined;
  const flashSalePriceExpected = payload.flashSalePriceExpected;
  const voucherCode = typeof payload.voucherCode === 'string' && payload.voucherCode.trim()
    ? payload.voucherCode.trim().slice(0, 32)
    : undefined;
  const destination = typeof payload.destination === 'string' ? payload.destination.trim() : '';
  const customerName = typeof payload.customerName === 'string'
    ? payload.customerName.trim().slice(0, 100)
    : null;
  const serverZoneId = typeof payload.serverZoneId === 'string'
    ? payload.serverZoneId.trim() || null
    : null;
  const purchaserName = session
    ? session.user.name.trim().slice(0, 100)
    : typeof payload.purchaserName === 'string'
      ? payload.purchaserName.trim().slice(0, 100)
      : '';
  const customerEmail = session
    ? session.user.email.trim().slice(0, 254).toLowerCase()
    : typeof payload.customerEmail === 'string'
      ? payload.customerEmail.trim().slice(0, 254).toLowerCase()
      : '';
  if (!productId || productId.length > 128 || destination.length < 3 || destination.length > 128) {
    return NextResponse.json({ error: 'INVALID_PRODUCT_OR_DESTINATION' }, { status: 400 });
  }
  if (
    ('customerName' in payload && typeof payload.customerName !== 'string') ||
    ('serverZoneId' in payload && typeof payload.serverZoneId !== 'string') ||
    ('customerPhone' in payload && typeof payload.customerPhone !== 'string') ||
    ('purchaserName' in payload && typeof payload.purchaserName !== 'string') ||
    ('customerEmail' in payload && typeof payload.customerEmail !== 'string')
    || ('flashSaleOfferId' in payload && typeof payload.flashSaleOfferId !== 'string')
    || ('flashSalePriceExpected' in payload &&
      !Number.isSafeInteger(payload.flashSalePriceExpected))
    || ('voucherCode' in payload && typeof payload.voucherCode !== 'string')
  ) {
    return NextResponse.json({ error: 'INVALID_ORDER_CONTACT' }, { status: 400 });
  }
  if (
    Boolean(flashSaleOfferId) !== (flashSalePriceExpected !== undefined) ||
    (
      flashSalePriceExpected !== undefined &&
      (!Number.isSafeInteger(flashSalePriceExpected) || Number(flashSalePriceExpected) <= 0)
    )
  ) {
    return NextResponse.json({ error: 'INVALID_FLASH_SALE' }, { status: 400 });
  }

  if (!session && (purchaserName.length < 2 || purchaserName.length > 100)) {
    return NextResponse.json({ error: 'VALID_CUSTOMER_NAME_REQUIRED' }, { status: 400 });
  }
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return NextResponse.json({ error: 'INVALID_CUSTOMER_EMAIL' }, { status: 400 });
  }

  const customerPhone = normalizePhone(
    session?.user.phoneNumber || (typeof payload.customerPhone === 'string' ? payload.customerPhone : ''),
  );
  if (!customerPhone) {
    return NextResponse.json({ error: 'VALID_CUSTOMER_PHONE_REQUIRED' }, { status: 400 });
  }

  const db = getDatabase();
  const idempotencyKey = `qrisly-order:${session?.user.id ?? 'guest'}:${hash(rawIdempotencyKey)}`;
  const existing = await db
    .select()
    .from(invoices)
    .where(eq(invoices.idempotencyKey, idempotencyKey))
    .limit(1)
    .then((rows) => rows[0]);
  if (existing) {
    const existingReservation = await db
      .select({ offerId: flashSaleReservations.offerId })
      .from(flashSaleReservations)
      .where(eq(flashSaleReservations.invoiceId, existing.id))
      .limit(1)
      .then((rows) => rows[0]);
    const sameOrder =
      existing.userId === (session?.user.id ?? null) &&
      existing.productId === productId &&
      existing.destination === destination &&
      existing.serverZoneId === serverZoneId &&
      existing.customerPhone === customerPhone &&
      existing.purchaserName === purchaserName &&
      existing.customerEmail === (customerEmail || null) &&
      existingReservation?.offerId === (flashSaleOfferId ?? undefined);
    if (!sameOrder) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REUSED' }, { status: 409 });
    }
    if (!existing.qrString) {
      // A previous attempt reserved the invoice but never got a QRIS back
      // (provider error). Retry generation instead of leaving it stuck.
      if (existing.paymentStatus === 'unpaid' && existing.expiresAt > new Date()) {
        try {
          const config = await getQrislyConfig();
          if (config.enabled && config.apiKey && config.qrisId) {
            const repaired = await attachQrislyPayment(
              existing,
              existing.totalPay,
              { apiKey: config.apiKey, qrisId: config.qrisId, mode: config.mode },
              existing.expiresAt,
            );
            return NextResponse.json({
              invoice: presentInvoice(repaired),
              accessToken: session ? null : rawIdempotencyKey,
            });
          }
        } catch (error) {
          console.error(
            '[QRISLY_ORDER_PAYMENT_RETRY_FAILED]',
            error instanceof Error ? error.message : 'Unknown Qrisly error',
          );
        }
      }
      return NextResponse.json({
        invoice: presentInvoice(existing),
        accessToken: session ? null : rawIdempotencyKey,
        error: 'PAYMENT_INITIALIZING',
      }, { status: 202 });
    }
    return NextResponse.json({
      invoice: presentInvoice(existing),
      accessToken: session ? null : rawIdempotencyKey,
    });
  }

  const product = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.status, 'active')))
    .limit(1)
    .then((rows) => rows[0]);
  if (!product) return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
  const destinationError = validateOrderDestination(
    product.category,
    product.operator,
    destination,
    serverZoneId,
  );
  if (destinationError) {
    return NextResponse.json({ error: destinationError }, { status: 400 });
  }
  if (!isOrderableVendor(product.vendor)) {
    return NextResponse.json({ error: 'PRODUCT_VENDOR_NOT_CONFIGURED' }, { status: 503 });
  }
  // A switched-off vendor must not take new orders. Pending invoices are settled
  // by the reconciler, so disabling a vendor never strands an existing order.
  const switches = await getVendorRuntimeConfig();
  if (!isVendorEnabled(product.vendor, {
    digiflazzEnabled: switches.digiflazzEnabled,
    tokovoucherEnabled: switches.tokovoucherEnabled,
  })) {
    return NextResponse.json(
      {
        error: 'VENDOR_DISABLED',
        message: `${product.vendor} sedang dinonaktifkan oleh admin.`,
      },
      { status: 409 },
    );
  }

  const regularPrice = session?.user.role === 'agent'
    ? product.sellPriceAgent
    : product.sellPriceUser;
  if (
    !Number.isSafeInteger(regularPrice) ||
    regularPrice <= 0 ||
    !Number.isSafeInteger(product.basePrice) ||
    product.basePrice < 0
  ) {
    return NextResponse.json({ error: 'INVALID_PRODUCT_PRICE' }, { status: 503 });
  }

  let qrislyConfig: Awaited<ReturnType<typeof getQrislyConfig>>;
  let vendorConfig: Awaited<ReturnType<typeof getDigiflazzConfig>>;
  try {
    [qrislyConfig, vendorConfig] = await Promise.all([
      getQrislyConfig(),
      getDigiflazzConfig(),
    ]);
  } catch (error) {
    console.error(
      '[QRISLY_ORDER_SETTINGS_UNAVAILABLE]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return NextResponse.json({ error: 'PAYMENT_CONFIGURATION_UNAVAILABLE' }, { status: 503 });
  }
  if (!qrislyConfig.enabled || !qrislyConfig.apiKey || !qrislyConfig.qrisId) {
    return NextResponse.json({ error: 'QRISLY_NOT_CONFIGURED' }, { status: 503 });
  }
  if (
    !vendorConfig.username ||
    !vendorConfig.apiKey ||
    (vendorConfig.mode !== 'sandbox' && vendorConfig.mode !== 'production') ||
    (vendorConfig.mode === 'production' && !vendorConfig.enableRealTransactions)
  ) {
    return NextResponse.json({ error: 'DIGIFLAZZ_NOT_READY' }, { status: 503 });
  }

  const now = new Date();
  const invoiceId = randomUUID();
  const invoiceNumber = createOrderCode('INV');
  const guestAccessTokenHash = session ? null : hash(rawIdempotencyKey);
  const expiresAt = new Date(now.getTime() + 15 * 60_000);
  let price = regularPrice;
  let createdInvoice: typeof invoices.$inferSelect;
  try {
    const creation = await db.transaction(async (tx) => {
      let saleOfferId: string | null = null;
      if (flashSaleOfferId) {
        const expectedPrice = flashSalePriceExpected;
        if (typeof expectedPrice !== 'number') {
          return { error: 'FLASH_SALE_UNAVAILABLE' as const };
        }
        const reservation = await reserveFlashSaleCapacity(tx, {
          offerId: flashSaleOfferId,
          productId: product.id,
          expectedPrice,
          now,
          role: session?.user.role === 'agent' ? 'agent' : session?.user.role === 'admin' ? 'admin' : 'user',
        });
        if ('error' in reservation) return { error: reservation.error };
        saleOfferId = reservation.offerId;
        price = reservation.salePrice;
      }

      // The voucher discounts the price after any flash sale. Validate before the
      // invoice insert (the redemption row references the invoice) and claim the
      // quota slot once the invoice exists.
      let voucherCodeSnapshot: string | null = null;
      let discountAmount = 0;
      let voucherClaim: { voucherId: string; code: string; discountAmount: number } | null = null;
      if (voucherCode) {
        const voucherResult = await previewVoucherForOrder(tx, {
          code: voucherCode,
          basePrice: price,
          userId: session?.user.id ?? null,
          now,
        });
        if (!voucherResult.ok) {
          if (saleOfferId) await releaseFlashSaleCapacity(tx, saleOfferId, now);
          return { error: voucherResult.error };
        }
        voucherCodeSnapshot = voucherResult.code;
        discountAmount = voucherResult.discountAmount;
        price = voucherResult.finalPrice;
        voucherClaim = {
          voucherId: voucherResult.voucherId,
          code: voucherResult.code,
          discountAmount: voucherResult.discountAmount,
        };
      }

      if (!isValidQrislyAmount(price)) {
        if (saleOfferId) await releaseFlashSaleCapacity(tx, saleOfferId, now);
        return { error: 'QRISLY_AMOUNT_OUT_OF_RANGE' as const };
      }

      const [invoice] = await tx
        .insert(invoices)
        .values({
          id: invoiceId,
          invoiceNumber,
          userId: session?.user.id ?? null,
          customerPhone,
          purchaserName: purchaserName || null,
          customerEmail: customerEmail || null,
          productId: product.id,
          vendorCode: product.vendorCode,
          productName: product.name,
          category: product.category,
          operator: product.operator,
          destination,
          serverZoneId,
          customerName,
          productPrice: price,
          basePrice: product.basePrice,
          adminFee: 0,
          totalPay: price,
          paymentMethod: 'qrisly',
          paymentStatus: 'unpaid',
          transactionStatus: 'pending',
          voucherCode: voucherCodeSnapshot,
          discountAmount,
          expiresAt,
          idempotencyKey,
          guestAccessTokenHash,
        })
        .onConflictDoNothing({ target: invoices.idempotencyKey })
        .returning();

      if (!invoice) {
        if (saleOfferId) await releaseFlashSaleCapacity(tx, saleOfferId, now);
        const racedInvoice = await tx
          .select()
          .from(invoices)
          .where(eq(invoices.idempotencyKey, idempotencyKey))
          .limit(1)
          .then((rows) => rows[0]);
        if (!racedInvoice) throw new Error('IDEMPOTENCY_CONFLICT_WITHOUT_INVOICE');
        const reservation = await tx
          .select({ offerId: flashSaleReservations.offerId })
          .from(flashSaleReservations)
          .where(eq(flashSaleReservations.invoiceId, racedInvoice.id))
          .limit(1)
          .then((rows) => rows[0]);
        const sameOrder =
          racedInvoice.userId === (session?.user.id ?? null) &&
          racedInvoice.productId === product.id &&
          racedInvoice.destination === destination &&
          racedInvoice.serverZoneId === serverZoneId &&
          racedInvoice.customerPhone === customerPhone &&
          racedInvoice.purchaserName === (purchaserName || null) &&
          racedInvoice.customerEmail === (customerEmail || null) &&
          reservation?.offerId === (flashSaleOfferId ?? undefined);
        if (!sameOrder) return { error: 'IDEMPOTENCY_KEY_REUSED' as const };
        return { racedInvoice };
      }

      if (saleOfferId) {
        await createFlashSaleReservation(
          tx,
          saleOfferId,
          { invoiceId: invoice.id },
          expiresAt,
          now,
        );
      }
      if (voucherClaim) {
        const claimed = await claimVoucherSlot(tx, {
          ...voucherClaim,
          userId: session?.user.id ?? null,
          reference: { invoiceId: invoice.id },
          expiresAt,
          now,
        });
        // Validated moments ago inside this transaction, so a lost slot means the
        // row changed underneath us; fail instead of honouring a stale discount.
        if (!claimed) throw new Error('VOUCHER_QUOTA_EXHAUSTED');
      }
      return { invoice };
    });

    if ('error' in creation) {
      const status = creation.error === 'QRISLY_AMOUNT_OUT_OF_RANGE' ? 422
        : creation.error === 'IDEMPOTENCY_KEY_REUSED' ? 409
          : 409;
      return NextResponse.json({ error: creation.error }, { status });
    }
    if ('racedInvoice' in creation && creation.racedInvoice) {
      const racedInvoice = creation.racedInvoice;
      return NextResponse.json({
        invoice: presentInvoice(racedInvoice),
        accessToken: session ? null : rawIdempotencyKey,
        error: racedInvoice.qrString ? undefined : 'PAYMENT_INITIALIZING',
      }, { status: racedInvoice.qrString ? 200 : 202 });
    }
    if ('racedInvoice' in creation) {
      throw new Error('IDEMPOTENCY_CONFLICT_WITHOUT_INVOICE');
    }
    createdInvoice = creation.invoice;
  } catch (error) {
    console.error(
      '[QRISLY_ORDER_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'ORDER_COULD_NOT_BE_CREATED' }, { status: 503 });
  }

  try {
    const updatedInvoice = await attachQrislyPayment(
      createdInvoice,
      price,
      {
        apiKey: qrislyConfig.apiKey,
        qrisId: qrislyConfig.qrisId,
        mode: qrislyConfig.mode,
      },
      expiresAt,
    );

    return NextResponse.json({
      invoice: presentInvoice(updatedInvoice),
      accessToken: session ? null : rawIdempotencyKey,
    }, { status: 201 });
  } catch (error) {
    console.error(
      '[QRISLY_ORDER_PAYMENT_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown Qrisly error',
    );
    return NextResponse.json({
      invoice: presentInvoice(createdInvoice),
      accessToken: session ? null : rawIdempotencyKey,
      error: 'QRISLY_PAYMENT_CREATE_FAILED',
      message: 'Status pembuatan pembayaran belum dapat dipastikan. Jangan membuat pembayaran lain sebelum memeriksa status pesanan.',
    }, { status: 202 });
  }
}
