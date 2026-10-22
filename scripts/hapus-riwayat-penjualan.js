'use strict';

require('dotenv').config({ path: '.env.local' });

process.env.VERCEL = '1';

const { get, put } = require('@vercel/blob');
const { Readable } = require('node:stream');
const XLSX = require('xlsx');

const DB_PATH = 'database/database-usaha.xlsx';
const BACKUP_PATH =
  `database/backups/sebelum-hapus-${Date.now()}.xlsx`;

const EXCEL_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function downloadDatabase() {
  const result = await get(DB_PATH, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  if (!result?.stream || result.statusCode !== 200) {
    throw new Error('Database Blob gagal dibaca.');
  }

  const chunks = [];

  for await (const chunk of Readable.fromWeb(result.stream)) {
    chunks.push(Buffer.from(chunk));
  }

  return {
    buffer: Buffer.concat(chunks),
    etag: result.blob?.etag
  };
}

function countRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) return 0;

  return XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false
  }).length;
}

async function main() {
  if (process.argv[2] !== '--hapus-semua-riwayat') {
    throw new Error(
      'Jalankan dengan --hapus-semua-riwayat'
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Token Blob tidak ditemukan.');
  }

  const { buffer, etag } = await downloadDatabase();

  if (!etag) {
    throw new Error('ETag tidak tersedia. Penghapusan dibatalkan.');
  }

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false
  });

  const salesBefore = countRows(workbook, 'Sales');
  const itemsBefore = countRows(workbook, 'SaleItems');
  const productsBefore = countRows(workbook, 'Products');

  console.log('Transaksi:', salesBefore);
  console.log('Detail penjualan:', itemsBefore);
  console.log('Produk:', productsBefore);

  if (salesBefore === 0 && itemsBefore === 0) {
    console.log('Riwayat penjualan sudah kosong.');
    return;
  }

  // Simpan backup database utuh sebelum perubahan.
  await put(BACKUP_PATH, buffer, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: EXCEL_TYPE,
    addRandomSuffix: false
  });

  // Kosongkan hanya dua sheet penjualan.
  for (const name of ['Sales', 'SaleItems']) {
    if (!workbook.Sheets[name]) {
      throw new Error(`Sheet ${name} tidak ditemukan.`);
    }

    const rows = XLSX.utils.sheet_to_json(
      workbook.Sheets[name],
      { header: 1, defval: null }
    );

    const headers = rows[0] || [];

    workbook.Sheets[name] = XLSX.utils.aoa_to_sheet([headers]);
  }

  const updatedBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  });

  // Jangan menimpa jika database berubah sejak dibaca.
  const saved = await put(DB_PATH, updatedBuffer, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: EXCEL_TYPE,
    addRandomSuffix: false,
    allowOverwrite: true,
    ifMatch: etag
  });

  console.log('Blob penulisan:', saved.pathname);
  console.log('Backup:', BACKUP_PATH);

  // Verifikasi memakai URL versi yang baru ditulis,
  // bukan sekadar membaca pathname lama.
  const verify = await get(saved.url, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  if (!verify?.stream || verify.statusCode !== 200) {
    throw new Error(
      'Penulisan selesai, tetapi verifikasi Blob gagal. Jangan ulangi penghapusan.'
    );
  }

  const verifyChunks = [];

  for await (const chunk of Readable.fromWeb(verify.stream)) {
    verifyChunks.push(Buffer.from(chunk));
  }

  const checked = XLSX.read(Buffer.concat(verifyChunks), {
    type: 'buffer',
    cellDates: false
  });

  const salesAfter = countRows(checked, 'Sales');
  const itemsAfter = countRows(checked, 'SaleItems');
  const productsAfter = countRows(checked, 'Products');

  console.log('Sisa transaksi:', salesAfter);
  console.log('Sisa detail penjualan:', itemsAfter);
  console.log('Jumlah produk sesudah:', productsAfter);

  if (
    salesAfter !== 0 ||
    itemsAfter !== 0 ||
    productsAfter !== productsBefore
  ) {
    throw new Error(
      'Verifikasi gagal. Jangan ulangi penghapusan; periksa Blob dan backup.'
    );
  }

  console.log('BERHASIL: riwayat penjualan telah kosong.');
}

main().catch((error) => {
  console.error('GAGAL:', error.message);
  process.exitCode = 1;
});