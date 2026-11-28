// Pure rules for taking a product off the storefront when the provider breaks it.
// Kept free of database imports so the test can exercise every branch.

export type ProductDisabledBy = 'system' | 'admin';

/** A product is only auto-revived when the system turned it off, never an admin. */
export type ProductHealth = {
  status: 'active' | 'inactive';
  disabledBy: ProductDisabledBy | null;
  failureStreak: number;
  lastFailureAt?: Date | null;
};

/**
 * A failure older than this is a different incident: a product that failed twice
 * last month and once today has not failed three times in a row. The window keeps
 * the streak about the current outage instead of a product's whole history.
 */
export const failureWindowMs = 24 * 60 * 60 * 1000;

/**
 * Digiflazz reports a provider outage with these rc codes: 44/45/47/48 cover a
 * disturbed or unavailable biller, and a "gangguan"/"maintenance" message is the
 * same condition spelled out. One of these is enough to pull the product: every
 * further order would fail and have to be refunded.
 */
const outageCodes = new Set(['44', '45', '47', '48']);

export function isVendorOutage(rc: string | null | undefined, message?: string | null) {
  const code = rc?.trim();
  if (code && outageCodes.has(code)) return true;
  const text = (message ?? '').toLowerCase();
  return text.includes('gangguan') || text.includes('maintenance') || text.includes('sedang offline');
}

export const failureStreakLimit = 3;

export function nextFailureStreak(current: number) {
  return Math.max(0, current) + 1;
}

/**
 * The streak only counts failures inside the window. An outage code is judged
 * before the streak, so a genuine provider outage still disables on its own even
 * if the previous failure was days ago.
 */
export function effectiveStreak(
  product: Pick<ProductHealth, 'failureStreak' | 'lastFailureAt'>,
  now: Date = new Date(),
) {
  if (!product.failureStreak) return 0;
  if (!product.lastFailureAt) return product.failureStreak;
  return now.getTime() - product.lastFailureAt.getTime() > failureWindowMs
    ? 0
    : product.failureStreak;
}

/**
 * Returns the change to apply after a failed order. A provider outage disables
 * immediately; anything else has to repeat, because one timeout is usually the
 * customer's network, not the product.
 */
export function afterFailedOrder(
  product: ProductHealth,
  rc: string | null | undefined,
  message?: string | null,
  now: Date = new Date(),
): { failureStreak: number; disable: boolean; reason: string | null } {
  const streak = nextFailureStreak(effectiveStreak(product, now));
  if (product.status === 'inactive' && product.disabledBy === 'system') {
    return { failureStreak: streak, disable: false, reason: null };
  }
  if (isVendorOutage(rc, message)) {
    return {
      failureStreak: streak,
      disable: true,
      reason: `Gangguan penyedia (rc ${rc?.trim() || 'maintenance'})`,
    };
  }
  if (streak >= failureStreakLimit) {
    return {
      failureStreak: streak,
      disable: true,
      reason: `${streak} transaksi gagal beruntun`,
    };
  }
  return { failureStreak: streak, disable: false, reason: null };
}

export function afterSuccessfulOrder(): { failureStreak: number; enable: boolean } {
  // A success proves the product works again, so a system disable is lifted even
  // if the vendor price list still claims otherwise.
  return { failureStreak: 0, enable: true };
}

/**
 * Sync only revives what the system disabled. A product an admin switched off
 * stays off: that is a merchandising decision, not a health signal.
 */
export function shouldAutoEnable(
  product: Pick<ProductHealth, 'status' | 'disabledBy'>,
  vendorSaysAvailable: boolean,
) {
  return vendorSaysAvailable && product.status === 'inactive' && product.disabledBy === 'system';
}
