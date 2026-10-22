'use strict';

/** Halaman Dashboard. */
window.Pages = window.Pages || {};

window.Pages.dashboard = {
  title: 'Dashboard',
  async render(container) {
    container.innerHTML = `
      <div class="cards" id="dashCards">${UI.skeleton(4)}</div>
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h3>⚠️ Produk Stok Rendah</h3><button type="button" class="btn btn-sm btn-ghost" data-reload="stok">Muat ulang</button></div>
          <div id="dashStokRendah">${UI.stateHtml('loading', 'Memuat data stok...')}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>🧾 Transaksi Terbaru</h3><button type="button" class="btn btn-sm btn-ghost" data-reload="trx">Muat ulang</button></div>
          <div id="dashTrx">${UI.stateHtml('loading', 'Memuat transaksi...')}</div>
        </section>
      </div>
      <section class="panel">
        <div class="panel-head"><h3>📦 Daftar Produk</h3><button type="button" class="btn btn-sm btn-ghost" data-reload="produk">Muat ulang</button></div>
        <div id="dashProduk">${UI.stateHtml('loading', 'Memuat produk...')}</div>
      </section>`;

    const today = hariIniJakarta();

    const reload = {
      stok: () => this.muatRingkasan(container, today),
      trx: () => this.muatTransaksi(container),
      produk: () => this.muatProduk(container)
    };
    container.querySelectorAll('[data-reload]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kunci = btn.getAttribute('data-reload');
        if (kunci === 'stok') reload.stok();
        if (kunci === 'trx') reload.trx();
        if (kunci === 'produk') reload.produk();
      });
    });

    // Muat tiap bagian terpisah: kegagalan satu bagian tidak menggagalkan yang lain.
    await Promise.allSettled([
      this.muatRingkasan(container, today),
      this.muatTransaksi(container),
      this.muatProduk(container)
    ]);
  },

  async muatRingkasan(container, today) {
    const cards = container.querySelector('#dashCards');
    try {
      const s = await API.get(`/api/summary?dari=${today}&sampai=${today}`);
      if (!s || typeof s !== 'object') throw new API.ApiError('Format ringkasan tidak sesuai.');
      const data = s;
      cards.innerHTML = `
        ${kartu('💰', 'Penjualan Hari Ini', UI.rupiah(data.penjualan && data.penjualan.total), `${UI.angka(data.penjualan && data.penjualan.jumlah_transaksi)} transaksi`, 'biru')}
        ${kartu('💸', 'Pengeluaran Hari Ini', UI.rupiah(data.pengeluaran && data.pengeluaran.total), `${UI.angka(data.pengeluaran && data.pengeluaran.jumlah_catatan)} catatan`, 'merah')}
        ${kartu('📦', 'Produk Aktif', UI.angka(data.produk && data.produk.total_aktif), `${UI.angka(data.produk && data.produk.stok_rendah)} stok rendah`, 'hijau')}
        ${kartu('🚚', 'Pembelian (hari ini)', UI.rupiah(data.pembelian && data.pembelian.total), `${UI.angka(data.pembelian && data.pembelian.jumlah_transaksi)} transaksi`, 'kuning')}
      `;
      const stokBox = container.querySelector('#dashStokRendah');
      const stok = normalizeArray(data.stok_rendah);
      if (!stok.length) {
        stokBox.innerHTML = UI.stateHtml('kosong', 'Semua stok aman. Tidak ada produk di bawah stok minimum.');
      } else {
        stokBox.innerHTML = `<div class="table-wrap"><table class="table">
          <thead><tr><th>Produk</th><th>Stok</th><th>Minimum</th></tr></thead>
          <tbody>${stok.map((p) => `
            <tr><td>${UI.esc(p.nama)}<small class="muted"> ${UI.esc(p.kategori)}</small></td>
            <td><span class="badge badge-merah">${UI.angka(p.stok)} ${UI.esc(p.satuan)}</span></td>
            <td>${UI.angka(p.stok_minimum)}</td></tr>`).join('')}
          </tbody></table></div>`;
      }
    } catch (err) {
      cards.innerHTML = '';
      const stokBox = container.querySelector('#dashStokRendah');
      if (stokBox) stokBox.innerHTML = UI.stateHtml('error', err.message, '<button type="button" class="btn btn-sm btn-primary" onclick="location.reload()">Muat ulang halaman</button>');
    }
  },

  async muatTransaksi(container) {
    const box = container.querySelector('#dashTrx');
    try {
      const trx = normalizeArray(await API.get('/api/sales?limit=8'));
      if (!trx.length) {
        box.innerHTML = UI.stateHtml('kosong', 'Belum ada transaksi penjualan.');
        return;
      }
      box.innerHTML = `<ul class="list">
        ${trx.map((s) => `<li>
          <div><strong>SALE-${UI.esc(s.id)}</strong><br><small class="muted">${UI.esc(s.tanggal)} · ${UI.esc(s.metode_bayar)}</small></div>
          <div class="list-right"><strong>${UI.rupiah(s.total)}</strong><br><small class="muted">${UI.angka(normalizeArray(s.items).reduce((a, i) => a + (Number(i.qty) || 0), 0))} item</small></div>
        </li>`).join('')}
      </ul>`;
    } catch (err) {
      box.innerHTML = UI.stateHtml('error', err.message);
    }
  },

  async muatProduk(container) {
    const box = container.querySelector('#dashProduk');
    try {
      const produk = normalizeArray(await API.get('/api/products'));
      if (!produk.length) {
        box.innerHTML = UI.stateHtml('kosong', 'Belum ada produk. Tambahkan produk di halaman Produk.', '<a class="btn btn-sm btn-primary" href="#/produk">Tambah Produk</a>');
        return;
      }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Nama</th><th>Kategori</th><th>Stok</th><th>Harga Beli</th><th>Harga Jual</th></tr></thead>
        <tbody>${produk.map((p) => `
          <tr>
            <td>${UI.esc(p.nama)}</td>
            <td><span class="badge badge-abu">${UI.esc(p.kategori)}</span></td>
            <td>${rendahBadge(p)}</td>
            <td>${UI.rupiah(p.harga_beli)}</td>
            <td><strong>${UI.rupiah(p.harga_jual)}</strong></td>
          </tr>`).join('')}
        </tbody></table></div>`;
    } catch (err) {
      box.innerHTML = UI.stateHtml('error', err.message);
    }
  }
};

function kartu(ikon, judul, nilai, sub, warna) {
  return `<div class="card card-${warna}">
    <div class="card-ikon">${ikon}</div>
    <div><small>${UI.esc(judul)}</small><strong>${UI.esc(nilai)}</strong><small class="muted">${UI.esc(sub)}</small></div>
  </div>`;
}

function rendahBadge(p) {
  const stok = Number(p.stok) || 0;
  const min = Number(p.stok_minimum) || 0;
  const cls = stok <= min ? 'badge-merah' : (stok <= min * 2 ? 'badge-kuning' : 'badge-hijau');
  return `<span class="badge ${cls}">${UI.angka(stok)} ${UI.esc(p.satuan)}</span>`;
}
window.rendahBadge = rendahBadge;

/** Tanggal hari ini (YYYY-MM-DD) menurut zona waktu Asia/Jakarta. */
function hariIniJakarta() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date());
}
window.hariIniJakarta = hariIniJakarta;
