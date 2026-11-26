import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Promo & flash sale',
  description: 'Promo aktif, voucher, dan flash sale produk digital.',
  alternates: { canonical: '/promo' },
};

export default function PromoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
