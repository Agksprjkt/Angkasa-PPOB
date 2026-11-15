'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageCircleQuestion } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import Header from '@/components/Header';

export default function HelpPage() {
  const router = useRouter();
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/store-settings', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { supportPhone?: unknown; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Identitas toko tidak dapat dimuat.');
        setSupportPhone(typeof body.supportPhone === 'string' ? body.supportPhone : '');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[HELP_SUPPORT_CONTACT_LOAD_FAILED]', error);
        setLoadError('Kontak bantuan belum dapat dimuat. Silakan coba beberapa saat lagi.');
      });
    return () => controller.abort();
  }, []);

  const supportDigits = supportPhone?.replace(/\D/g, '').replace(/^0/, '62');
  const supportUrl = supportDigits ? `https://wa.me/${supportDigits}` : null;

  return (
    <main className="min-h-screen bg-[#f7f5fb] px-4 py-8 pb-28 sm:px-6 sm:py-12">
      <Header
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenHistory={() => router.push('/?tab=history')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal')}
        mobileBack
      />
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mb-5 hidden items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-700 md:inline-flex">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke katalog
        </Link>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <MessageCircleQuestion className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Bantuan</h1>
              <p className="text-sm text-slate-500">Perlu bantuan untuk pembayaran atau pesanan?</p>
            </div>
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
            Siapkan kode pesanan sebelum menghubungi admin agar status transaksi dapat diperiksa lebih cepat.
            Kamu juga dapat membuka menu Cek Pesanan untuk melihat status terbaru.
          </div>
          {loadError ? (
            <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {loadError}
            </p>
          ) : supportUrl ? (
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <MessageCircleQuestion className="h-4 w-4" />
              Hubungi bantuan via WhatsApp
            </a>
          ) : (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Nomor WhatsApp bantuan belum diatur. Silakan cek status pesanan dari menu Cek Pesanan.
            </p>
          )}
        </section>
      </div>

      <BottomNav
        activeTab="legal"
        setActiveTab={() => {}}
        onOpenHome={() => router.push('/')}
        onOpenHistory={() => router.push('/?tab=history')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal')}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenDeposit={() => setIsDepositOpen(true)}
      />
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
    </main>
  );
}
