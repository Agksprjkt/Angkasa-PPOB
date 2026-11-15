'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import AuthModal from '@/components/AuthModal';
import DepositModal from '@/components/DepositModal';
import { openCookiePreferencesEventName } from '@/components/CookieConsent';

const legalDocuments = [
  { id: 'tentang', label: 'Tentang Kami' },
  { id: 'syarat-ketentuan', label: 'Syarat & Ketentuan' },
  { id: 'kebijakan-privasi', label: 'Kebijakan Privasi' },
  { id: 'disclaimer', label: 'Disclaimer' },
  { id: 'kontak', label: 'Kontak' },
] as const;

type LegalDocumentId = (typeof legalDocuments)[number]['id'];

interface StoreInfo {
  storeName: string;
  tagline: string;
  description: string;
  supportPhone: string;
}

function getSupportContact(store: StoreInfo | null) {
  const digits = store?.supportPhone.replace(/\D/g, '') ?? '';
  if (digits.length < 8) return null;
  const internationalNumber = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits;
  return {
    display: store?.supportPhone.trim() ?? '',
    url: `https://wa.me/${internationalNumber}`,
  };
}

function isLegalDocumentId(value: string): value is LegalDocumentId {
  return legalDocuments.some((document) => document.id === value);
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="space-y-3 text-sm leading-7 text-slate-600">{children}</div>
    </section>
  );
}

