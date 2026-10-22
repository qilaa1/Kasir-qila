'use strict';

/**
 * Rute produk.
 * Kontrak (semua butuh autentikasi):
 * - GET    /api/products                 -> { success, data: Produk[] }
 * - POST   /api/products                 -> { success, message, data: Produk }
 * - PUT    /api/products/:id             -> { success, message, data: Produk }
 * - DELETE /api/products/:id             -> { success, message, data: { mode } }
 * - POST   /api/products/:id/koreksi-stok -> { success, message, data: Produk }
 */

const express = require('express');
const db = require('../db/excel');
const { wrap } = require('../middleware/error');
const {
  cleanStr,
  toInt,
  toNum,
  parseId,
  nextId,
  formatTanggal,
  requireFields,
  AppError,
  uang
} = require('../utils/helpers');

const router = express.Router();

const KATEGORI_DIKENAL = [
  'Es Krim Jadul',
  'Bahan Baku',
  'Santan & Kelapa',
  'Lainnya'
];

const KATEGORI_TANPA_HARGA_JUAL = 'Bahan Baku';
const BATAS_HARGA = 1_000_000_000;
const BATAS_STOK = 100_000_000;

/** Normalisasi record produk menjadi bentuk API. */
function serialize(row) {
  return {
    id: toInt(row.id),
    nama: cleanStr(row.nama),
    kategori: cleanStr(row.kategori),
    satuan: cleanStr(row.satuan),
    harga_beli: uang(row.harga_beli),
    harga_jual: uang(row.harga_jual),
    stok: toInt(row.stok) ?? 0,
    stok_minimum: toInt(row.stok_minimum) ?? 0,
    aktif: toInt(row.aktif) === 1
  };
}

/**
 * Validasi dan normalisasi data produk.
 * Untuk Bahan Baku, harga jual boleh kosong atau 0.
 * Untuk kategori lain, harga jual harus >= harga beli.
 */
function validateProduct(body, { partial = false } = {}) {
  body = body || {};

  if (!partial) {
    const missing = requireFields(body, [
      'nama',
      'kategori',
      'satuan'
    ]);

    if (missing.length) {
      throw new AppError(
        'Field wajib tidak lengkap.',
        400,
        { missing }
      );
    }
  }

  const out = {};

  // Nama produk
  if (body.nama !== undefined || !partial) {
    const nama = cleanStr(body.nama, 120);

    if (!nama) {
      throw new AppError('Nama produk wajib diisi.', 400);
    }

    out.nama = nama;
  }

  // Kategori produk
  if (body.kategori !== undefined || !partial) {
    const kategori = cleanStr(body.kategori, 60);

    if (!kategori) {
      throw new AppError('Kategori produk wajib diisi.', 400);
    }

    if (!KATEGORI_DIKENAL.includes(kategori)) {
      throw new AppError(
        `Kategori tidak dikenal. Pilihan: ${KATEGORI_DIKENAL.join(', ')}.`,
        400
      );
    }

    out.kategori = kategori;
  }

  // Satuan produk
  if (body.satuan !== undefined || !partial) {
    const satuan = cleanStr(body.satuan, 40);

    if (!satuan) {
      throw new AppError('Satuan produk wajib diisi.', 400);
    }

    out.satuan = satuan;
  }

  const kategoriUntukValidasi =
    out.kategori ?? cleanStr(body.kategori, 60);

  // Harga beli dan harga jual
  for (const field of ['harga_beli', 'harga_jual']) {
    const nilai = body[field];

    // Harga jual Bahan Baku boleh kosong.
    if (
      field === 'harga_jual' &&
      kategoriUntukValidasi === KATEGORI_TANPA_HARGA_JUAL &&
      (nilai === undefined || nilai === null || nilai === '')
    ) {
      out.harga_jual = 0;
      continue;
    }

    if (nilai !== undefined || !partial) {
      const n = toNum(nilai);

      if (n === null || n < 0) {
        throw new AppError(
          `${field.replace('_', ' ')} harus berupa angka >= 0.`,
          400
        );
      }

      if (n > BATAS_HARGA) {
        throw new AppError(
          `${field.replace('_', ' ')} terlalu besar.`,
          400
        );
      }

      out[field] = uang(n);
    }
  }

  // Stok dan stok minimum
  for (const field of ['stok', 'stok_minimum']) {
    if (body[field] !== undefined || !partial) {
      const n = toInt(body[field]);

      if (n === null || n < 0) {
        throw new AppError(
          `${field.replace('_', ' ')} harus berupa angka bulat >= 0.`,
          400
        );
      }

      if (n > BATAS_STOK) {
        throw new AppError(
          `${field.replace('_', ' ')} terlalu besar.`,
          400
        );
      }

      out[field] = n;
    }
  }

  // Status aktif
  if (body.aktif !== undefined) {
    out.aktif =
      body.aktif === true ||
      body.aktif === 1 ||
      body.aktif === '1' ||
      body.aktif === 'true'
        ? 1
        : 0;
  }

  // Validasi harga untuk pembuatan produk.
  // Validasi edit dilakukan setelah data lama dan baru digabungkan.
  if (
    !partial &&
    out.kategori !== KATEGORI_TANPA_HARGA_JUAL &&
    out.harga_jual !== undefined &&
    out.harga_beli !== undefined &&
    out.harga_jual < out.harga_beli
  ) {
    throw new AppError(
      'Harga jual tidak boleh lebih kecil dari harga beli.',
      400
    );
  }

  return out;
}

