'use client';

import { usePathname } from 'next/navigation';
import { Headset } from 'lucide-react';
import { usePPOB } from '@/context/PPOBContext';
import { buildWhatsAppMessageUrl } from '@/lib/contact-message';

// Persistent support entry point. On phones it docks to the right edge so it
// never fights the bottom navigation; from sm: upwards it becomes the bottom
// right tab used by the reference storefront.
export default function ChatSupportButton() {
  const pathname = usePathname();
  const { storeName, storeSocialLinks } = usePPOB();
  const whatsapp = storeSocialLinks.find((link) => link.type === 'whatsapp');
  // The dashboard has its own contact flows; a support tab there is noise.
  if (!whatsapp || pathname?.startsWith('/admin')) return null;

  const href = buildWhatsAppMessageUrl(
    whatsapp.value,
    `Halo ${storeName}, saya ingin bertanya.`,
  );
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Chat CS via WhatsApp"
      title="Chat CS"
      className="fixed right-0 top-1/2 z-50 inline-flex -translate-y-1/2 items-center gap-2 rounded-l-lg bg-emerald-600 px-2 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-[-4px_0_18px_-8px_rgba(5,150,105,0.8)] transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:bottom-0 sm:right-4 sm:top-auto sm:translate-y-0 sm:rounded-tl-lg sm:rounded-tr-lg sm:rounded-bl-none sm:px-5 sm:pb-2 sm:pt-3"
    >
      <Headset className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">Chat CS</span>
    </a>
  );
}
