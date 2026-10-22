'use strict';

/**
 * Rute pembelian barang.
 * Kontrak:
 * - GET  /api/purchases?dari=&sampai= -> { success, data: Pembelian[] }
 * - POST /api/purchases
 *      { tanggal?, pemasok, items: [{ product_id, qty, harga_beli? }], metode_bayar, catatan }
 *      -> { success, message, data: Pembelian }
 * harga_beli per item bersifat opsional (harga beli dapat berfluktuasi);
 * jika tidak diisi, digunakan harga beli produk saat ini. Total dihitung ulang oleh backend.
 */

const express = require('express');
const db = require('../db/excel');
const { wrap } = require('../middleware/error');
const {
  cleanStr, toInt, toNum, parseId, nextId, formatTanggal, formatTanggalPendek,
  requireFields, AppError, uang
} = require('../utils/helpers');

const router = express.Router();

const METODE_BAYAR = ['Tunai', 'Transfer', 'QRIS', 'Utang', 'Lainnya'];

function serializePurchase(p, items) {
  return {
    id: toInt(p.id),
    tanggal: cleanStr(p.tanggal),
    pemasok: cleanStr(p.pemasok),
    total: uang(p.total),
    metode_bayar: cleanStr(p.metode_bayar),
    catatan: cleanStr(p.catatan),
    items: items.map((it) => ({
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

  const purchases = (data.Purchases || [])
    .filter((p) => {
      const t = cleanStr(p.tanggal).slice(0, 10);
      if (dari && dari.length === 10 && t < dari) return false;
      if (sampai && sampai.length === 10 && t > sampai) return false;
      return true;
    })
    .sort((a, b) => cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal)) || ((toInt(b.id) || 0) - (toInt(a.id) || 0)))
    .slice(0, limit)
    .map((p) => {
      const items = (data.PurchaseItems || []).filter((it) => toInt(it.purchase_id) === toInt(p.id));
      return serializePurchase(p, items);
    });

  res.json({ success: true, data: purchases });
}));

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const missing = requireFields(body, ['pemasok', 'metode_bayar']);
  if (missing.length) throw new AppError('pemasok dan metode_bayar wajib diisi.', 400, { missing });

  const pemasok = cleanStr(body.pemasok, 120);
  const metode = cleanStr(body.metode_bayar, 30);
  if (!METODE_BAYAR.includes(metode)) {
    throw new AppError(`Metode pembayaran tidak dikenal. Pilihan: ${METODE_BAYAR.join(', ')}.`, 400);
  }
  const catatan = cleanStr(body.catatan, 300);

  let tanggal = cleanStr(body.tanggal, 10);
  if (tanggal) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new AppError('Format tanggal harus YYYY-MM-DD.', 400);
  } else {
    tanggal = formatTanggalPendek();
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new AppError('Daftar item pembelian harus berupa array dan tidak boleh kosong.', 400);
  }
  if (body.items.length > 100) throw new AppError('Maksimal 100 item per pembelian.', 400);

  const result = await db.commit((data) => {
    const detail = body.items.map((item, idx) => {
      const productId = parseId(item && item.product_id);
      if (!productId) throw new AppError(`Item ke-${idx + 1}: product_id tidak valid.`, 400);
      const qty = toInt(item.qty);
      if (qty === null || qty <= 0) throw new AppError(`Item ke-${idx + 1}: qty harus bilangan bulat > 0.`, 400);

      const product = (data.Products || []).find((p) => toInt(p.id) === productId);
      if (!product) throw new AppError(`Item ke-${idx + 1}: produk tidak ditemukan.`, 404);

      let hargaBeli;
      if (item.harga_beli !== undefined && item.harga_beli !== null && item.harga_beli !== '') {
        hargaBeli = toNum(item.harga_beli);
        if (hargaBeli === null || hargaBeli < 0) throw new AppError(`Item ke-${idx + 1}: harga_beli tidak valid.`, 400);
        hargaBeli = uang(hargaBeli);
      } else {
        hargaBeli = uang(product.harga_beli);
      }
      return { product, qty, hargaBeli };
    });

    const merged = new Map();
    for (const d of detail) {
      const cur = merged.get(d.product.id) || { product: d.product, qty: 0, hargaBeli: d.hargaBeli };
      cur.qty += d.qty;
      merged.set(d.product.id, cur);
    }

    const purchaseId = nextId(data.Purchases);
    const jamSekarang = formatTanggal().slice(10); // ' HH:mm:ss'
    const tanggalLengkap = `${tanggal}${jamSekarang}`;
    let total = 0;
    let itemId = nextId(data.PurchaseItems);

    for (const m of merged.values()) {
      const subtotal = uang(m.hargaBeli * m.qty);
      total = uang(total + subtotal);
      data.PurchaseItems.push({
        id: itemId++,
        purchase_id: purchaseId,
        product_id: m.product.id,
        nama_produk: cleanStr(m.product.nama),
        qty: m.qty,
        harga_beli: m.hargaBeli,
        subtotal
      });
      m.product.stok = (toInt(m.product.stok) ?? 0) + m.qty;
      data.StockMovements.push({
        id: nextId(data.StockMovements),
        tanggal: tanggalLengkap,
        product_id: m.product.id,
        nama_produk: cleanStr(m.product.nama),
        jenis: 'masuk',
        qty: m.qty,
        alasan: `Pembelian dari ${pemasok}`,
        referensi: `PURCHASE-${purchaseId}`
      });
    }

    const purchaseRow = {
      id: purchaseId,
      tanggal: tanggalLengkap,
      pemasok,
      total,
      metode_bayar: metode,
      catatan
    };
    data.Purchases.push(purchaseRow);

    const items = data.PurchaseItems.filter((it) => toInt(it.purchase_id) === purchaseId);
    return serializePurchase(purchaseRow, items);
  });

  res.status(201).json({ success: true, message: 'Pembelian tersimpan dan stok bertambah.', data: result });
}));

module.exports = router;