/** Mencari produk berdasarkan ID. */
function findProduct(rows, id) {
  return (rows || []).find((p) => toInt(p.id) === id) || null;
}

/** Mengecek apakah produk digunakan dalam riwayat transaksi. */
function hasHistory(data, id) {
  return (
    (data.SaleItems || []).some(
      (r) => toInt(r.product_id) === id
    ) ||
    (data.PurchaseItems || []).some(
      (r) => toInt(r.product_id) === id
    ) ||
    (data.ProductionItems || []).some(
      (r) => toInt(r.product_id) === id
    ) ||
    (data.ProductionBatches || []).some(
      (r) => toInt(r.produk) === id
    ) ||
    (data.StockMovements || []).some(
      (r) => toInt(r.product_id) === id
    )
  );
}

// ---------------------------------------------------------------
// GET PRODUK
// ---------------------------------------------------------------
router.get('/', wrap(async (req, res) => {
  const data = db.readAll();
  const includeNonaktif =
    String(req.query.include_nonaktif || '') === '1';

  const produk = (data.Products || [])
    .map(serialize)
    .filter((p) => includeNonaktif || p.aktif);

  res.json({
    success: true,
    data: produk
  });
}));

// ---------------------------------------------------------------
// TAMBAH PRODUK
// ---------------------------------------------------------------
router.post('/', wrap(async (req, res) => {
  const fields = validateProduct(req.body);

  const created = await db.commit((data) => {
    const namaDuplikat = (data.Products || []).some(
      (p) =>
        cleanStr(p.nama).toLowerCase() === fields.nama.toLowerCase() &&
        toInt(p.aktif) !== 0
    );

    if (namaDuplikat) {
      throw new AppError(
        'Produk dengan nama tersebut sudah ada.',
        409
      );
    }

    const row = {
      id: nextId(data.Products),
      nama: fields.nama,
      kategori: fields.kategori,
      satuan: fields.satuan,
      harga_beli: fields.harga_beli,
      harga_jual: fields.harga_jual ?? 0,
      stok: fields.stok ?? 0,
      stok_minimum: fields.stok_minimum ?? 0,
      aktif: 1
    };

    data.Products.push(row);

    if (row.stok > 0) {
      data.StockMovements.push({
        id: nextId(data.StockMovements),
        tanggal: formatTanggal(),
        product_id: row.id,
        nama_produk: row.nama,
        jenis: 'masuk',
        qty: row.stok,
        alasan: 'Stok awal produk baru',
        referensi: `PRODUK-${row.id}`
      });
    }

    return serialize(row);
  });

  res.status(201).json({
    success: true,
    message: 'Produk berhasil ditambahkan.',
    data: created
  });
}));

