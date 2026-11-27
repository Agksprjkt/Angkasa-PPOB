import 'server-only';

import { generateDigiflazzSignature, type DigiflazzConfig } from './digiflazz';
import {
  mapPostpaidError,
  readPostpaidInquiry,
  type PostpaidErrorCode,
  type PostpaidInquiry,
} from './digiflazz-postpaid-protocol';

const baseUrl = 'https://api.digiflazz.com/v1';

export class PostpaidProviderError extends Error {
  readonly code: PostpaidErrorCode;

  constructor(code: PostpaidErrorCode, message: string) {
    super(message);
    this.name = 'PostpaidProviderError';
    this.code = code;
  }
}

function requireCredentials(config: DigiflazzConfig) {
  if (!config.username || !config.apiKey) {
    throw new PostpaidProviderError(
      'BILL_PROVIDER_UNAVAILABLE',
      'DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED',
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
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PostpaidProviderError('BILL_PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PostpaidProviderError('BILL_PROVIDER_UNAVAILABLE', 'PROVIDER_NON_JSON');
  }
  return { status: response.status, data };
}

function providerMessage(data: unknown): { message: string; rc: string } {
  if (typeof data !== 'object' || data === null) return { message: '', rc: '' };
  const record = data as Record<string, unknown>;
  const nested = typeof record.data === 'object' && record.data !== null
    ? record.data as Record<string, unknown>
    : record;
  const message = typeof nested.message === 'string'
    ? nested.message
    : typeof record.message === 'string' ? record.message : '';
  const rc = typeof nested.rc === 'string' || typeof nested.rc === 'number'
    ? String(nested.rc)
    : '';
  return { message, rc };
}

export async function inquiryDigiflazzBill(
  config: DigiflazzConfig,
  params: { skuCode: string; customerNo: string; refId: string },
): Promise<PostpaidInquiry> {
  requireCredentials(config);
  const { status, data } = await postJson('/inquiry-pasca', {
    username: config.username,
    buyer_sku_code: params.skuCode,
    customer_no: params.customerNo,
    ref_id: params.refId,
    sign: generateDigiflazzSignature(config.username, config.apiKey, params.refId),
    // Same rule as prepaid: sandbox never touches a real bill.
    testing: config.mode !== 'production',
  });

  const inquiry = readPostpaidInquiry(data);
  if (inquiry) return inquiry;

  const { message, rc } = providerMessage(data);
  throw new PostpaidProviderError(
    mapPostpaidError(message, rc),
    message || `Digiflazz inquiry gagal (HTTP ${status}).`,
  );
}

export type PostpaidPaymentResult = {
  refId: string;
  status: string;
  rc: string;
  message: string;
  sn: string | null;
};

export async function payDigiflazzBill(
  config: DigiflazzConfig,
  params: { skuCode: string; customerNo: string; refId: string; inquiryRefId?: string },
): Promise<PostpaidPaymentResult> {
  requireCredentials(config);
  const { status, data } = await postJson('/transaction', {
    username: config.username,
    buyer_sku_code: params.skuCode,
    customer_no: params.customerNo,
    ref_id: params.refId,
    // Digiflazz links a payment to its inquiry through this field.
    ...(params.inquiryRefId ? { inquiry_ref_id: params.inquiryRefId } : {}),
    sign: generateDigiflazzSignature(config.username, config.apiKey, params.refId),
    testing: config.mode !== 'production',
  });

  const record = typeof data === 'object' && data !== null
    ? (data as { data?: unknown }).data
    : null;
  const payload = typeof record === 'object' && record !== null
    ? record as Record<string, unknown>
    : null;
  if (payload && typeof payload.ref_id === 'string' && typeof payload.status === 'string') {
    return {
      refId: payload.ref_id,
      status: payload.status,
      rc: typeof payload.rc === 'string' ? payload.rc : '',
      message: typeof payload.message === 'string' ? payload.message : '',
      sn: typeof payload.sn === 'string' ? payload.sn : null,
    };
  }

  const { message, rc } = providerMessage(data);
  throw new PostpaidProviderError(
    mapPostpaidError(message, rc),
    message || `Digiflazz pembayaran gagal (HTTP ${status}).`,
  );
}

// Postpaid price list. Same endpoint as prepaid with cmd "pasca"; the sync keeps
// these rows unmapped so an admin decides where they appear.
export async function fetchDigiflazzPostpaidList(config: DigiflazzConfig) {
  requireCredentials(config);
  const { status, data } = await postJson('/price-list', {
    cmd: 'pasca',
    username: config.username,
    sign: generateDigiflazzSignature(config.username, config.apiKey, 'pricelist'),
  });
  const list = typeof data === 'object' && data !== null
    ? (data as { data?: unknown }).data
    : null;
  if (!Array.isArray(list)) {
    const { message, rc } = providerMessage(data);
    throw new PostpaidProviderError(
      mapPostpaidError(message, rc),
      message || `Daftar produk pascabayar tidak dikenali (HTTP ${status}).`,
    );
  }
  return { total: list.length, products: list };
}
