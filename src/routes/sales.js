'use strict';

/**
 * Rute penjualan (kasir).
 * Kontrak:
 * - GET  /api/sales?dari=YYYY-MM-DD&sampai=YYYY-MM-DD -> { success, data: Penjualan[] }
 *      Penjualan = { id, tanggal, total, metode_bayar, catatan, items: [...] }
 * - POST /api/sales { items: [{ product_id, qty }], metode_bayar, catatan }
 *      -> { success, message, data: Penjualan }
 *
 * Backend SELALU menghitung ulang harga & total dari data produk tersimpan,
 * memvalidasi stok terkini, dan menolak transaksi bila stok tidak mencukupi.
 */

const express = require('express');
const db = require('../db/excel');
const { wrap } = require('../middleware/error');
const {
  cleanStr, toInt, toNum, parseId, nextId, formatTanggal,
  requireFields, AppError, uang
} = require('../utils/helpers');

const router = express.Router();

const METODE_BAYAR = ['Tunai', 'QRIS', 'Transfer', 'Debit', 'Lainnya'];

function serializeSale(sale, items) {
  return {
    id: toInt(sale.id),
    tanggal: cleanStr(sale.tanggal),
    total: uang(sale.total),
    metode_bayar: cleanStr(sale.metode_bayar),
    catatan: cleanStr(sale.catatan),
    items: items.map((it) => ({
      id: toInt(it.id),
      product_id: toInt(it.product_id),
      nama_produk: cleanStr(it.nama_produk),
      qty: toInt(it.qty) ?? 0,
      harga_jual: uang(it.harga_jual),
      harga_modal: uang(it.harga_modal),
      subtotal: uang(it.subtotal)
    }))
  };
}

router.get('/', wrap(async (req, res) => {
  const data = db.readAll();
  const dari = cleanStr(req.query.dari, 10);
  const sampai = cleanStr(req.query.sampai, 10);
  const limit = Math.min(Math.max(toInt(req.query.limit) || 200, 1), 1000);

  const sales = (data.Sales || [])
    .filter((s) => {
      const t = cleanStr(s.tanggal).slice(0, 10);
      if (dari && dari.length === 10 && t < dari) return false;
      if (sampai && sampai.length === 10 && t > sampai) return false;
      return true;
    })
    .sort((a, b) => (cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal))) || ((toInt(b.id) || 0) - (toInt(a.id) || 0)))
    .slice(0, limit)
    .map((s) => {
      const items = (data.SaleItems || []).filter((it) => toInt(it.sale_id) === toInt(s.id));
      return serializeSale(s, items);
    });

  res.json({ success: true, data: sales });
}));

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const missing = requireFields(body, ['metode_bayar']);
  if (missing.length) throw new AppError('metode_bayar wajib diisi.', 400, { missing });

  const metode = cleanStr(body.metode_bayar, 30);
  if (!METODE_BAYAR.includes(metode)) {
    throw new AppError(`Metode pembayaran tidak dikenal. Pilihan: ${METODE_BAYAR.join(', ')}.`, 400);
  }
  const catatan = cleanStr(body.catatan, 300);

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new AppError('Daftar item penjualan harus berupa array dan tidak boleh kosong.', 400);
  }
  if (body.items.length > 100) throw new AppError('Maksimal 100 item per transaksi.', 400);

  const sale = await db.commit((data) => {
    // Validasi setiap item terhadap data produk terkini.
    const detail = body.items.map((item, idx) => {
      const productId = parseId(item && item.product_id);
      if (!productId) throw new AppError(`Item ke-${idx + 1}: product_id tidak valid.`, 400);
      const qty = toInt(item.qty);
      if (qty === null || qty <= 0) throw new AppError(`Item ke-${idx + 1}: qty harus bilangan bulat > 0.`, 400);

      const product = (data.Products || []).find((p) => toInt(p.id) === productId);
      if (!product) throw new AppError(`Item ke-${idx + 1}: produk tidak ditemukan.`, 404);
      if (cleanStr(product.kategori).toLowerCase() === 'bahan baku') {
        throw new AppError(
          `Produk "${cleanStr(product.nama)}" termasuk Bahan Baku dan tidak bisa dijual melalui kasir.`,
          400
        );
      }
      if (toInt(product.aktif) === 0) throw new AppError(`Produk "${cleanStr(product.nama)}" sudah nonaktif dan tidak bisa dijual.`, 400);

      const stok = toInt(product.stok) ?? 0;
      if (stok < qty) {
        throw new AppError(`Stok "${cleanStr(product.nama)}" tidak mencukupi (tersisa ${stok}, diminta ${qty}).`, 400);
      }
      return { product, qty, hargaJual: uang(product.harga_jual), hargaModal: uang(product.harga_beli) };
    });

    // Gabungkan item duplikat agar stok tidak dipotong dua kali.
    const merged = new Map();
    for (const d of detail) {
      const cur = merged.get(d.product.id) || { product: d.product, qty: 0, hargaJual: d.hargaJual, hargaModal: d.hargaModal };
      cur.qty += d.qty;
      merged.set(d.product.id, cur);
    }
    for (const m of merged.values()) {
      const stok = toInt(m.product.stok) ?? 0;
      if (stok < m.qty) {
        throw new AppError(`Stok "${cleanStr(m.product.nama)}" tidak mencukupi (tersisa ${stok}, diminta ${m.qty}).`, 400);
      }
    }

    const saleId = nextId(data.Sales);
    const tanggal = formatTanggal();
    let total = 0;
    let itemId = nextId(data.SaleItems);

    for (const m of merged.values()) {
      const subtotal = uang(m.hargaJual * m.qty);
      total = uang(total + subtotal);
      data.SaleItems.push({
        id: itemId++,
        sale_id: saleId,
        product_id: m.product.id,
        nama_produk: cleanStr(m.product.nama),
        qty: m.qty,
        harga_jual: m.hargaJual,
        harga_modal: m.hargaModal,
        subtotal
      });
      m.product.stok = (toInt(m.product.stok) ?? 0) - m.qty;
      data.StockMovements.push({
        id: nextId(data.StockMovements),
        tanggal,
        product_id: m.product.id,
        nama_produk: cleanStr(m.product.nama),
        jenis: 'keluar',
        qty: m.qty,
        alasan: 'Penjualan',
        referensi: `SALE-${saleId}`
      });
    }

    const saleRow = { id: saleId, tanggal, total, metode_bayar: metode, catatan };
    data.Sales.push(saleRow);

    const items = data.SaleItems.filter((it) => toInt(it.sale_id) === saleId);
    return serializeSale(saleRow, items);
  });

  res.status(201).json({ success: true, message: 'Transaksi penjualan tersimpan.', data: sale });
}));

module.exports = router;
