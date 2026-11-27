import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  PostpaidProviderError,
  inquiryDigiflazzBill,
} from '@/lib/digiflazz-postpaid';
import {
  TokoVoucherPostpaidError,
  inquiryTokoVoucherBill,
} from '@/lib/tokovoucher-postpaid';
import type { PostpaidErrorCode, PostpaidInquiry } from '@/lib/postpaid-protocol';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { billInquiries, products } from '@/lib/server/db/schema';
import {
  getDigiflazzConfig,
  getTokoVoucherConfig,
} from '@/lib/server/integration-settings';
import { clientAddress, consumeRateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

// Digiflazz requires the payment to happen on the same day as the inquiry, and a
// quoted bill can change, so a quote is only valid briefly.
const inquiryTtlMs = 15 * 60_000;

const statusByCode: Record<PostpaidErrorCode, number> = {
  BILL_NOT_FOUND: 404,
  BILL_ALREADY_PAID: 409,
  BILL_EXPIRED: 409,
  BILL_REJECTED: 400,
  BILL_PROVIDER_UNAVAILABLE: 503,
};

function errorResponse(code: string, status: number, message?: string) {
  return NextResponse.json(message ? { error: code, message } : { error: code }, { status });
}

function buildRefId() {
  return `INQ${Date.now().toString(36)}${randomUUID().slice(0, 6)}`.toUpperCase();
}

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return errorResponse('UNAUTHORIZED', 401);

  // A failed inquiry still costs a provider call, so limit per user and address.
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

  const db = getDatabase();
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.status, 'active')))
    .limit(1);
  if (!product) return errorResponse('PRODUCT_NOT_FOUND', 404);
  if (product.category !== 'tagihan') {
    return errorResponse('NOT_A_BILL_PRODUCT', 400);
  }

  const refId = buildRefId();
  let inquiry: PostpaidInquiry;
  const providerTrxId: string | null = null;

  try {
    if (product.vendor === 'Digiflazz') {
      const config = await getDigiflazzConfig();
      if (!config.postpaidEnabled) {
        return errorResponse(
          'BILL_PROVIDER_UNAVAILABLE',
          503,
          'Pembayaran tagihan Digiflazz belum diaktifkan oleh admin.',
        );
      }
      inquiry = await inquiryDigiflazzBill(
        { ...config, mode: config.mode === 'production' ? 'production' : 'sandbox' },
        {
          skuCode: product.vendorCode,
          customerNo: destination,
          refId,
        },
      );
    } else if (product.vendor === 'TokoVoucher') {
      const config = await getTokoVoucherConfig();
      if (!config.postpaidEnabled) {
        return errorResponse(
          'BILL_PROVIDER_UNAVAILABLE',
          503,
          'Pembayaran tagihan TokoVoucher belum diaktifkan oleh admin.',
        );
      }
      inquiry = await inquiryTokoVoucherBill(config, {
        skuCode: product.vendorCode,
        customerNo: destination,
        refId,
      });
    } else {
      return errorResponse('BILL_PROVIDER_UNAVAILABLE', 503, 'Vendor ini tidak mendukung pascabayar.');
    }
  } catch (error) {
    if (error instanceof PostpaidProviderError || error instanceof TokoVoucherPostpaidError) {
      return errorResponse(error.code, statusByCode[error.code] ?? 503, error.message);
    }
    console.error(
      '[BILL_INQUIRY_FAILED]',
      error instanceof Error ? error.message : 'Unknown inquiry error',
    );
    return errorResponse('BILL_PROVIDER_UNAVAILABLE', 503);
  }

  // A provider can answer "Sukses" without a customer name; the bill is still
  // payable, so only a missing amount is treated as a failure.
  if (inquiry.totalAmount <= 0) {
    return errorResponse('BILL_PROVIDER_REJECTED', 400, 'Provider tidak mengirim nominal tagihan.');
  }

  try {
    const [saved] = await db
      .insert(billInquiries)
      .values({
        id: randomUUID(),
        userId: session.user.id,
        productId: product.id,
        vendor: product.vendor,
        destination,
        customerName: inquiry.customerName,
        billAmount: inquiry.billAmount,
        adminFee: inquiry.adminFee,
        totalAmount: inquiry.totalAmount,
        providerRef: refId,
        providerTrxId,
        lines: inquiry.lines,
        periods: inquiry.periods,
        dueDate: inquiry.dueDate,
        status: 'open',
        expiresAt: new Date(Date.now() + inquiryTtlMs),
      })
      .returning();

    return NextResponse.json({
      inquiry: {
        id: saved.id,
        productId: saved.productId,
        vendor: saved.vendor,
        destination: saved.destination,
        customerName: saved.customerName,
        billAmount: saved.billAmount,
        adminFee: saved.adminFee,
        totalAmount: saved.totalAmount,
        lines: saved.lines,
        periods: saved.periods,
        dueDate: saved.dueDate,
        status: saved.status,
        expiresAt: saved.expiresAt,
      },
    });
  } catch (error) {
    console.error(
      '[BILL_INQUIRY_SAVE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return errorResponse('BILL_INQUIRY_SAVE_FAILED', 503);
  }
}
