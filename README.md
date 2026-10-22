# Aplikasi Kasir & Manajemen Usaha Es Krim Jadul

Aplikasi kasir (POS) dan manajemen usaha berbasis **Node.js + Express** dengan **database file Excel** (`data/database-usaha.xlsx`). Frontend menggunakan HTML, CSS, dan JavaScript murni (tanpa framework). Antarmuka Bahasa Indonesia, mata uang Rupiah, zona waktu Asia/Jakarta.

## Fitur

- **Login & autentikasi** — hashing password (bcryptjs), token HMAC-SHA256 ber expiry, proteksi seluruh endpoint API, logout, penanganan sesi kedaluwarsa.
- **Produk** — tambah, edit, hapus/nonaktif (soft delete bila punya riwayat), cari, filter kategori, koreksi stok dengan pencatatan StockMovements, penanda stok rendah.
- **Pembelian** — multi item, pemasok, harga beli dapat berfluktuasi, total dihitung backend, stok bertambah otomatis.
- **Penjualan / Kasir** — keranjang, validasi stok di backend, harga modal tersimpan saat transaksi, struk/cetak, riwayat.
- **Produksi** — batch bahan baku → produk jadi, biaya dihitung dari harga beli bahan, validasi stok bahan, riwayat batch.
- **Pengeluaran** — kategori usaha & kategori, filter periode, total otomatis.
- **Dashboard & Laporan** — ringkasan periode, laporan penjualan/pembelian/pengeluaran/stok/produksi + unduh CSV.

## Persyaratan

- Node.js 18 atau lebih baru (dianjurkan 20+)
- Windows / macOS / Linux
- VS Code atau terminal apa pun

## Cara Menjalankan

```bash
cd aplikasi-kasir
npm install
npm start

Untuk Testing
node .\public\scripts\smoke-test.js
Smoke test ke http://localhost:3000
```

Lalu buka **http://localhost:3000** di browser.

Login awal (dibuat otomatis pada pertama kali dijalankan):

- Username: `admin`
- Password: `admin123`

> **Penting:** segera ganti password. Buat akun baru lewat `npm run create-admin` lalu nonaktifkan/mengganti akun default di sheet `Users` file Excel, atau hapus akun default setelah akun baru dibuat.
> Secret token: set environment variable `TOKEN_SECRET` (dan `ADMIN_PASSWORD`) sebelum menjalankan untuk produksi nyata.

Variabel environment yang didukung: `PORT` (default 3000), `TOKEN_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `TOKEN_TTL_HOURS`.

## Struktur Folder

```
aplikasi-kasir/
├── server.js                  # Entry point Express + bootstrap DB & admin
├── package.json
├── data/
│   ├── database-usaha.xlsx    # Database Excel (dibuat otomatis)
│   └── backup/                # Backup otomatis sebelum setiap penulisan
├── scripts/
│   ├── create-admin.js        # Membuat akun pengguna baru
│   └── smoke-test.js          # 37 pengujian endpoint otomatis (npm test)
├── src/
│   ├── config.js              # Path & konfigurasi (berbasis lokasi file, bukan cwd)
│   ├── db/excel.js            # Lapisan Excel: antrean tulis, backup, atomic write
│   ├── middleware/
│   │   ├── auth.js            # Verifikasi token Bearer
│   │   └── error.js           # 404 + error handler terpusat (tanpa stack trace ke klien)
│   ├── routes/
│   │   ├── auth.js            # /api/auth/*
│   │   ├── products.js        # /api/products/*
│   │   ├── purchases.js       # /api/purchases
│   │   ├── sales.js           # /api/sales
│   │   ├── production.js      # /api/production
│   │   ├── expenses.js        # /api/expenses
│   │   └── reports.js         # /api/summary, /api/reports, /api/meta
│   └── utils/
│       ├── helpers.js         # Validasi, format tanggal/jam, AppError
│       └── token.js           # Buat & verifikasi token HMAC
└── public/
    ├── index.html             # Halaman login + kerangka aplikasi
    ├── css/style.css
    └── js/
        ├── api.js             # Klien API terpusat + normalizeArray
        ├── ui.js              # Toast, modal, konfirmasi, escaping, state
        ├── app.js             # Autentikasi, router hash, navigasi
        └── pages/             # dashboard, produk, pembelian, penjualan,
                               # produksi, pengeluaran, laporan
