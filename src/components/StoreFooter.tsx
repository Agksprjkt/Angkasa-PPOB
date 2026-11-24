'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SocialIcon from '@/components/ui/social-icon';
import StoreLogo from '@/components/StoreLogo';
import { buildWhatsAppMessageUrl } from '@/lib/contact-message';
import type { NormalizedSocialLink } from '@/lib/social-links';

// Published on <html> so the mobile bottom nav can hide itself without either
// component owning the other. IntersectionObserver is used instead of a scroll
// listener: it costs nothing per frame and works at any viewport height.
export const footerVisibilityEvent = 'storefront-footer-visibility';

const footerLinks = [
  { href: '/produk', label: 'Produk' },
  { href: '/promo', label: 'Promo' },
  { href: '/cek-pesanan', label: 'Cek Pesanan' },
  { href: '/legal/tentang', label: 'Tentang' },
  { href: '/legal/syarat-ketentuan', label: 'Syarat' },
  { href: '/legal/kebijakan-privasi', label: 'Privasi' },
  { href: '/kontak', label: 'Kontak' },
];

export default function StoreFooter({
  storeName,
  tagline,
  socialLinks,
}: {
  storeName: string;
  tagline: string;
  socialLinks: NormalizedSocialLink[];
}) {
  const ref = useRef<HTMLElement>(null);
  const [contactValue, setContactValue] = useState('');

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.dispatchEvent(
          new CustomEvent(footerVisibilityEvent, { detail: entry.isIntersecting }),
        );
      },
      { threshold: 0 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.dispatchEvent(new CustomEvent(footerVisibilityEvent, { detail: false }));
    };
  }, []);

  const year = new Date().getFullYear();
  const whatsapp = socialLinks.find((link) => link.type === 'whatsapp') ?? null;

  // The quick-contact box opens WhatsApp with the typed value already included,
  // so no subscription backend is needed and the message still reaches an admin.
  const startConversation = () => {
    if (!whatsapp) return;
    const value = contactValue.trim();
    const message = value
      ? `Halo{storeName}, saya ingin dihubungi di ${value}.`
      : `Halo ${storeName}, saya ingin bertanya.`;
    const url = buildWhatsAppMessageUrl(whatsapp.value, message);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <footer
      ref={ref}
      className="mt-10 bg-slate-950 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-9 text-slate-300 lg:pb-9"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,17rem)] lg:items-start">
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-center gap-2">
              <StoreLogo
                imageClassName="max-h-7 max-w-28 object-contain"
                textClassName="text-sm font-semibold text-white"
              />
            </Link>
            {tagline ? (
              <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-slate-400">{tagline}</p>
            ) : null}

            {socialLinks.length > 0 && (
              <ul className="mt-4 flex flex-wrap items-center gap-2">
                {socialLinks.map((link, index) => (
                  <li key={`${link.type}:${link.value}:${index}`}>
                    <a
                      href={link.href}
                      target={link.type === 'email' ? undefined : '_blank'}
                      rel={link.type === 'email' ? undefined : 'noreferrer noopener'}
                      aria-label={`${link.label} ${storeName}`}
                      title={link.label}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-200 transition-colors hover:bg-sky-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <SocialIcon type={link.type} className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav
            aria-label="Tautan footer"
            className="flex flex-wrap items-start gap-x-5 gap-y-2 pt-1 text-[11px] font-medium text-slate-400 lg:justify-center lg:pt-2"
          >
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Hubungi kami
            </p>
            <div className="mt-2 flex gap-2">
              <label htmlFor="footer-contact" className="sr-only">
                Nomor WhatsApp atau email
              </label>
              <input
                id="footer-contact"
                value={contactValue}
                maxLength={80}
                onChange={(event) => setContactValue(event.target.value)}
                placeholder={whatsapp ? 'Nomor WhatsApp atau email' : 'Kontak belum diatur'}
                disabled={!whatsapp}
                className="h-9 min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-2.5 text-xs text-white placeholder:text-slate-500 focus-visible:border-sky-400 focus-visible:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={startConversation}
                disabled={!whatsapp}
                className="h-9 shrink-0 rounded-md bg-white px-3 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-200 disabled:opacity-60"
              >
                Kirim
              </button>
            </div>
            <Link
              href="/kontak"
              className="mt-2 inline-flex text-[11px] font-medium text-sky-400 transition-colors hover:text-sky-300"
            >
              Halaman kontak lengkap
            </Link>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-4 text-center text-[11px] text-slate-500">
          © {year} {storeName}. Seluruh hak dilindungi.
        </div>
      </div>
    </footer>
  );
}
