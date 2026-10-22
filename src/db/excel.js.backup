'use strict';

/**
 * Lapisan database Excel.
 *
 * Prinsip:
 * - Semua pembacaan & penulisan melewati antrean berantai (write queue) sehingga
 *   tidak ada dua proses yang menulis file secara bersamaan.
 * - Penulisan selalu membaca workbook terbaru, lalu menulis ke file sementara
 *   dan mengganti file asli (atomic replace) untuk meminimalkan korupsi.
 * - Sebelum menimpa, dibuat backup ke data/backup/.
 * - Sheet dan header diinisialisasi otomatis tanpa menghapus sheet lain.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const config = require('../config');
const { AppError } = require('../utils/helpers');

/** Definisi sheet: nama -> urutan kolom wajib. */
const SHEET_DEFS = {
  Products: ['id', 'nama', 'kategori', 'satuan', 'harga_beli', 'harga_jual', 'stok', 'stok_minimum', 'aktif'],
  Sales: ['id', 'tanggal', 'total', 'metode_bayar', 'catatan'],
  SaleItems: ['id', 'sale_id', 'product_id', 'nama_produk', 'qty', 'harga_jual', 'harga_modal', 'subtotal'],
  Purchases: ['id', 'tanggal', 'pemasok', 'total', 'metode_bayar', 'catatan'],
  PurchaseItems: ['id', 'purchase_id', 'product_id', 'nama_produk', 'qty', 'harga_beli', 'subtotal'],
  Expenses: ['id', 'tanggal', 'kategori_usaha', 'kategori', 'deskripsi', 'jumlah', 'metode_bayar'],
  StockMovements: ['id', 'tanggal', 'product_id', 'nama_produk', 'jenis', 'qty', 'alasan', 'referensi'],
  ProductionBatches: ['id', 'tanggal', 'produk', 'nama_produk', 'jumlah_hasil', 'biaya_total', 'catatan'],
  ProductionItems: ['id', 'batch_id', 'product_id', 'nama_produk', 'qty', 'harga_beli', 'subtotal'],
  Users: ['id', 'username', 'password_hash', 'nama', 'role', 'aktif']
};

// ---------------------------------------------------------------- antrean tulis

let writeChain = Promise.resolve();

/** Jalankan fn secara berantai; hanya satu operasi tulis yang berjalan pada satu waktu. */
function withWrite(fn) {
  const run = writeChain.then(() => fn());
  writeChain = run.catch(() => {}); // kegagalan tidak merusak antrean berikutnya
  return run;
}

// ---------------------------------------------------------------- util file

function ensureDirs() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.BACKUP_DIR, { recursive: true });
}

function dbExists() {
  return fs.existsSync(config.DB_FILE);
}

