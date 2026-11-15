type ExistingProductPrices = {
  basePrice: number;
  sellPriceUser: number;
  sellPriceAgent: number;
};

type ProviderPricing = {
  pricingType: 'fixed' | 'percent';
  pricingValue: number;
  memberPricingType?: 'fixed' | 'percent';
  memberPricingValue?: number;
};

function calculateMarkup(type: 'fixed' | 'percent', value: number, basePrice: number) {
  return type === 'percent' ? Math.round(basePrice * value / 100) : value;
}

export function calculateDigiflazzSellPrices(
  basePrice: number,
  existing: ExistingProductPrices | undefined,
  pricing: ProviderPricing | undefined,
) {
  const userMarkup = pricing
    ? calculateMarkup(pricing.pricingType, pricing.pricingValue, basePrice)
    : existing
      ? Math.max(0, existing.sellPriceUser - existing.basePrice)
      : 0;
  const memberMarkup = pricing
    ? calculateMarkup(
        pricing.memberPricingType ?? pricing.pricingType,
        pricing.memberPricingValue ?? pricing.pricingValue,
        basePrice,
      )
    : existing
      ? Math.max(0, existing.sellPriceAgent - existing.basePrice)
      : 0;

  return {
    sellPriceUser: basePrice + userMarkup,
    sellPriceAgent: basePrice + memberMarkup,
  };
}
