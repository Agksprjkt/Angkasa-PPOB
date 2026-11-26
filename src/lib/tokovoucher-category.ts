import type { ProductCategory } from '@/types/ppob';

// TokoVoucher sends free-text category names ("Voucher Game", "Topup Game",
// "Pulsa Reguler", "E-Money"), so the mapping is keyword based. "Voucher Game"
// sells a voucher and stays in voucher; "Topup Game" tops up an account and
// belongs in game, which is why a game name without the word voucher is checked
// before the generic voucher rule.
//
// Pure and import-free so the sync and its test share one definition.
export function tokoVoucherCategory(...values: string[]): ProductCategory | null {
  for (const value of values) {
    const category = value.toLocaleLowerCase('id-ID').replace(/[^a-z]/g, '');
    if (!category) continue;
    if (category.includes('pulsa')) return 'pulsa';
    if (category.includes('data') || category.includes('internet')) return 'data';
    // "Topup Game" tops up an account and belongs in game; "Voucher Game" sells a
    // voucher, so a game name that also says voucher keeps the voucher category.
    if (category.includes('game') && !category.includes('voucher')) return 'game';
    if (category.includes('voucher') || category.includes('game')) return 'voucher';
    if (category.includes('ewallet') || category.includes('emoney') || category.includes('uangelektronik')) {
      return 'ewallet';
    }
    if (category.includes('pln') || category.includes('listrik')) return 'pln';
    if (category.includes('tagihan') || category.includes('pascabayar')) return 'tagihan';
  }
  return null;
}
