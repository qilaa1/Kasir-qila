
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { put, list } = require('@vercel/blob');
require('dotenv').config();

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN belum tersedia di environment lokal.'
    );
  }

  const filePath = path.resolve('data/database-usaha.xlsx');

  if (!fs.existsSync(filePath)) {
    throw new Error(`File database tidak ditemukan: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const blobPath = 'database/database-usaha.xlsx';

  // Hentikan proses jika file tujuan sudah ada.
  const existing = await list({
    prefix: blobPath,
    token
  });

  if (existing.blobs.some((b) => b.pathname === blobPath)) {
    throw new Error(
      'File tujuan sudah ada di Blob. Upload dibatalkan agar tidak menimpa data.'
    );
  }

  const result = await put(blobPath, fileBuffer, {
    access: 'private',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    token,
    addRandomSuffix: false
  });

  console.log('Upload selesai.');
  console.log('Lokasi Blob:', result.pathname);
  console.log('URL tersedia:', Boolean(result.url));
  console.log('Ukuran file lokal:', fileBuffer.length, 'byte');
}

main().catch((err) => {
  console.error('Upload gagal:', err.message);
  process.exitCode = 1;
});
