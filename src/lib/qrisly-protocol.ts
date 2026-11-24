// Qrisly returns WIB wall-clock strings without an offset.
export function parseQrislyExpiry(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}+07:00`
    : trimmed;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

// Qrisly adds its own unique code, so the payable amount is final_amount,
// never the amount we requested.
export function resolveQrislyPayableAmount(
  requested: number,
  finalAmount: unknown,
  originalAmount: unknown,
) {
  for (const candidate of [finalAmount, originalAmount]) {
    const amount = Number(candidate);
    if (Number.isSafeInteger(amount) && amount >= requested) return amount;
  }
  return null;
}
