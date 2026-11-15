import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PPOBProvider } from '@/context/PPOBContext';
import ToastContainer from '@/components/ToastContainer';
import CookieConsent from '@/components/CookieConsent';
import { getStoreSettings } from '@/lib/server/store-settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  const defaultDescription =
    'Platform PPOB Lengkap & Cepat. Beli pulsa reguler, paket kuota data, token listrik PLN, dan bayar tagihan.';
  const icon = settings.logoFile
    ? `/api/store-assets/${encodeURIComponent(settings.logoFile)}`
    : '/icons/icon.svg';
  return {
    metadataBase: new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'),
    title: settings.seoTitle || settings.storeName,
    description: settings.seoDescription || settings.description || defaultDescription,
    verification: settings.googleSiteVerification
      ? { google: settings.googleSiteVerification }
      : undefined,
    other: settings.bingSiteVerification
      ? { 'msvalidate.01': settings.bingSiteVerification }
      : undefined,
    manifest: '/api/manifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: settings.storeName,
    },
    icons: { icon, apple: icon },
  };
}

export const viewport: Viewport = {
  themeColor: '#0F2C59',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="manifest" href="/api/manifest" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- Load with swap and local system fallbacks. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Momo+Trust+Display&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <PPOBProvider>
          {children}
          <ToastContainer />
          <CookieConsent />
        </PPOBProvider>

        {/* PWA Service Worker Registration Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('ServiceWorker registered successfully:', registration.scope);
                    },
                    function(err) {
                      console.log('ServiceWorker registration failed:', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
