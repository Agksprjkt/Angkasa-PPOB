import type { Metadata } from 'next';

const categoryLabels: Record<string, string> = {
  pulsa: 'Pulsa',
  data: 'Paket Data',
  voucher: 'Voucher',
  pln: 'Token Listrik',
  tagihan: 'Tagihan',
  ewallet: 'E-Wallet',
  game: 'Game',
};

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// The page itself is a client component, so the shareable metadata for each
// provider lives here where the route params are available on the server.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; provider: string }>;
}): Promise<Metadata> {
  const { category, provider } = await params;
  const categoryLabel = categoryLabels[category] ?? 'Produk';
  const providerName = decode(provider);
  const title = `${categoryLabel} ${providerName}`;
  return {
    title,
    description: `Harga ${categoryLabel.toLocaleLowerCase('id-ID')} ${providerName} terbaru, proses otomatis dan instan.`,
    alternates: { canonical: `/checkout/${category}/${provider}` },
    openGraph: { title, description: `Harga ${categoryLabel} ${providerName} terbaru.` },
  };
}

export default function CheckoutProviderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