```

## Kontrak API (ringkas)

Semua respons JSON: `{ "success": true/false, "message"?, "data"?, "details"? }`.
Semua endpoint (kecuali `/api/auth/login` dan `/api/health`) memerlukan header `Authorization: Bearer <token>`.

| Method | URL | Request | Data respons (`data`) |
|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` | `{ token, user }` (objek) |
| GET | `/api/auth/me` | — | objek user |
| POST | `/api/auth/logout` | — | — |
| GET | `/api/products` | `?include_nonaktif=1` | **array** produk |
| POST | `/api/products` | `{ nama, kategori, satuan, harga_beli, harga_jual, stok, stok_minimum }` | objek produk |
| PUT | `/api/products/:id` | sebagian field di atas + `aktif` | objek produk |
| DELETE | `/api/products/:id` | — | `{ mode: 'hapus'\|'nonaktif' }` |
| POST | `/api/products/:id/koreksi-stok` | `{ stok_baru, alasan }` | objek produk |
| GET | `/api/purchases` | `?dari=&sampai=&limit=` | **array** pembelian (dengan `items[]`) |
| POST | `/api/purchases` | `{ tanggal?, pemasok, items[{product_id, qty, harga_beli?}], metode_bayar, catatan }` | objek pembelian |
| GET | `/api/sales` | `?dari=&sampai=&limit=` | **array** penjualan (dengan `items[]`) |
| POST | `/api/sales` | `{ items[{product_id, qty}], metode_bayar, catatan }` | objek penjualan |
| GET | `/api/production` | `?dari=&sampai=&limit=` | **array** batch (dengan `bahan[]`) |
| POST | `/api/production` | `{ tanggal?, produk, jumlah_hasil, bahan[{product_id, qty}], catatan }` | objek batch |
| GET | `/api/expenses` | `?dari=&sampai=&limit=` | **array** pengeluaran |
| POST | `/api/expenses` | `{ tanggal?, kategori_usaha, kategori, deskripsi, jumlah, metode_bayar }` | objek pengeluaran |
| GET | `/api/summary` | `?dari=&sampai=` | objek ringkasan dashboard |
| GET | `/api/reports` | `?jenis=penjualan\|pembelian\|pengeluaran\|stok\|produksi&dari=&sampai=` | objek laporan + `rincian` |
| GET | `/api/meta` | — | pilihan form (kategori, metode bayar) |
| GET | `/api/health` | — | status server (publik) |

Aturan kontrak yang dijaga di seluruh aplikasi:

- Endpoint **daftar** selalu mengembalikan **array** di `data`.
- Endpoint **satu objek** (login, detail, hasil simpan) mengembalikan **objek** di `data`.
- Frontend men-normalisasi array sebagai jaring pengaman tambahan (`normalizeArray`), bukan sebagai pengganti kontrak.

## Struktur Sheet Excel

Database: `data/database-usaha.xlsx`. Sheet dan kolom:

- `Products`: id, nama, kategori, satuan, harga_beli, harga_jual, stok, stok_minimum, aktif
- `Sales`: id, tanggal, total, metode_bayar, catatan
- `SaleItems`: id, sale_id, product_id, nama_produk, qty, harga_jual, harga_modal, subtotal
- `Purchases`: id, tanggal, pemasok, total, metode_bayar, catatan
- `PurchaseItems`: id, purchase_id, product_id, nama_produk, qty, harga_beli, subtotal
- `Expenses`: id, tanggal, kategori_usaha, kategori, deskripsi, jumlah, metode_bayar
- `StockMovements`: id, tanggal, product_id, nama_produk, jenis, qty, alasan, referensi
- `ProductionBatches`: id, tanggal, produk, nama_produk, jumlah_hasil, biaya_total, catatan
- `ProductionItems`: id, batch_id, product_id, nama_produk, qty, harga_beli, subtotal
- `Users`: id, username, password_hash, nama, role, aktif

Cataman keamanan data Excel:

- Seluruh operasi tulis diserialkan (antrean berantai) — tidak ada dua penulisan bersamaan.
- Sebelum menimpa, file disalin ke `data/backup/` (dibatasi 30 backup terakhir).
- Penulisan bersifat atomik (tulis ke `.tmp` lalu ganti file).
- Kegagalan validasi membatalkan seluruh operasi — tidak ada perubahan stok parsial.
- Excel bukan database transaksional; backup tetap disarankan secara berkala.

## Pengujian

```bash
npm start          # terminal 1
npm test           # terminal 2 — 37 pengujian endpoint otomatis
```

Pengujian yang sudah dijalankan dan lulus di lingkungan pengembangan (37/37):

- Health check, proteksi endpoint tanpa token (401), token rusak (401)
- Login benar/salah/kosong; respons login berupa objek (bukan array)
- CRUD produk, validasi input, ID tidak ditemukan (404)
- Pembelian menambah stok; total dihitung backend
- Penjualan mengurangi stok; ditolak saat stok kurang & saat produk nonaktif
- Produksi mengurangi bahan & menambah hasil; biaya dihitung backend
- Pengeluaran tersimpan; input tidak valid ditolak
- Koreksi stok tercatat
- Summary/laporan berbentuk objek; rincian berbentuk array; jenis tidak dikenal -> 400
- Soft delete produk ber-riwayat; riwayat tetap utuh
- Endpoint tak dikenal -> 404 JSON

Yang **perlu diuji langsung di komputer Anda** (membutuhkan browser/OS asli):

- Tampilan responsif (desktop + layar kecil), sidebar mobile
- Cetak struk (`window.print`)
- Penulisan file Excel saat file sedang dibuka di Microsoft Excel (harus menampilkan pesan galat yang jelas, bukan korupsi)
- Perilaku Windows saat file terkunci

## Pemecahan Masalah

| Gejala | Penyebab / solusi |
|---|---|
| `Port 3000 sudah dipakai` | Jalankan `set PORT=3100` (Windows) atau `PORT=3100 npm start` (Linux/macOS) |
| `Gagal membaca file database Excel` | Tutup file Excel yang sedang terbuka, lalu jalankan ulang server |
| 401 terus-menerus di browser | Login ulang; token kedaluwarsa (default 12 jam) |
| Perubahan data tidak tersimpan | Cek log terminal server; pesan error lengkap dicatat di sana |
| Ingin reset total | Hentikan server, hapus `data/database-usaha.xlsx` (opsional: simpan dulu `data/backup/`), jalankan ulang |
