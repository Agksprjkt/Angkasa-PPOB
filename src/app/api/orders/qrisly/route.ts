import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { getActivePaymentGateway, getDigiflazzConfig, getQrislyConfig } from '@/lib/server/integration-settings';
import { createQrislyPayment } from '@/lib/server/qrisly';
import { isValidQrislyAmount } from '@/lib/deposit-validation';
import { normalizePhone } from '@/lib/phone';
import { invoices, products } from '@/lib/server/db/schema';
import { createOrderCode } from '@/lib/order-codes';
import { validateOrderDestination } from '@/lib/order-input-validation';

export const runtime = 'nodejs';

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

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
    paymentStatus: invoice.paymentStatus,
    transactionStatus: invoice.transactionStatus,
    qrString: invoice.qrString,
    expiresAt: invoice.expiresAt,
    createdAt: invoice.createdAt,
  };
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
  ) {
    return NextResponse.json({ error: 'INVALID_ORDER_CONTACT' }, { status: 400 });
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
    const sameOrder =
      existing.userId === (session?.user.id ?? null) &&
      existing.productId === productId &&
      existing.destination === destination &&
      existing.serverZoneId === serverZoneId &&
      existing.customerPhone === customerPhone &&
      existing.purchaserName === purchaserName &&
      existing.customerEmail === (customerEmail || null);
    if (!sameOrder) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REUSED' }, { status: 409 });
    }
    if (!existing.qrString) {
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
  if (product.vendor !== 'Digiflazz') {
    return NextResponse.json({ error: 'PRODUCT_VENDOR_NOT_CONFIGURED' }, { status: 503 });
  }

  const price = session?.user.role === 'agent'
    ? product.sellPriceAgent
    : product.sellPriceUser;
  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    !Number.isSafeInteger(product.basePrice) ||
    product.basePrice < 0
  ) {
    return NextResponse.json({ error: 'INVALID_PRODUCT_PRICE' }, { status: 503 });
  }
  if (!isValidQrislyAmount(price)) {
    return NextResponse.json({ error: 'QRISLY_AMOUNT_OUT_OF_RANGE' }, { status: 422 });
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
  const [createdInvoice] = await db
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
      expiresAt: new Date(now.getTime() + 15 * 60_000),
      idempotencyKey,
      guestAccessTokenHash,
    })
    .onConflictDoNothing({ target: invoices.idempotencyKey })
    .returning();

  if (!createdInvoice) {
    const racedInvoice = await db
      .select()
      .from(invoices)
      .where(eq(invoices.idempotencyKey, idempotencyKey))
      .limit(1)
      .then((rows) => rows[0]);
    if (!racedInvoice) {
      return NextResponse.json({ error: 'ORDER_COULD_NOT_BE_CREATED' }, { status: 503 });
    }
    const sameOrder =
      racedInvoice.userId === (session?.user.id ?? null) &&
      racedInvoice.productId === product.id &&
      racedInvoice.destination === destination &&
      racedInvoice.serverZoneId === serverZoneId &&
      racedInvoice.customerPhone === customerPhone &&
      racedInvoice.purchaserName === (purchaserName || null) &&
      racedInvoice.customerEmail === (customerEmail || null);
    if (!sameOrder) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REUSED' }, { status: 409 });
    }
    return NextResponse.json({
      invoice: presentInvoice(racedInvoice),
      accessToken: session ? null : rawIdempotencyKey,
      error: racedInvoice.qrString ? undefined : 'PAYMENT_INITIALIZING',
    }, { status: racedInvoice.qrString ? 200 : 202 });
  }

  try {
    const payment = await createQrislyPayment({
      apiKey: qrislyConfig.apiKey,
      qrisId: qrislyConfig.qrisId,
      mode: qrislyConfig.mode,
    }, price);
    const expiresAt = payment.expiresAt && payment.expiresAt > now
      ? payment.expiresAt
      : new Date(now.getTime() + 15 * 60_000);
    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        providerReference: payment.historyId,
        qrString: payment.qrString,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();
    if (!updatedInvoice) throw new Error('ORDER_INVOICE_SAVE_FAILED');

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
