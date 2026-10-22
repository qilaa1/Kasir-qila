'use strict';

/**
 * Rute produksi es krim jadul.
 * Kontrak:
 * - GET  /api/production?dari=&sampai= -> { success, data: Batch[] }
 *      Batch = { id, tanggal, produk, nama_produk, jumlah_hasil, biaya_total, catatan, bahan: [...] }
 * - POST /api/production
 *      { tanggal?, produk, jumlah_hasil, bahan: [{ product_id, qty }], catatan }
 *      -> { success, message, data: Batch }
 *
 * Stok bahan dikurangi, stok produk jadi ditambah, semua dicatat di StockMovements.
 * Bila stok bahan tidak mencukupi, seluruh operasi dibatalkan (tidak ada perubahan parsial).
 */

const express = require('express');
const db = require('../db/excel');
const { wrap } = require('../middleware/error');
const {
  cleanStr, toInt, parseId, nextId, formatTanggal, formatTanggalPendek,
  AppError, uang
} = require('../utils/helpers');

const router = express.Router();

function serializeBatch(b, items) {
  return {
    id: toInt(b.id),
    tanggal: cleanStr(b.tanggal),
    produk: toInt(b.produk),
    nama_produk: cleanStr(b.nama_produk),
    jumlah_hasil: toInt(b.jumlah_hasil) ?? 0,
    biaya_total: uang(b.biaya_total),
    catatan: cleanStr(b.catatan),
    bahan: items.map((it) => ({
      id: toInt(it.id),
      product_id: toInt(it.product_id),
      nama_produk: cleanStr(it.nama_produk),
      qty: toInt(it.qty) ?? 0,
      harga_beli: uang(it.harga_beli),
      subtotal: uang(it.subtotal)
    }))
  };
}

