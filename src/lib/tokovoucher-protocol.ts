import { createHash, timingSafeEqual } from 'node:crypto';

export type TokoVoucherTransaction = {
  refId: string;
  status: string;
  message: string;
  sn: string;
  trxId: string;
};

// TokoVoucher signs a transaction with md5(MEMBER_CODE:SECRET:REF_ID). The
// member-level endpoints (/member, /member/produk/full) instead use the default
// signature straight from the member panel, so this helper is only for orders.
export function tokoVoucherSignature(memberCode: string, secret: string, refId: string) {
  return createHash('md5')
    .update(`${memberCode}:${secret}:${refId}`)
    .digest('hex');
}

export function tokoVoucherPostpaidSignature(
  memberCode: string,
  secret: string,
  refId: string,
) {
  return createHash('md5')
    .update(`${refId}:${memberCode}:${secret}`)
    .digest('hex');
}

// Their API documents price as a number but sends strings in some payloads.
export function parseTokoVoucherPrice(value: unknown): number | null {
  const price = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(price) || price < 0) return null;
  return price;
}

// "sukses" is the only definitive success and "gagal" the only definitive
// failure. Their docs require every other case — including an unknown string,
// an HTTP error, or a network timeout — to be treated as pending so a retry or
// the webhook can still settle the order.
export function mapTokoVoucherStatus(status: unknown): 'success' | 'pending' | 'failed' {
  if (typeof status !== 'string') return 'pending';
  const normalized = status.trim().toLowerCase();
  if (normalized === 'sukses') return 'success';
  if (normalized === 'gagal') return 'failed';
  return 'pending';
}

export function readTokoVoucherTransaction(value: unknown): TokoVoucherTransaction | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // An error body is { status: 0, error_msg }. It is not a transaction; the
  // caller decides whether to retry.
  if (typeof record.status !== 'string') return null;
  const refId = typeof record.ref_id === 'string'
    ? record.ref_id
    : typeof record.ref_id === 'number'
      ? String(record.ref_id)
      : '';
  if (!refId) return null;
  return {
    refId,
    status: record.status,
    message: typeof record.message === 'string' ? record.message.slice(0, 500) : '',
    sn: typeof record.sn === 'string' ? record.sn : '',
    trxId: typeof record.trx_id === 'string' ? record.trx_id : '',
  };
}

// Game top-ups need an extra server/zone field. Their `format_form` metadata
// names the field `server_id` for every game operator we support.
export function buildTokoVoucherDestination(
  destination: string,
  serverZoneId?: string | null,
) {
  const trimmed = destination.trim();
  const zone = serverZoneId?.trim();
  return zone ? { tujuan: trimmed, server_id: zone } : { tujuan: trimmed };
}

// The documented callback signature is md5(MEMBER_CODE:SECRET:REF_ID).
export function verifyTokoVoucherWebhook(
  signature: string | null,
  memberCode: string,
  secret: string,
  refId: string,
) {
  if (!signature || !memberCode || !secret || !refId) return false;
  const normalized = signature.trim();
  if (!/^[0-9a-f]{32}$/i.test(normalized)) return false;
  const supplied = Buffer.from(normalized, 'hex');
  const expected = Buffer.from(tokoVoucherSignature(memberCode, secret, refId), 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function readTokoVoucherError(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.error_msg === 'string' && record.error_msg.trim()) {
    return record.error_msg.trim().slice(0, 300);
  }
  if (record.status === 0 && typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim().slice(0, 300);
  }
  return null;
}

export type TokoVoucherProductRow = {
  code: string;
  name: string;
  description: string;
  price: number;
  active: boolean;
  categoryName: string;
  operatorName: string;
  jenisName: string;
};

type FullPayload = {
  category?: { id?: unknown; nama?: unknown }[];
  operator?: { id?: unknown; nama?: unknown; status?: unknown }[];
  jenis?: { id?: unknown; nama?: unknown; operator_id?: unknown; status?: unknown }[];
  produk?: {
    kode_produk?: unknown;
    nama?: unknown;
    deskripsi?: unknown;
    price?: unknown;
    status?: unknown;
    kategori_id?: unknown;
    operator_id?: unknown;
    jenis_id?: unknown;
  }[];
};

function nameById(rows: { id?: unknown; nama?: unknown }[] | undefined) {
  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    if (row.id === undefined || typeof row.nama !== 'string') continue;
    map.set(String(row.id), row.nama.trim());
  }
  return map;
}

function isActiveFlag(value: unknown) {
  // Their API sends 1/0 or "1"/"0"; anything falsy disables the product.
  return value !== 0 && value !== '0' && value !== false;
}

function statusById(rows: { id?: unknown; status?: unknown }[] | undefined) {
  const map = new Map<string, boolean>();
  for (const row of rows ?? []) {
    if (row.id === undefined) continue;
    map.set(String(row.id), isActiveFlag(row.status));
  }
  return map;
}

// The full list arrives as four joined arrays. Anything that cannot be resolved
// to a code, a name, and a price is skipped rather than guessed.
export function readTokoVoucherProducts(value: unknown): TokoVoucherProductRow[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const payload = (value as { data?: unknown }).data;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return [];
  const full = payload as FullPayload;

  const categories = nameById(full.category);
  const operators = nameById(full.operator);
  const operatorStatus = statusById(full.operator);
  const jenis = nameById(full.jenis);
  const jenisStatus = statusById(full.jenis);

  const rows: TokoVoucherProductRow[] = [];
  for (const product of full.produk ?? []) {
    const code = typeof product.kode_produk === 'string' ? product.kode_produk.trim() : '';
    const name = typeof product.nama === 'string' ? product.nama.trim() : '';
    const price = parseTokoVoucherPrice(product.price);
    if (!code || !name || price === null) continue;

    const categoryId = product.kategori_id === undefined ? '' : String(product.kategori_id);
    const operatorId = product.operator_id === undefined ? '' : String(product.operator_id);
    const jenisId = product.jenis_id === undefined ? '' : String(product.jenis_id);
    const active = isActiveFlag(product.status) &&
      (operatorStatus.get(operatorId) ?? true) &&
      (jenisStatus.get(jenisId) ?? true);

    rows.push({
      code,
      name,
      description: typeof product.deskripsi === 'string' ? product.deskripsi.slice(0, 1000) : '',
      price,
      active,
      categoryName: categories.get(categoryId) ?? '',
      operatorName: operators.get(operatorId) ?? '',
      jenisName: jenis.get(jenisId) ?? '',
    });
  }
  return rows;
}
