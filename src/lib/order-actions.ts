export type QrislyOrderActionState = {
  paymentStatus: 'unpaid' | 'paid' | 'expired' | 'review';
  transactionStatus: 'pending' | 'processing' | 'success' | 'failed';
};

// Cancel and renew both retire an invoice that has not been paid yet. A settled
// QRIS must never be discarded, so the guard is deliberately narrow.
export function canManageQrislyOrder(order: QrislyOrderActionState) {
  return order.paymentStatus === 'unpaid' && order.transactionStatus === 'pending';
}
