import 'server-only';

import crypto from 'crypto';

import { readDigiflazzTransactionResponse } from './digiflazz-protocol';

export interface DigiflazzConfig {
  username: string;
  apiKey: string;
  mode: 'sandbox' | 'production';
}

export function generateDigiflazzSignature(username: string, apiKey: string, refOrCmd: string): string {
  return crypto
    .createHash('md5')
    .update(`${username}${apiKey}${refOrCmd}`)
    .digest('hex');
}

function findProductList(value: unknown, depth = 0): unknown[] | null {
  if (depth > 8 || typeof value !== 'object' || value === null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return value;
    if (
      value.some(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'buyer_sku_code' in item,
      )
    ) {
      return value;
    }
    for (const item of value) {
      const nested = findProductList(item, depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  for (const key of ['data', 'products', 'price_list', 'priceList', 'response', 'result']) {
    const nested = findProductList(
      (value as Record<string, unknown>)[key],
      depth + 1,
    );
    if (nested) return nested;
  }
  return null;
}

function getProviderError(data: unknown) {
  const pending = [data];
  for (let depth = 0; pending.length > 0 && depth < 16; depth += 1) {
    const current = pending.shift();
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      continue;
    }
    const record = current as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message.trim() : '';
    const code = typeof record.rc === 'string' || typeof record.rc === 'number'
      ? String(record.rc)
      : '';
    if (message || code) {
      return `Digiflazz menolak permintaan daftar produk${code ? ` (kode ${code})` : ''}${message ? `: ${message.slice(0, 300)}` : '.'}`;
    }
    for (const key of ['data', 'error', 'response', 'result']) {
      if (record[key] !== undefined) pending.push(record[key]);
    }
  }
  return null;
}

export async function checkDigiflazzBalance(config: DigiflazzConfig) {
  const sign = generateDigiflazzSignature(config.username, config.apiKey, 'depo');
  const payload = {
    cmd: 'deposit',
    username: config.username,
    sign,
  };

  const response = await fetch('https://api.digiflazz.com/v1/cek-saldo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Digiflazz balance request failed (${response.status})`);
  }
  return response.json() as Promise<unknown>;
}

export async function fetchDigiflazzPriceList(
  config: DigiflazzConfig,
  command: 'prepaid' | 'pasca' = 'prepaid',
) {
  const sign = generateDigiflazzSignature(config.username, config.apiKey, 'pricelist');
  const response = await fetch('https://api.digiflazz.com/v1/price-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cmd: command,
      username: config.username,
      sign,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Digiflazz mengirim respons non-JSON (HTTP ${response.status}).`);
  }
  const providerError = getProviderError(data);
  if (!response.ok) {
    throw new Error(
      providerError ?? `Digiflazz price-list request gagal (HTTP ${response.status}).`,
    );
  }
  const products = findProductList(data);
  if (!products) {
    const root = typeof data === 'object' && data !== null
      ? Object.keys(data).slice(0, 12).join(', ')
      : typeof data;
    throw new Error(
      providerError ??
      `Format respons daftar produk Digiflazz tidak dikenali${root ? ` (field: ${root})` : ''}.`,
    );
  }
  return { total: products.length, products };
}

export async function createDigiflazzTransaction(
  config: DigiflazzConfig,
  params: {
    buyerSkuCode: string;
    customerNo: string;
    refId: string;
    testing?: boolean;
  }
) {
  const result = await requestDigiflazzTransaction(config, params);
  if (result.httpStatus < 200 || result.httpStatus >= 300) {
    // Digiflazz answers rejected transactions with HTTP 400 and a full transaction
    // body (status "Gagal", rc 45 for unregistered IP, ...). Keep that body so the
    // caller can classify a definitive failure instead of treating it as unclear.
    const rejected = readDigiflazzTransactionResponse(result.data);
    if (rejected) return result.data;
    throw new Error(`Digiflazz transaction request failed (${result.httpStatus})`);
  }
  return result.data;
}

export async function checkDigiflazzTransactionStatus(
  config: DigiflazzConfig,
  params: {
    buyerSkuCode: string;
    customerNo: string;
    refId: string;
  },
) {
  return createDigiflazzTransaction(config, params);
}

export async function testDigiflazzTransaction(
  config: DigiflazzConfig,
  params: {
    buyerSkuCode: string;
    customerNo: string;
    refId: string;
  },
) {
  return requestDigiflazzTransaction(config, { ...params, testing: true });
}

async function requestDigiflazzTransaction(
  config: DigiflazzConfig,
  params: {
    buyerSkuCode: string;
    customerNo: string;
    refId: string;
    testing?: boolean;
  },
) {
  const sign = generateDigiflazzSignature(config.username, config.apiKey, params.refId);
  const payload = {
    username: config.username,
    buyer_sku_code: params.buyerSkuCode,
    customer_no: params.customerNo,
    ref_id: params.refId,
    sign,
    testing: config.mode === 'sandbox' || params.testing === true,
    // Required whenever customer_no contains the "<id>.<zone>" game separator.
    ...(params.customerNo.includes('.') ? { allow_dot: true } : {}),
  };

  const response = await fetch('https://api.digiflazz.com/v1/transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  return {
    httpStatus: response.status,
    data: (await response.json()) as unknown,
  };
}
