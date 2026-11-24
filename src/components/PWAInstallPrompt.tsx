'use client';

import React, { useState } from 'react';
import { Smartphone, Download, X } from 'lucide-react';
import type { BeforeInstallPromptEvent } from '@/types/pwa';
import { usePPOB } from '@/context/PPOBContext';

interface PWAInstallPromptProps {
  deferredPrompt: BeforeInstallPromptEvent;
  onInstall: () => void;
}

export default function PWAInstallPrompt({ deferredPrompt, onInstall }: PWAInstallPromptProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const { storeName } = usePPOB();

  if (!deferredPrompt || isDismissed) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-40 animate-slideUp">
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-700 text-white shadow-2xl flex items-start gap-3">
        <div className="install-badge w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-600 flex items-center justify-center flex-shrink-0 text-white shadow-md">
          <Smartphone className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="font-bold text-sm text-white">Pasang Aplikasi {storeName}</h4>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              PWA
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
            Install ke layar utama HP / Desktop Anda untuk transaksi lebih cepat dan akses instan tanpa kuota browsing.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onInstall}
              className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install Sekarang</span>
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="py-1.5 px-2.5 rounded-lg text-slate-400 hover:text-white text-xs font-medium hover:bg-slate-800 transition-colors"
            >
              Nanti Saja
            </button>
          </div>
        </div>

        <button
          onClick={() => setIsDismissed(true)}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
