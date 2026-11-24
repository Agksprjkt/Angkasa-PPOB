'use client';

import React, { useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import StoreLogo from '@/components/StoreLogo';
import {
  Eye,
  EyeOff,
  PlusCircle,
  ArrowDownUp,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

interface BalanceCardProps {
  onOpenDeposit: () => void;
  onOpenMutations: () => void;
}

export default function BalanceCard({ onOpenDeposit, onOpenMutations }: BalanceCardProps) {
  const { balance, role } = usePPOB();
  const [showBalance, setShowBalance] = useState(true);

  return (
    <div className="liquid-surface relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-5 text-slate-900 shadow-[0_16px_44px_-24px_rgba(15,23,42,0.24)] backdrop-blur-2xl sm:p-6">
      {/* Background Decorative Accent */}
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-blue-300/25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-sky-300/20 blur-2xl" />

      <div className="relative z-10">
        {/* Top Header of Card */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <span className="text-xs font-medium text-slate-500">Saldo tersedia</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-blue-600" />
                <StoreLogo
                  imageClassName="max-h-4 max-w-28"
                  textClassName="text-[11px] font-medium text-slate-500"
                />
                <span className="text-[11px] font-medium text-slate-500">Wallet</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {role === 'agent' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:text-xs">
                <TrendingUp className="w-3 h-3" />
                Member
              </span>
            ) : role === 'admin' ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-700 sm:text-xs">
                Admin
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-blue-700 sm:text-xs">
                Pelanggan
              </span>
            )}
          </div>
        </div>

        {/* Amount Section */}
        <div className="my-2">
          <div className="flex items-center gap-3">
            <div className="font-sans text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              {showBalance ? (
                <>
                  <span className="mr-1.5 text-lg font-medium text-slate-500">Rp</span>
                  {balance.toLocaleString('id-ID')}
                </>
              ) : (
                <span className="tracking-widest text-slate-400">••••••••</span>
              )}
            </div>

            <button
              onClick={() => setShowBalance(!showBalance)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
              title={showBalance ? 'Sembunyikan Saldo' : 'Tampilkan Saldo'}
              aria-label={showBalance ? 'Sembunyikan saldo' : 'Tampilkan saldo'}
            >
              {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {role === 'agent' && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
              <span>Harga member aktif otomatis pada setiap produk.</span>
            </p>
          )}
        </div>

        {/* Quick Action Buttons */}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4 sm:gap-3">
          <button
            onClick={onOpenDeposit}
            className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white/70 px-3 py-2.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 sm:text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Isi saldo</span>
          </button>

          <button
            onClick={onOpenMutations}
            className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white/70 px-3 py-2.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 sm:text-sm"
          >
            <ArrowDownUp className="h-4 w-4" />
            <span>Mutasi saldo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
