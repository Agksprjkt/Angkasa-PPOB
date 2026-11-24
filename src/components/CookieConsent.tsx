'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';

const consentStorageKey = 'payku-cookie-consent-v1';
export const openCookiePreferencesEventName = 'payku:open-cookie-preferences';
type ConsentChoice = 'essential' | 'accepted';

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const savedChoice = window.localStorage.getItem(consentStorageKey);
        if (savedChoice !== 'essential' && savedChoice !== 'accepted') {
          setIsVisible(true);
        }
      } catch (error) {
        console.error('[COOKIE_CONSENT_READ_FAILED]', error);
        setStorageError('Pilihan persetujuan tidak dapat dibaca dari browser. Periksa pengaturan penyimpanan browser Anda.');
        setIsVisible(true);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const openPreferences = () => setIsVisible(true);
    window.addEventListener(openCookiePreferencesEventName, openPreferences);
    return () => window.removeEventListener(openCookiePreferencesEventName, openPreferences);
  }, []);

  const saveChoice = (choice: ConsentChoice) => {
    try {
      window.localStorage.setItem(consentStorageKey, choice);
      setStorageError('');
      setIsVisible(false);
    } catch (error) {
      console.error('[COOKIE_CONSENT_SAVE_FAILED]', error);
      setStorageError('Pilihan belum dapat disimpan. Izinkan penyimpanan situs di browser, lalu coba lagi.');
    }
  };

  if (!isVisible) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[90] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.45)] sm:inset-x-6 sm:bottom-[calc(7.75rem+env(safe-area-inset-bottom))] sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-blue-700">
          <Cookie className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="cookie-consent-title" className="text-sm font-bold text-slate-900">
            Cookie dan penyimpanan browser
          </h2>
          <p id="cookie-consent-description" className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
            Kami menggunakan cookie esensial untuk login, sesi, dan keamanan. Cookie ini diperlukan agar layanan berfungsi.
            Saat ini kami tidak menggunakan cookie analitik atau iklan. Preferensi persetujuan disimpan di browser Anda.
            <Link href="/legal/kebijakan-privasi" className="ml-1 font-semibold text-blue-700 underline underline-offset-2">
              Baca kebijakan privasi
            </Link>
          </p>
        </div>
      </div>
      {storageError && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {storageError}
        </p>
      )}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => saveChoice('essential')}
          className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:text-sm"
        >
          Hanya cookie esensial
        </button>
        <button
          type="button"
          onClick={() => saveChoice('accepted')}
          className="min-h-10 rounded-xl bg-blue-700 px-4 text-xs font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:text-sm"
        >
          Setuju & lanjutkan
        </button>
      </div>
    </aside>
  );
}
