'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  MessageCircle,
  Send,
  ShieldAlert,
} from 'lucide-react';
import AuthModal from '@/components/AuthModal';
import BottomNav from '@/components/BottomNav';
import DepositModal from '@/components/DepositModal';
import Header from '@/components/Header';
import SocialIcon from '@/components/ui/social-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NormalizedSocialLink } from '@/lib/social-links';
import {
  buildContactMessage,
  buildWhatsAppMessageUrl,
  maxContactMessageLength,
} from '@/lib/contact-message';

type StoreIdentity = {
  storeName: string;
  tagline: string;
  socialLinks: NormalizedSocialLink[];
};

const topics = [
  'Pertanyaan umum',
  'Status pesanan',
  'Deposit saldo',
  'Kendala pembayaran',
  'Kerja sama',
] as const;

const maxMessageLength = maxContactMessageLength;

export default function ContactPage() {
  const router = useRouter();
  const [store, setStore] = useState<StoreIdentity | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState<string>(topics[0]);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/store-settings', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as {
          storeName?: unknown;
          tagline?: unknown;
          socialLinks?: unknown;
          error?: string;
        };
        if (!response.ok || typeof body.storeName !== 'string') {
          throw new Error(body.error ?? 'Identitas toko tidak dapat dimuat.');
        }
        return {
          storeName: body.storeName,
          tagline: typeof body.tagline === 'string' ? body.tagline : '',
          socialLinks: Array.isArray(body.socialLinks)
            ? (body.socialLinks as NormalizedSocialLink[])
            : [],
        } satisfies StoreIdentity;
      })
      .then((identity) => {
        if (!controller.signal.aborted) setStore(identity);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[CONTACT_STORE_LOAD_FAILED]', error);
        setLoadError('Informasi kontak belum dapat dimuat. Silakan muat ulang halaman.');
      });
    return () => controller.abort();
  }, []);

  const whatsappLinks = useMemo(
    () => (store?.socialLinks ?? []).filter((link) => link.type === 'whatsapp'),
    [store],
  );
  const otherLinks = useMemo(
    () => (store?.socialLinks ?? []).filter((link) => link.type !== 'whatsapp'),
    [store],
  );
  const emailLink = otherLinks.find((link) => link.type === 'email') ?? null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setSentUrl(null);

    const trimmedName = name.trim();
    const trimmedMessage = message.trim();
    if (trimmedName.length < 2) {
      setFormError('Isi nama Anda minimal 2 karakter.');
      return;
    }
    if (trimmedMessage.length < 10) {
      setFormError('Tulis pesan minimal 10 karakter agar admin dapat membantu.');
      return;
    }
    if (whatsappLinks.length === 0) {
      setFormError('Nomor WhatsApp toko belum diatur. Gunakan email atau media sosial di samping.');
      return;
    }

    const body = buildContactMessage({
      storeName: store?.storeName ?? 'admin',
      name: trimmedName,
      phone: phone.trim(),
      topic,
      message: trimmedMessage,
    });

    const url = buildWhatsAppMessageUrl(whatsappLinks[0].value, body);
    if (!url) {
      setFormError('Nomor WhatsApp toko tidak valid.');
      return;
    }
    setSentUrl(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex min-h-screen flex-col bg-white pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
      <Header
        activeTab="help"
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenDeposit={() => setIsDepositOpen(true)}
        mobileBack
        backFallback="/"
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/"
          className="mb-5 hidden items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-700 md:inline-flex"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke katalog
        </Link>

        <header className="mb-6 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Kontak</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Hubungi {store?.storeName ?? 'kami'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Tulis pesan Anda, lalu kirim langsung melalui WhatsApp. Sertakan kode pesanan bila
            pertanyaan Anda menyangkut transaksi tertentu.
          </p>
          {store?.tagline ? (
            <p className="mt-1 text-xs text-slate-500">{store.tagline}</p>
          ) : null}
        </header>

        {loadError ? (
          <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loadError}
          </p>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-base font-semibold text-slate-900">Kirim pesan</h2>
            <p className="mt-1 text-xs text-slate-500">
              Pesan dibuka di WhatsApp Anda; tidak ada data yang disimpan di server ini.
            </p>

            <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">Nama</Label>
                  <Input
                    id="contact-name"
                    value={name}
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Nama Anda"
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-phone">Nomor WhatsApp (opsional)</Label>
                  <Input
                    id="contact-phone"
                    type="tel"
                    value={phone}
                    maxLength={20}
                    autoComplete="tel"
                    placeholder="081234567890"
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-topic">Topik</Label>
                <select
                  id="contact-topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                >
                  {topics.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="contact-message">Pesan</Label>
                  <span className="text-[11px] text-slate-500">
                    {message.length}/{maxMessageLength}
                  </span>
                </div>
                <textarea
                  id="contact-message"
                  rows={6}
                  maxLength={maxMessageLength}
                  value={message}
                  placeholder="Jelaskan kendala atau pertanyaan Anda. Contoh: Pesanan dengan kode INV-2026-0001 belum berubah status."
                  onChange={(event) => setMessage(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                />
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Jangan pernah mengirim kata sandi, PIN transaksi, atau kode OTP melalui kanal
                  mana pun, termasuk WhatsApp.
                </span>
              </div>

              {formError ? (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </p>
              ) : null}

              {sentUrl ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <p className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    WhatsApp dibuka di tab baru
                  </p>
                  <p className="mt-1 text-xs">
                    Tekan kirim di WhatsApp untuk mengirim pesan. Jika tab tidak terbuka,{' '}
                    <a
                      href={sentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline"
                    >
                      buka tautan ini
                    </a>
                    .
                  </p>
                </div>
              ) : null}

              <Button type="submit" className="w-full gap-2 sm:w-auto">
                <Send className="h-4 w-4" aria-hidden="true" />
                Kirim lewat WhatsApp
              </Button>
            </form>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Kanal resmi</h2>
              {whatsappLinks.length === 0 && otherLinks.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">
                  Kanal kontak belum diatur oleh pengelola toko.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {whatsappLinks.map((link, index) => (
                    <li key={`wa-${link.value}-${index}`}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
                      >
                        <SocialIcon type="whatsapp" className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-medium">{link.label}</span>
                          <span className="block truncate text-xs text-slate-500">{link.display}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                  {otherLinks.map((link, index) => (
                    <li key={`${link.type}-${link.value}-${index}`}>
                      <a
                        href={link.href}
                        target={link.type === 'email' ? undefined : '_blank'}
                        rel={link.type === 'email' ? undefined : 'noopener noreferrer'}
                        className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
                      >
                        <SocialIcon type={link.type} className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-medium">{link.label}</span>
                          <span className="block truncate text-xs text-slate-500">{link.display}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Sebelum menghubungi</h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden="true" />
                  Siapkan kode pesanan dari menu Cek Pesanan.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden="true" />
                  Sebutkan nominal dan waktu transaksi bila ada kendala pembayaran.
                </li>
                <li className="flex gap-2">
                  <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden="true" />
                  Pesan di luar jam operasional dibalas pada kesempatan berikutnya.
                </li>
              </ul>
              {emailLink ? (
                <a
                  href={emailLink.href}
                  className="mt-4 flex items-center gap-2 text-xs font-semibold text-sky-700 hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {emailLink.display}
                </a>
              ) : null}
            </section>
          </aside>
        </div>
      </main>

      <BottomNav
        activeTab="home"
        setActiveTab={() => {}}
        className="lg:hidden"
        onOpenHome={() => router.push('/')}
        onOpenPromo={() => router.push('/promo')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenDeposit={() => setIsDepositOpen(true)}
      />
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
    </div>
  );
}
