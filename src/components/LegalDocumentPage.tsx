'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MessageCircleQuestion } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import { openCookiePreferencesEventName } from '@/components/CookieConsent';
import {
  defaultLegalContent,
  isLegalDocumentId,
  legalDocumentIds,
  legalDocumentLabels,
  parseLegalContent,
  type LegalDocumentId,
} from '@/lib/legal-content';

interface StoreInfo {
  storeName: string;
  tagline: string;
  description: string;
  supportPhone: string;
}

type LegalDocumentPayload = {
  id: LegalDocumentId;
  title: string;
  content: string;
};

export default function LegalDocumentPage({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [documents, setDocuments] = useState<LegalDocumentPayload[]>([]);
  const [loadError, setLoadError] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const selectedId = isLegalDocumentId(documentId) ? documentId : null;
  const brandName = store?.storeName ?? 'Toko ini';

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch('/api/store-settings', { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const body = await response.json() as Partial<StoreInfo> & { error?: string };
          if (!response.ok || typeof body.storeName !== 'string') {
            throw new Error(body.error ?? 'Informasi toko tidak dapat dimuat.');
          }
          return {
            storeName: body.storeName,
            tagline: typeof body.tagline === 'string' ? body.tagline : '',
            description: typeof body.description === 'string' ? body.description : '',
            supportPhone: typeof body.supportPhone === 'string' ? body.supportPhone : '',
          } satisfies StoreInfo;
        }),
      fetch('/api/legal-documents', { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const body = await response.json() as { documents?: unknown; error?: string };
          if (!response.ok || !Array.isArray(body.documents)) {
            throw new Error(body.error ?? 'Dokumen legal tidak dapat dimuat.');
          }
          return body.documents
            .filter((document): document is LegalDocumentPayload =>
              typeof document === 'object' &&
              document !== null &&
              isLegalDocumentId(String((document as { id?: unknown }).id)) &&
              typeof (document as { title?: unknown }).title === 'string' &&
              typeof (document as { content?: unknown }).content === 'string',
            )
            .map((document) => ({
              id: document.id,
              title: document.title,
              content: document.content,
            }));
        }),
    ])
      .then(([storeInfo, legalDocuments]) => {
        if (controller.signal.aborted) return;
        setStore(storeInfo);
        setDocuments(legalDocuments);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[LEGAL_CONTENT_LOAD_FAILED]', error);
        setLoadError('Dokumen belum dapat dimuat penuh. Silakan coba muat ulang halaman.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSidebarOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  const selectedDocument = useMemo(() => {
    if (!selectedId) return null;
    const saved = documents.find((document) => document.id === selectedId);
    return {
      id: selectedId,
      title: saved?.title || legalDocumentLabels[selectedId],
      content: saved?.content || defaultLegalContent(selectedId, brandName),
    };
  }, [brandName, documents, selectedId]);

  const blocks = useMemo(
    () => (selectedDocument ? parseLegalContent(selectedDocument.content) : []),
    [selectedDocument],
  );

  const sectionNav = (
    <nav aria-label="Dokumen legal" className="space-y-1">
      {legalDocumentIds.map((id) => (
        <Link
          key={id}
          href={`/legal/${id}`}
          aria-current={selectedId === id ? 'page' : undefined}
          onClick={() => setIsSidebarOpen(false)}
          className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            selectedId === id
              ? 'bg-sky-100 text-sky-800'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {documents.find((document) => document.id === id)?.title || legalDocumentLabels[id]}
        </Link>
      ))}
    </nav>
  );

  if (!selectedDocument) {
    return (
      <div className="flex min-h-screen flex-col bg-white pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
        <Header
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenOrders={() => router.push('/cek-pesanan')}
          onOpenDeposit={() => setIsDepositOpen(true)}
          mobileBack
        />
        <main className="mx-auto flex w-full max-w-7xl flex-1 items-start px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Dokumen tidak ditemukan</h1>
            <Link href="/legal/tentang" className="mt-4 inline-flex text-sm font-semibold text-sky-700">
              Buka dokumen legal
            </Link>
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

  return (
    <div className="flex min-h-screen flex-col bg-white pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
      <Header
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenDeposit={() => setIsDepositOpen(true)}
        mobileBack
        mobileMenuMode
        mobileMenuOpen={isSidebarOpen}
        onMobileMenuToggle={() => setIsSidebarOpen((open) => !open)}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="sticky top-20 hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:block">
            <h2 className="px-3 py-2 text-sm font-bold text-slate-900">Dokumen Legal</h2>
            <Link
              href="/"
              className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Kembali ke katalog
            </Link>
            {sectionNav}
          </aside>

          <article className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <header className="border-b border-slate-100 pb-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Informasi & kebijakan</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{selectedDocument.title}</h1>
              {selectedDocument.id === 'tentang' && (
                <p className="mt-2 text-sm text-slate-500">
                  Informasi mengenai {store?.storeName ?? 'toko'} dan layanan yang tersedia.
                </p>
              )}
            </header>

            {loadError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {loadError}
              </p>
            )}

            <div className="space-y-5">
              {blocks.map((block, index) => (
                <section key={`${block.heading ?? 'block'}-${index}`} className="space-y-2">
                  {block.heading && (
                    <h3 className="text-sm font-semibold text-slate-900">{block.heading}</h3>
                  )}
                  {block.paragraphs.length > 0 && (
                    <div className="space-y-3 text-sm leading-7 text-slate-600">
                      {block.paragraphs.map((paragraph, paragraphIndex) => (
                        <p key={paragraphIndex}>{paragraph}</p>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>

            {selectedDocument.id === 'kebijakan-privasi' && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(openCookiePreferencesEventName))}
                className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Ubah pilihan cookie
              </button>
            )}

            <Link
              href="/kontak"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
            >
              <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
              Hubungi kami
            </Link>
          </article>
        </div>
      </main>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Tutup navigasi dokumen legal"
            onClick={() => setIsSidebarOpen(false)}
            className="absolute inset-0 bg-slate-950/40"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigasi dokumen legal"
            className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] overflow-y-auto border-r border-slate-200 bg-white px-4 pb-8 pt-24 shadow-2xl"
          >
            <h2 className="mb-3 px-3 text-sm font-bold text-slate-900">Dokumen Legal</h2>
            {sectionNav}
          </aside>
        </div>
      )}

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
