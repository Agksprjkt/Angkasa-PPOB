import 'server-only';

import { isValidQrislyAmount } from '@/lib/deposit-validation';
import { parseQrislyExpiry, resolveQrislyPayableAmount } from '@/lib/qrisly-protocol';

export type QrislyConfig = {
  apiKey: string;
  qrisId: string;
  mode: 'sandbox' | 'production';
};

function getBaseUrl(mode: QrislyConfig['mode']) {
  return mode === 'sandbox'
    ? 'https://api-sandbox.collaborator.komerce.id/user'
    : 'https://api.collaborator.komerce.id/user';
}

async function readJson(response: Response) {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function dataObject(body: Record<string, unknown> | null) {
  const data = body?.data;
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : body;
}

export async function createQrislyPayment(config: QrislyConfig, amount: number) {
  if (!isValidQrislyAmount(amount)) {
    throw new Error('QRISLY_AMOUNT_OUT_OF_RANGE');
  }
  const response = await fetch(
    `${getBaseUrl(config.mode)}/api/v1/qrisly/generate-qris`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify({
        // Qrisly expects a numeric qris_id; a string is rejected with HTTP 400.
        qris_id: Number(config.qrisId),
        amount,
        output_type: 'string',
        unique_amount: false,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const result = dataObject(await readJson(response));
  const rawHistoryId = result?.history_id;
  const historyId = typeof rawHistoryId === 'string'
    ? rawHistoryId.trim()
    : typeof rawHistoryId === 'number' &&
        Number.isSafeInteger(rawHistoryId) &&
        rawHistoryId > 0
      ? String(rawHistoryId)
      : '';
  if (
    !response.ok ||
    !result ||
    !historyId ||
    typeof result.qris_string !== 'string' ||
    !result.qris_string.trim()
  ) {
    throw new Error(`Qrisly gagal membuat QRIS (HTTP ${response.status}).`);
  }
  const expiry = parseQrislyExpiry(result.expiry_time);
  return {
    historyId,
    qrString: result.qris_string.trim(),
    // Qrisly adds a unique code on top of the requested amount, so the buyer
    // must pay final_amount, not the amount we asked for.
    payableAmount: resolveQrislyPayableAmount(
      amount,
      result.final_amount,
      result.original_amount,
    ),
    expiresAt: expiry,
  };
}

export async function checkQrislyPayment(
  config: Pick<QrislyConfig, 'apiKey' | 'mode'>,
  historyId: string,
) {
  const response = await fetch(
    `${getBaseUrl(config.mode)}/api/v1/qrisly/payment-status/${encodeURIComponent(historyId)}`,
    {
      headers: { 'X-API-Key': config.apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const result = dataObject(await readJson(response));
  if (!response.ok) {
    throw new Error(`Status pembayaran Qrisly tidak tersedia (HTTP ${response.status}).`);
  }
  if (!result) throw new Error('Qrisly mengembalikan status pembayaran yang tidak valid.');
  const statusValue = result?.payment_status ?? result?.status;
  if (typeof statusValue !== 'string' || !statusValue.trim()) {
    throw new Error('Qrisly mengembalikan status pembayaran yang tidak valid.');
  }
  const amountValue = result.final_amount ?? result.amount ?? result.original_amount;
  const amount = Number(amountValue);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('Qrisly mengembalikan nominal pembayaran yang tidak valid.');
  }
  return {
    status: statusValue.toLowerCase(),
    amount,
  };
}

export async function uploadQrislyMerchantQr(
  config: Pick<QrislyConfig, 'apiKey' | 'mode'>,
  name: string,
  file: File,
) {
  const body = new FormData();
  body.set('name', name);
  body.set('qris_image', file);
  const response = await fetch(
    `${getBaseUrl(config.mode)}/api/v1/qrisly/upload-qris`,
    {
      method: 'POST',
      headers: { 'X-API-Key': config.apiKey },
      body,
      signal: AbortSignal.timeout(20_000),
    },
  );
  const result = dataObject(await readJson(response));
  if (!response.ok || typeof result?.qris_id !== 'string' || !result.qris_id.trim()) {
    throw new Error(`Qrisly gagal mengunggah QR merchant (HTTP ${response.status}).`);
  }
  return result.qris_id.trim();
}
