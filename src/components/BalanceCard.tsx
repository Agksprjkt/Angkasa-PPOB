'use client';

import React, { useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import {
  Wallet,
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
  const { balance, role, storeName } = usePPOB();
  const [showBalance, setShowBalance] = useState(true);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-blue-400/30 bg-gradient-to-br from-indigo-500 via-blue-500 to-sky-400 p-5 text-white shadow-lg shadow-blue-900/10 sm:p-6">
      {/* Background Decorative Accent */}
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-indigo-300/25 blur-2xl" />

      <div className="relative z-10">
        {/* Top Header of Card */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-white">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-medium text-white/75">Saldo tersedia</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-white/80" />
                <span className="text-[11px] font-medium text-white/80">{storeName} Wallet</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {role === 'agent' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white sm:text-xs">
                <TrendingUp className="w-3 h-3" />
                Member
              </span>
            ) : role === 'admin' ? (
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white sm:text-xs">
                Admin
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[10px] font-medium text-white sm:text-xs">
                Pelanggan
              </span>
            )}
          </div>
        </div>

        {/* Amount Section */}
        <div className="my-2">
          <div className="flex items-center gap-3">
            <div className="font-sans text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {showBalance ? (
                <>
                  <span className="mr-1.5 text-lg font-medium text-white/75">Rp</span>
                  {balance.toLocaleString('id-ID')}
                </>
              ) : (
                <span className="tracking-widest text-white/80">••••••••</span>
              )}
            </div>

            <button
              onClick={() => setShowBalance(!showBalance)}
              className="rounded-lg p-1.5 text-white/75 transition-colors hover:bg-white/15 hover:text-white"
              title={showBalance ? 'Sembunyikan Saldo' : 'Tampilkan Saldo'}
              aria-label={showBalance ? 'Sembunyikan saldo' : 'Tampilkan saldo'}
            >
              {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {role === 'agent' && (
            <p className="mt-1 flex items-center gap-1 text-xs text-white/80">
              <span>Harga member aktif otomatis pada setiap produk.</span>
            </p>
          )}
        </div>

        {/* Quick Action Buttons */}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/20 pt-4 sm:gap-3">
          <button
            onClick={onOpenDeposit}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/25 sm:text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Isi saldo</span>
          </button>

          <button
            onClick={onOpenMutations}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/25 sm:text-sm"
          >
            <ArrowDownUp className="h-4 w-4" />
            <span>Riwayat</span>
          </button>
        </div>
      </div>
    </div>
  );
}