// ---------------------------------------------------------------
// EDIT PRODUK
// ---------------------------------------------------------------
router.put('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    throw new AppError('ID produk tidak valid.', 400);
  }

  // Ambil produk lama agar kategori Bahan Baku tetap dikenali
  // meskipun kategori tidak dikirim oleh form edit.
  const dataAwal = db.readAll();
  const produkLama = findProduct(dataAwal.Products, id);

  if (!produkLama) {
    throw new AppError('Produk tidak ditemukan.', 404);
  }

  const body = { ...(req.body || {}) };

  const kategoriAkhir =
    body.kategori !== undefined
      ? cleanStr(body.kategori, 60)
      : cleanStr(produkLama.kategori, 60);

  // Jika harga jual dikosongkan untuk Bahan Baku,
  // simpan sebagai 0 agar tidak ditolak validasi angka.
  if (
    kategoriAkhir === KATEGORI_TANPA_HARGA_JUAL &&
    (body.harga_jual === '' || body.harga_jual === null)
  ) {
    body.harga_jual = 0;
  }

  const fields = validateProduct(body, { partial: true });

  if (!Object.keys(fields).length) {
    throw new AppError(
      'Tidak ada perubahan yang dikirim.',
      400
    );
  }

  const updated = await db.commit((data) => {
    const row = findProduct(data.Products, id);

    if (!row) {
      throw new AppError('Produk tidak ditemukan.', 404);
    }

    if (
      fields.nama &&
      fields.nama.toLowerCase() !== cleanStr(row.nama).toLowerCase()
    ) {
      const namaDuplikat = (data.Products || []).some(
        (p) =>
          toInt(p.id) !== id &&
          cleanStr(p.nama).toLowerCase() === fields.nama.toLowerCase() &&
          toInt(p.aktif) !== 0
      );

      if (namaDuplikat) {
        throw new AppError(
          'Produk dengan nama tersebut sudah ada.',
          409
        );
      }
    }

    // Hitung nilai akhir dari gabungan data lama dan data baru.
    const kategoriFinal = fields.kategori ?? cleanStr(row.kategori);
    const hargaJualFinal =
      fields.harga_jual !== undefined
        ? fields.harga_jual
        : toNum(row.harga_jual);
    const hargaBeliFinal =
      fields.harga_beli !== undefined
        ? fields.harga_beli
        : toNum(row.harga_beli);

    // Hanya Bahan Baku yang dibebaskan dari aturan harga jual.
    if (
      kategoriFinal !== KATEGORI_TANPA_HARGA_JUAL &&
      hargaJualFinal !== null &&
      hargaJualFinal !== undefined &&
      hargaBeliFinal !== null &&
      hargaBeliFinal !== undefined &&
      hargaJualFinal < hargaBeliFinal
    ) {
      throw new AppError(
        'Harga jual tidak boleh lebih kecil dari harga beli.',
        400
      );
    }

    Object.assign(row, fields);

    // Pastikan harga jual Bahan Baku yang kosong tersimpan sebagai 0.
    if (
      cleanStr(row.kategori) === KATEGORI_TANPA_HARGA_JUAL &&
      (row.harga_jual === undefined ||
        row.harga_jual === null ||
        row.harga_jual === '')
    ) {
      row.harga_jual = 0;
    }

    return serialize(row);
  });

  res.json({
    success: true,
    message: 'Produk berhasil diperbarui.',
    data: updated
  });
}));

// ---------------------------------------------------------------
// HAPUS / NONAKTIFKAN PRODUK
// ---------------------------------------------------------------
router.delete('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    throw new AppError('ID produk tidak valid.', 400);
  }

  const result = await db.commit((data) => {
    const row = findProduct(data.Products, id);

    if (!row) {
      throw new AppError('Produk tidak ditemukan.', 404);
    }

    if (hasHistory(data, id)) {
      row.aktif = 0;

      return {
        mode: 'nonaktif',
        data: serialize(row)
      };
    }

    data.Products = (data.Products || []).filter(
      (p) => toInt(p.id) !== id
    );

    data.StockMovements = (data.StockMovements || []).filter(
      (m) => toInt(m.product_id) !== id
    );

    return {
      mode: 'hapus',
      data: null
    };
  });

  if (result.mode === 'nonaktif') {
    res.json({
      success: true,
      message:
        'Produk memiliki riwayat transaksi sehingga dinonaktifkan. Riwayat tetap tersimpan.',
      data: result.data
    });
  } else {
    res.json({
      success: true,
      message:
        'Produk berhasil dihapus permanen karena belum memiliki riwayat transaksi.',
      data: result.data
    });
  }
}));

// ---------------------------------------------------------------
// KOREKSI STOK
// ---------------------------------------------------------------
router.post('/:id/koreksi-stok', wrap(async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    throw new AppError('ID produk tidak valid.', 400);
  }

  const body = req.body || {};
  const stokBaru = toInt(body.stok_baru);
  const alasan = cleanStr(body.alasan, 200);

  if (stokBaru === null || stokBaru < 0) {
    throw new AppError(
      'stok_baru harus berupa angka bulat >= 0.',
      400
    );
  }

  if (!alasan) {
    throw new AppError('Alasan koreksi stok wajib diisi.', 400);
  }

  const result = await db.commit((data) => {
    const row = findProduct(data.Products, id);

    if (!row) {
      throw new AppError('Produk tidak ditemukan.', 404);
    }

    const stokLama = toInt(row.stok) ?? 0;
    const delta = stokBaru - stokLama;

    if (delta === 0) {
      throw new AppError(
        'Stok baru sama dengan stok saat ini — tidak ada perubahan.',
        400
      );
    }

    row.stok = stokBaru;

    data.StockMovements.push({
      id: nextId(data.StockMovements),
      tanggal: formatTanggal(),
      product_id: id,
      nama_produk: cleanStr(row.nama),
      jenis: 'penyesuaian',
      qty: Math.abs(delta),
      alasan: `${alasan} (stok ${stokLama} → ${stokBaru})`,
      referensi: cleanStr(body.referensi, 60) || `KOREKSI-${id}`
    });

    return {
      product: serialize(row),
      delta
    };
  });

  res.json({
    success: true,
    message: `Stok diperbarui (perubahan ${result.delta > 0 ? '+' : ''}${result.delta}).`,
    data: result.product
  });
}));

module.exports = router;
module.exports.serializeProduct = serialize;