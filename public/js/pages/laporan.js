'use strict';

/** Halaman Laporan: ringkasan periode + rincian per jenis laporan. */
window.Pages = window.Pages || {};

window.Pages.laporan = {
  title: 'Laporan',

  async render(container) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>📊 Filter Periode &amp; Jenis Laporan</h3></div>
        <div class="toolbar toolbar-wrap">
          <label class="muted">Dari</label><input class="input input-sm" type="date" id="lpDari" value="${window.hariIniJakarta()}" />
          <label class="muted">Sampai</label><input class="input input-sm" type="date" id="lpSampai" value="${window.hariIniJakarta()}" />
          <select class="input input-sm" id="lpJenis">
            <option value="penjualan">Laporan Penjualan</option>
            <option value="pembelian">Laporan Pembelian</option>
            <option value="pengeluaran">Laporan Pengeluaran</option>
            <option value="stok">Laporan Stok</option>
            <option value="produksi">Laporan Produksi</option>
          </select>
          <button type="button" id="lpTampilkan" class="btn btn-sm btn-primary">Tampilkan</button>
          <button type="button" id="lpUnduh" class="btn btn-sm btn-ghost">⬇️ Unduh CSV</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h3 id="lpJudul">Ringkasan</h3></div>
        <div class="cards" id="lpKartu"></div>
        <div id="lpIsi">${UI.stateHtml('loading', 'Memuat laporan...')}</div>
      </section>`;

    container.querySelector('#lpTampilkan').addEventListener('click', () => this.muat(container));
    container.querySelector('#lpUnduh').addEventListener('click', () => this.unduhCsv(container));

    this._dataTerakhir = null;
    await this.muat(container);
  },

  async muat(container) {
    const kartu = container.querySelector('#lpKartu');
    const isi = container.querySelector('#lpIsi');
    const judul = container.querySelector('#lpJudul');
    const dari = container.querySelector('#lpDari').value;
    const sampai = container.querySelector('#lpSampai').value;
    const jenis = container.querySelector('#lpJenis').value;

    isi.innerHTML = UI.skeleton(5);
    kartu.innerHTML = '';
    try {
      const data = await API.get(`/api/reports?jenis=${jenis}&dari=${dari}&sampai=${sampai}`);
      if (!data || typeof data !== 'object') throw new API.ApiError('Format laporan tidak sesuai.');
      this._dataTerakhir = { data, jenis, dari, sampai };
      judul.textContent = `${judulJenis(jenis)} — ${UI.esc(dari)} s/d ${UI.esc(sampai)}`;

      const kartuData = [
        ['💰', 'Total Penjualan', UI.rupiah(data.penjualan && data.penjualan.total), `${UI.angka(data.penjualan && data.penjualan.jumlah_transaksi)} transaksi`],
        ['📈', 'Laba Kotor (perkiraan)', UI.rupiah(data.penjualan && data.penjualan.laba_kotor_perkiraan), 'Penjualan − harga modal'],
        ['💸', 'Total Pengeluaran', UI.rupiah(data.pengeluaran && data.pengeluaran.total), `${UI.angka(data.pengeluaran && data.pengeluaran.jumlah_catatan)} catatan`],
        ['🚚', 'Total Pembelian', UI.rupiah(data.pembelian && data.pembelian.total), `${UI.angka(data.pembelian && data.pembelian.jumlah_transaksi)} transaksi`],
        ['🏭', 'Biaya Produksi', UI.rupiah(data.produksi && data.produksi.total_biaya), `${UI.angka(data.produksi && data.produksi.total_hasil)} unit hasil`],
        ['📦', 'Produk Aktif', UI.angka(data.produk && data.produk.total_aktif), `${UI.angka(data.produk && data.produk.stok_rendah)} stok rendah`]
      ];
      kartu.innerHTML = kartuData.map(([i, j, n, s]) => `
        <div class="card card-biru"><div class="card-ikon">${i}</div>
        <div><small>${UI.esc(j)}</small><strong>${UI.esc(n)}</strong><small class="muted">${UI.esc(s)}</small></div></div>`).join('');

      const rincian = normalizeArray(data.rincian);
      if (jenis === 'stok') {
        if (!rincian.length) { isi.innerHTML = UI.stateHtml('kosong', 'Belum ada produk.'); return; }
        isi.innerHTML = `<div class="table-wrap"><table class="table">
          <thead><tr><th>Produk</th><th>Kategori</th><th>Stok</th><th>Minimum</th><th>Harga Beli</th><th>Nilai Stok</th><th>Status</th></tr></thead>
          <tbody>${rincian.map((r) => `<tr>
            <td>${UI.esc(r.nama)}</td><td>${UI.esc(r.kategori)}</td>
            <td>${UI.angka(r.stok)} ${UI.esc(r.satuan)}</td><td>${UI.angka(r.stok_minimum)}</td>
            <td>${UI.rupiah(r.harga_beli)}</td><td><strong>${UI.rupiah(r.nilai_stok)}</strong></td>
            <td>${r.aktif ? '<span class="badge badge-hijau">Aktif</span>' : '<span class="badge badge-abu">Nonaktif</span>'}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="5"><strong>Total nilai stok</strong></td><td colspan="2"><strong>${UI.rupiah(data.total_nilai_stok)}</strong></td></tr></tfoot>
        </table></div>`;
        return;
      }

      if (!rincian.length) {
        isi.innerHTML = UI.stateHtml('kosong', 'Tidak ada data pada periode yang dipilih.');
        return;
      }

      let kolom;
      if (jenis === 'penjualan') {
        kolom = [
          ['Tanggal', (r) => UI.esc(r.tanggal)],
          ['#', (r) => `SALE-${UI.esc(r.id)}`],
          ['Item', (r) => normalizeArray(r.items).map((it) => `${UI.esc(it.nama_produk)} ×${UI.angka(it.qty)}`).join(', ')],
          ['Metode', (r) => UI.esc(r.metode_bayar)],
          ['Total', (r) => `<strong>${UI.rupiah(r.total)}</strong>`]
        ];
      } else if (jenis === 'pembelian') {
        kolom = [
          ['Tanggal', (r) => UI.esc(r.tanggal)],
          ['Pemasok', (r) => UI.esc(r.pemasok)],
          ['Metode', (r) => UI.esc(r.metode_bayar)],
          ['Total', (r) => `<strong>${UI.rupiah(r.total)}</strong>`]
        ];
      } else if (jenis === 'pengeluaran') {
        kolom = [
          ['Tanggal', (r) => UI.esc(String(r.tanggal).slice(0, 10))],
          ['Usaha', (r) => UI.esc(r.kategori_usaha)],
          ['Kategori', (r) => UI.esc(r.kategori)],
          ['Deskripsi', (r) => UI.esc(r.deskripsi)],
          ['Metode', (r) => UI.esc(r.metode_bayar)],
          ['Jumlah', (r) => `<strong>${UI.rupiah(r.jumlah)}</strong>`]
        ];
      } else {
        kolom = [
          ['Tanggal', (r) => UI.esc(r.tanggal)],
          ['Produk Jadi', (r) => UI.esc(r.nama_produk)],
          ['Hasil', (r) => UI.angka(r.jumlah_hasil)],
          ['Biaya', (r) => UI.rupiah(r.biaya_total)],
          ['Catatan', (r) => UI.esc(r.catatan)]
        ];
      }

      isi.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr>${kolom.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rincian.map((r) => `<tr>${kolom.map(([, f]) => `<td>${f(r)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    } catch (err) {
      this._dataTerakhir = null;
      isi.innerHTML = UI.stateHtml('error', err.message);
    }
  },

  /** Unduh CSV dari rincian laporan terakhir (tanpa library eksternal). */
  unduhCsv(container) {
    if (!this._dataTerakhir) { UI.toast('Muat laporan terlebih dahulu.', 'galat'); return; }
    const { data, jenis, dari, sampai } = this._dataTerakhir;
    const rincian = normalizeArray(data.rincian);
    if (!rincian.length) { UI.toast('Tidak ada data untuk diunduh.', 'galat'); return; }

    let baris;
    if (jenis === 'stok') {
      baris = [['nama', 'kategori', 'satuan', 'stok', 'stok_minimum', 'harga_beli', 'nilai_stok', 'aktif']]
        .concat(rincian.map((r) => [r.nama, r.kategori, r.satuan, r.stok, r.stok_minimum, r.harga_beli, r.nilai_stok, r.aktif ? 'ya' : 'tidak']));
    } else if (jenis === 'penjualan') {
      baris = [['id', 'tanggal', 'item', 'metode_bayar', 'total']]
        .concat(rincian.map((r) => [r.id, r.tanggal, normalizeArray(r.items).map((it) => `${it.nama_produk} x${it.qty}`).join('; '), r.metode_bayar, r.total]));
    } else if (jenis === 'pembelian') {
      baris = [['id', 'tanggal', 'pemasok', 'metode_bayar', 'total']]
        .concat(rincian.map((r) => [r.id, r.tanggal, r.pemasok, r.metode_bayar, r.total]));
    } else if (jenis === 'pengeluaran') {
      baris = [['id', 'tanggal', 'kategori_usaha', 'kategori', 'deskripsi', 'metode_bayar', 'jumlah']]
        .concat(rincian.map((r) => [r.id, String(r.tanggal).slice(0, 10), r.kategori_usaha, r.kategori, r.deskripsi, r.metode_bayar, r.jumlah]));
    } else {
      baris = [['id', 'tanggal', 'produk', 'jumlah_hasil', 'biaya_total', 'catatan']]
        .concat(rincian.map((r) => [r.id, r.tanggal, r.nama_produk, r.jumlah_hasil, r.biaya_total, r.catatan]));
    }

    const csv = baris.map((b) => b.map((v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `laporan-${jenis}-${dari}-${sampai}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    UI.toast('CSV diunduh.');
  }
};

function judulJenis(jenis) {
  return {
    penjualan: 'Laporan Penjualan',
    pembelian: 'Laporan Pembelian',
    pengeluaran: 'Laporan Pengeluaran',
    stok: 'Laporan Stok',
    produksi: 'Laporan Produksi'
  }[jenis] || 'Laporan';
}
