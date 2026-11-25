'use client';

import { usePathname } from 'next/navigation';
import { Headset } from 'lucide-react';
import { usePPOB } from '@/context/PPOBContext';
import { buildWhatsAppMessageUrl } from '@/lib/contact-message';

// Persistent support entry point, shaped like the reference storefront: a tab
// pinned to the bottom-right corner. Mobile lifts it above the bottom nav so
// both stay tappable; desktop sits flush on the viewport edge.
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
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 inline-flex items-center gap-2.5 rounded-t-lg bg-emerald-600 px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_-6px_24px_-10px_rgba(5,150,105,0.7)] transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:bottom-0 sm:px-5"
    >
      <Headset className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Chat CS</span>
    </a>
  );
}
