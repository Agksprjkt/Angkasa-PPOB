import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bantuan',
  description: 'Panduan cara membeli pulsa, paket data, token listrik, dan cek pesanan.',
  alternates: { canonical: '/bantuan' },
};

export default function BantuanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
