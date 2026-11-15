const minDepositAmount = 1_000;
const maxDepositAmount = 100_000_000;

export function isValidQrislyAmount(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minDepositAmount &&
    value <= maxDepositAmount;
}

export function parseDepositAmount(value: unknown): number | null {
  const amount = typeof value === 'string' && value.trim() ? Number(value) : value;
  return isValidQrislyAmount(amount) ? amount : null;
}

export function classifyQrislyPayment(
  status: string,
  paidAmount: number,
  expectedAmount: number,
): 'paid' | 'amount_mismatch' | 'failed' | 'pending' {
  if (['paid', 'success', 'settlement', 'completed'].includes(status)) {
    return paidAmount === expectedAmount ? 'paid' : 'amount_mismatch';
  }
  if (['failed', 'expired', 'cancelled', 'canceled', 'deny'].includes(status)) {
    return 'failed';
  }
  return 'pending';
}
