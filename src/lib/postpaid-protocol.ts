// Pure parsing for the two postpaid (pascabayar) providers. Kept free of network
// and DB imports so the inquiry route and its tests share one definition.

export type PostpaidLine = { label: string; value: string };

export type PostpaidInquiry = {
  customerName: string;
  // Value of the bill itself, without the admin fee or the provider margin.
  billAmount: number;
  adminFee: number;
  // What the buyer actually pays.
  totalAmount: number;
  lines: PostpaidLine[];
  periods: string[];
  dueDate: string | null;
};

export type PostpaidErrorCode =
  | 'BILL_NOT_FOUND'
  | 'BILL_ALREADY_PAID'
  | 'BILL_EXPIRED'
  | 'BILL_PROVIDER_UNAVAILABLE'
  | 'BILL_REJECTED';

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[^\d]/g, '');
  if (!cleaned) return null;
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

// The two providers send the same field in opposite orders: Digiflazz uses
// YYYYMM ("201901"), TokoVoucher uses MMYYYY ("012024"). A 6-digit value is only
// ambiguous when both halves could be a month, so the year is the discriminator.
function formatPeriod(value: string) {
  if (!/^\d{6}$/.test(value)) return value;
  const first = Number(value.slice(0, 2));
  const last = Number(value.slice(4));
  // YYYYMM: last two digits are the month.
  if (last >= 1 && last <= 12 && (first < 1 || first > 12)) {
    return `${value.slice(4)}/${value.slice(0, 4)}`;
  }
  // MMYYYY: first two digits are the month.
  if (first >= 1 && first <= 12) {
    return `${value.slice(0, 2)}/${value.slice(2)}`;
  }
  return value;
}

