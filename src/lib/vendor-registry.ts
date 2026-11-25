import type { ProductVendor } from '@/types/ppob';

export type { ProductVendor };

const displayNames: Record<ProductVendor, string> = {
  Digiflazz: 'Digiflazz',
  TokoVoucher: 'TokoVoucher',
  Manual: 'Manual',
};

export function vendorDisplayName(vendor: ProductVendor) {
  return displayNames[vendor] ?? vendor;
}

// The storefront badge: an admin-set label ("Server 1") wins, otherwise the
// vendor name is shown so a buyer still knows where the product comes from.
export function vendorLabelOf(product: {
  vendor: ProductVendor;
  vendorLabel?: string | null;
}) {
  const label = product.vendorLabel?.trim();
  return label ? label : vendorDisplayName(product.vendor);
}

// Only these vendors can actually place an order; Manual products are a price
// reference and must never be sold.
export function isOrderableVendor(vendor: ProductVendor) {
  return vendor === 'Digiflazz' || vendor === 'TokoVoucher';
}

// The admin switch is authoritative: a vendor with valid credentials but the
// switch off must not accept new orders.
export function isVendorEnabled(
  vendor: ProductVendor,
  values: { digiflazzEnabled?: boolean; tokovoucherEnabled?: boolean },
) {
  if (vendor === 'Digiflazz') return values.digiflazzEnabled !== false;
  if (vendor === 'TokoVoucher') return values.tokovoucherEnabled === true;
  return false;
}

export type VendorStatus = 'active' | 'disabled' | 'unconfigured';

// Three states, because "credentials missing" and "switched off on purpose" are
// different problems for an admin to fix.
export function vendorStatus(input: {
  enabled: boolean;
  configured: boolean;
}): VendorStatus {
  if (!input.configured) return 'unconfigured';
  return input.enabled ? 'active' : 'disabled';
}

export function vendorStatusLabel(status: VendorStatus) {
  if (status === 'active') return 'Aktif';
  if (status === 'disabled') return 'Nonaktif';
  return 'Belum dikonfigurasi';
}
