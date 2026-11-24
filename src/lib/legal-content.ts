export const legalDocumentIds = [
  'tentang',
  'syarat-ketentuan',
  'kebijakan-privasi',
  'disclaimer',
] as const;

export type LegalDocumentId = (typeof legalDocumentIds)[number];

export const legalDocumentLabels: Record<LegalDocumentId, string> = {
  tentang: 'Tentang Kami',
  'syarat-ketentuan': 'Syarat & Ketentuan',
  'kebijakan-privasi': 'Kebijakan Privasi',
  disclaimer: 'Disclaimer',
};

export function isLegalDocumentId(value: string): value is LegalDocumentId {
  return (legalDocumentIds as readonly string[]).includes(value);
}

export type LegalBlock = {
  heading: string | null;
  paragraphs: string[];
};

// Ponytail: minimal markup — a line starting with "##" is a heading; other non-blank
// lines become paragraphs of the current section. Upgrade to a Markdown renderer
// if inline formatting is ever needed.
export function parseLegalContent(content: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let current: LegalBlock | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('##')) {
      const heading = line.replace(/^#+/, '').trim();
      current = { heading: heading || null, paragraphs: [] };
      blocks.push(current);
      continue;
    }
    if (!current) {
      current = { heading: null, paragraphs: [] };
      blocks.push(current);
    }
    current.paragraphs.push(line);
  }

  return blocks.filter((block) => block.heading !== null || block.paragraphs.length > 0);
}

function brand(brandName: string) {
  return brandName.trim() || 'Toko ini';
}

