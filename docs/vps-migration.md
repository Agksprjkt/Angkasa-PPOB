# Migrasi VPS tanpa kehilangan data

Panduan ini memindahkan deployment Docker Compose PPOB ke VPS lain dengan
downtime terencana. Asumsinya deployment memakai PostgreSQL 17, volume Docker
`postgres-data` dan `ppob-data`, serta satu instance app dan worker. Tidak ada
replikasi langsung antarmesin; jangan menjalankan dua app/worker yang menulis
ke database terpisah pada waktu yang sama.

## Batas penting dan persiapan sebelum VPS kedaluwarsa

Compose saat ini **tidak** mengatur backup off-site otomatis, PostgreSQL
replication, atau WAL archiving. Jika VPS sudah dihapus/tidak dapat diakses
sebelum snapshot terakhir, pemulihan hanya bisa sampai backup off-site terbaru;
transaksi sesudah waktu backup itu mungkin tidak dapat dipulihkan. Jaminan
benar-benar tanpa kehilangan transaksi memerlukan replikasi/arsip WAL yang
kontinu ke infrastruktur lain dan prosedur failover yang sudah diuji.

Sebelum masa sewa berakhir:

- Buat backup PostgreSQL **dan** `ppob-data` secara berkala ke penyimpanan
  terenkripsi di luar VPS/provider. Atur frekuensinya berdasarkan jumlah
  transaksi yang masih dapat diterima untuk dibuat ulang.
- Verifikasi checksum, pantau kegagalan backup, dan uji restore ke deployment
  terisolasi. Backup yang belum pernah diuji restore bukan rencana pemulihan.
- Simpan salinan aman `docker-compose.yml`, `.env`, secrets, konfigurasi
  reverse proxy, DNS/provider account recovery, dan tag image aktif.
- Jangan menunggu sampai hari terakhir: selesaikan restore dan verifikasi di
  VPS tujuan sebelum menghentikan atau membatalkan VPS sumber.

## Data yang harus dipindahkan

| Data | Lokasi | Cara pindah |
| --- | --- | --- |
| User, produk, transaksi, deposit, saldo, ledger, pengaturan | PostgreSQL | `pg_dump` lalu `pg_restore` |
| File upload, aset lokal, konfigurasi mode database | Volume `ppob-data` di `/app/.data` | Arsip setelah app dan worker berhenti |
| Kunci auth, URL database, kredensial provider, secret worker | `.env` dan file Compose secrets | Salin melalui kanal terenkripsi/SSH; jangan commit |
| Rate limit, cache singkat, worker lock | Redis | Tidak dipindahkan; Redis dibuat kosong di VPS baru |
| Versi aplikasi | Tag image GHCR | Gunakan tag SHA yang sama seperti server sumber |

PostgreSQL adalah sumber data finansial. Jangan menyalin volume
`postgres-data` saat PostgreSQL masih berjalan. Jangan mengganti mode database:
file `.data/database-mode.json`, jika ada, berada di dalam `ppob-data` dan ikut
dipindahkan.

## Sebelum hari migrasi

1. Siapkan VPS tujuan: Docker Engine dan Compose v2, disk persisten, firewall,
   reverse proxy/TLS, dan IP egress tetap. Allowlist IP egress baru pada provider
   yang membutuhkannya.
2. Pastikan DNS, domain, serta port HTTPS sudah siap. Turunkan TTL DNS lebih
   awal dan tunggu setidaknya selama TTL lama sebelum cutover.
3. Siapkan direktori Compose di VPS tujuan. Salin `docker-compose.yml`, `.env`,
   file-file di `secrets/`, dan konfigurasi reverse proxy secara aman. Set
   `APP_IMAGE` ke tag SHA yang sama dengan deployment sumber.
4. Pertahankan nilai `BETTER_AUTH_SECRET`, `PAYMENT_RECONCILER_SECRET`,
   password database/Redis, dan kredensial provider. `DATABASE_URL` di file
   secret harus menunjuk ke host Compose `postgres` dan memakai database, user,
   serta password yang sama. Jangan taruh secret di Git, image, atau chat.
5. Pastikan deployment tujuan benar-benar baru atau database/volume tujuannya
   kosong. Jika sebelumnya sudah berisi data, backup dan tinjau terlebih dahulu;
   jangan menimpa data tujuan tanpa keputusan eksplisit.
6. Uji pemulihan backup di lingkungan terisolasi bila memungkinkan. Jangan
   menggabungkan migrasi VPS dengan upgrade major PostgreSQL atau perubahan
   skema lain.

## Snapshot konsisten dari VPS sumber

Jadwalkan downtime. Hentikan app dan worker agar tidak ada transaksi, callback,
atau rekonsiliasi yang menulis selama snapshot. Biarkan service PostgreSQL hidup
sampai dump selesai.

Jalankan dari direktori Compose di VPS sumber:

```sh
set -eu
umask 077
mkdir -p migration-backup
chmod 700 migration-backup
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
APP_CONTAINER="$(docker compose ps -q app)"
test -n "$APP_CONTAINER"

docker compose stop payment-reconciler app

docker compose exec -T postgres sh -ec \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "migration-backup/postgres-$STAMP.dump"

docker run --rm --volumes-from "$APP_CONTAINER:ro" \
  -v "$PWD/migration-backup:/backup" alpine:3.22 \
  sh -ec "tar -czf /backup/ppob-data-$STAMP.tar.gz -C /app/.data ."

test -s "migration-backup/postgres-$STAMP.dump"
test -s "migration-backup/ppob-data-$STAMP.tar.gz"
(cd migration-backup && sha256sum "postgres-$STAMP.dump" "ppob-data-$STAMP.tar.gz" > SHA256SUMS)
```

