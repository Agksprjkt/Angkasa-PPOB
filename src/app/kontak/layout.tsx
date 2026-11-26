import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kontak',
  description: 'Hubungi tim dukungan lewat WhatsApp, email, atau media sosial.',
  alternates: { canonical: '/kontak' },
};

export default function KontakLayout({ children }: { children: React.ReactNode }) {
  return children;
}
