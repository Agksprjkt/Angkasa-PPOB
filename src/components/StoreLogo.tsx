'use client';

import { useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { cn } from '@/lib/utils';

type StoreLogoProps = {
  className?: string;
  imageClassName?: string;
  textClassName?: string;
  alt?: string;
};

// Shows the uploaded store logo; falls back to the store name text when no logo
// exists (no initials badge, no icon box).
export default function StoreLogo({
  className,
  imageClassName,
  textClassName,
  alt,
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
        className={cn('object-contain', imageClassName, className)}
      />
    );
  }

  return (
    <span className={cn('truncate font-semibold text-slate-900', textClassName, className)}>
      {storeName}
    </span>
  );
}
