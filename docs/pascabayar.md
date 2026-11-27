# Pascabayar (tagihan)

Alur: pilih produk → masukkan nomor pelanggan → **Cek Tagihan** → detail tagihan
muncul → **Bayar** (PIN) → invoice.

## Dua penyedia, dua bentuk API

| | Digiflazz | TokoVoucher |
|---|---|---|
| Endpoint cek | `POST /v1/transaction` + `commands: "inq-pasca"` | `POST /v1/pascabayar-inq` |
| Endpoint bayar | `POST /v1/transaction` + `commands: "pay-pasca"` | `POST /v1/pascabayar-pay` |
| Signature | `md5(username + apiKey + ref_id)` | `md5(memberCode:secret:ref_id)` |
| Bentuk respons | bersarang di `data.desc.detail[]` | datar (`tagihan`, `admin`, `denda`) |

Keduanya memakai `ref_id` sebagai kunci korelasi: **pembayaran wajib mengirim
`ref_id` yang sama dengan saat inquiry**. Itulah sebabnya
`bill_inquiries.providerRef` disimpan.

### Catatan formula signature TokoVoucher

Halaman dokumentasi `/v1/pascabayar-inq` menulis
`md5(REF_ID:MEMBER_CODE:SECRET_KEY)`. Nilai itu **ditolak** server dengan
`"Signature not valid"`. Yang diterima adalah
`md5(MEMBER_CODE:SECRET:REF_ID)`.

Bukti yang dipakai:

1. Dengan `ref_id` identik, hanya formula kedua yang melewati validasi signature
   (server lalu menjawab `"ID Pelanggan tidak terdaftar"`).
2. Uji kontrol memakai signature 32 nol membuktikan validasi signature
   **mendahului** pencarian nomor pelanggan. Jadi pesan "ID Pelanggan tidak
   terdaftar" memang berarti signature diterima.
3. `defaultSignature` dari panel member (32 karakter) juga diuji dengan bentuk
   dokumentasi — tetap ditolak.

Penyebab perbedaan ini **tidak diketahui** dan tidak bisa disimpulkan dari luar.
Yang bisa dilakukan: menjalankan ulang perbandingan di atas sebelum mengubah
formula. Jangan mengubahnya hanya karena dokumentasi menulis lain.

Catatan: halaman E-Wallet Reload memakai endpoint berbeda
(`/v1/transfer/ewallet`), jadi formulanya tidak bisa dijadikan pembanding.

## Bentuk respons dan pemetaan

`src/lib/postpaid-protocol.ts` memisahkan dua pembaca karena bentuknya berbeda.

### Digiflazz
```json
{"data":{"customer_name":"…","admin":2500,"price":10000,"selling_price":11000,
 "desc":{"tarif":"R1","daya":1300,
  "detail":[{"periode":"201901","nilai_tagihan":"8000","denda":"500"}]}}}
```
- `billAmount` = Σ (`nilai_tagihan` + `denda`) — **bukan** `price`
- `adminFee` = `admin`
- `totalAmount` = `selling_price`
- `detail[]` bisa lebih dari satu (multi-periode)
- `price` hanya dipakai sebagai fallback bila `detail[]` tidak ada

### TokoVoucher
```json
{"status":"Sukses","customer_name":"…","tagihan":147500,"admin":2500,
 "selling_price":152500,"denda":0,"blnth":"012024","data":"900VA","jml_bulan":1}
```
- `billAmount` = `tagihan` + `denda`
- `totalAmount` = `selling_price`
- `blnth` berformat `MMYYYY`; Digiflazz `YYYYMM` — keduanya dinormalkan ke `MM/YYYY`

## Tabel `bill_inquiries`

Satu tabel untuk kedua vendor; kolom `vendor` membedakan.

| kolom | catatan |
|---|---|
| `providerRef` | `ref_id`, unik, dipakai ulang saat bayar |
| `billAmount`, `adminFee`, `totalAmount` | hasil parser |
| `lines`, `periods`, `dueDate` | untuk tampilan |
| `status` | `open` → `used` (atau `expired`/`failed`) |
| `expiresAt` | 15 menit |

`transactions.billInquiryId` menunjuk quote yang dipakai, dengan unique index
parsial `WHERE billInquiryId IS NOT NULL`, sehingga satu tagihan tidak bisa
dibayar dua kali. Quote ditandai `used` di dalam transaksi database yang sama
dengan pemotongan saldo.

## Aturan order pascabayar

- wajib `billInquiryId`; quote harus milik user, `open`, belum kedaluwarsa,
  produk dan nomor cocok;
- harga diambil dari `totalAmount` quote, bukan dari harga price-list;
- voucher dan flash sale ditolak (`PROMOTION_NOT_ALLOWED_FOR_BILL`);
- pembayaran memakai `providerRef` yang sama dengan inquiry.

## Saklar pengaman

| Env | Default | Arti |
|---|---|---|
| `DIGIFLAZZ_POSTPAID_ENABLED` | `false` | izinkan cek tagihan Digiflazz |
| `TOKOVOUCHER_POSTPAID_ENABLED` | `false` | izinkan cek tagihan TokoVoucher |

Selama false, `POST /api/bills/inquiry` menjawab 503 `BILL_PROVIDER_UNAVAILABLE`.
Ini terpisah dari `ENABLE_REAL_TRANSACTIONS` supaya mengaktifkan prabayar tidak
otomatis mengizinkan pembayaran tagihan nyata.

## Sync produk pascabayar

Produk pascabayar Digiflazz ada di price list terpisah (`cmd: "pasca"`).
`POST /api/admin/digiflazz/price-list?scope=pasca` menjalankan
`syncDigiflazzPostpaidProducts()`. Semua baris masuk `category = 'tagihan'` dan
status `inactive` seperti hasil sync lainnya — admin yang mengaktifkan.

## Batasan sandbox (terverifikasi)

- Digiflazz: hanya SKU `pln` yang punya test case. `PPASCA` →
  `"Test case untuk produk PPASCA tidak ditemukan"`. Nomor uji:
  `530000000001` (1 lembar), `530000000002` (2 lembar).
- TokoVoucher: semua nomor uji ditolak (`"ID Pelanggan tidak terdaftar"`),
  `sisa_saldo` 0.
- **Pembayaran sungguhan tidak bisa diverifikasi di sandbox.** Perlu kredensial
  production dan saldo.
- Rate limit price list Digiflazz ketat (`rc 83`, kadang dilaporkan sebagai `rc 41`).

## Pengujian

```
npm run typecheck
npm run lint
npm run test:payments      # termasuk tests/postpaid-protocol.test.mjs
```
