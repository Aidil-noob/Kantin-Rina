# Kasir Warung Bu Rina & Antrean Kantin

Aplikasi kasir berbasis web sederhana untuk **Warung Bu Rina**, dilengkapi modul **antrean Kantin**. Bisa dijalankan lokal di satu perangkat (Termux, laptop, atau mini PC) maupun di VPS dengan Docker + HTTPS.

## Fitur

**Kasir Warung**
- Daftar menu dengan pencarian, filter kategori, dan info stok.
- Keranjang, atur jumlah, diskon, uang diterima, kembalian.
- Pembayaran Tunai, QRIS, atau Transfer.
- Struk yang bisa dicetak (CSS printer 58 mm).
- Riwayat transaksi per tanggal, detail nota, dan pembatalan (stok otomatis dikembalikan).
- Laporan harian: omzet, jumlah nota, item terjual, produk terlaris, metode pembayaran.
- Export laporan ke CSV (bisa dibuka di Excel/Spreadsheet).

**Antrean Kantin**
- Ambil nomor antrean dengan penomoran otomatis (`A-001`, reset tiap hari).
- Panggil berikutnya, panggil ulang, selesai, lewati, dan reset.
- Layar antrean besar dengan panggilan suara Bahasa Indonesia (Web Speech API).
- Halaman operator dan layar diperbarui otomatis tanpa reload.

**Keamanan & data**
- Login admin dengan password (hash scrypt) dan sesi cookie bertanda tangan HMAC.
- Rate limit percobaan login, proteksi seluruh halaman dan API.
- Data tersimpan di SQLite lokal: `data/warung.db`.
- Zona waktu `Asia/Jakarta`, mata uang Rupiah.
- Tampilan responsif untuk HP, tablet, dan desktop.

## Kebutuhan

- Node.js **22.13+** (disarankan Node 24). Di Termux:

```bash
pkg update
pkg install nodejs
```

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env
```

Isi `.env`:

```bash
# Buat hash password:
node scripts/hash-password.js 'password-kuat'
# salin hasilnya ke ADMIN_PASSWORD_HASH

# Buat SESSION_SECRET:
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Untuk pengembangan cepat boleh memakai `ADMIN_PASSWORD=password-dev` (tanpa hash), tetapi produksi mewajibkan `ADMIN_PASSWORD_HASH`.

Jalankan:

```bash
npm start
```

Buka `http://localhost:3000`, lalu login.

| Halaman | URL |
| --- | --- |
| Login | `/login` |
| Dashboard | `/` |
| Kasir | `/kasir` |
| Produk | `/produk` |
| Riwayat | `/riwayat` |
| Laporan | `/laporan` |
| Operator antrean | `/antrean` |
| Layar antrean | `/layar` |

Port bisa diganti: `PORT=8080 npm start`.

Server mendengarkan di `0.0.0.0`, sehingga perangkat lain di WiFi yang sama dapat membuka `http://IP-PERANGKAT:3000` (opsional) dan login dengan password yang sama.

### Mode pengembangan

```bash
npm run dev
```

Server restart otomatis saat file berubah (Node `--watch`).

## Autentikasi

- Hanya ada **satu password admin** (tanpa multi-user/role).
- Sesi berlaku **7 hari** secara default; ubah dengan `SESSION_TTL_HOURS`.
- Semua halaman dan `/api/*` dilindungi, kecuali:
  - `/login` dan aset `/css/*`, `/js/*`
  - `POST /api/auth/login`
  - `/healthz`
- Layar antrean juga perlu login sekali di browser TV/monitor.
- Logout tersedia lewat tombol **Keluar** di navigasi.
- Jika `SESSION_SECRET` diganti, semua sesi lama otomatis tidak berlaku.

## Hosting di VPS (Docker + Caddy)

### 1. Persiapan

- VPS Ubuntu 24 (1 vCPU / 1 GB cukup).
- Domain dengan **A record** mengarah ke IP VPS.
- Install Docker Engine + plugin Compose, lalu buka firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

### 2. Siapkan aplikasi

```bash
cd /opt
git clone <url-repo> kantin-rina
cd kantin-rina
mkdir -p data backups
sudo chown -R 1000:1000 data backups   # user "node" di dalam container
cp .env.example .env
chmod 600 .env
```

Isi `.env`:

```dotenv
DOMAIN=kasir.domainanda.com
ADMIN_PASSWORD_HASH=scrypt$...
SESSION_SECRET=<hasil node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))">
SESSION_TTL_HOURS=168
TRUST_PROXY=1
```

Buat hash:

```bash
node scripts/hash-password.js 'password-kuat'
```

