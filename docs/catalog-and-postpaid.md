# Katalog storefront & alur pascabayar

## Prinsip

Menu toko **bukan** lagi enum di kode. Tiga tabel mengaturnya:

| Tabel | Isi |
|---|---|
| `catalog_groups` | Kategori teratas (`kind = prepaid` atau `postpaid`) |
| `catalog_subgroups` | Menu di dalam kategori, mis. `PLN`, `PLN Promo`, `Finance` |
| `catalog_rules` | Aturan pemetaan produk otomatis ke subkategori |

`products.category` masih ada, tetapi hanya dipakai internal (validasi tujuan
nomor, routing vendor). Yang menentukan tampilan adalah `products.subgroupId`.

### Dua gaya menu

`catalog_groups` punya dua kolom yang menentukan cara grup dirender:

- `productCategory` + `includeUnmapped = true` → **menu gaya operator**. Grup
  menampilkan kartu operator (game, paket data, pulsa) langsung dari
  `products.category`, termasuk produk yang belum dipetakan. Cocok untuk
  kategori yang isinya ratusan brand.
- `productCategory = null` / `includeUnmapped = false` → **menu terkurasi**.
  Hanya produk yang sudah punya `subgroupId` yang tampil. Cocok untuk PLN
  (PLN vs PLN Promo) dan Tagihan (PDAM, BPJS, Finance, …).

## Alur produk

1. Sync vendor (`digiflazz-product-sync.ts`, `tokovoucher-product-sync.ts`)
   menulis semua produk ke tabel `products`. Produk baru langsung dievaluasi
   terhadap `catalog_rules`.
2. Produk dengan `subgroupId = null` **tidak tampil di storefront**, tetapi tetap
   terlihat di menu Produk dashboard dan menu Semua Produk.
3. Admin memetakan produk dengan salah satu cara:
   - membuat aturan lalu menekan **Terapkan aturan** di Admin > Katalog &
     Subkategori, atau
   - memilih subkategori per produk di detail provider, atau
   - memakai **Petakan semua ke…** untuk seluruh produk satu provider.
4. Pemetaan manual (`subgroupSource = 'manual'`) tidak pernah ditimpa sync
   maupun "Terapkan aturan". Memilih "Tidak tampil di toko" juga manual, jadi
   produk yang sengaja disembunyikan tetap tersembunyi.

### Aturan pemetaan

`matchType` yang didukung: `operator`, `vendorCode`, `prefix`, `name`.
Prioritas lebih kecil menang. Aturan dengan `vendor` terisi hanya berlaku untuk
vendor itu. Logika murni ada di `src/lib/catalog-mapping.ts` dan diuji di
`tests/catalog-mapping.test.mjs`.

## Storefront

- `GET /api/products` mengembalikan `{ groups, subgroups, products }`.
- **Beranda tetap memakai layout lama**: deretan pill kategori di atas, lalu grid
  kartu layanan. Yang berubah hanya sumbernya — pill diambil dari
  `catalog_groups`, bukan enum di kode.
  - Grup gaya operator (`includeUnmapped = true`): kartu berisi operator
    (AXIS, TELKOMSEL, FREE FIRE, …) seperti sebelumnya.
  - Grup terkurasi (`includeUnmapped = false`): kartu berisi subkategori
    (PLN, PLN Promo, PDAM, BPJS, Finance, …), lalu menuju
    `/katalog/[group]/[subgroup]`.
  - Bila admin belum membuat grup sama sekali, daftar pill bawaan dipakai
    supaya toko tidak kosong.
- `/katalog/[group]/[subgroup]` menampilkan produk subkategori itu.
  - grup `prepaid` → grid nominal seperti biasa
  - grup `postpaid` → `BillInquiryFlow`
- URL lama `/checkout/[category]/[provider]` tetap berfungsi; tambahkan
  `?subgroup=<id>` untuk membatasi katalog ke subkategori tersebut.

## Pascabayar

Alur tiga langkah, semua lewat Digiflazz pascabayar:

1. `POST /api/bills/inquiry` — `{ productId, destination }`.
   Server memanggil `/v1/inquiry-pasca`, menyimpan baris `bill_inquiries`
   (`status = 'open'`, berlaku 15 menit), mengembalikan detail tagihan.
2. Pembeli memeriksa detail (nama pelanggan, rincian, total).
3. `POST /api/orders` dengan `billInquiryId`:
   - inquiry harus milik user, `open`, belum kedaluwarsa, produk & nomor cocok;
   - inquiry ditandai `used` **di dalam transaksi DB yang sama** yang memotong
     saldo, sehingga satu tagihan tidak bisa dibayar dua kali
     (`uniqueIndex transactions_bill_inquiry_unique` menjadi pengaman kedua);
   - `amount` diambil dari `totalAmount` inquiry, bukan harga price-list;
   - voucher dan flash sale ditolak (`PROMOTION_NOT_ALLOWED_FOR_BILL`);
   - pembayaran memakai `/v1/transaction` dengan `inquiry_ref_id`.

### Saklar pengaman

`DIGIFLAZZ_POSTPAID_ENABLED` (default **false**). Selama false,
`POST /api/bills/inquiry` menjawab 503 `BILL_PROVIDER_UNAVAILABLE`. Ini terpisah
dari `ENABLE_REAL_TRANSACTIONS` supaya mengaktifkan prabayar tidak otomatis
mengizinkan pembayaran tagihan nyata.

### Kode error

| Kode | Arti |
|---|---|
| `BILL_NOT_FOUND` | Nomor tagihan tidak ada |
| `BILL_ALREADY_PAID` | Tagihan sudah dibayar |
| `BILL_INQUIRY_EXPIRED` | Lewat 15 menit |
| `BILL_INQUIRY_REQUIRED` | Order pascabayar tanpa `billInquiryId` |
| `BILL_INQUIRY_ALREADY_USED` | Inquiry sudah dipakai order lain |
| `BILL_PROVIDER_UNAVAILABLE` | Provider mati atau saklar mati |
| `BILL_PROVIDER_REJECTED` | Provider menolak tanpa kode yang dikenal |

## Seed awal

```
npm run db:seed-catalog
```

Membuat 7 kategori, 9 subkategori (PLN, PLN Promo, PDAM, BPJS Kesehatan,
Finance, Asuransi, TV Kabel, Internet & Telepon, Gas), dan 10 aturan operator.
Semua baris dibuat **nonaktif** dan idempoten (`ON CONFLICT DO NOTHING`), jadi
tidak ada perubahan tampilan sebelum admin mengaktifkannya.

## Migrasi

- SQLite: `drizzle/0024_condemned_master_mold.sql`, `drizzle/0025_lively_bulldozer.sql`,
  `drizzle/0026_wet_millenium_guard.sql`
- Postgres: `drizzle/postgres-runtime/0013_productive_patch.sql`,
  `drizzle/postgres-runtime/0014_tidy_microbe.sql`,
  `drizzle/postgres-runtime/0015_exotic_master_mold.sql`

## Pengujian

```
npm run typecheck
npm run lint
npm run test:digiflazz-sync
npm run test:payments      # termasuk catalog-mapping + digiflazz-postpaid
npm run test:database
```
