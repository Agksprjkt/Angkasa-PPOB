import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { PPOBProvider } from '@/context/PPOBContext';
import ToastContainer from '@/components/ToastContainer';
import CookieConsent from '@/components/CookieConsent';
import ChatSupportButton from '@/components/ChatSupportButton';
import { getStoreSettings } from '@/lib/server/store-settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  const defaultDescription =
    'Platform PPOB Lengkap & Cepat. Beli pulsa reguler, paket kuota data, token listrik PLN, dan bayar tagihan.';
  // Each asset has its own job: favicon is the browser tab, icon is the installed
  // app, logo is the header. Fall back down the chain so a single upload still
  // improves everything.
  const iconFile = settings.iconFile ?? settings.logoFile;
  const faviconFile = settings.faviconFile ?? iconFile;
  const assetUrl = (file: string | null) =>
    file ? `/api/store-assets/${encodeURIComponent(file)}` : null;
  const icon = assetUrl(iconFile) ?? '/icons/icon-192.png';
  const favicon = assetUrl(faviconFile) ?? '/icons/icon.svg';
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
    icons: {
      icon: favicon,
      shortcut: favicon,
      apple: icon,
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
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
    <html lang="id" className="liquid-theme" data-theme="light" suppressHydrationWarning>
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
      <body className="min-h-screen flex flex-col text-slate-900">
        <Script id="ppob-theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                var saved = window.localStorage.getItem('ppob-theme');
                var mode = saved === 'light' || saved === 'dark'
                  ? saved
                  : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                document.documentElement.dataset.theme = mode;
                document.documentElement.style.colorScheme = mode;
              } catch (error) {}
            })();
          `}
        </Script>
        <div aria-hidden="true" className="liquid-backdrop">
          <span className="liquid-orb liquid-orb-one" />
          <span className="liquid-orb liquid-orb-two" />
          <span className="liquid-orb liquid-orb-three" />
        </div>
        <PPOBProvider>
          {children}
          <ToastContainer />
          <CookieConsent />
          <ChatSupportButton />
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