/** Salin file database ke folder backup dengan stempel waktu. */
function backup() {
  if (!dbExists()) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(config.BACKUP_DIR, `backup-${stamp}.xlsx`);
  fs.copyFileSync(config.DB_FILE, target);
  // Batasi jumlah backup agar folder tidak membesar tanpa batas.
  const files = fs.readdirSync(config.BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.xlsx'))
    .sort();
  while (files.length > 30) {
    const oldest = files.shift();
    try { fs.unlinkSync(path.join(config.BACKUP_DIR, oldest)); } catch { /* abaikan */ }
  }
  return target;
}

/** Baca workbook utama. Jika belum ada, buat dulu. */
function readWorkbook() {
  if (!dbExists()) {
    createEmptyDb();
  }
  try {
    return XLSX.readFile(config.DB_FILE, { type: 'file', cellDates: false, raw: false });
  } catch (err) {
    throw new AppError(
      'Gagal membaca file database Excel. Pastikan file tidak sedang dibuka/dikunci oleh aplikasi lain (mis. Excel). Detail: ' + err.message,
      500
    );
  }
}

/** Ganti file database secara atomik: tulis ke .tmp lalu rename. */
function atomicWrite(workbook) {
  const tmp = config.DB_FILE + '.tmp';
  XLSX.writeFile(workbook, tmp, { bookType: 'xlsx' });
  try {
    fs.renameSync(tmp, config.DB_FILE);
  } catch {
    // Fallback untuk Windows yang kadang menolak rename menimpa file yang ada.
    fs.copyFileSync(tmp, config.DB_FILE);
    try { fs.unlinkSync(tmp); } catch { /* abaikan */ }
  }
}

/** Buat workbook kosong berisi semua sheet dengan header lengkap. */
function createEmptyDb() {
  const wb = XLSX.utils.book_new();
  for (const [name, cols] of Object.entries(SHEET_DEFS)) {
    const ws = XLSX.utils.aoa_to_sheet([cols]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  ensureDirs();
  atomicWrite(wb);
  return wb;
}

/**
 * Pastikan semua sheet & header ada di workbook, tanpa menyentuh data lain.
 * Mengembalikan workbook yang sudah rapi.
 */
function ensureStructure(wb) {
  for (const [name, cols] of Object.entries(SHEET_DEFS)) {
    let ws = wb.Sheets[name];
    if (!ws) {
      ws = XLSX.utils.aoa_to_sheet([cols]);
      XLSX.utils.book_append_sheet(wb, ws, name);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
    const rebuilt = XLSX.utils.aoa_to_sheet([cols]);
    for (const row of rows) {
      const out = cols.map((c) => (row[c] === undefined ? null : row[c]));
      XLSX.utils.sheet_add_aoa(rebuilt, [out], { origin: -1 });
    }
    wb.Sheets[name] = rebuilt;
  }
  return wb;
}

// ---------------------------------------------------------------- baca data

/** Ambil seluruh baris sebuah sheet sebagai array objek (selalu array, minimal []). */
function getRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  return Array.isArray(rows) ? rows : [];
}

/** Baca seluruh database sebagai objek berisi array per sheet. */
function readAll() {
  const wb = readWorkbook();
  const out = {};
  for (const name of Object.keys(SHEET_DEFS)) {
    out[name] = getRows(wb, name);
  }
  return out;
}

// ---------------------------------------------------------------- tulis data

/**
 * Terapkan mutasi pada database dan simpan dengan aman.
 * `mutator(data, wb)` menerima objek berisi semua sheet (array) dan workbook.
 * Apa pun yang dikembalikan mutator menjadi nilai hasil operasi.
 *
 * Karena Excel bukan database transaksional, kami:
 * 1) validasi semua data terlebih dahulu di mutator (lempar AppError bila gagal),
 * 2) membuat backup sebelum menimpa,
 * 3) menulis secara atomik.
 */
function commit(mutator) {
  return withWrite(() => {
    const wb = ensureStructure(readWorkbook());
    const data = {};
    for (const name of Object.keys(SHEET_DEFS)) {
      data[name] = getRows(wb, name);
    }

    const result = mutator(data, wb);

    // Susun ulang workbook: sheet yang sudah ada ditulis ulang dari data terbaru,
    // sheet lain yang tidak dikenal tetap dipertahankan.
    for (const name of Object.keys(SHEET_DEFS)) {
      const cols = SHEET_DEFS[name];
      const ws = XLSX.utils.aoa_to_sheet([cols]);
      for (const row of data[name]) {
        const out = cols.map((c) => (row[c] === undefined || row[c] === null ? null : row[c]));
        XLSX.utils.sheet_add_aoa(ws, [out], { origin: -1 });
      }
      wb.Sheets[name] = ws;
    }

    backup();
    atomicWrite(wb);
    return result;
  });
}

module.exports = {
  SHEET_DEFS,
  ensureDirs,
  ensureStructure,
  createEmptyDb,
  readAll,
  getRows,
  readWorkbook,
  commit,
  backup,
  dbExists
};
