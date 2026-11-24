import type { Product } from '@/types/ppob';

type FlashSaleOfferFields = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  quotaLimit: number | null;
  quantitySold: number;
  quantityReserved: number;
  status: 'draft' | 'active' | 'paused';
};

type FlashSaleProduct = Pick<
  Product,
  'status' | 'sellPriceUser' | 'sellPriceAgent' | 'compareAtPrice'
>;

export type FlashSaleAvailability = {
  id: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  endsAt: Date;
  quantityRemaining: number | null;
};

// Flash sale price always follows the product's selling price, so admin only
// schedules the offer. compareAtPrice is display-only (visual anchor).
export function getFlashSalePrice(
  product: Pick<Product, 'sellPriceUser' | 'sellPriceAgent'>,
  role: 'user' | 'agent' | 'admin' | 'guest' = 'user',
) {
  const price = role === 'agent'
    ? product.sellPriceAgent ?? product.sellPriceUser
    : product.sellPriceUser;
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}

export function getAvailableFlashSale(
  product: FlashSaleProduct,
  offer: FlashSaleOfferFields,
  now: Date,
  role: 'user' | 'agent' | 'admin' | 'guest' = 'user',
): FlashSaleAvailability | null {
  if (
    product.status !== 'active' ||
    offer.status !== 'active' ||
    offer.startsAt > now ||
    offer.endsAt <= now ||
    (
      offer.quotaLimit !== null &&
      offer.quantitySold + offer.quantityReserved >= offer.quotaLimit
    )
  ) {
    return null;
  }

  const price = getFlashSalePrice(product, role);
  if (price === null) return null;

  const compareAtPrice = Number.isSafeInteger(product.compareAtPrice) &&
    (product.compareAtPrice ?? 0) > price
    ? product.compareAtPrice as number
    : null;

  return {
    id: offer.id,
    price,
    compareAtPrice,
    discountPercent: compareAtPrice === null
      ? 0
      : Math.round((1 - price / compareAtPrice) * 100),
    endsAt: offer.endsAt,
    quantityRemaining: offer.quotaLimit === null
      ? null
      : offer.quotaLimit - offer.quantitySold - offer.quantityReserved,
  };
}
