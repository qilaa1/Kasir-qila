'use strict';

/**
 * Rute ringkasan (dashboard) dan laporan.
 * Kontrak:
 * - GET /api/summary?dari=&sampai=  -> { success, data: { periode, penjualan, pengeluaran, pembelian, produksi, produk, stok_rendah, transaksi_terbaru } }
 * - GET /api/reports?jenis=...&dari=&sampai= -> { success, data: {...} }
 *      jenis: 'penjualan' | 'pembelian' | 'pengeluaran' | 'stok' | 'produksi'
 * - GET /api/meta -> { success, data: { kategori_produk, metode_bayar, ... } } (pilihan form frontend)
 */

const express = require('express');
const db = require('../db/excel');
const { wrap } = require('../middleware/error');
const { cleanStr, toInt, toNum, hariIni, AppError, uang } = require('../utils/helpers');

const router = express.Router();

function periode(req) {
  const dari = cleanStr(req.query.dari, 10) || hariIni();
  const sampai = cleanStr(req.query.sampai, 10) || hariIni();
  for (const t of [dari, sampai]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new AppError('Format filter tanggal harus YYYY-MM-DD.', 400);
  }
  if (dari > sampai) throw new AppError('Tanggal mulai tidak boleh setelah tanggal akhir.', 400);
  return { dari, sampai };
}

function inRange(tanggalStr, dari, sampai) {
  const t = cleanStr(tanggalStr).slice(0, 10);
  return t >= dari && t <= sampai;
}

function hitung(data, { dari, sampai }) {
  const sales = (data.Sales || []).filter((s) => inRange(s.tanggal, dari, sampai));
  const saleItems = (data.SaleItems || []).filter((it) => sales.some((s) => toInt(s.id) === toInt(it.sale_id)));
  const purchases = (data.Purchases || []).filter((p) => inRange(p.tanggal, dari, sampai));
  const expenses = (data.Expenses || []).filter((e) => inRange(e.tanggal, dari, sampai) && toNum(e.jumlah) !== null && toNum(e.jumlah) > 0);
  const batches = (data.ProductionBatches || []).filter((b) => inRange(b.tanggal, dari, sampai));
  const products = data.Products || [];
  const aktif = products.filter((p) => toInt(p.aktif) === 1);

  const totalPenjualan = uang(sales.reduce((a, s) => a + (uang(s.total) || 0), 0));
  const totalModal = uang(saleItems.reduce((a, it) => a + uang(it.harga_modal) * (toInt(it.qty) || 0), 0));
  const totalPengeluaran = uang(expenses.reduce((a, e) => a + (uang(e.jumlah) || 0), 0));
  const totalPembelian = uang(purchases.reduce((a, p) => a + (uang(p.total) || 0), 0));
  const totalBiayaProduksi = uang(batches.reduce((a, b) => a + (uang(b.biaya_total) || 0), 0));
  const totalHasilProduksi = batches.reduce((a, b) => a + (toInt(b.jumlah_hasil) || 0), 0);

  const stokRendah = aktif
    .filter((p) => (toInt(p.stok) ?? 0) <= (toInt(p.stok_minimum) ?? 0))
    .map((p) => ({
      id: toInt(p.id),
      nama: cleanStr(p.nama),
      kategori: cleanStr(p.kategori),
      stok: toInt(p.stok) ?? 0,
      stok_minimum: toInt(p.stok_minimum) ?? 0,
      satuan: cleanStr(p.satuan)
    }))
    .sort((a, b) => a.stok - b.stok);

  const transaksiTerbaru = [...sales]
    .sort((a, b) => cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal)) || ((toInt(b.id) || 0) - (toInt(a.id) || 0)))
    .slice(0, 8)
    .map((s) => ({
      id: toInt(s.id),
      tanggal: cleanStr(s.tanggal),
      total: uang(s.total),
      metode_bayar: cleanStr(s.metode_bayar),
      jumlah_item: (data.SaleItems || []).filter((it) => toInt(it.sale_id) === toInt(s.id)).reduce((a, it) => a + (toInt(it.qty) || 0), 0)
    }));

  return {
    periode: { dari, sampai },
    penjualan: {
      definisi: 'Seluruh transaksi penjualan tercatat pada periode berdasarkan kolom total.',
      jumlah_transaksi: sales.length,
      total: totalPenjualan,
      laba_kotor_perkiraan: uang(totalPenjualan - totalModal),
      item_terjual: saleItems.reduce((a, it) => a + (toInt(it.qty) || 0), 0)
    },
    pengeluaran: {
      definisi: 'Seluruh catatan pengeluaran dengan jumlah > 0 pada periode.',
      jumlah_catatan: expenses.length,
      total: totalPengeluaran
    },
    pembelian: {
      definisi: 'Seluruh pembelian barang tercatat pada periode.',
      jumlah_transaksi: purchases.length,
      total: totalPembelian
    },
    produksi: {
      definisi: 'Seluruh batch produksi tercatat pada periode.',
      jumlah_batch: batches.length,
      total_biaya: totalBiayaProduksi,
      total_hasil: totalHasilProduksi
    },
    produk: {
      definisi: 'Jumlah produk aktif (kolom aktif = 1).',
      total_aktif: aktif.length,
      total_semua: products.length,
      stok_rendah: stokRendah.length
    },
    stok_rendah: stokRendah,
    transaksi_terbaru: transaksiTerbaru
  };
}

