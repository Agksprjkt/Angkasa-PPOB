import { createHmac, timingSafeEqual } from 'node:crypto';

export type DigiflazzTransactionResponse = {
  refId: string;
  status: string;
  message: string;
  rc: string;
  sn?: string;
};

// Digiflazz documents `price` as a String but sends numbers in practice, so both
// shapes must be accepted or the whole price-list sync silently skips products.
export function parseDigiflazzPrice(value: unknown): number | null {
  const price = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(price) || price < 0) return null;
  return price;
}

// Game top-ups send "<user id>.<zone id>". Digiflazz only accepts the dot when
// allow_dot is true, otherwise it rejects the order or truncates the zone.
export function buildDigiflazzCustomerNo(
  destination: string,
  serverZoneId?: string | null,
) {
  const customerNo = serverZoneId ? `${destination}.${serverZoneId}` : destination;
  return { customerNo, allowDot: customerNo.includes('.') };
}

export function readDigiflazzTransactionResponse(
  value: unknown,
): DigiflazzTransactionResponse | null {
  if (typeof value !== 'object' || value === null || !('data' in value)) return null;
  const data = (value as { data: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (
    typeof record.ref_id !== 'string' ||
    typeof record.status !== 'string' ||
    typeof record.message !== 'string' ||
    typeof record.rc !== 'string' ||
    (record.sn !== undefined && typeof record.sn !== 'string')
  ) {
    return null;
  }
  return {
    refId: record.ref_id,
    status: record.status,
    message: record.message,
    rc: record.rc,
    ...(typeof record.sn === 'string' ? { sn: record.sn } : {}),
  };
}

// rc "00" is the only definitive success; "Gagal" is definitive failure; anything
// else stays pending so the reconciler can settle it later.
export function mapDigiflazzStatus(
  status: string,
  rc: string,
): 'success' | 'pending' | 'failed' {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'sukses' && rc === '00') return 'success';
  if (normalized === 'gagal') return 'failed';
  return 'pending';
}

// Digiflazz re-creates a transaction when a status check runs more than 90 days
// after the order, so old pending orders must never be re-queried.
export const digiflazzStatusCheckLimitMs = 89 * 24 * 60 * 60_000;

export function isDigiflazzStatusCheckSafe(createdAt: Date, now: Date) {
  return now.getTime() - createdAt.getTime() < digiflazzStatusCheckLimitMs;
}

// Webhook header format: "sha1=<hex hmac of the raw body>".
export function verifyDigiflazzWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
) {
  if (!secret || !signatureHeader) return false;
  const provided = signatureHeader.trim().replace(/^sha1=/i, '');
  if (!/^[0-9a-f]{40}$/i.test(provided)) return false;
  const expected = createHmac('sha1', secret).update(rawBody).digest();
  const supplied = Buffer.from(provided, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