export function defaultLegalContent(id: LegalDocumentId, brandName: string): string {
  const name = brand(brandName);
  switch (id) {
    case 'tentang':
      return `## Mengenal ${name}

${name} adalah layanan yang membantu pelanggan menemukan dan memesan produk digital serta layanan pembayaran yang tersedia di katalog.

Kami berupaya menyajikan informasi produk, harga, biaya, dan status pesanan dengan jelas sebelum pelanggan menyelesaikan transaksi.

## Cara menggunakan layanan

Pilih kategori dan produk, masukkan nomor tujuan atau data pelanggan dengan benar, lalu tinjau total pembayaran sebelum mengonfirmasi pesanan.

Status pesanan dapat diperiksa melalui menu Cek Pesanan menggunakan kode pesanan.

## Komitmen layanan

Kami menjaga data pelanggan, menampilkan status transaksi secara transparan, dan menyediakan kanal bantuan bagi pelanggan yang mengalami kendala.

Jika membutuhkan bantuan, siapkan kode pesanan dan hubungi kanal dukungan pada halaman Kontak.`;

    case 'syarat-ketentuan':
      return `## 1. Ruang lingkup dan persetujuan

Ketentuan ini mengatur akses dan penggunaan layanan ${name}, termasuk katalog, pemesanan produk digital, pembayaran, akun, saldo, dan dukungan pelanggan. Dengan mengakses atau menggunakan layanan, Anda menyatakan telah membaca dan menyetujui ketentuan ini serta Kebijakan Privasi.

## 2. Informasi akun dan pemesanan

Berikan informasi yang benar dan terkini. Anda bertanggung jawab memastikan kategori, produk, nominal, nomor tujuan, ID pelanggan, zona permainan, serta rincian pesanan lainnya sudah benar sebelum membayar. Kesalahan data tujuan dapat menyebabkan produk terkirim ke tujuan yang tidak dapat diubah.

Jaga kerahasiaan kata sandi, PIN transaksi, kode verifikasi, kode pembayaran, dan tautan atau token akses pesanan.

## 3. Harga dan pembayaran

Harga dan biaya yang ditampilkan pada halaman konfirmasi adalah acuan pesanan sebelum pembayaran. Harga maupun ketersediaan dapat berubah sebelum pesanan dibuat. Periksa kembali total tagihan dan penerima pembayaran sebelum melanjutkan.

Pesanan berbayar diproses setelah pembayaran terkonfirmasi oleh sistem pembayaran atau setelah pembayaran manual diverifikasi jika metode tersebut tersedia. Jangan mengirim pembayaran di luar instruksi yang tampil pada halaman pesanan.

## 4. Pemrosesan, pembatalan, dan pengembalian dana

Pemrosesan dapat tertunda karena gangguan jaringan, pemeriksaan pembayaran, pemeliharaan, atau kendala pada penyedia produk. Status menunggu atau diproses bukan bukti bahwa transaksi telah berhasil.

Jika pembayaran berhasil tetapi produk belum diterima, hubungi dukungan dengan kode pesanan dan bukti pembayaran. Pengembalian dana atau koreksi saldo dilakukan setelah status pembayaran dan transaksi diverifikasi. Pesanan yang telah diteruskan ke penyedia mungkin tidak dapat dibatalkan.

## 5. Saldo akun dan PIN transaksi

Saldo hanya dapat digunakan sesuai fungsi yang ditampilkan di aplikasi. Pengisian saldo berstatus menunggu hingga terkonfirmasi atau diverifikasi.

Pembayaran menggunakan saldo memerlukan PIN transaksi 6 digit. PIN terkunci sementara setelah beberapa percobaan gagal. Laporkan segera aktivitas atau perubahan saldo yang tidak Anda kenali.

## 6. Penggunaan yang dilarang

Anda tidak boleh menggunakan layanan untuk aktivitas melanggar hukum, penipuan, penyalahgunaan promosi, mengganggu sistem, mengakses akun atau data pihak lain tanpa izin, maupun mengirimkan data yang tidak berhak Anda gunakan.

## 7. Ketersediaan layanan dan perubahan ketentuan

Layanan dan fitur dapat berubah, dihentikan sementara, atau tidak tersedia karena pemeliharaan maupun ketergantungan pada penyedia pihak ketiga. Ketentuan dapat diperbarui dari waktu ke waktu; versi yang berlaku adalah versi yang ditampilkan pada halaman ini.

## 8. Penyelesaian sengketa

Keluhan disampaikan terlebih dahulu melalui kanal dukungan agar dapat diselesaikan secara musyawarah. Apabila tidak tercapai kesepakatan, para pihak dapat menempuh penyelesaian sesuai hukum yang berlaku di Republik Indonesia.

## 9. Hukum yang berlaku dan kontak

Ketentuan ini ditafsirkan berdasarkan hukum yang berlaku di Republik Indonesia. Pertanyaan atau keluhan dapat disampaikan melalui informasi pada halaman Kontak dengan menyertakan kode pesanan bila relevan.`;

    case 'kebijakan-privasi':
      return `Kebijakan ini menjelaskan bagaimana ${name} memproses informasi saat Anda mengakses atau menggunakan layanan.

## Informasi yang kami proses

Bergantung pada cara Anda menggunakan layanan, informasi dapat mencakup nama, alamat email, nomor telepon atau WhatsApp, data tujuan produk yang Anda masukkan, rincian produk dan pembayaran, status pesanan, komunikasi dukungan, serta informasi teknis dasar yang diperlukan agar aplikasi dan sesi akun bekerja.

Jangan memasukkan kata sandi akun lain, PIN, kode OTP, atau informasi keuangan rahasia ke kolom tujuan transaksi maupun pesan dukungan.

## Dasar dan tujuan penggunaan

Informasi digunakan untuk membuat dan memproses pesanan, mencocokkan pembayaran, mengelola akun dan saldo, menyampaikan status, mencegah penyalahgunaan, memenuhi kewajiban pencatatan, serta menanggapi pertanyaan dan keluhan.

## Cookie dan penyimpanan di browser

Kami menggunakan cookie esensial yang dikelola oleh sistem autentikasi untuk mempertahankan sesi login dan membantu melindungi akun. Cookie ini tidak digunakan untuk iklan atau pelacakan lintas situs.

Pilihan Anda pada pemberitahuan cookie, preferensi tema dashboard, dan informasi akses sementara invoice QRIS disimpan di penyimpanan lokal atau sesi browser. Anda dapat menghapusnya melalui pengaturan browser.

## Penyedia layanan dan pembagian informasi

Data yang diperlukan dapat diteruskan kepada penyedia produk digital, penyedia pembayaran, infrastruktur teknologi, atau layanan komunikasi agar pesanan, pembayaran, keamanan, dan dukungan dapat dijalankan. Pihak tersebut menerima informasi sebatas yang diperlukan.

Informasi juga dapat diungkapkan jika diwajibkan oleh hukum, diperlukan untuk menangani sengketa, atau untuk melindungi keamanan layanan dan pengguna.

## Penyimpanan dan keamanan

Informasi disimpan selama diperlukan untuk menyediakan layanan, menyelesaikan pesanan atau sengketa, menjaga catatan transaksi, dan memenuhi kewajiban hukum. Kami menerapkan pembatasan akses dan langkah perlindungan yang wajar, tetapi tidak ada transmisi atau penyimpanan elektronik yang dapat dijamin sepenuhnya bebas risiko.

## Hak subjek data

Anda berhak meminta akses, koreksi, atau penghapusan informasi pribadi Anda, serta menarik persetujuan atas pemrosesan yang didasarkan pada persetujuan. Permintaan dapat memerlukan verifikasi identitas dan dapat dibatasi jika informasi masih diperlukan untuk transaksi, keamanan, sengketa, atau kewajiban hukum.

## Perubahan kebijakan

Kebijakan ini dapat diperbarui untuk mencerminkan perubahan layanan atau ketentuan yang berlaku. Perubahan akan dipublikasikan pada halaman ini.`;

    case 'disclaimer':
      return `## Ketersediaan dan informasi produk

Informasi produk, harga, stok, promosi, cakupan, biaya, dan estimasi waktu pemrosesan dapat berubah mengikuti pembaruan dari penyedia. Informasi ditampilkan untuk membantu Anda mengambil keputusan, tetapi dapat mengalami keterlambatan atau ketidakakuratan sementara.

## Penyedia pihak ketiga

Pemenuhan sebagian produk dan pemrosesan pembayaran bergantung pada pihak ketiga. ${name} tidak mengendalikan seluruh sistem, jaringan, kebijakan, atau gangguan pada pihak tersebut. Nama produk, merek, dan logo pihak ketiga adalah milik pemegang hak masing-masing dan tidak dengan sendirinya menunjukkan afiliasi atau dukungan resmi.

## Pemeriksaan data dan status transaksi

Anda bertanggung jawab memeriksa nomor tujuan, ID pelanggan, dan rincian pesanan sebelum membayar. Tampilan status dapat memerlukan waktu untuk diperbarui. Gunakan kode pesanan untuk memeriksa status terbaru dan jangan membuat pesanan ulang sebelum memastikan pesanan sebelumnya gagal atau kedaluwarsa.

## Batasan informasi

Materi pada halaman ini bersifat informasi umum dan bukan nasihat hukum, pajak, atau keuangan. Tidak ada bagian disclaimer ini yang menghapus hak konsumen atau tanggung jawab yang tidak dapat dikecualikan berdasarkan hukum yang berlaku.`;
  }
}
