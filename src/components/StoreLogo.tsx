'use client';

import { useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { cn } from '@/lib/utils';

type StoreLogoProps = {
  className?: string;
  imageClassName?: string;
  textClassName?: string;
  alt?: string;
  // Force the invert filter. Used where the background is dark regardless of the
  // active theme, such as the footer.
  onDark?: boolean;
};

// Shows the uploaded store logo; falls back to the store name text when no logo
// exists (no initials badge, no icon box).
export default function StoreLogo({
  className,
  imageClassName,
  textClassName,
  alt,
  onDark = false,
}: StoreLogoProps) {
  const { storeName, storeLogoUrl } = usePPOB();
  // Track which URL failed so a newly uploaded logo renders without an effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (storeLogoUrl && failedUrl !== storeLogoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={storeLogoUrl}
        alt={alt ?? storeName}
        onError={() => setFailedUrl(storeLogoUrl)}
        // An uploaded logo is usually dark ink on transparency, so it disappears
        // on a dark surface. The filter is applied in CSS for the dark theme and
        // forced here when the container is always dark.
        data-on-dark={onDark ? 'true' : undefined}
        className={cn('store-logo object-contain', imageClassName, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'truncate font-semibold text-slate-900',
        onDark && 'text-white',
        textClassName,
        className,
      )}
    >
      {storeName}
    </span>
  );
}
