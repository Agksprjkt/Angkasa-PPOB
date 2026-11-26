import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { PPOBProvider } from '@/context/PPOBContext';
import ToastContainer from '@/components/ToastContainer';
import CookieConsent from '@/components/CookieConsent';
import ChatSupportButton from '@/components/ChatSupportButton';
import { getStoreSettings } from '@/lib/server/store-settings';
import { resolveSeo, storeAssetUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  const seo = resolveSeo(settings);
  // Each asset has its own job: favicon is the browser tab, icon is the installed
  // app, logo is the header. Fall back down the chain so a single upload still
  // improves everything.
  const iconFile = settings.iconFile ?? settings.logoFile;
  const faviconFile = settings.faviconFile ?? iconFile;
  const icon = storeAssetUrl(iconFile) ?? '/icons/icon-192.png';
  const favicon = storeAssetUrl(faviconFile) ?? '/icons/icon.svg';
  const baseUrl = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000');
  const noIndex = settings.seoNoIndex;
  const images = seo.imageUrl
    ? [{ url: seo.imageUrl, alt: seo.imageAlt }]
    : undefined;
  return {
    metadataBase: baseUrl,
    title: seo.title,
    description: seo.description,
    applicationName: settings.storeName,
    keywords: [settings.storeName, 'PPOB', 'pulsa', 'paket data', 'token listrik']
      .filter(Boolean),
    alternates: { canonical: '/' },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: 'website',
      url: '/',
      siteName: settings.storeName,
      title: seo.ogTitle,
      description: seo.ogDescription,
      locale: 'id_ID',
      images,
    },
    twitter: {
      card: seo.imageUrl ? 'summary_large_image' : 'summary',
      title: seo.ogTitle,
      description: seo.ogDescription,
      images: images?.map((image) => image.url),
    },
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getStoreSettings();
  const baseUrl = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000');
  const logoUrl = storeAssetUrl(settings.iconFile ?? settings.logoFile);
  // One graph for the store as a whole: search engines read the site name and
  // the merchant identity from here instead of guessing from page markup.
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': new URL('/#organization', baseUrl).toString(),
        name: settings.storeName,
        url: baseUrl.toString(),
        description: settings.description || settings.tagline || undefined,
        logo: logoUrl ? new URL(logoUrl, baseUrl).toString() : undefined,
      },
      {
        '@type': 'WebSite',
        '@id': new URL('/#website', baseUrl).toString(),
        name: settings.storeName,
        url: baseUrl.toString(),
        inLanguage: 'id-ID',
        publisher: { '@id': new URL('/#organization', baseUrl).toString() },
      },
    ],
  };
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
        <script
          type="application/ld+json"
          // Values come from admin settings; JSON.stringify escapes them.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
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
