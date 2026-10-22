
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const XLSX = require('xlsx');
const { get, put } = require('@vercel/blob');
const config = require('../config');
const { AppError } = require('../utils/helpers');

const BLOB_PATH = 'database/database-usaha.xlsx';
const EXCEL_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const isVercel = process.env.VERCEL === '1';
let writeChain = Promise.resolve();

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

function withWrite(fn) {
  const run = writeChain.then(fn);
  writeChain = run.catch(() => {});
  return run;
}

function ensureDirs() {
  if (isVercel) return;
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.BACKUP_DIR, { recursive: true });
}

function dbExists() {
  if (isVercel) {
    throw new Error('dbExists() sinkron hanya tersedia untuk database lokal.');
  }
  return fs.existsSync(config.DB_FILE);
}

function createEmptyDb() {
  if (isVercel) {
    throw new Error(
      'Database Blob tidak boleh dibuat otomatis. Periksa database/database-usaha.xlsx.'
    );
  }

  const wb = XLSX.utils.book_new();

  for (const [name, cols] of Object.entries(SHEET_DEFS)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols]), name);
  }

  ensureDirs();
  atomicWrite(wb);
  return wb;
}

function atomicWrite(workbook) {
  ensureDirs();

  const tmp = config.DB_FILE + '.tmp';
  XLSX.writeFile(workbook, tmp, { bookType: 'xlsx' });

  try {
    fs.renameSync(tmp, config.DB_FILE);
  } catch {
    fs.copyFileSync(tmp, config.DB_FILE);
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

async function loadBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Environment BLOB_READ_WRITE_TOKEN belum tersedia.');
  }

  const result = await get(BLOB_PATH, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(
      `Database Blob tidak ditemukan atau tidak dapat dibaca: ${BLOB_PATH}. Database kosong tidak dibuat.`
    );
  }

  const chunks = [];

  for await (const chunk of Readable.fromWeb(result.stream)) {
    chunks.push(Buffer.from(chunk));
  }

  const buffer = Buffer.concat(chunks);
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    raw: false
  });

  return {
    workbook,
    buffer,
    etag: result.blob.etag
  };
}

async function readWorkbook() {
  try {
    if (isVercel) {
      const remote = await loadBlob();
      return remote.workbook;
    }

    ensureDirs();

    if (!fs.existsSync(config.DB_FILE)) {
      createEmptyDb();
    }

    return XLSX.readFile(config.DB_FILE, {
      type: 'file',
      cellDates: false,
      raw: false
    });
  } catch (err) {
    throw new AppError(
      'Gagal membaca database Excel: ' + err.message,
      500
    );
  }
}

function sheetColumns(wb, name) {
  const required = SHEET_DEFS[name];
  const ws = wb.Sheets[name];

  if (!ws) return [...required];

  const headerRows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null
  });

  const existing = (headerRows[0] || [])
    .filter((value) => value !== null && value !== '')
    .map(String);

  // Pertahankan kolom tambahan yang sudah ada.
  return [...new Set([...required, ...existing])];
}

function ensureStructure(wb) {
  for (const name of Object.keys(SHEET_DEFS)) {
    const ws = wb.Sheets[name];

    if (!ws) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([SHEET_DEFS[name]]),
        name
      );
      continue;
    }

    const columns = sheetColumns(wb, name);
    const rows = XLSX.utils.sheet_to_json(ws, {
      defval: null,
      raw: false
    });

    const rebuilt = XLSX.utils.aoa_to_sheet([columns]);

    for (const row of rows) {
      XLSX.utils.sheet_add_aoa(
        rebuilt,
        [columns.map((column) =>
          row[column] === undefined ? null : row[column]
        )],
        { origin: -1 }
      );
    }

    wb.Sheets[name] = rebuilt;
  }

  return wb;
}

function getRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, {
    defval: null,
    raw: false
  });

  return Array.isArray(rows) ? rows : [];
}

async function readAll() {
  const wb = ensureStructure(await readWorkbook());
  const data = {};

  for (const name of Object.keys(SHEET_DEFS)) {
    data[name] = getRows(wb, name);
  }

  return data;
}

function workbookBuffer(workbook) {
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  });
}

async function backupBlob(buffer) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `database/backups/backup-${stamp}.xlsx`;

  // Backup adalah file baru, bukan penimpaan database utama.
  return put(backupPath, buffer, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: EXCEL_TYPE,
    addRandomSuffix: false
  });
}

function backup() {
  if (isVercel) {
    return loadBlob().then(({ buffer }) => backupBlob(buffer));
  }

  ensureDirs();
  if (!fs.existsSync(config.DB_FILE)) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(config.BACKUP_DIR, `backup-${stamp}.xlsx`);

  fs.copyFileSync(config.DB_FILE, target);

  const files = fs.readdirSync(config.BACKUP_DIR)
    .filter((file) => file.startsWith('backup-') && file.endsWith('.xlsx'))
    .sort();

  while (files.length > 30) {
    const oldest = files.shift();
    try {
      fs.unlinkSync(path.join(config.BACKUP_DIR, oldest));
    } catch {}
  }

  return target;
}

async function commit(mutator) {
  return withWrite(async () => {
    let wb;
    let originalBuffer;
    let etag;

    if (isVercel) {
      const remote = await loadBlob();
      wb = remote.workbook;
      originalBuffer = remote.buffer;
      etag = remote.etag;
    } else {
      wb = await readWorkbook();
    }

    ensureStructure(wb);

    const data = {};
    for (const name of Object.keys(SHEET_DEFS)) {
      data[name] = getRows(wb, name);
    }

    const result = mutator(data, wb);

    if (result && typeof result.then === 'function') {
      throw new Error(
        'Mutator commit harus sinkron; jangan gunakan callback async.'
      );
    }

    for (const name of Object.keys(SHEET_DEFS)) {
      const columns = sheetColumns(wb, name);
      const ws = XLSX.utils.aoa_to_sheet([columns]);

      for (const row of data[name]) {
        XLSX.utils.sheet_add_aoa(
          ws,
          [columns.map((column) =>
            row[column] === undefined || row[column] === null
              ? null
              : row[column]
          )],
          { origin: -1 }
        );
      }

      wb.Sheets[name] = ws;
    }

    if (isVercel) {
      // Backup versi sebelumnya sebelum menyimpan perubahan.
      await backupBlob(originalBuffer);

      // Jangan menimpa data yang berubah sejak dibaca.
      await put(BLOB_PATH, workbookBuffer(wb), {
        access: 'private',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: EXCEL_TYPE,
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: etag
      });
    } else {
      backup();
      atomicWrite(wb);
    }

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
