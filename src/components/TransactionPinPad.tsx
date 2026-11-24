'use client';

import { ArrowLeft, Delete, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingOverlay } from '@/components/ui/crystal-loader';

export const PIN_LENGTH = 6;

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

export function TransactionPinPad({
  productName,
  amount,
  digits,
  isProcessing,
  error,
  onKey,
  onBack,
  onCancel,
  onGoToSettings,
}: {
  productName: string;
  amount: number;
  digits: string;
  isProcessing: boolean;
  error: string;
  onKey: (key: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onGoToSettings: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-white animate-fadeIn"
      style={{ height: '100dvh' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-pad-title"
    >
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 id="pin-pad-title" className="text-base font-bold text-slate-900">
          Masukkan PIN transaksi
        </h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-700">
          <LockKeyhole className="h-7 w-7" />
        </span>

        <div className="text-center">
          <p className="text-sm text-slate-500">{productName}</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">
            Rp {amount.toLocaleString('id-ID')}
          </p>
        </div>

        <div className="flex gap-3" aria-label={`PIN ${digits.length} dari ${PIN_LENGTH} digit`}>
          {Array.from({ length: PIN_LENGTH }).map((_, index) => {
            const filled = index < digits.length;
            return (
              <span
                key={index}
                aria-hidden="true"
                className={`flex h-12 w-10 items-center justify-center rounded-xl border-2 text-xl font-bold transition ${
                  error
                    ? 'border-rose-400 text-rose-500'
                    : filled
                      ? 'border-sky-500 text-sky-700'
                      : 'border-slate-200 text-slate-300'
                }`}
              >
                {filled ? '•' : ''}
              </span>
            );
          })}
        </div>

        <p
          role="status"
          aria-live="polite"
          className={`min-h-5 text-center text-sm ${error ? 'text-rose-600' : 'text-slate-400'}`}
        >
          {error || (digits.length > 0 ? `${digits.length} dari ${PIN_LENGTH} digit` : '')}
        </p>

        <div className="grid w-full max-w-xs grid-cols-3 gap-2">
          {keys.map((key, index) => {
            if (!key) return <span key={`gap-${index}`} />;
            const isBack = key === 'back';
            return (
              <button
                key={key}
                type="button"
                onClick={() => (isBack ? onBack() : onKey(key))}
                disabled={isProcessing || (isBack && digits.length === 0)}
                aria-label={isBack ? 'Hapus digit' : key}
                className="flex h-16 items-center justify-center rounded-2xl text-2xl font-semibold text-slate-800 transition active:scale-95 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40"
              >
                {isBack ? <Delete className="h-6 w-6" /> : key}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onGoToSettings}
          className="text-xs font-semibold text-slate-500 underline hover:text-sky-700"
        >
          Lupa PIN? Atur di Pengaturan
        </button>
      </div>

      <div className="border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          className="w-full"
          onClick={onCancel}
          disabled={isProcessing}
        >
          Batal
        </Button>
      </div>

      {isProcessing && <LoadingOverlay message="Memproses pembayaran…" />}
    </div>
  );
}
