'use client';

// From Uiverse.io by Z4drus - https://uiverse.io/Z4drus/average-lizard-53
// MIT License, Copyright (c) Z4drus (Z4drus)

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const STAGE_SIZE = 200;

interface CrystalLoaderProps {
  className?: string;
  size?: number;
  label?: string;
}

export function CrystalLoader({ className, size = 100, label = 'Memuat…' }: CrystalLoaderProps) {
  return (
    <div
      className={cn('crystal-loader', className)}
      style={{ width: size, height: size }}
      role="status"
      aria-live="polite"
    >
      <div
        className="crystal-loader__stage"
        style={{ '--crystal-loader-scale': size / STAGE_SIZE } as CSSProperties}
        aria-hidden="true"
      >
        <div className="crystal-loader__crystal" />
        <div className="crystal-loader__crystal" />
        <div className="crystal-loader__crystal" />
        <div className="crystal-loader__crystal" />
        <div className="crystal-loader__crystal" />
        <div className="crystal-loader__crystal" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

// A full-screen overlay must escape any ancestor with a backdrop-filter or
// transform, otherwise `fixed` resolves against that ancestor and the overlay
// only covers the dialog/card it sits in. Portaling to <body> plus a z-index
// above every other layer keeps it truly on top.
export function LoadingState({
  message,
  size = 140,
  className,
}: {
  message?: string;
  size?: number;
  className?: string;
}) {
  // The portal target only exists in the browser. Until the first frame the
  // overlay renders in place, which keeps the server and client markup identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const overlay: ReactNode = (
    <div
      className={cn(
        'fixed inset-0 z-[120] flex flex-col items-center justify-center gap-1 bg-slate-950/40 backdrop-blur-[2px]',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <CrystalLoader size={size} label={message ?? 'Memuat…'} />
      {message && (
        <p className="max-w-[70vw] text-center text-sm font-medium text-white drop-shadow">
          {message}
        </p>
      )}
    </div>
  );

  return mounted ? createPortal(overlay, document.body) : overlay;
}

export function LoadingOverlay({
  message,
  size = 140,
}: {
  message?: string;
  size?: number;
}) {
  return <LoadingState message={message} size={size} />;
}
