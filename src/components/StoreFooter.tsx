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

const linkGroups = [
  {
    title: 'Belanja',
    links: [
      { href: '/produk', label: 'Semua produk' },
      { href: '/promo', label: 'Promo & voucher' },
      { href: '/cek-pesanan', label: 'Cek pesanan' },
      { href: '/kontak', label: 'Hubungi kami' },
    ],
  },
  {
    title: 'Bantuan',
    links: [
      { href: '/bantuan', label: 'Pusat bantuan' },
      { href: '/cek-pesanan', label: 'Lacak transaksi' },
      { href: '/legal/tentang', label: 'Tentang kami' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/legal/syarat-ketentuan', label: 'Syarat & ketentuan' },
      { href: '/legal/kebijakan-privasi', label: 'Kebijakan privasi' },
    ],
  },
];

export default function StoreFooter({
  storeName,
  tagline,
  socialLinks,
  supportPhone = '',
}: {
  storeName: string;
  tagline: string;
  socialLinks: NormalizedSocialLink[];
  supportPhone?: string;
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
  const contactTarget = whatsapp?.value ?? supportPhone;
  const waDigits = contactTarget.replace(/\D/g, '').replace(/^0/, '62');

  // The quick-contact box opens WhatsApp with the typed value already included,
  // so no subscription backend is needed and the message still reaches an admin.
  const startConversation = () => {
    if (!contactTarget) return;
    const value = contactValue.trim();
    const message = value
      ? `Halo ${storeName}, saya ingin dihubungi di ${value}.`
      : `Halo ${storeName}, saya ingin bertanya.`;
    const url = buildWhatsAppMessageUrl(contactTarget, message);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <footer
      ref={ref}
      className="mt-10 bg-slate-950 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-10 text-slate-300 lg:pb-10"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-9 md:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            <Link href="/" className="inline-flex items-center gap-2">
              <StoreLogo
                onDark
                imageClassName="max-h-8 max-w-32 object-contain"
                textClassName="text-base font-semibold text-white"
              />
            </Link>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-slate-400">
              {tagline || 'Pulsa, paket data, token listrik, dan top up game dalam satu tempat.'}
            </p>

            <div className="mt-5 space-y-2 text-xs">
              {waDigits && (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 text-slate-300 transition-colors hover:text-white"
                >
                  <SocialIcon type="whatsapp" className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-medium">{contactTarget}</span>
                </a>
              )}
              <p className="text-slate-500">Layanan pelanggan setiap hari, 08.00-22.00 WIB.</p>
            </div>

            {socialLinks.length > 0 && (
              <ul className="mt-5 flex flex-wrap items-center gap-2">
                {socialLinks.map((link, index) => (
                  <li key={`${link.type}:${link.value}:${index}`}>
                    <a
                      href={link.href}
                      target={link.type === 'email' ? undefined : '_blank'}
                      rel={link.type === 'email' ? undefined : 'noreferrer noopener'}
                      aria-label={`${link.label} ${storeName}`}
                      title={link.label}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-200 transition-colors hover:bg-sky-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <SocialIcon type={link.type} className="h-4 w-4" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {linkGroups.map((group) => (
              <nav key={group.title} aria-label={group.title} className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {group.title}
                </p>
                <ul className="mt-3 space-y-2 text-xs">
                  {group.links.map((link) => (
                    <li key={`${group.title}:${link.href}:${link.label}`}>
                      <Link
                        href={link.href}
                        className="text-slate-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-9 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Butuh dibantu?</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Tinggalkan nomor WhatsApp atau email, admin akan menghubungi Anda.
              </p>
            </div>
            <div className="flex gap-2 sm:w-80">
              <label htmlFor="footer-contact" className="sr-only">
                Nomor WhatsApp atau email
              </label>
              <input
                id="footer-contact"
                value={contactValue}
                maxLength={80}
                onChange={(event) => setContactValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    startConversation();
                  }
                }}
                placeholder={contactTarget ? 'Nomor WhatsApp atau email' : 'Kontak belum diatur'}
                disabled={!contactTarget}
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-white placeholder:text-slate-500 focus-visible:border-sky-400 focus-visible:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={startConversation}
                disabled={!contactTarget}
                className="h-10 shrink-0 rounded-lg bg-white px-4 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-200 disabled:opacity-60"
              >
                Kirim
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-4 text-[11px] text-slate-500 sm:flex-row">
          <p>
            © {year} {storeName}. Seluruh hak dilindungi.
          </p>
          <Link href="/kontak" className="transition-colors hover:text-slate-300">
            Halaman kontak lengkap
          </Link>
        </div>
      </div>
    </footer>
  );
}
