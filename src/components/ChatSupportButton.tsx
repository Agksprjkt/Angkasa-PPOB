'use client';

import { usePathname } from 'next/navigation';
import { Headset } from 'lucide-react';
import { usePPOB } from '@/context/PPOBContext';
import { buildWhatsAppMessageUrl } from '@/lib/contact-message';

// Persistent support entry point. On phones it docks to the left edge with the
// label set vertically, so it never fights the bottom navigation; from sm:
// upwards it becomes the bottom right tab used by the reference storefront.
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
      className="fixed left-0 top-1/2 z-50 inline-flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-r-lg bg-emerald-600 px-1.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-[4px_0_18px_-8px_rgba(5,150,105,0.8)] transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:left-auto sm:right-4 sm:top-auto sm:bottom-0 sm:translate-y-0 sm:flex-row sm:gap-2 sm:rounded-r-none sm:rounded-t-lg sm:px-5 sm:pb-2 sm:pt-3 sm:text-xs"
    >
      <Headset className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="[writing-mode:vertical-rl] rotate-180 sm:rotate-0 sm:[writing-mode:horizontal-tb]">Chat CS</span>
    </a>
  );
}
