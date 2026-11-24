'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePPOB } from '@/context/PPOBContext';
import HistoryView, { type HistoryViewMode } from '@/components/HistoryView';
import ReceiptModal from '@/components/ReceiptModal';
import { Transaction } from '@/types/ppob';

interface CustomerHistoryPageProps {
  mode: Extract<HistoryViewMode, 'transactions' | 'wallet'>;
  initialStatus?: 'all' | 'success' | 'pending' | 'failed';
}

export default function CustomerHistoryPage({ mode, initialStatus }: CustomerHistoryPageProps) {
  const { currentUser, addToast } = usePPOB();
  const router = useRouter();
  const [activeReceipt, setActiveReceipt] = useState<Transaction | null>(null);

  const handleSelectReceipt = (transaction: Transaction) => {
    setActiveReceipt(transaction);
    void fetch(`/api/orders/${encodeURIComponent(transaction.id)}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { transaction?: Transaction; error?: string };
        if (!response.ok || !result.transaction || result.transaction.id !== transaction.id) {
          throw new Error(result.error ?? 'Detail transaksi gagal dimuat.');
        }
        setActiveReceipt((current) =>
          current?.id === transaction.id ? result.transaction ?? current : current,
        );
      })
      .catch((error: unknown) => {
        addToast(
          'Detail Belum Diperbarui',
          error instanceof Error
            ? `${error.message} Data terakhir yang tersedia tetap ditampilkan.`
            : 'Data terakhir yang tersedia tetap ditampilkan.',
          'warning',
        );
      });
  };

  return (
    <>
      <HistoryView
        key={currentUser?.id ?? 'customer'}
        mode={mode}
        initialStatus={initialStatus}
        onSelectReceipt={handleSelectReceipt}
        onRequireAuth={() => router.push('/')}
      />
      {activeReceipt && (
        <ReceiptModal transaction={activeReceipt} onClose={() => setActiveReceipt(null)} />
      )}
    </>
  );
}
