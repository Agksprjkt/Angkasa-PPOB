'use client';

import SocialIcon from '@/components/ui/social-icon';

// Floating help button. It sits above the mobile bottom nav so both stay
// reachable, and hides while the footer is visible because the footer already
// offers the same contact action.
export default function WhatsAppFloat({
  phone,
  storeName,
}: {
  phone: string;
  storeName: string;
}) {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '62');
  if (!digits) return null;

  const href = `https://wa.me/${digits}?text=${encodeURIComponent(
    `Halo ${storeName}, saya ingin bertanya.`,
  )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Bantuan WhatsApp ${storeName}`}
      title="Bantuan WhatsApp"
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_-8px_rgba(37,211,102,0.65)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 lg:bottom-6 lg:right-6"
    >
      <SocialIcon type="whatsapp" className="h-6 w-6" />
    </a>
  );
}