Jika salah satu perintah gagal, **jangan lanjutkan migrasi**. Periksa file
backup; bila perlu pulihkan layanan sumber dengan
`docker compose start app payment-reconciler`. Simpan backup di luar VPS sumber
dengan transfer SSH, verifikasi checksum di tujuan, dan lindungi salinannya
dengan enkripsi at-rest. Salin `.env`, file secrets, dan konfigurasi proxy secara
terpisah dengan akses terbatas. Jangan mengirimkannya melalui GitHub.

Setelah snapshot berhasil, biarkan app dan worker sumber berhenti. Jangan
mengaktifkannya lagi setelah VPS tujuan mulai menerima transaksi.

## Pulihkan di VPS tujuan

Pastikan `.env`, secret files, dan tag image sudah benar. Gunakan PostgreSQL
dengan major version yang sama (17), lalu:

```sh
set -eu
docker compose config --quiet
docker compose pull app payment-reconciler
docker compose up -d postgres redis
docker compose ps
```

Pastikan PostgreSQL sehat. Jangan start app atau worker sebelum pemulihan
database dan volume selesai.

Salin arsip backup ke direktori aman di VPS tujuan, lalu verifikasi checksum.
Gunakan nama file sesuai snapshot:

```sh
chmod 700 migration-backup
chmod 600 migration-backup/*
(cd migration-backup && sha256sum -c SHA256SUMS)
docker compose exec -T postgres sh -ec \
  'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "migration-backup/postgres-<STAMP>.dump"
```

Pulihkan `ppob-data` ke volume baru. `create --no-deps` membuat container app
beserta named volume tanpa menjalankan app:

```sh
docker compose create --no-deps app
APP_CONTAINER="$(docker compose ps -aq app)"
test -n "$APP_CONTAINER"
docker run --rm --volumes-from "$APP_CONTAINER" \
  -v "$PWD/migration-backup:/backup:ro" alpine:3.22 \
  sh -ec "tar -xzf /backup/ppob-data-<STAMP>.tar.gz -C /app/.data"

docker run --rm --volumes-from "$APP_CONTAINER:ro" alpine:3.22 \
  sh -ec 'if [ -f /app/.data/database-mode.json ]; then cat /app/.data/database-mode.json; else echo "No mode file"; fi'
```

Ganti `<STAMP>` dengan timestamp snapshot yang sama. Jangan memulihkan ke volume
yang berisi data yang ingin dipertahankan. Jika `pg_restore` gagal, jangan start
app; gunakan database tujuan yang bersih dan ulangi pemulihan setelah penyebab
gagal diperbaiki.

Sebelum start app, pastikan file `/app/.data/database-mode.json`, jika ada,
menetapkan mode `postgres`. File ini mengalahkan `DATABASE_PROVIDER`; jangan
biarkan app menunjuk ke SQLite setelah PostgreSQL dipulihkan.

Setelah restore berhasil, jalankan versi image yang sudah dipin:

```sh
docker compose up -d --no-build app payment-reconciler
docker compose ps
docker compose logs --tail=100 app payment-reconciler
```

App menjalankan migrasi skema saat startup. Tunggu healthcheck lulus, lalu
verifikasi login admin, katalog, riwayat transaksi/deposit, saldo dan ledger
beberapa akun, aset yang diunggah, serta status transaksi pending. Pastikan
worker berjalan dan rekonsiliasi tidak menghasilkan transaksi ganda. Jangan
mengaktifkan transaksi live hanya untuk memvalidasi pemulihan.

## Cutover DNS dan masa observasi

1. Setelah VPS tujuan sehat, arahkan DNS A/AAAA ke VPS baru. Hapus atau perbarui
   record IPv6 lama jika tujuan tidak menyediakan IPv6 yang benar.
2. Jika domain atau URL publik berubah, perbarui `BETTER_AUTH_URL`, trusted
   origins, konfigurasi TLS, dan URL callback/webhook provider. Pastikan IP
   egress baru sudah di-allowlist.
3. Uji HTTPS, login, dan alur staging dari luar VPS. Pantau log app/worker,
   status provider, kesehatan PostgreSQL, serta ruang disk/RAM.
4. Biarkan VPS lama dan volumenya tetap utuh selama masa observasi dan sampai
   backup off-host serta pemulihan tujuan terverifikasi. Jangan jalankan app
   atau worker lama bersamaan dengan yang baru.

## Rollback

- **Sebelum VPS baru menerima transaksi:** jika validasi gagal, hentikan app dan
  worker tujuan, biarkan DNS tetap mengarah ke sumber, lalu start kembali app
  dan worker sumber. Sumber tetap menjadi satu-satunya database aktif.
- **Setelah VPS baru menerima transaksi:** jangan sekadar menyalakan app lama.
  Database lama sudah tertinggal. Hentikan app dan worker tujuan, buat snapshot
  konsisten terbaru dari tujuan, lalu pulihkan snapshot terbaru itu ke database
  bersih pada host yang akan menjadi sumber aktif. Verifikasi lagi sebelum
  mengalihkan DNS dan membuka trafik.

Jangan menghapus volume atau membatalkan VPS lama sampai migrasi, observasi,
backup, dan uji pemulihan selesai. Jangan gunakan `docker compose down -v`
sebagai cara membersihkan atau rollback.
