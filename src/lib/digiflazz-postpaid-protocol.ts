// Pure parsing for the Digiflazz postpaid (pascabayar) endpoints. Kept free of
// network and DB imports so the inquiry route and its test share one definition.

export type PostpaidInquiry = {
  customerName: string;
  adminFee: number;
  billAmount: number;
  totalAmount: number;
  lines: { label: string; value: string }[];
};

export type PostpaidErrorCode =
  | 'BILL_NOT_FOUND'
  | 'BILL_ALREADY_PAID'
  | 'BILL_INQUIRY_EXPIRED'
  | 'BILL_PROVIDER_UNAVAILABLE'
  | 'BILL_PROVIDER_REJECTED';

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  // Provider sends "12.500" and "12500" in different fields.
  const cleaned = value.trim().replace(/[^\d-]/g, '');
  const parsed = Number(cleaned);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

// Digiflazz wraps postpaid payloads in `data`; some fields sit one level deeper.
function findData(value: unknown, depth = 0): Record<string, unknown> | null {
  const record = recordOf(value);
  if (!record || depth > 4) return null;
  if ('customer_name' in record || 'total' in record || 'selling_price' in record) {
    return record;
  }
  for (const key of ['data', 'result', 'response']) {
    const nested = findData(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

// Provider rc/status mapping. Anything unrecognised is a rejection rather than a
// silent success, because a wrong "paid" is worse than a retry.
export function mapPostpaidError(message: string, rc: string): PostpaidErrorCode {
  const text = `${message} ${rc}`.toLocaleLowerCase('id-ID');
  if (text.includes('sudah dibayar') || text.includes('already paid') || text.includes('telah dibayar')) {
    return 'BILL_ALREADY_PAID';
  }
  if (text.includes('tidak ditemukan') || text.includes('not found') || text.includes('nomor tidak')) {
    return 'BILL_NOT_FOUND';
  }
  if (text.includes('expired') || text.includes('kedaluwarsa') || text.includes('kadaluarsa')) {
    return 'BILL_INQUIRY_EXPIRED';
  }
  if (text.includes('gangguan') || text.includes('maintenance') || text.includes('timeout')) {
    return 'BILL_PROVIDER_UNAVAILABLE';
  }
  return 'BILL_PROVIDER_REJECTED';
}

export function readPostpaidInquiry(value: unknown): PostpaidInquiry | null {
  const data = findData(value);
  if (!data) return null;

  const customerName = asText(data.customer_name ?? data.customerName ?? data.name);
  const billAmount = asNumber(
    data.bill_amount ?? data.billAmount ?? data.amount,
  );
  // Digiflazz names the fee "admin" in some responses and "admin_fee" in others.
  const adminFee = asNumber(data.admin_fee ?? data.adminFee ?? data.admin ?? 0);
  const totalAmount = asNumber(
    data.total ?? data.total_amount ?? data.selling_price ?? data.price,
  );
  if (billAmount === null || totalAmount === null || adminFee === null) return null;

  // Detail rows come as a list of label/value pairs, but the label key varies.
  const lines: { label: string; value: string }[] = [];
  const rawLines = data.detail ?? data.details ?? data.breakdown;
  if (Array.isArray(rawLines)) {
    for (const item of rawLines.slice(0, 30)) {
      const row = recordOf(item);
      if (!row) continue;
      const label = asText(row.label ?? row.name ?? row.title);
      const value = asText(row.value ?? row.amount ?? row.detail);
      if (label && value) lines.push({ label, value });
    }
  }
  for (const key of ['periode', 'period', 'tarif', 'daya', 'alamat']) {
    const text = asText(data[key]);
    if (text) lines.push({ label: key, value: text });
  }

  return { customerName, adminFee, billAmount, totalAmount, lines };
}

// Postpaid price lists reuse the prepaid shape, so this only guards the fields
// the sync needs.
export function readPostpaidProductRow(value: unknown): {
  vendorCode: string;
  name: string;
  operator: string;
  price: number;
  category: string;
} | null {
  const record = recordOf(value);
  if (!record) return null;
  const vendorCode = asText(record.buyer_sku_code);
  const name = asText(record.product_name);
  const operator = asText(record.brand);
  const category = asText(record.category);
  const price = asNumber(record.price);
  if (!vendorCode || !name || !operator || price === null) return null;
  return { vendorCode, name, operator, price, category };
}
