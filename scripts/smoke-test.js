'use strict';

/**
 * Smoke test menyeluruh untuk API aplikasi kasir.
 * Jalankan server dulu (npm start), lalu: npm test
 * Semua request dibuat ke http://localhost:PORT (PORT dari env, default 3000).
 */

const BASE = `http://localhost:${process.env.PORT || 3000}`;
let token = null;
let lulus = 0;
let gagal = 0;

async function req(method, url, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text };
}

function cek(nama, kondisi, info = '') {
  if (kondisi) {
    lulus++;
    console.log(`  LULUS  - ${nama}`);
  } else {
    gagal++;
    console.log(`  GAGAL  - ${nama} ${info}`);
  }
}

(async () => {
  console.log(`Smoke test ke ${BASE}\n`);

  // 1. Health
  let r = await req('GET', '/api/health');
  cek('Server berjalan (/api/health)', r.status === 200 && r.json && r.json.success === true);

  // 2. Endpoint butuh auth menolak akses anonim
  r = await req('GET', '/api/products');
  cek('GET /api/products tanpa token ditolak (401)', r.status === 401);

  // 3. Login salah
  r = await req('POST', '/api/auth/login', { username: 'admin', password: 'salah-banget' });
  cek('Login dengan password salah -> 401', r.status === 401 && r.json && r.json.success === false);

  // 4. Login kosong
  r = await req('POST', '/api/auth/login', { username: '', password: '' });
  cek('Login dengan input kosong -> 400', r.status === 400);

  // 5. Login benar (env ADMIN_USERNAME/ADMIN_PASSWORD, default admin/admin123)
  const user = process.env.ADMIN_USERNAME || 'admin';
  const pass = process.env.ADMIN_PASSWORD || 'admin123';
  r = await req('POST', '/api/auth/login', { username: user, password: pass });
  const loginOk = r.status === 200 && r.json && r.json.success === true && typeof r.json.token === 'string' && r.json.user;
  cek('Login dengan kredensial valid -> token + user (objek, bukan array)', loginOk);
  if (!loginOk) { console.log('\nBerhenti: login gagal.'); process.exit(1); }
  token = r.json.token;

  // 6. /api/auth/me
  r = await req('GET', '/api/auth/me');
  cek('GET /api/auth/me mengembalikan objek user', r.status === 200 && r.json.data && !Array.isArray(r.json.data));

  // 7. Produk selalu array
  r = await req('GET', '/api/products');
  cek('GET /api/products mengembalikan array', r.status === 200 && Array.isArray(r.json.data));

  // 8. Tambah produk bahan baku & produk jadi
  const stamp = Date.now();
  r = await req('POST', '/api/products', {
    nama: `Susu UHT ${stamp}`, kategori: 'Bahan Baku', satuan: 'liter',
    harga_beli: 15000, harga_jual: 18000, stok: 50, stok_minimum: 10
  });
  cek('POST /api/products (bahan baku) 201', r.status === 201 && r.json.data && r.json.data.id > 0);
  const idBahan = r.json && r.json.data ? r.json.data.id : null;

  r = await req('POST', '/api/products', {
    nama: `Es Krim Cone ${stamp}`, kategori: 'Es Krim Jadul', satuan: 'pcs',
    harga_beli: 4000, harga_jual: 7000, stok: 0, stok_minimum: 5
  });
  cek('POST /api/products (produk jadi) 201', r.status === 201);
  const idJadi = r.json && r.json.data ? r.json.data.id : null;

  // 9. Validasi input tidak valid
  r = await req('POST', '/api/products', { nama: '', kategori: 'Aneh', satuan: '', harga_beli: -5 });
  cek('POST /api/products dengan data tidak valid -> 400', r.status === 400);

  // 10. Edit produk
  r = await req('PUT', `/api/products/${idJadi}`, { harga_jual: 7500, stok_minimum: 3 });
  cek('PUT /api/products/:id memperbarui data', r.status === 200 && r.json.data.harga_jual === 7500);

  // 11. PUT ID tidak ada
  r = await req('PUT', '/api/products/999999', { harga_jual: 1000 });
  cek('PUT dengan ID tidak ditemukan -> 404', r.status === 404);

  // 12. Pembelian menambah stok
  r = await req('POST', '/api/purchases', {
    pemasok: 'Supplier Uji', metode_bayar: 'Tunai',
    items: [{ product_id: idJadi, qty: 24, harga_beli: 4000 }]
  });
  cek('POST /api/purchases 201 & total dihitung backend', r.status === 201 && r.json.data.total === 96000);
  r = await req('GET', '/api/products');
  const setelahBeli = r.json.data.find((p) => p.id === idJadi);
  cek('Stok produk bertambah setelah pembelian (0 -> 24)', setelahBeli && setelahBeli.stok === 24);

  // 13. Penjualan
  r = await req('POST', '/api/sales', {
    metode_bayar: 'Tunai',
    items: [{ product_id: idJadi, qty: 5 }]
  });
  cek('POST /api/sales 201', r.status === 201 && r.json.data.items.length === 1 && r.json.data.total === 37500);

  // 14. Stok tidak mencukupi
  r = await req('POST', '/api/sales', { metode_bayar: 'Tunai', items: [{ product_id: idJadi, qty: 9999 }] });
  cek('Penjualan stok tidak mencukupi -> 400', r.status === 400 && /mencukupi/.test(r.json.message));

  // 15. Stok berkurang setelah penjualan
  r = await req('GET', '/api/products');
  const setelahJual = r.json.data.find((p) => p.id === idJadi);
  cek('Stok berkurang setelah penjualan (24 -> 19)', setelahJual && setelahJual.stok === 19);

  // 16. Produksi: bahan -> produk jadi
  r = await req('POST', '/api/production', {
    produk: idJadi, jumlah_hasil: 10,
    bahan: [{ product_id: idBahan, qty: 5 }],
    catatan: 'Uji produksi'
  });
  cek('POST /api/production 201 & biaya dihitung backend', r.status === 201 && r.json.data.biaya_total === 75000);
  r = await req('GET', '/api/products');
  const bahanSetelah = r.json.data.find((p) => p.id === idBahan);
  const jadiSetelah = r.json.data.find((p) => p.id === idJadi);
  cek('Stok bahan berkurang & produk jadi bertambah', bahanSetelah.stok === 45 && jadiSetelah.stok === 29);

  // 17. Produksi dengan stok bahan kurang
  r = await req('POST', '/api/production', { produk: idJadi, jumlah_hasil: 5, bahan: [{ product_id: idBahan, qty: 99999 }] });
  cek('Produksi dengan stok bahan kurang -> 400', r.status === 400);

  // 18. Pengeluaran
  r = await req('POST', '/api/expenses', {
    kategori_usaha: 'Umum', kategori: 'Operasional', deskripsi: 'Biaya uji listrik',
    jumlah: 50000, metode_bayar: 'Tunai'
  });
  cek('POST /api/expenses 201', r.status === 201 && r.json.data.jumlah === 50000);

  // 19. Pengeluaran tidak valid
  r = await req('POST', '/api/expenses', { kategori_usaha: 'Umum', kategori: 'Operasional', deskripsi: 'x', jumlah: -1, metode_bayar: 'Tunai' });
  cek('Pengeluaran jumlah negatif -> 400', r.status === 400);

  // 20. Koreksi stok
  r = await req('POST', `/api/products/${idBahan}/koreksi-stok`, { stok_baru: 40, alasan: 'Opname uji' });
  cek('Koreksi stok 200', r.status === 200 && r.json.data && r.json.data.stok === 40);

  // 21. Summary & laporan selalu objek
  const t = new Date(); const p = (n) => String(n).padStart(2, '0');
  const hari = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  r = await req('GET', `/api/summary?dari=${hari}&sampai=${hari}`);
  cek('GET /api/summary objek dengan penjualan.jumlah_transaksi', r.status === 200 && r.json.data && typeof r.json.data.penjualan.jumlah_transaksi === 'number');
  r = await req('GET', `/api/reports?jenis=stok&dari=${hari}&sampai=${hari}`);
  cek('GET /api/reports?jenis=stok memiliki rincian array', r.status === 200 && Array.isArray(r.json.data.rincian));
  r = await req('GET', '/api/reports?jenis=ngawur');
  cek('GET /api/reports jenis tidak dikenal -> 400', r.status === 400);

  // 22. Riwayat penjualan/pembelian/produksi
  r = await req('GET', '/api/sales');
  cek('GET /api/sales array dengan items', r.status === 200 && Array.isArray(r.json.data) && r.json.data.every((s) => Array.isArray(s.items)));
  r = await req('GET', '/api/purchases');
  cek('GET /api/purchases array', r.status === 200 && Array.isArray(r.json.data));
  r = await req('GET', '/api/production');
  cek('GET /api/production array dengan bahan', r.status === 200 && Array.isArray(r.json.data) && r.json.data.every((b) => Array.isArray(b.bahan)));
  r = await req('GET', '/api/expenses');
  cek('GET /api/expenses array', r.status === 200 && Array.isArray(r.json.data));

  // 23. Produk dengan riwayat -> dinonaktifkan, bukan hilang merusak histori
  r = await req('DELETE', `/api/products/${idJadi}`);
  cek('DELETE produk ber-riwayat -> nonaktif (soft delete)', r.status === 200 && /nonaktif/i.test(r.json.message));
  r = await req('GET', '/api/products');
  cek('Produk nonaktif tidak tampil di daftar aktif', !r.json.data.some((p2) => p2.id === idJadi));
  r = await req('GET', '/api/products?include_nonaktif=1');
  cek('Produk nonaktif tetap ada dengan include_nonaktif=1', r.json.data.some((p2) => p2.id === idJadi));
  r = await req('POST', '/api/sales', { metode_bayar: 'Tunai', items: [{ product_id: idJadi, qty: 1 }] });
  cek('Penjualan produk nonaktif ditolak', r.status === 400);

  // 24. Endpoint tidak dikenal
  r = await req('GET', '/api/tidak-ada');
  cek('Endpoint tak dikenal -> 404 JSON', r.status === 404 && r.json && r.json.success === false);

  // 25. Logout / token dibuang
  const tokenSimpanan = token;
  token = null;
  r = await req('GET', '/api/products');
  cek('Tanpa token -> 401', r.status === 401);
  token = tokenSimpanan + 'xxx';
  r = await req('GET', '/api/products');
  cek('Token rusak -> 401', r.status === 401);

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal dari ${lulus + gagal} pengujian.`);
  if (gagal > 0) process.exit(1);
})().catch((err) => {
  console.error('Smoke test gagal berjalan:', err.message);
  process.exit(1);
});
