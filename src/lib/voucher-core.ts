import type { Voucher } from '@/types/ppob';

export type VoucherDiscountType = 'percent' | 'fixed';

export type VoucherRuleFields = {
  code: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  maxDiscount: number | null;
  minOrder: number;
  quotaLimit: number | null;
  quantityUsed: number;
  perUserLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  enabled: boolean;
};

export type VoucherErrorCode =
  | 'VOUCHER_NOT_FOUND'
  | 'VOUCHER_INACTIVE'
  | 'VOUCHER_NOT_STARTED'
  | 'VOUCHER_EXPIRED'
  | 'VOUCHER_QUOTA_EXHAUSTED'
  | 'VOUCHER_MIN_ORDER_NOT_MET'
  | 'VOUCHER_USER_LIMIT_REACHED';

export type VoucherEvaluation =
  | { ok: true; discountAmount: number; finalPrice: number }
  | { ok: false; error: VoucherErrorCode };

// Codes are case-insensitive for the buyer but stored canonically, so the same
// voucher cannot exist twice as "promo" and "PROMO".
export function normalizeVoucherCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidVoucherCode(code: string) {
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code);
}

// A discount never makes an order free: Digiflazz still charges the vendor, so
// the floor keeps the payable amount at least one rupiah.
export function computeVoucherDiscount(
  voucher: Pick<VoucherRuleFields, 'discountType' | 'discountValue' | 'maxDiscount'>,
  basePrice: number,
) {
  if (!Number.isSafeInteger(basePrice) || basePrice <= 0) return 0;
  if (!Number.isSafeInteger(voucher.discountValue) || voucher.discountValue <= 0) return 0;

  const raw = voucher.discountType === 'percent'
    ? Math.floor((basePrice * voucher.discountValue) / 100)
    : voucher.discountValue;
  const capped = voucher.discountType === 'percent' &&
    voucher.maxDiscount !== null &&
    voucher.maxDiscount > 0
    ? Math.min(raw, voucher.maxDiscount)
    : raw;

  return Math.max(0, Math.min(capped, basePrice - 1));
}

export function evaluateVoucher(input: {
  voucher: VoucherRuleFields | null;
  basePrice: number;
  now: Date;
  userUsageCount: number;
}): VoucherEvaluation {
  const { voucher, basePrice, now, userUsageCount } = input;
  if (!voucher) return { ok: false, error: 'VOUCHER_NOT_FOUND' };
  if (!voucher.enabled) return { ok: false, error: 'VOUCHER_INACTIVE' };
  if (voucher.startsAt && voucher.startsAt > now) {
    return { ok: false, error: 'VOUCHER_NOT_STARTED' };
  }
  if (voucher.endsAt && voucher.endsAt <= now) {
    return { ok: false, error: 'VOUCHER_EXPIRED' };
  }
  if (voucher.quotaLimit !== null && voucher.quantityUsed >= voucher.quotaLimit) {
    return { ok: false, error: 'VOUCHER_QUOTA_EXHAUSTED' };
  }
  if (voucher.perUserLimit !== null && userUsageCount >= voucher.perUserLimit) {
    return { ok: false, error: 'VOUCHER_USER_LIMIT_REACHED' };
  }
  if (basePrice < voucher.minOrder) {
    return { ok: false, error: 'VOUCHER_MIN_ORDER_NOT_MET' };
  }

  const discountAmount = computeVoucherDiscount(voucher, basePrice);
  if (discountAmount <= 0) return { ok: false, error: 'VOUCHER_MIN_ORDER_NOT_MET' };

  return { ok: true, discountAmount, finalPrice: basePrice - discountAmount };
}

// Human-readable reason, shown in the checkout error slot.
export function voucherErrorMessage(code: VoucherErrorCode, minOrder?: number) {
  switch (code) {
    case 'VOUCHER_NOT_FOUND':
      return 'Kode voucher tidak ditemukan.';
    case 'VOUCHER_INACTIVE':
      return 'Kode voucher sedang tidak aktif.';
    case 'VOUCHER_NOT_STARTED':
      return 'Kode voucher belum berlaku.';
    case 'VOUCHER_EXPIRED':
      return 'Kode voucher sudah kedaluwarsa.';
    case 'VOUCHER_QUOTA_EXHAUSTED':
      return 'Kuota kode voucher sudah habis.';
    case 'VOUCHER_USER_LIMIT_REACHED':
      return 'Kamu sudah memakai kode ini sampai batasnya.';
    case 'VOUCHER_MIN_ORDER_NOT_MET':
      return minOrder
        ? `Minimal transaksi Rp ${minOrder.toLocaleString('id-ID')} untuk kode ini.`
        : 'Total transaksi belum memenuhi syarat kode voucher.';
  }
}

export type { Voucher };