Tempel hasilnya ke `ADMIN_PASSWORD_HASH`. Saat memakai Docker Compose, bungkus nilainya dengan kutip tunggal agar karakter `$` tidak dianggap interpolasi:

```dotenv
ADMIN_PASSWORD_HASH='scrypt$16384$...'
```

### 3. Jalankan

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f
```

Caddy otomatis menerbitkan sertifikat HTTPS. Aplikasi Node tidak diekspos langsung ke internet; hanya Caddy pada port 80/443.

### 4. Backup harian

Backup memakai `VACUUM INTO` sehingga aman dilakukan saat aplikasi berjalan:

```bash
docker compose exec -T app node scripts/backup.js
```

Hasilnya ada di `backups/` (bind mount). Contoh cron:

```cron
15 23 * * * cd /opt/kantin-rina && docker compose exec -T app node scripts/backup.js >> backups/backup.log 2>&1
30 23 * * * rsync -a /opt/kantin-rina/backups/ user@host-lain:/backup/kantin-rina/
```

Retensi default 14 hari (`BACKUP_RETENTION_DAYS`).

### 5. Restore

```bash
docker compose stop app
rm -f data/warung.db data/warung.db-wal data/warung.db-shm
cp backups/warung-YYYY-MM-DD_HH-MM-SS.db data/warung.db
docker compose start app
```

### 6. Update aplikasi

```bash
git pull
docker compose up -d --build
```

## Data & backup lokal

- Database: `data/warung.db` (dibuat otomatis saat pertama dijalankan).
- Backup manual: `npm run backup` atau salin folder `data/` saat aplikasi berhenti.
- Hapus `data/warung.db` untuk memulai dari nol (menu contoh akan dibuat ulang).
- Produk yang dihapus tidak menghapus riwayat; nama dan harga disimpan di item transaksi.

## Struktur

```
server.js                     Entry point Express + proteksi auth
db.js                         Skema, pengaturan awal, seed menu
src/auth.js                   Hash password, cookie sesi, rate limit, middleware
src/routes/auth.js            Login, logout, cek sesi
src/routes/products.js        CRUD produk
src/routes/transactions.js    Transaksi, riwayat, void
src/routes/reports.js         Laporan harian, CSV, ringkasan
src/routes/queue.js           Antrean
src/routes/config.js          Nama warung & pengaturan
scripts/hash-password.js      Generator ADMIN_PASSWORD_HASH
scripts/backup.js             Snapshot SQLite + retensi
public/login.html             Halaman login
public/                       Halaman web lain (HTML/CSS/JS tanpa build)
test/api.test.js              Test API + auth (node:test)
Dockerfile                    Image produksi
docker-compose.yml            App + Caddy
Caddyfile                     Reverse proxy & HTTPS
.env.example                  Template konfigurasi
data/warung.db                Database SQLite (dibuat otomatis)
```

## API singkat

Semua endpoint di bawah ini butuh sesi login, kecuali `POST /api/auth/login` dan `/healthz`.

```
GET    /healthz                     publik
POST   /api/auth/login              publik
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/products
POST   /api/products
PUT    /api/products/:id
DELETE /api/products/:id

POST   /api/transactions
GET    /api/transactions?date=YYYY-MM-DD
GET    /api/transactions/:id
POST   /api/transactions/:id/void

GET    /api/reports/daily?date=YYYY-MM-DD
GET    /api/reports/export.csv?date=YYYY-MM-DD
GET    /api/reports/summary?date=YYYY-MM-DD

GET    /api/queue/today
POST   /api/queue/take
POST   /api/queue/call-next
POST   /api/queue/:id/call
POST   /api/queue/:id/done
POST   /api/queue/:id/skip
POST   /api/queue/reset

GET    /api/config
PUT    /api/config
```

## Test

```bash
npm test
```

Test memakai database sementara di folder temp, jadi data asli tidak tersentuh. Test juga mencakup login, proteksi halaman/API, rate limit, cookie, dan logout.

## Catatan

- Suara panggilan memakai text-to-speech bawaan browser. Chrome/Edge/Android umumnya mendukung `id-ID`; suara bisa berbeda tergantung perangkat.
- Cetak struk mengikuti ukuran kertas 58 mm. Untuk hasil rapi, pilih printer thermal 58 mm saat dialog cetak.
- Layar antrean mencoba menahan layar tetap menyala lewat Screen Wake Lock API; fitur ini hanya aktif di HTTPS atau `localhost`.
- Jangan pernah mengekspos port aplikasi (3000) langsung ke internet. Gunakan Caddy/Nginx dengan HTTPS.
- Simpan `.env` dengan permission `600` dan jangan commit ke git.
- Aplikasi ini hanya mendukung **satu instance** karena memakai SQLite. Jangan menjalankan beberapa replika pada database yang sama.