function formatRupiah(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

// Digiflazz: everything sits inside `data`, and the bill detail is nested under
// `desc.detail[]` with one entry per billed period.
export function readDigiflazzInquiry(value: unknown): PostpaidInquiry | null {
  const root = recordOf(value);
  if (!root) return null;
  const data = recordOf(root.data) ?? root;
  if (asText(data.status).toLowerCase() !== 'sukses') return null;

  const desc = recordOf(data.desc);
  const rawDetail = desc && Array.isArray(desc.detail) ? desc.detail : [];

  const lines: PostpaidLine[] = [];
  const periods: string[] = [];
  let billAmount = 0;
  let hasDetail = false;

  for (const item of rawDetail.slice(0, 24)) {
    const row = recordOf(item);
    if (!row) continue;
    const periode = asText(row.periode);
    const nilai = asNumber(row.nilai_tagihan);
    const denda = asNumber(row.denda) ?? 0;
    if (periode) periods.push(formatPeriod(periode));
    if (nilai === null) continue;
    hasDetail = true;
    billAmount += nilai + denda;
    const parts = [formatRupiah(nilai)];
    if (denda > 0) parts.push(`denda ${formatRupiah(denda)}`);
    lines.push({
      label: periode ? `Tagihan ${formatPeriod(periode)}` : 'Tagihan',
      value: parts.join(' + '),
    });
  }

  // `price` is the total deducted from the vendor deposit, not the bill, so it is
  // only a fallback for providers that omit the detail array.
  const fallbackBill = asNumber(data.price);
  if (!hasDetail) {
    if (fallbackBill === null) return null;
    billAmount = fallbackBill;
  }

  const adminFee = asNumber(data.admin) ?? 0;
  const totalAmount = asNumber(data.selling_price) ?? billAmount + adminFee;

  const tarif = desc ? asText(desc.tarif) : '';
  const daya = desc ? asNumber(desc.daya) : null;
  const alamat = desc ? asText(desc.alamat) : '';
  const jatuhTempo = desc ? asText(desc.jatuh_tempo) : '';
  if (tarif) lines.push({ label: 'Tarif', value: tarif });
  if (daya !== null) lines.push({ label: 'Daya', value: `${daya} VA` });
  if (alamat) lines.push({ label: 'Alamat', value: alamat });
  if (jatuhTempo) lines.push({ label: 'Jatuh tempo', value: jatuhTempo });

  const periode = asText(data.periode);
  if (periode && periods.length === 0) periods.push(formatPeriod(periode));

  return {
    customerName: asText(data.customer_name).slice(0, 120),
    billAmount,
    adminFee,
    totalAmount,
    lines,
    periods,
    dueDate: jatuhTempo || null,
  };
}

// TokoVoucher returns a flat body. Require `tagihan`; `price` is not a safe
// substitute because it may include provider margin.
export function readTokoVoucherInquiry(value: unknown): PostpaidInquiry | null {
  const root = recordOf(value);
  if (!root) return null;
  if (asText(root.status).toLowerCase() !== 'sukses') return null;

  const billAmount = asNumber(root.tagihan);
  if (billAmount === null) return null;
  const adminFee = asNumber(root.admin) ?? 0;
  const denda = asNumber(root.denda) ?? 0;
  const totalAmount = asNumber(root.selling_price) ?? billAmount + denda + adminFee;
  const periode = formatPeriod(asText(root.blnth));
  const daya = asText(root.data);
  const dueDate = asText(root.due_date);
  const months = asNumber(root.jml_bulan);

  const lines: PostpaidLine[] = [];
  lines.push({
    label: periode ? `Tagihan ${periode}` : 'Tagihan',
    value: formatRupiah(billAmount),
  });
  if (denda > 0) lines.push({ label: 'Denda', value: formatRupiah(denda) });
  if (daya) lines.push({ label: 'Daya', value: daya });
  if (dueDate) lines.push({ label: 'Jatuh tempo', value: dueDate });
  if (months !== null && months > 1) lines.push({ label: 'Jumlah bulan', value: String(months) });

  return {
    customerName: asText(root.customer_name).slice(0, 120),
    billAmount: billAmount + denda,
    adminFee,
    totalAmount,
    lines,
    periods: periode ? [periode] : [],
    dueDate: dueDate || null,
  };
}

// Provider text to an internal code. Anything unrecognised is a rejection rather
// than a silent success: a wrong "paid" costs more than a retry.
export function mapPostpaidError(message: string, rc?: string): PostpaidErrorCode {
  const text = `${message} ${rc ?? ''}`.toLocaleLowerCase('id-ID');
  if (text.includes('sudah dibayar') || text.includes('already paid') || text.includes('telah dibayar')) {
    return 'BILL_ALREADY_PAID';
  }
  if (
    text.includes('tidak ditemukan') ||
    text.includes('not found') ||
    text.includes('tidak terdaftar') ||
    text.includes('nomor tujuan salah')
  ) {
    return 'BILL_NOT_FOUND';
  }
  if (text.includes('expired') || text.includes('kedaluwarsa') || text.includes('kadaluarsa')) {
    return 'BILL_EXPIRED';
  }
  if (
    text.includes('gangguan') ||
    text.includes('maintenance') ||
    text.includes('timeout') ||
    text.includes('ip not allowed') ||
    text.includes('blocked') ||
    text.includes('signature not valid') ||
    text.includes('signature anda salah')
  ) {
    return 'BILL_PROVIDER_UNAVAILABLE';
  }
  return 'BILL_REJECTED';
}

// A postpaid price list has no sale price: the bill amount only exists after an
// inquiry, so `price` here is the admin fee.
export function readPostpaidProductRow(value: unknown): {
  vendorCode: string;
  name: string;
  operator: string;
  price: number;
} | null {
  const root = recordOf(value);
  if (!root) return null;
  const vendorCode = asText(root.buyer_sku_code);
  const name = asText(root.product_name);
  const operator = asText(root.brand);
  const price = asNumber(root.admin) ?? asNumber(root.price) ?? 0;
  if (!vendorCode || !name || !operator) return null;
  return { vendorCode, name, operator, price };
}

// Payment confirmation shape. Both providers report `status` + `sn`.
export function readPostpaidPayment(value: unknown): {
  status: string;
  message: string;
  sn: string | null;
  rc: string | null;
} | null {
  const root = recordOf(value);
  if (!root) return null;
  const data = recordOf(root.data) ?? root;
  const status = asText(data.status);
  if (!status) return null;
  return {
    status,
    message: asText(data.message).slice(0, 500),
    sn: asText(data.sn) || null,
    rc: asText(data.rc) || null,
  };
}
