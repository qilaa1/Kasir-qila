'use strict';

/** Halaman Produksi: form batch (bahan → produk jadi) + riwayat produksi. */
window.Pages = window.Pages || {};

const KATEGORI_JADI = ['Es Krim Jadul'];
const KATEGORI_BAHAN = ['Bahan Baku', 'Santan & Kelapa'];

window.Pages.produksi = {
  title: 'Produksi',
  produk: [],

  async render(container) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>🏭 Batch Produksi Baru</h3></div>
        <div class="form-grid">
          <div class="field"><label for="prTanggal">Tanggal *</label>
            <input class="input" type="date" id="prTanggal" value="${window.hariIniJakarta()}" /></div>
          <div class="field"><label for="prProduk">Produk Jadi *</label>
            <select class="input" id="prProduk"><option value="">— pilih produk jadi —</option></select></div>
          <div class="field"><label for="prHasil">Jumlah Hasil Produksi *</label>
            <input class="input" id="prHasil" type="number" min="1" step="1" placeholder="mis. 20" /></div>
          <div class="field"><label for="prCatatan">Catatan</label>
            <input class="input" id="prCatatan" placeholder="opsional" /></div>
        </div>

        <div class="items-box">
          <div class="panel-head"><h4>Bahan Baku Digunakan</h4>
            <button type="button" id="prTambahBahan" class="btn btn-sm btn-primary">+ Tambah Bahan</button></div>
          <div id="prBahan"></div>
          <div class="total-line">Total Biaya Bahan: <strong id="prBiaya">Rp0</strong></div>
        </div>

        <div id="prError" class="form-error" hidden></div>
        <button type="button" id="prSimpan" class="btn btn-primary">💾 Simpan Produksi</button>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>📜 Riwayat Produksi</h3>
          <button type="button" id="prMuatUlang" class="btn btn-sm btn-ghost">Muat ulang</button></div>
        <div id="prRiwayat">${UI.stateHtml('loading', 'Memuat riwayat...')}</div>
      </section>`;

    container.querySelector('#prTambahBahan').addEventListener('click', () => this.tambahBahan(container));
    container.querySelector('#prSimpan').addEventListener('click', (e) => this.simpan(container, e.currentTarget));
    container.querySelector('#prMuatUlang').addEventListener('click', () => this.muatRiwayat(container));
    window.addEventListener('products-changed', this._onProductsChanged = () => this.muatProduk(container));

    this.tambahBahan(container);
    await Promise.allSettled([this.muatProduk(container), this.muatRiwayat(container)]);
  },

  produkJadi() {
    return this.produk.filter((p) => KATEGORI_JADI.includes(p.kategori));
  },
  produkBahan() {
    return this.produk.filter((p) => KATEGORI_BAHAN.includes(p.kategori));
  },

  async muatProduk(container) {
    try {
      this.produk = normalizeArray(await API.get('/api/products'));
      const selJadi = container.querySelector('#prProduk');
      const nilai = selJadi.value;
      const jadi = this.produkJadi();
      selJadi.innerHTML = '<option value="">— pilih produk jadi —</option>' +
        jadi.map((p) => `<option value="${p.id}">${UI.esc(p.nama)} (stok ${UI.angka(p.stok)})</option>`).join('');
      if (nilai) selJadi.value = nilai;

      container.querySelectorAll('select[data-role="bahan"]').forEach((sel) => {
        const v = sel.value;
        sel.innerHTML = '<option value="">— pilih bahan —</option>' +
          this.produkBahan().map((p) => `<option value="${p.id}">${UI.esc(p.nama)} (stok ${UI.angka(p.stok)} ${UI.esc(p.satuan)})</option>`).join('');
        if (v) sel.value = v;
      });
      this.hitungBiaya(container);

      if (!jadi.length) {
        UI.toast('Belum ada produk jadi berkategori "Es Krim Jadul". Tambahkan dulu di halaman Produk.', 'peringatan', 6000);
      }
    } catch (err) {
      UI.toast('Gagal memuat produk: ' + err.message, 'galat');
    }
  },

  tambahBahan(container) {
    const box = container.querySelector('#prBahan');
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <select class="input input-sm" data-role="bahan">
        <option value="">— pilih bahan —</option>
        ${this.produkBahan().map((p) => `<option value="${p.id}">${UI.esc(p.nama)} (stok ${UI.angka(p.stok)} ${UI.esc(p.satuan)})</option>`).join('')}
      </select>
      <input class="input input-sm" type="number" min="1" step="1" data-role="qty" placeholder="Qty" />
      <span class="item-subtotal" data-role="subtotal">Rp0</span>
      <button type="button" class="btn btn-sm btn-ghost btn-danger-ghost" data-role="hapus">✕</button>`;
    box.appendChild(row);
    row.querySelector('[data-role="bahan"]').addEventListener('change', () => this.hitungBiaya(container));
    row.querySelector('[data-role="qty"]').addEventListener('input', () => this.hitungBiaya(container));
    row.querySelector('[data-role="hapus"]').addEventListener('click', () => { row.remove(); this.hitungBiaya(container); });
    this.hitungBiaya(container);
  },

  bacaBahan(container) {
    const items = [];
    container.querySelectorAll('#prBahan .item-row').forEach((row) => {
      const id = row.querySelector('[data-role="bahan"]').value;
      const qty = Number(row.querySelector('[data-role="qty"]').value);
      const p = this.produk.find((x) => String(x.id) === id);
      const sub = p ? Number(p.harga_beli) * (Number.isFinite(qty) ? qty : 0) : 0;
      row.querySelector('[data-role="subtotal"]').textContent = UI.rupiah(sub);
      if (id && qty > 0) items.push({ product_id: Number(id), qty });
    });
    return items;
  },

  hitungBiaya(container) {
    const items = this.bacaBahan(container);
    const total = items.reduce((a, it) => {
      const p = this.produk.find((x) => x.id === it.product_id);
      return a + (p ? Number(p.harga_beli) : 0) * it.qty;
    }, 0);
    const el = container.querySelector('#prBiaya');
    if (el) el.textContent = UI.rupiah(total);
  },

  async simpan(container, btn) {
    const errBox = container.querySelector('#prError');
    errBox.hidden = true;

    const produk = Number(container.querySelector('#prProduk').value);
    const hasil = Number(container.querySelector('#prHasil').value);
    const bahan = this.bacaBahan(container);

    if (!produk) { errBox.textContent = 'Pilih produk jadi terlebih dahulu.'; errBox.hidden = false; return; }
    if (!Number.isInteger(hasil) || hasil <= 0) { errBox.textContent = 'Jumlah hasil produksi harus bilangan bulat > 0.'; errBox.hidden = false; return; }
    if (!bahan.length) { errBox.textContent = 'Tambahkan minimal satu bahan baku.'; errBox.hidden = false; return; }

    // Validasi stok bahan di sisi klien (backend tetap memvalidasi ulang).
    for (const b of bahan) {
      const p = this.produk.find((x) => x.id === b.product_id);
      if (p && Number(p.stok) < b.qty) {
        errBox.textContent = `Stok bahan "${p.nama}" tidak mencukupi (tersisa ${p.stok}, dibutuhkan ${b.qty}).`;
        errBox.hidden = false;
        return;
      }
    }

    await UI.withBusy(btn, async () => {
      try {
        await API.post('/api/production', {
          tanggal: container.querySelector('#prTanggal').value,
          produk,
          jumlah_hasil: hasil,
          bahan,
          catatan: container.querySelector('#prCatatan').value.trim()
        });
        UI.toast('Batch produksi tersimpan.');
        container.querySelector('#prHasil').value = '';
        container.querySelector('#prCatatan').value = '';
        container.querySelector('#prBahan').innerHTML = '';
        this.tambahBahan(container);
        this.muatRiwayat(container);
        this.muatProduk(container);
        window.dispatchEvent(new CustomEvent('products-changed'));
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  },

  async muatRiwayat(container) {
    const box = container.querySelector('#prRiwayat');
    box.innerHTML = UI.skeleton(4);
    try {
      const data = normalizeArray(await API.get('/api/production?limit=100'));
      if (!data.length) {
        box.innerHTML = UI.stateHtml('kosong', 'Belum ada riwayat produksi.');
        return;
      }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Tanggal</th><th>Produk Jadi</th><th>Hasil</th><th>Bahan Digunakan</th><th>Biaya</th></tr></thead>
        <tbody>${data.map((b) => `
          <tr>
            <td>${UI.esc(b.tanggal)}</td>
            <td><strong>${UI.esc(b.nama_produk)}</strong></td>
            <td>${UI.angka(b.jumlah_hasil)}</td>
            <td>${normalizeArray(b.bahan).map((it) => `${UI.esc(it.nama_produk)} ×${UI.angka(it.qty)}`).join(', ') || '—'}</td>
            <td>${UI.rupiah(b.biaya_total)}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    } catch (err) {
      box.innerHTML = UI.stateHtml('error', err.message);
    }
  },

  destroy() {
    if (this._onProductsChanged) window.removeEventListener('products-changed', this._onProductsChanged);
  }
};