function LegalContent({ document, store }: { document: LegalDocumentId; store: StoreInfo | null }) {
  const brandName = store?.storeName || 'Toko ini';
  const supportContact = getSupportContact(store);

  switch (document) {
    case 'tentang':
      return (
        <div className="space-y-5">
          <LegalSection title={`Mengenal ${brandName}`}>
            <p>
              {store?.description ||
                `${brandName} adalah layanan untuk membantu pelanggan menemukan dan memesan produk digital serta layanan pembayaran yang tersedia di katalog.`}
            </p>
            {store?.tagline && <p className="font-medium text-slate-700">{store.tagline}</p>}
            <p>
              Kami berupaya menyajikan informasi produk, harga, biaya, dan status pesanan dengan jelas sebelum pelanggan menyelesaikan transaksi.
              Ketersediaan produk bergantung pada katalog dan sistem penyedia yang terhubung.
            </p>
          </LegalSection>
          <LegalSection title="Cara menggunakan layanan">
            <p>
              Pilih kategori dan produk, masukkan nomor tujuan atau data pelanggan dengan benar, lalu tinjau total pembayaran sebelum mengonfirmasi pesanan.
              Status pesanan dapat diperiksa melalui menu Cek Pesanan atau riwayat akun jika tersedia.
            </p>
            <p>
              Jika membutuhkan bantuan, siapkan kode pesanan dan hubungi kanal dukungan yang dicantumkan pada halaman Kontak.
            </p>
          </LegalSection>
        </div>
      );
    case 'syarat-ketentuan':
      return (
        <div className="space-y-5">
          <LegalSection title="1. Ruang lingkup dan persetujuan">
            <p>
              Ketentuan ini mengatur akses dan penggunaan layanan {brandName}, termasuk katalog, pemesanan produk digital,
              pembayaran, akun, saldo, dan dukungan pelanggan. Dengan mengakses atau menggunakan layanan, Anda menyatakan
              telah membaca dan menyetujui ketentuan ini serta Kebijakan Privasi.
            </p>
          </LegalSection>
          <LegalSection title="2. Informasi akun dan pemesanan">
            <p>
              Berikan informasi yang benar dan terkini. Anda bertanggung jawab memastikan kategori, produk, nominal,
              nomor tujuan, ID pelanggan, zona permainan, serta rincian pesanan lainnya sudah benar sebelum membayar.
              Kesalahan data tujuan dapat menyebabkan produk terkirim ke tujuan yang tidak dapat diubah.
            </p>
            <p>
              Jaga kerahasiaan kata sandi, kode verifikasi, kode pembayaran, dan tautan atau token akses pesanan.
              Aktivitas yang dilakukan melalui akun atau akses pesanan Anda menjadi tanggung jawab Anda, kecuali diwajibkan lain oleh hukum.
            </p>
          </LegalSection>
          <LegalSection title="3. Harga dan pembayaran">
            <p>
              Harga dan biaya yang ditampilkan pada halaman konfirmasi adalah acuan pesanan sebelum pembayaran.
              Harga maupun ketersediaan dapat berubah sebelum pesanan dibuat. Periksa kembali total tagihan dan penerima
              pembayaran sebelum melanjutkan.
            </p>
            <p>
              Pesanan berbayar diproses setelah pembayaran terkonfirmasi oleh sistem pembayaran atau setelah pembayaran
              manual diverifikasi jika metode tersebut tersedia. Jangan mengirim pembayaran di luar instruksi yang tampil
              pada halaman pesanan.
            </p>
          </LegalSection>
          <LegalSection title="4. Pemrosesan, pembatalan, dan pengembalian dana">
            <p>
              Pemrosesan dapat tertunda karena gangguan jaringan, pemeriksaan pembayaran, pemeliharaan, atau kendala pada
              penyedia produk. Status menunggu atau diproses bukan bukti bahwa transaksi telah berhasil; periksa status
              terbaru sebelum mengirim pembayaran atau membuat pesanan ulang.
            </p>
            <p>
              Jika pembayaran berhasil tetapi produk belum diterima, hubungi dukungan dengan kode pesanan dan bukti
              pembayaran. Pengembalian dana atau koreksi saldo dilakukan setelah status pembayaran dan transaksi
              diverifikasi, sesuai metode pembayaran, kebijakan penyedia, dan ketentuan hukum yang berlaku. Pesanan yang
              telah diteruskan ke penyedia mungkin tidak dapat dibatalkan.
            </p>
          </LegalSection>
          <LegalSection title="5. Saldo akun">
            <p>
              Jika fitur saldo tersedia, saldo hanya dapat digunakan sesuai fungsi yang ditampilkan di aplikasi.
              Pengisian saldo melalui transfer atau QR akan berstatus menunggu hingga terkonfirmasi atau diverifikasi.
              Jangan menganggap bukti transfer saja sebagai tanda saldo telah masuk.
            </p>
            <p>
              Laporkan segera aktivitas atau perubahan saldo yang tidak Anda kenali. Penyesuaian saldo dilakukan setelah
              pemeriksaan catatan transaksi dan bukti terkait.
            </p>
          </LegalSection>
          <LegalSection title="6. Penggunaan yang dilarang">
            <p>
              Anda tidak boleh menggunakan layanan untuk aktivitas melanggar hukum, penipuan, penyalahgunaan promosi,
              mengganggu sistem, mengakses akun atau data pihak lain tanpa izin, maupun mengirimkan data yang tidak
              berhak Anda gunakan.
            </p>
          </LegalSection>
          <LegalSection title="7. Ketersediaan layanan dan perubahan ketentuan">
            <p>
              Layanan dan fitur dapat berubah, dihentikan sementara, atau tidak tersedia karena pemeliharaan maupun
              ketergantungan pada penyedia pihak ketiga. Ketentuan dapat diperbarui dari waktu ke waktu; versi yang
              berlaku adalah versi yang ditampilkan pada halaman ini saat Anda menggunakan layanan.
            </p>
          </LegalSection>
          <LegalSection title="8. Hukum dan kontak">
            <p>
              Ketentuan ini ditafsirkan berdasarkan hukum yang berlaku di Republik Indonesia. Jika ada pertanyaan atau
              keluhan, hubungi {brandName} melalui informasi pada halaman Kontak dengan menyertakan kode pesanan bila relevan.
            </p>
          </LegalSection>
        </div>
      );
    case 'kebijakan-privasi':
      return (
        <div className="space-y-5">
          <p className="text-sm leading-7 text-slate-600">
            Kebijakan ini menjelaskan bagaimana {brandName} memproses informasi saat Anda mengakses atau menggunakan layanan.
          </p>
          <LegalSection title="Informasi yang kami proses">
            <p>
              Bergantung pada cara Anda menggunakan layanan, informasi dapat mencakup nama, alamat email, nomor
              telepon atau WhatsApp, data tujuan produk yang Anda masukkan, rincian produk dan pembayaran, status
              pesanan, komunikasi dukungan, serta informasi teknis dasar yang diperlukan agar aplikasi dan sesi akun bekerja.
            </p>
            <p>
              Jangan memasukkan kata sandi akun lain, PIN, kode OTP, atau informasi keuangan rahasia ke kolom tujuan
              transaksi maupun pesan dukungan.
            </p>
          </LegalSection>
          <LegalSection title="Tujuan penggunaan">
            <p>
              Informasi digunakan untuk membuat dan memproses pesanan, mencocokkan pembayaran, mengelola akun dan saldo
              jika tersedia, menyampaikan status, mencegah penyalahgunaan, memenuhi kewajiban pencatatan, serta
              menanggapi pertanyaan dan keluhan.
            </p>
          </LegalSection>
          <LegalSection title="Cookie dan penyimpanan di browser">
            <p>
              Kami menggunakan cookie esensial yang dikelola oleh sistem autentikasi untuk mempertahankan sesi login
              dan membantu melindungi akun. Cookie ini diperlukan untuk menyediakan fitur akun dan tidak digunakan
              untuk iklan atau pelacakan lintas situs. Saat ini kami tidak menggunakan cookie analitik atau iklan.
            </p>
            <p>
              Pilihan Anda pada pemberitahuan cookie disimpan di penyimpanan lokal browser agar pemberitahuan tidak
              muncul setiap kali halaman dibuka. Preferensi tema dashboard juga disimpan secara lokal. Informasi akses
              sementara untuk membuka invoice QRIS disimpan di penyimpanan sesi browser dan digunakan untuk meminta
              status invoice terkait. Penyimpanan lokal dan sesi ini bukan cookie; Anda dapat menghapusnya melalui
              pengaturan browser, tetapi beberapa fitur mungkin perlu digunakan atau disiapkan kembali.
            </p>
            <p>
              Anda dapat menghapus data situs melalui pengaturan browser. Cookie esensial tetap diperlukan saat Anda
              menggunakan fitur akun; jika cookie tersebut diblokir, login atau fungsi terkait mungkin tidak tersedia.
              Jika kami menambahkan cookie non-esensial di kemudian hari, kami akan meminta pilihan Anda sebelum
              mengaktifkannya.
            </p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(openCookiePreferencesEventName))}
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Ubah pilihan cookie
            </button>
          </LegalSection>
          <LegalSection title="Penyedia layanan dan pembagian informasi">
            <p>
              Data yang diperlukan dapat diteruskan kepada penyedia produk digital, penyedia pembayaran, infrastruktur
              teknologi, atau layanan komunikasi agar pesanan, pembayaran, keamanan, dan dukungan dapat dijalankan.
              Pihak tersebut menerima informasi sebatas yang diperlukan untuk fungsi terkait dan dapat memprosesnya
              berdasarkan kebijakan masing-masing.
            </p>
            <p>
              Informasi juga dapat digunakan atau diungkapkan jika diwajibkan oleh hukum, diperlukan untuk menangani
              sengketa, atau untuk melindungi keamanan layanan dan pengguna.
            </p>
          </LegalSection>
          <LegalSection title="Penyimpanan dan keamanan">
            <p>
              Informasi disimpan selama diperlukan untuk menyediakan layanan, menyelesaikan pesanan atau sengketa,
              menjaga catatan transaksi, dan memenuhi kewajiban hukum. Kami menerapkan pembatasan akses dan langkah
              perlindungan yang wajar, tetapi tidak ada transmisi atau penyimpanan elektronik yang dapat dijamin
              sepenuhnya bebas risiko.
            </p>
          </LegalSection>
          <LegalSection title="Pilihan dan permintaan Anda">
            <p>
              Anda dapat meminta akses atau koreksi informasi akun, atau mengajukan pertanyaan mengenai penghapusan
              informasi melalui kanal dukungan. Permintaan dapat memerlukan verifikasi identitas dan dapat dibatasi jika
              informasi masih diperlukan untuk transaksi, keamanan, sengketa, atau kewajiban hukum.
            </p>
          </LegalSection>
          <LegalSection title="Perubahan kebijakan">
            <p>
              Kebijakan ini dapat diperbarui untuk mencerminkan perubahan layanan atau ketentuan yang berlaku.
              Perubahan akan dipublikasikan pada halaman ini.
            </p>
          </LegalSection>
        </div>
      );
    case 'disclaimer':
      return (
        <div className="space-y-5">
          <LegalSection title="Ketersediaan dan informasi produk">
            <p>
              Informasi produk, harga, stok, promosi, cakupan, biaya, dan estimasi waktu pemrosesan dapat berubah
              mengikuti pembaruan dari penyedia. Informasi ditampilkan untuk membantu Anda mengambil keputusan, tetapi
              dapat mengalami keterlambatan atau ketidakakuratan sementara. Pastikan rincian akhir pada halaman
              konfirmasi sebelum membuat pesanan.
            </p>
          </LegalSection>
          <LegalSection title="Penyedia pihak ketiga">
            <p>
              Pemenuhan sebagian produk dan pemrosesan pembayaran bergantung pada pihak ketiga. {brandName} tidak
              mengendalikan seluruh sistem, jaringan, kebijakan, atau gangguan pada pihak tersebut. Nama produk, merek,
              dan logo pihak ketiga adalah milik pemegang hak masing-masing dan tidak dengan sendirinya menunjukkan
              afiliasi atau dukungan resmi.
            </p>
          </LegalSection>
          <LegalSection title="Pemeriksaan data dan status transaksi">
            <p>
              Anda bertanggung jawab memeriksa nomor tujuan, ID pelanggan, dan rincian pesanan sebelum membayar.
              Tampilan status dapat memerlukan waktu untuk diperbarui. Gunakan kode pesanan untuk memeriksa status
              terbaru dan jangan membuat pesanan ulang sebelum memastikan pesanan sebelumnya gagal atau kedaluwarsa.
            </p>
          </LegalSection>
          <LegalSection title="Batasan informasi">
            <p>
              Materi pada halaman ini bersifat informasi umum dan bukan nasihat hukum, pajak, atau keuangan. Tidak ada
              bagian disclaimer ini yang menghapus hak konsumen atau tanggung jawab yang tidak dapat dikecualikan
              berdasarkan hukum yang berlaku.
            </p>
          </LegalSection>
        </div>
      );
    case 'kontak':
      return (
        <div className="space-y-5">
          <LegalSection title={`Hubungi ${brandName}`}>
            <p>
              Untuk pertanyaan pembayaran, status pesanan, atau akun, siapkan kode pesanan dan jelaskan kendala yang
              dialami. Jangan mengirimkan kata sandi, PIN, atau kode OTP.
            </p>
          </LegalSection>
          {supportContact ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                WhatsApp dukungan: <span className="font-semibold">{supportContact.display}</span>
              </p>
              <a
                href={supportContact.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Hubungi via WhatsApp
              </a>
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Nomor WhatsApp dukungan belum tersedia. Periksa menu Cek Pesanan untuk melihat status pesanan.
            </p>
          )}
        </div>
      );
  }
}