router.get('/', wrap(async (req, res) => {
  const data = await db.readAll();
  const dari = cleanStr(req.query.dari, 10);
  const sampai = cleanStr(req.query.sampai, 10);
  const limit = Math.min(Math.max(toInt(req.query.limit) || 200, 1), 1000);

  const batches = (data.ProductionBatches || [])
    .filter((b) => {
      const t = cleanStr(b.tanggal).slice(0, 10);
      if (dari && dari.length === 10 && t < dari) return false;
      if (sampai && sampai.length === 10 && t > sampai) return false;
      return true;
    })
    .sort((a, b) => cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal)) || ((toInt(b.id) || 0) - (toInt(a.id) || 0)))
    .slice(0, limit)
    .map((b) => {
      const items = (data.ProductionItems || []).filter((it) => toInt(it.batch_id) === toInt(b.id));
      return serializeBatch(b, items);
    });

  res.json({ success: true, data: batches });
}));

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const produkId = parseId(body.produk);
  if (!produkId) throw new AppError('produk (ID produk jadi) wajib diisi dan valid.', 400);

  const jumlahHasil = toInt(body.jumlah_hasil);
  if (jumlahHasil === null || jumlahHasil <= 0) throw new AppError('jumlah_hasil harus bilangan bulat > 0.', 400);

  if (!Array.isArray(body.bahan) || body.bahan.length === 0) {
    throw new AppError('Daftar bahan harus berupa array dan tidak boleh kosong.', 400);
  }

  let tanggal = cleanStr(body.tanggal, 10);
  if (tanggal) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new AppError('Format tanggal harus YYYY-MM-DD.', 400);
  } else {
    tanggal = formatTanggalPendek();
  }
  const catatan = cleanStr(body.catatan, 300);

  const result = await db.commit((data) => {
    const produkJadi = (data.Products || []).find((p) => toInt(p.id) === produkId);
    if (!produkJadi) throw new AppError('Produk jadi tidak ditemukan.', 404);
    if (toInt(produkJadi.aktif) === 0) throw new AppError(`Produk "${cleanStr(produkJadi.nama)}" nonaktif.`, 400);

    // Validasi seluruh bahan terlebih dahulu.
    const detail = body.bahan.map((item, idx) => {
      const productId = parseId(item && item.product_id);
      if (!productId) throw new AppError(`Bahan ke-${idx + 1}: product_id tidak valid.`, 400);
      if (productId === produkId) throw new AppError(`Bahan ke-${idx + 1}: tidak boleh sama dengan produk jadi.`, 400);
      const qty = toInt(item.qty);
      if (qty === null || qty <= 0) throw new AppError(`Bahan ke-${idx + 1}: qty harus bilangan bulat > 0.`, 400);

      const bahan = (data.Products || []).find((p) => toInt(p.id) === productId);
      if (!bahan) throw new AppError(`Bahan ke-${idx + 1}: produk tidak ditemukan.`, 404);
      if (toInt(bahan.aktif) === 0) throw new AppError(`Bahan "${cleanStr(bahan.nama)}" nonaktif.`, 400);
      const stok = toInt(bahan.stok) ?? 0;
      if (stok < qty) {
        throw new AppError(`Stok bahan "${cleanStr(bahan.nama)}" tidak mencukupi (tersisa ${stok}, dibutuhkan ${qty}).`, 400);
      }
      return { bahan, qty, hargaBeli: uang(bahan.harga_beli) };
    });

    const merged = new Map();
    for (const d of detail) {
      const cur = merged.get(d.bahan.id) || { bahan: d.bahan, qty: 0, hargaBeli: d.hargaBeli };
      cur.qty += d.qty;
      merged.set(d.bahan.id, cur);
    }
    for (const m of merged.values()) {
      const stok = toInt(m.bahan.stok) ?? 0;
      if (stok < m.qty) {
        throw new AppError(`Stok bahan "${cleanStr(m.bahan.nama)}" tidak mencukupi (tersisa ${stok}, dibutuhkan ${m.qty}).`, 400);
      }
    }

    const batchId = nextId(data.ProductionBatches);
    const tanggalLengkap = `${tanggal}${formatTanggal().slice(10)}`;
    let biayaTotal = 0;
    let itemId = nextId(data.ProductionItems);

    for (const m of merged.values()) {
      const subtotal = uang(m.hargaBeli * m.qty);
      biayaTotal = uang(biayaTotal + subtotal);
      data.ProductionItems.push({
        id: itemId++,
        batch_id: batchId,
        product_id: m.bahan.id,
        nama_produk: cleanStr(m.bahan.nama),
        qty: m.qty,
        harga_beli: m.hargaBeli,
        subtotal
      });
      m.bahan.stok = (toInt(m.bahan.stok) ?? 0) - m.qty;
      data.StockMovements.push({
        id: nextId(data.StockMovements),
        tanggal: tanggalLengkap,
        product_id: m.bahan.id,
        nama_produk: cleanStr(m.bahan.nama),
        jenis: 'keluar',
        qty: m.qty,
        alasan: `Bahan produksi batch #${batchId}`,
        referensi: `PRODUCTION-${batchId}`
      });
    }

    produkJadi.stok = (toInt(produkJadi.stok) ?? 0) + jumlahHasil;
    data.StockMovements.push({
      id: nextId(data.StockMovements),
      tanggal: tanggalLengkap,
      product_id: produkJadi.id,
      nama_produk: cleanStr(produkJadi.nama),
      jenis: 'masuk',
      qty: jumlahHasil,
      alasan: `Hasil produksi batch #${batchId}`,
      referensi: `PRODUCTION-${batchId}`
    });

    const batchRow = {
      id: batchId,
      tanggal: tanggalLengkap,
      produk: produkJadi.id,
      nama_produk: cleanStr(produkJadi.nama),
      jumlah_hasil: jumlahHasil,
      biaya_total: biayaTotal,
      catatan
    };
    data.ProductionBatches.push(batchRow);

    const items = data.ProductionItems.filter((it) => toInt(it.batch_id) === batchId);
    return serializeBatch(batchRow, items);
  });

  res.status(201).json({ success: true, message: 'Batch produksi tersimpan. Stok bahan berkurang dan stok produk jadi bertambah.', data: result });
}));

module.exports = router;
