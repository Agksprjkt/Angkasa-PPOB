import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Semua produk',
  description: 'Daftar lengkap pulsa, paket data, voucher game, token PLN, dan tagihan.',
  alternates: { canonical: '/produk' },
};

export default function ProdukLayout({ children }: { children: React.ReactNode }) {
  return children;
}
