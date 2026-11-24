'use client';

import React from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = usePPOB();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-0 top-0 z-[130] flex w-full max-w-sm flex-col gap-3 px-4 pt-4 sm:right-4 sm:px-0"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => {
        let tone = 'border-slate-200 bg-white text-slate-900';
        let IconComponent = Info;
        let iconStyle = 'bg-blue-50 text-blue-600';

        if (toast.type === 'success') {
          tone = 'border-emerald-200 bg-white text-slate-900';
          IconComponent = CheckCircle2;
          iconStyle = 'bg-emerald-50 text-emerald-600';
        } else if (toast.type === 'error') {
          tone = 'border-rose-200 bg-white text-slate-900';
          IconComponent = AlertCircle;
          iconStyle = 'bg-rose-50 text-rose-600';
        } else if (toast.type === 'warning') {
          tone = 'border-amber-200 bg-white text-slate-900';
          IconComponent = AlertTriangle;
          iconStyle = 'bg-amber-50 text-amber-700';
        }

        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.35)] ring-1 ring-black/[0.03] transition-all duration-200 ${tone}`}
          >
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconStyle}`}>
              <IconComponent className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold tracking-tight">{toast.title}</h4>
              <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-600">
                {toast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
