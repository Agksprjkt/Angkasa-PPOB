import 'server-only';

import {
  buildTokoVoucherDestination,
  parseTokoVoucherPrice,
  readTokoVoucherError,
  readTokoVoucherProducts,
  readTokoVoucherTransaction,
  tokoVoucherSignature,
} from './tokovoucher-protocol';

export type { TokoVoucherProductRow } from './tokovoucher-protocol';

export interface TokoVoucherConfig {
  memberCode: string;
  secret: string;
  // The "signature default" from the member panel. It is a distinct value, not
  // derived from the secret, and is required by /member and /member/produk/full.
  defaultSignature: string;
  mode: 'sandbox' | 'production';
}

const baseUrl = 'https://api.tokovoucher.net';

function requireCredentials(config: TokoVoucherConfig) {
  if (!config.memberCode || !config.secret) {
    throw new Error('TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED');
  }
}

// /member and /member/produk/full authenticate with the member panel's signature
// default verbatim. The secret is only a fallback for the case where the panel
// shows both as the same value.
function memberSignature(config: TokoVoucherConfig) {
  return config.defaultSignature || config.secret;
}

export async function checkTokoVoucherBalance(config: TokoVoucherConfig) {
  requireCredentials(config);
  const url = new URL(`${baseUrl}/member`);
  url.searchParams.set('member_code', config.memberCode);
  url.searchParams.set('signature', memberSignature(config));

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const data: unknown = await response.json();
  const error = readTokoVoucherError(data);
  if (!response.ok || error) {
    throw new Error(error ?? `TokoVoucher balance request failed (${response.status})`);
  }
  const record = data as { data?: { saldo?: unknown } };
  const balance = parseTokoVoucherPrice(record.data?.saldo);
  if (balance === null) {
    throw new Error('TokoVoucher mengirim saldo yang tidak dikenali.');
  }
  return { balance };
}

export async function fetchTokoVoucherProducts(config: TokoVoucherConfig) {
  requireCredentials(config);
  const url = new URL(`${baseUrl}/member/produk/full`);
  url.searchParams.set('member_code', config.memberCode);
  url.searchParams.set('signature', memberSignature(config));

  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`TokoVoucher mengirim respons non-JSON (HTTP ${response.status}).`);
  }
  const error = readTokoVoucherError(data);
  if (!response.ok || error) {
    throw new Error(error ?? `TokoVoucher product request gagal (HTTP ${response.status}).`);
  }
  const products = readTokoVoucherProducts(data);
  if (products.length === 0) {
    throw new Error('Daftar produk TokoVoucher kosong atau formatnya tidak dikenali.');
  }
  return { total: products.length, products };
}

type TransactionParams = {
  refId: string;
  vendorCode: string;
  destination: string;
  serverZoneId?: string | null;
};

async function postTransaction(
  config: TokoVoucherConfig,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // Their rule: a non-JSON or timed-out response must be treated as pending by
    // the caller, never as a failure.
    throw new Error(`TokoVoucher respons tidak terbaca (HTTP ${response.status}).`);
  }
  return { httpStatus: response.status, data };
}

export async function createTokoVoucherTransaction(
  config: TokoVoucherConfig,
  params: TransactionParams,
) {
  requireCredentials(config);
  const result = await postTransaction(config, '/v1/transaksi', {
    ref_id: params.refId,
    produk: params.vendorCode,
    ...buildTokoVoucherDestination(params.destination, params.serverZoneId),
    member_code: config.memberCode,
    signature: tokoVoucherSignature(config.memberCode, config.secret, params.refId),
  });

  const transaction = readTokoVoucherTransaction(result.data);
  if (transaction) return transaction;
  // An explicit provider error is surfaced so the caller can classify it; an
  // HTTP 5xx or unreadable body is thrown and treated as pending upstream.
  const error = readTokoVoucherError(result.data);
  if (error) throw new Error(error);
  throw new Error(`TokoVoucher transaction request gagal (HTTP ${result.httpStatus}).`);
}

export async function checkTokoVoucherTransactionStatus(
  config: TokoVoucherConfig,
  params: { refId: string },
) {
  requireCredentials(config);
  const result = await postTransaction(config, '/v1/transaksi/status', {
    ref_id: params.refId,
    member_code: config.memberCode,
    signature: tokoVoucherSignature(config.memberCode, config.secret, params.refId),
  });

  const transaction = readTokoVoucherTransaction(result.data);
  if (transaction) return transaction;
  const error = readTokoVoucherError(result.data);
  if (error) throw new Error(error);
  throw new Error(`TokoVoucher status request gagal (HTTP ${result.httpStatus}).`);
}