router.get('/summary', wrap(async (req, res) => {
  const p = periode(req);
  const data = db.readAll();
  res.json({ success: true, data: hitung(data, p) });
}));

router.get('/reports', wrap(async (req, res) => {
  const p = periode(req);
  const jenis = cleanStr(req.query.jenis, 30) || 'penjualan';
  const data = db.readAll();

  let result;
  if (jenis === 'penjualan' || jenis === 'pembelian' || jenis === 'pengeluaran' || jenis === 'stok' || jenis === 'produksi') {
    result = hitung(data, p);
  } else {
    throw new AppError("jenis laporan tidak dikenal. Pilihan: 'penjualan', 'pembelian', 'pengeluaran', 'stok', 'produksi'.", 400);
  }

  if (jenis === 'penjualan') {
    const sales = (data.Sales || [])
      .filter((s) => inRange(s.tanggal, p.dari, p.sampai))
      .sort((a, b) => cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal)));
    result.rincian = sales.map((s) => ({
      id: toInt(s.id),
      tanggal: cleanStr(s.tanggal),
      total: uang(s.total),
      metode_bayar: cleanStr(s.metode_bayar),
      catatan: cleanStr(s.catatan),
      items: (data.SaleItems || [])
        .filter((it) => toInt(it.sale_id) === toInt(s.id))
        .map((it) => ({
          nama_produk: cleanStr(it.nama_produk),
          qty: toInt(it.qty) ?? 0,
          harga_jual: uang(it.harga_jual),
          subtotal: uang(it.subtotal)
        }))
    }));
  } else if (jenis === 'pembelian') {
    result.rincian = (data.Purchases || [])
      .filter((x) => inRange(x.tanggal, p.dari, p.sampai))
      .sort((a, b) => cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal)))
      .map((x) => ({
        id: toInt(x.id),
        tanggal: cleanStr(x.tanggal),
        pemasok: cleanStr(x.pemasok),
        total: uang(x.total),
        metode_bayar: cleanStr(x.metode_bayar)
      }));
  } else if (jenis === 'pengeluaran') {
    result.rincian = (data.Expenses || [])
      .filter((x) => inRange(x.tanggal, p.dari, p.sampai))
      .sort((a, b) => cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal)))
      .map((x) => ({
        id: toInt(x.id),
        tanggal: cleanStr(x.tanggal),
        kategori_usaha: cleanStr(x.kategori_usaha),
        kategori: cleanStr(x.kategori),
        deskripsi: cleanStr(x.deskripsi),
        jumlah: uang(x.jumlah),
        metode_bayar: cleanStr(x.metode_bayar)
      }));
  } else if (jenis === 'stok') {
    result.rincian = (data.Products || [])
      .map((x) => ({
        id: toInt(x.id),
        nama: cleanStr(x.nama),
        kategori: cleanStr(x.kategori),
        satuan: cleanStr(x.satuan),
        stok: toInt(x.stok) ?? 0,
        stok_minimum: toInt(x.stok_minimum) ?? 0,
        aktif: toInt(x.aktif) === 1,
        harga_beli: uang(x.harga_beli),
        nilai_stok: uang((toInt(x.stok) ?? 0) * uang(x.harga_beli))
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    result.total_nilai_stok = uang(result.rincian.reduce((a, x) => a + x.nilai_stok, 0));
  } else if (jenis === 'produksi') {
    result.rincian = (data.ProductionBatches || [])
      .filter((x) => inRange(x.tanggal, p.dari, p.sampai))
      .sort((a, b) => cleanStr(b.tanggal).localeCompare(cleanStr(a.tanggal)))
      .map((x) => ({
        id: toInt(x.id),
        tanggal: cleanStr(x.tanggal),
        nama_produk: cleanStr(x.nama_produk),
        jumlah_hasil: toInt(x.jumlah_hasil) ?? 0,
        biaya_total: uang(x.biaya_total),
        catatan: cleanStr(x.catatan)
      }));
  }

  res.json({ success: true, data: result });
}));

router.get('/meta', wrap(async (req, res) => {
  res.json({
    success: true,
    data: {
      kategori_produk: ['Es Krim Jadul', 'Bahan Baku', 'Santan & Kelapa', 'Lainnya'],
      metode_bayar_penjualan: ['Tunai', 'QRIS', 'Transfer', 'Debit', 'Lainnya'],
      metode_bayar_pembelian: ['Tunai', 'Transfer', 'QRIS', 'Utang', 'Lainnya'],
      kategori_usaha: ['Es Krim Jadul', 'Santan & Kelapa', 'Umum'],
      kategori_pengeluaran: ['Bahan baku', 'Operasional', 'Gaji', 'Sewa', 'Listrik & Air', 'Lainnya'],
      metode_bayar_pengeluaran: ['Tunai', 'Transfer', 'QRIS', 'Lainnya']
    }
  });
}));

module.exports = router;
