'use strict';

/**
 * Rute pengeluaran usaha.
 * Kontrak:
 * - GET  /api/expenses?dari=&sampai= -> { success, data: Pengeluaran[] }
 * - POST /api/expenses
 *      { tanggal?, kategori_usaha, kategori, deskripsi, jumlah, metode_bayar }
 *      -> { success, message, data: Pengeluaran }
 */

const express = require('express');
const db = require('../db/excel');
const { wrap } = require('../middleware/error');
const {
  cleanStr, toInt, toNum, nextId, formatTanggal, formatTanggalPendek,
  requireFields, AppError, uang
} = require('../utils/helpers');

const router = express.Router();

const KATEGORI_USAHA = ['Es Krim Jadul', 'Santan & Kelapa', 'Umum'];
const KATEGORI = ['Bahan baku', 'Operasional', 'Gaji', 'Sewa', 'Listrik & Air', 'Lainnya'];
const METODE_BAYAR = ['Tunai', 'Transfer', 'QRIS', 'Lainnya'];

function serialize(e) {
  return {
    id: toInt(e.id),
    tanggal: cleanStr(e.tanggal),
    kategori_usaha: cleanStr(e.kategori_usaha),
    kategori: cleanStr(e.kategori),
    deskripsi: cleanStr(e.deskripsi),
    jumlah: uang(e.jumlah),
    metode_bayar: cleanStr(e.metode_bayar)
  };
}

router.get('/', wrap(async (req, res) => {
  const data = db.readAll();
  const dari = cleanStr(req.query.dari, 10);
  const sampai = cleanStr(req.query.sampai, 10);
  const limit = Math.min(Math.max(toInt(req.query.limit) || 500, 1), 2000);

  const expenses = (data.Expenses || [])
    .filter((e) => {
      const t = cleanStr(e.tanggal).slice(0, 10);
      if (dari && dari.length === 10 && t < dari) return false;
      if (sampai && sampai.length === 10 && t > sampai) return false;
      return true;
    })
    .sort((a, b) => cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal)) || ((toInt(b.id) || 0) - (toInt(a.id) || 0)))
    .slice(0, limit)
    .map(serialize);

  res.json({ success: true, data: expenses });
}));

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const missing = requireFields(body, ['kategori_usaha', 'kategori', 'deskripsi', 'jumlah', 'metode_bayar']);
  if (missing.length) throw new AppError('Beberapa field wajib belum diisi.', 400, { missing });

  const kategoriUsaha = cleanStr(body.kategori_usaha, 60);
  if (!KATEGORI_USAHA.includes(kategoriUsaha)) {
    throw new AppError(`kategori_usaha tidak dikenal. Pilihan: ${KATEGORI_USAHA.join(', ')}.`, 400);
  }
  const kategori = cleanStr(body.kategori, 60);
  if (!KATEGORI.includes(kategori)) {
    throw new AppError(`kategori tidak dikenal. Pilihan: ${KATEGORI.join(', ')}.`, 400);
  }
  const metode = cleanStr(body.metode_bayar, 30);
  if (!METODE_BAYAR.includes(metode)) {
    throw new AppError(`metode_bayar tidak dikenal. Pilihan: ${METODE_BAYAR.join(', ')}.`, 400);
  }
  const deskripsi = cleanStr(body.deskripsi, 300);
  if (deskripsi.length < 3) throw new AppError('Deskripsi pengeluaran minimal 3 karakter.', 400);

  const jumlah = toNum(body.jumlah);
  if (jumlah === null || jumlah <= 0) throw new AppError('Jumlah pengeluaran harus angka > 0.', 400);
  if (jumlah > 10_000_000_000) throw new AppError('Jumlah pengeluaran terlalu besar.', 400);

  let tanggal = cleanStr(body.tanggal, 10);
  if (tanggal) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new AppError('Format tanggal harus YYYY-MM-DD.', 400);
  } else {
    tanggal = formatTanggalPendek();
  }

  const created = await db.commit((data) => {
    const row = {
      id: nextId(data.Expenses),
      tanggal: `${tanggal}${formatTanggal().slice(10)}`,
      kategori_usaha: kategoriUsaha,
      kategori,
      deskripsi,
      jumlah: uang(jumlah),
      metode_bayar: metode
    };
    data.Expenses.push(row);
    return serialize(row);
  });

  res.status(201).json({ success: true, message: 'Pengeluaran tersimpan.', data: created });
}));

module.exports = router;
module.exports.KATEGORI_USAHA = KATEGORI_USAHA;
module.exports.KATEGORI = KATEGORI;
module.exports.METODE_BAYAR = METODE_BAYAR;
