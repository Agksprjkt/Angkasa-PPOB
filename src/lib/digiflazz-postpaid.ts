import 'server-only';

import { generateDigiflazzSignature, type DigiflazzConfig } from './digiflazz';
import {
  mapPostpaidError,
  readDigiflazzInquiry,
  readPostpaidPayment,
  type PostpaidErrorCode,
  type PostpaidInquiry,
} from './postpaid-protocol';

const endpoint = 'https://api.digiflazz.com/v1/transaction';

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

async function postJson(body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
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

function providerMessage(data: unknown) {
  if (typeof data !== 'object' || data === null) return { message: '', rc: '' };
  const record = data as Record<string, unknown>;
  const nested = typeof record.data === 'object' && record.data !== null
    ? record.data as Record<string, unknown>
    : record;
  return {
    message: typeof nested.message === 'string'
      ? nested.message
      : typeof record.message === 'string' ? record.message : '',
    rc: typeof nested.rc === 'string' || typeof nested.rc === 'number' ? String(nested.rc) : '',
  };
}

// Postpaid uses `commands` on the same /v1/transaction endpoint as prepaid, and
// signs the ref_id exactly like a prepaid order.
export async function inquiryDigiflazzBill(
  config: DigiflazzConfig,
  params: { skuCode: string; customerNo: string; refId: string },
): Promise<PostpaidInquiry> {
  requireCredentials(config);
  const { status, data } = await postJson({
    commands: 'inq-pasca',
    username: config.username,
    buyer_sku_code: params.skuCode,
    customer_no: params.customerNo,
    ref_id: params.refId,
    sign: generateDigiflazzSignature(config.username, config.apiKey, params.refId),
    testing: config.mode !== 'production',
  });

  if (status < 200 || status >= 300) {
    const { message } = providerMessage(data);
    throw new PostpaidProviderError(
      'BILL_PROVIDER_UNAVAILABLE',
      message || `Digiflazz inquiry gagal (HTTP ${status}).`,
    );
  }

  const inquiry = readDigiflazzInquiry(data);
  if (inquiry) return inquiry;

  const { message, rc } = providerMessage(data);
  throw new PostpaidProviderError(
    mapPostpaidError(message, rc),
    message || `Digiflazz inquiry gagal (HTTP ${status}).`,
  );
}

// Digiflazz requires the payment to reuse the inquiry's ref_id and to happen on
// the same day.
export async function payDigiflazzBill(
  config: DigiflazzConfig,
  params: { skuCode: string; customerNo: string; refId: string },
) {
  requireCredentials(config);
  const { status, data } = await postJson({
    commands: 'pay-pasca',
    username: config.username,
    buyer_sku_code: params.skuCode,
    customer_no: params.customerNo,
    ref_id: params.refId,
    sign: generateDigiflazzSignature(config.username, config.apiKey, params.refId),
    testing: config.mode !== 'production',
  });

  if (status < 200 || status >= 300) {
    const { message } = providerMessage(data);
    throw new PostpaidProviderError(
      'BILL_PROVIDER_UNAVAILABLE',
      message || `Digiflazz pembayaran gagal (HTTP ${status}).`,
    );
  }

  const payment = readPostpaidPayment(data);
  if (payment) return payment;

  const { message, rc } = providerMessage(data);
  throw new PostpaidProviderError(
    mapPostpaidError(message, rc),
    message || `Digiflazz pembayaran gagal (HTTP ${status}).`,
  );
}

export async function checkDigiflazzPostpaidStatus(
  config: DigiflazzConfig,
  params: { skuCode: string; customerNo: string; refId: string },
) {
  requireCredentials(config);
  const { status, data } = await postJson({
    commands: 'status-pasca',
    username: config.username,
    buyer_sku_code: params.skuCode,
    customer_no: params.customerNo,
    ref_id: params.refId,
    sign: generateDigiflazzSignature(config.username, config.apiKey, params.refId),
    testing: config.mode !== 'production',
  });

  if (status < 200 || status >= 300) {
    const { message } = providerMessage(data);
    throw new PostpaidProviderError(
      'BILL_PROVIDER_UNAVAILABLE',
      message || `Digiflazz status pascabayar gagal (HTTP ${status}).`,
    );
  }

  const payment = readPostpaidPayment(data);
  if (payment) return payment;

  const { message, rc } = providerMessage(data);
  throw new PostpaidProviderError(
    mapPostpaidError(message, rc),
    message || `Digiflazz status pascabayar tidak terbaca (HTTP ${status}).`,
  );
}
