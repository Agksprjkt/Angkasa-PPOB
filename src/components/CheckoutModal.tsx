'use client';

import React, { useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { Product, Transaction } from '@/types/ppob';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { LoadingOverlay } from '@/components/ui/crystal-loader';

interface CheckoutModalProps {
  product: Product | null;
  destination: string;
  customerName?: string;
  onClose: () => void;
  onOpenDeposit: () => void;
  onSuccess: (transaction: Transaction) => void;
}

export default function CheckoutModal({
  product,
  destination,
  customerName,
  onClose,
  onOpenDeposit,
  onSuccess,
}: CheckoutModalProps) {
  const { balance, role, buyProductWithBalance } = usePPOB();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!product) return null;

  const price = role === 'agent'
    ? product.sellPriceAgent ?? product.sellPriceUser
    : product.sellPriceUser;
  const isBalanceSufficient = balance >= price;
  const balanceRemaining = balance - price;

  const handleConfirmPurchase = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await buyProductWithBalance(product.id, destination, customerName);

      if (result.success && result.transaction.status === 'success') {
        onSuccess(result.transaction);
      } else {
        onClose();
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Transaksi gagal diproses',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              PAY
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">Konfirmasi Pembelian</h3>
              <p className="text-xs text-slate-500">Periksa rincian sebelum transaksi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Product Summary Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase tracking-wide">
                  {product.operator} • {product.category}
                </span>
                <h4 className="font-bold text-sm text-slate-900 mt-1">{product.name}</h4>
              </div>
              <span className="text-base font-bold text-slate-900 font-sans">
                Rp {price.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200 text-xs text-slate-600 flex justify-between">
              <span>Tujuan / No Pelanggan:</span>
              <span className="font-semibold text-slate-900">{destination}</span>
            </div>

            {customerName && (
              <div className="text-xs text-slate-600 flex justify-between">
                <span>Nama Terdaftar:</span>
                <span className="font-semibold text-slate-900">{customerName}</span>
              </div>
            )}
          </div>

          {/* Balance Breakdown & Check */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Saldo Anda Saat Ini:</span>
              <span className="font-medium text-slate-900">
                Rp {balance.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex justify-between text-xs text-slate-600">
              <span>Harga Produk:</span>
              <span className="font-medium text-rose-600">
                - Rp {price.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-900">
              <span>Sisa Saldo Setelah Transaksi:</span>
              <span className={balanceRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                Rp {balanceRemaining.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Insufficient Balance Alert */}
          {!isBalanceSufficient && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-bold">Saldo Tidak Cukup</div>
                <p className="mt-0.5 text-rose-700">
                  Saldo Anda kurang Rp {Math.abs(balanceRemaining).toLocaleString('id-ID')} untuk melanjutkan.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onOpenDeposit();
                  }}
                  className="mt-2 inline-flex items-center gap-1 font-bold text-rose-800 underline hover:text-rose-950"
                >
                  <span>Isi Saldo Sekarang</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="text-xs text-rose-600 text-center font-medium">{errorMessage}</p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs sm:text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Batal
          </button>

          <button
            onClick={handleConfirmPurchase}
            disabled={!isBalanceSufficient || isLoading}
            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-md transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span>Memproses Vendor...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Bayar Rp {price.toLocaleString('id-ID')}</span>
              </>
            )}
          </button>
        </div>
      </div>
      {isLoading && <LoadingOverlay message="Memproses pesanan…" />}
    </div>
  );
}