export default function LegalDocumentPage({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const selectedDocument = isLegalDocumentId(documentId)
    ? legalDocuments.find((document) => document.id === documentId)
    : undefined;

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/store-settings', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as {
          storeName?: unknown;
          tagline?: unknown;
          description?: unknown;
          supportPhone?: unknown;
          error?: string;
        };
        if (!response.ok || typeof body.storeName !== 'string') {
          throw new Error(body.error ?? 'Informasi toko tidak dapat dimuat.');
        }
        setStore({
          storeName: body.storeName,
          tagline: typeof body.tagline === 'string' ? body.tagline : '',
          description: typeof body.description === 'string' ? body.description : '',
          supportPhone: typeof body.supportPhone === 'string' ? body.supportPhone : '',
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[LEGAL_STORE_SETTINGS_LOAD_FAILED]', error);
        setLoadError('Informasi toko belum dapat dimuat. Silakan coba muat ulang halaman.');
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

  if (!selectedDocument) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f7f5fb] pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Header
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenHistory={() => router.push('/?tab=history')}
          onOpenOrders={() => router.push('/cek-pesanan')}
          onOpenLegal={() => router.push('/legal/tentang')}
          mobileBack
          mobileMenuMode
          mobileMenuOpen={isSidebarOpen}
          onMobileMenuToggle={() => setIsSidebarOpen((open) => !open)}
        />
        <main className="mx-auto flex w-full max-w-7xl flex-1 items-start px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Dokumen tidak ditemukan</h1>
            <Link href="/legal/tentang" className="mt-4 inline-flex text-sm font-semibold text-violet-700">
              Buka dokumen legal
            </Link>
          </div>
        </main>
        <BottomNav
          activeTab="legal"
          setActiveTab={() => {}}
          onOpenHome={() => router.push('/')}
          onOpenHistory={() => router.push('/?tab=history')}
          onOpenOrders={() => router.push('/cek-pesanan')}
          onOpenLegal={() => router.push('/legal/tentang')}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenDeposit={() => setIsDepositOpen(true)}
        />
        <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
        <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
      </div>
    );
  }

  const sectionNav = (
    <nav aria-label="Dokumen legal" className="space-y-1">
      {legalDocuments.map((document) => (
        <Link
          key={document.id}
          href={`/legal/${document.id}`}
          aria-current={selectedDocument.id === document.id ? 'page' : undefined}
          onClick={() => setIsSidebarOpen(false)}
          className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            selectedDocument.id === document.id
              ? 'bg-violet-100 text-violet-800'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {document.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f5fb] pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <Header
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenHistory={() => router.push('/?tab=history')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal/tentang')}
        mobileBack
        mobileMenuMode
        mobileMenuOpen={isSidebarOpen}
        onMobileMenuToggle={() => setIsSidebarOpen((open) => !open)}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="sticky top-5 hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:block">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Informasi & kebijakan</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{selectedDocument.label}</h1>
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

            <LegalContent document={selectedDocument.id} store={store} />
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
        activeTab="legal"
        setActiveTab={() => {}}
        onOpenHome={() => router.push('/')}
        onOpenHistory={() => router.push('/?tab=history')}
        onOpenOrders={() => router.push('/cek-pesanan')}
        onOpenLegal={() => router.push('/legal/tentang')}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenDeposit={() => setIsDepositOpen(true)}
      />
      <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
      <DepositModal open={isDepositOpen} onOpenChange={setIsDepositOpen} />
    </div>
  );
}
