'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CrystalLoader } from '@/components/ui/crystal-loader';
import type { PromotionalBanner } from '@/types/ppob';

const fallbackBanner = {
  id: 'storefront-feature',
  title: 'Top up kebutuhan digitalmu dengan mudah',
  description: 'Temukan pulsa, paket data, voucher, dan top up game favorit dalam satu tempat.',
  imageUrl: '',
  targetPath: '#product-catalog',
  buttonLabel: '',
  sortOrder: 0,
  startsAt: null,
  endsAt: null,
  enabled: true,
} satisfies PromotionalBanner;

const autoplayMs = 6000;

function isPromotionalBanner(value: unknown): value is PromotionalBanner {
  if (typeof value !== 'object' || value === null) return false;
  const banner = value as Record<string, unknown>;
  return typeof banner.id === 'string' &&
    typeof banner.title === 'string' &&
    typeof banner.description === 'string' &&
    typeof banner.imageUrl === 'string' &&
    typeof banner.targetPath === 'string' &&
    typeof banner.buttonLabel === 'string' &&
    typeof banner.sortOrder === 'number';
}

export default function PromotionSlider() {
  const router = useRouter();
  const [banners, setBanners] = useState<PromotionalBanner[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const slides = banners.length ? banners : [fallbackBanner];
  const activeSlide = slides[activeIndex] ?? slides[0];
  const hasImage = Boolean(activeSlide.imageUrl);

  useEffect(() => {
    const controller = new AbortController();
    const loadBanners = async () => {
      try {
        const response = await fetch('/api/promotions', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== 'object' ||
          result === null ||
          !('banners' in result) ||
          !Array.isArray(result.banners)
        ) {
          throw new Error('Promosi belum dapat dimuat.');
        }
        setBanners(result.banners.filter(isPromotionalBanner));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[STOREFRONT_PROMOTIONS_LOAD_FAILED]', error);
          setLoadError('Promosi belum dapat dimuat. Konten pilihan tetap tersedia.');
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadBanners();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || isPaused || reducedMotion) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, autoplayMs);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused, reducedMotion, slides.length]);

  const moveSlide = useCallback((direction: -1 | 1) => {
    setActiveIndex((index) => (index + direction + slides.length) % slides.length);
  }, [slides.length]);

  const openSlideTarget = () => {
    if (activeSlide.targetPath.startsWith('#')) {
      document.querySelector(activeSlide.targetPath)?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      return;
    }
    router.push(activeSlide.targetPath);
  };

  return (
    <>
      {isLoading ? (
        <section
          aria-label="Memuat promosi"
          aria-busy="true"
          className="relative isolate overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/55 shadow-[0_24px_70px_-35px_rgba(74,101,178,0.28)] backdrop-blur-2xl"
        >
          <div className="relative aspect-[16/10] w-full sm:aspect-[16/7] lg:min-h-[21rem]">
            <div className="absolute inset-0 flex items-center justify-center">
              <CrystalLoader size={72} label="Memuat promosi" />
            </div>
            <div className="absolute inset-0 flex flex-col justify-end gap-3 p-5 sm:p-8 lg:justify-center lg:px-12">
              <Skeleton className="h-8 w-3/4 max-w-md bg-white/70" />
              <Skeleton className="h-8 w-1/2 max-w-sm bg-white/70" />
              <Skeleton className="h-4 w-2/3 max-w-sm bg-white/60" />
            </div>
            <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 sm:bottom-4">
              <Skeleton className="h-1.5 w-6 rounded-full bg-white/70" />
              <Skeleton className="h-1.5 w-1.5 rounded-full bg-white/60" />
              <Skeleton className="h-1.5 w-1.5 rounded-full bg-white/60" />
            </div>
          </div>
        </section>
      ) : (
      <section
        aria-label="Promosi"
        aria-roledescription="carousel"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            moveSlide(-1);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            moveSlide(1);
          }
        }}
        className="promo-hero relative isolate overflow-hidden rounded-[1.75rem] border border-white/80 bg-gradient-to-br from-white/85 via-white/65 to-sky-50/75 text-slate-900 shadow-[0_24px_70px_-35px_rgba(74,101,178,0.28)] backdrop-blur-2xl"
      >
        <div className="relative aspect-[16/10] w-full sm:aspect-[16/7] lg:min-h-[21rem]">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeSlide.imageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              <div className="promo-blob pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-cyan-300/30 blur-[100px]" />
              <div className="promo-blob pointer-events-none absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-sky-300/30 blur-[100px]" />
              <div className="promo-orb pointer-events-none absolute right-[18%] top-8 h-40 w-40 rounded-full border border-white/70 bg-white/30 backdrop-blur-2xl" />
            </>
          )}
          <div
            aria-hidden="true"
            className={`absolute inset-0 ${
              hasImage
                ? 'bg-gradient-to-r from-slate-950/85 via-slate-950/55 to-slate-950/15'
                : 'bg-gradient-to-br from-white/20 via-transparent to-cyan-100/20'
            }`}
          />

          <button
            type="button"
            onClick={openSlideTarget}
            aria-label={`${activeSlide.title} — buka`}
            className="group absolute inset-0 z-10 flex flex-col justify-end p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white sm:p-8 lg:justify-center lg:px-12"
          >
            <div className="max-w-2xl" aria-live="polite">
              <h2 className={`line-clamp-2 max-w-xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl ${
                hasImage ? 'text-white' : 'text-slate-900'
              }`}>
                {activeSlide.title}
              </h2>
              {activeSlide.description && (
                <p className={`mt-2 line-clamp-2 max-w-lg text-sm leading-relaxed ${
                  hasImage ? 'text-slate-200' : 'text-slate-600'
                }`}>
                  {activeSlide.description}
                </p>
              )}
              <span className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold transition group-hover:gap-2 ${
                hasImage ? 'text-white' : 'text-blue-700'
              }`}>
                Lihat promo
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
          </button>

          {slides.length > 1 && (
            <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1.5 sm:bottom-4">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Tampilkan promosi ${index + 1}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    index === activeIndex
                      ? `w-6 ${hasImage ? 'bg-white' : 'bg-blue-700'}`
                      : `w-1.5 ${hasImage ? 'bg-white/55 hover:bg-white/80' : 'bg-slate-400/60 hover:bg-slate-500/80'}`
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </section>
      )}
      {loadError && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          {loadError}
        </p>
      )}
    </>
  );
}
