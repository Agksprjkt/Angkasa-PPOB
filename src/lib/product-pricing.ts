export function calculateMarkup(basePrice: number, sellPrice: number) {
  const amount = sellPrice - basePrice;
  return {
    amount,
    percentage: basePrice > 0 ? (amount / basePrice) * 100 : null,
  };
}
