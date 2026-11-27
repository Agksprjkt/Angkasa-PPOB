import 'server-only';

import {
  mapPostpaidError,
  readPostpaidPayment,
  readTokoVoucherInquiry,
  type PostpaidErrorCode,
  type PostpaidInquiry,
} from './postpaid-protocol';
import { tokoVoucherPostpaidSignature } from './tokovoucher-protocol';
import type { TokoVoucherConfig } from './tokovoucher';

const baseUrl = 'https://api.tokovoucher.id';

export class TokoVoucherPostpaidError extends Error {
  readonly code: PostpaidErrorCode;

  constructor(code: PostpaidErrorCode, message: string) {
    super(message);
    this.name = 'TokoVoucherPostpaidError';
    this.code = code;
  }
}

function requireCredentials(config: TokoVoucherConfig) {
  if (!config.memberCode || !config.secret) {
    throw new TokoVoucherPostpaidError(
      'BILL_PROVIDER_UNAVAILABLE',
      'TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED',
    );
  }
}

async function postJson(path: string, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new TokoVoucherPostpaidError('BILL_PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new TokoVoucherPostpaidError('BILL_PROVIDER_UNAVAILABLE', 'PROVIDER_NON_JSON');
  }
  return { status: response.status, data };
}

function providerMessage(data: unknown) {
  if (typeof data !== 'object' || data === null) return '';
  const record = data as Record<string, unknown>;
  if (typeof record.error_msg === 'string' && record.error_msg.trim()) {
    return record.error_msg.trim();
  }
  return typeof record.message === 'string' ? record.message.trim() : '';
}

export async function inquiryTokoVoucherBill(
  config: TokoVoucherConfig,
  params: { skuCode: string; customerNo: string; refId: string; serverId?: string | null },
): Promise<PostpaidInquiry> {
  requireCredentials(config);
  const { status, data } = await postJson('/v1/pascabayar-inq', {
    ref_id: params.refId,
    produk: params.skuCode,
    tujuan: params.customerNo,
    server_id: params.serverId ?? '',
    member_code: config.memberCode,
    signature: tokoVoucherPostpaidSignature(config.memberCode, config.secret, params.refId),
  });

  if (status < 200 || status >= 300) {
    const message = providerMessage(data);
    throw new TokoVoucherPostpaidError(
      'BILL_PROVIDER_UNAVAILABLE',
      message || `TokoVoucher inquiry gagal (HTTP ${status}).`,
    );
  }

  const inquiry = readTokoVoucherInquiry(data);
  if (inquiry) return inquiry;

  const message = providerMessage(data);
  const responseStatus = typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>).status
    : null;
  if (
    typeof responseStatus === 'string' &&
    responseStatus.toLowerCase() === 'sukses'
  ) {
    throw new TokoVoucherPostpaidError(
      'BILL_PROVIDER_UNAVAILABLE',
      'TokoVoucher inquiry response tidak menyertakan nilai tagihan.',
    );
  }
  throw new TokoVoucherPostpaidError(
    mapPostpaidError(message),
    message || `TokoVoucher inquiry gagal (HTTP ${status}).`,
  );
}

// The payment reuses the inquiry ref_id, which is what links it to the cached
// inquiry on their side.
export async function payTokoVoucherBill(
  config: TokoVoucherConfig,
  params: { skuCode: string; customerNo: string; refId: string; serverId?: string | null },
) {
  requireCredentials(config);
  const { status, data } = await postJson('/v1/pascabayar-pay', {
    ref_id: params.refId,
    produk: params.skuCode,
    tujuan: params.customerNo,
    server_id: params.serverId ?? '',
    member_code: config.memberCode,
    signature: tokoVoucherPostpaidSignature(config.memberCode, config.secret, params.refId),
  });

  if (status < 200 || status >= 300) {
    const message = providerMessage(data);
    throw new TokoVoucherPostpaidError(
      'BILL_PROVIDER_UNAVAILABLE',
      message || `TokoVoucher pembayaran gagal (HTTP ${status}).`,
    );
  }

  const payment = readPostpaidPayment(data);
  if (payment) return payment;

  const message = providerMessage(data);
  throw new TokoVoucherPostpaidError(
    mapPostpaidError(message),
    message || `TokoVoucher pembayaran gagal (HTTP ${status}).`,
  );
}
