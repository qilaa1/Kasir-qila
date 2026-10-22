'use strict';

/** Halaman Pembelian: form tambah pembelian (multi item) + riwayat. */
window.Pages = window.Pages || {};

const METODE_BAYAR_BELI = ['Tunai', 'Transfer', 'QRIS', 'Utang', 'Lainnya'];

window.Pages.pembelian = {
  title: 'Pembelian',
  produk: [],

  async render(container) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>🚚 Pembelian Baru</h3></div>
        <div id="formPembelianWrap">
          <div class="form-grid">
            <div class="field"><label for="pbTanggal">Tanggal *</label>
              <input class="input" type="date" id="pbTanggal" value="${window.hariIniJakarta()}" /></div>
            <div class="field"><label for="pbPemasok">Nama Pemasok *</label>
              <input class="input" id="pbPemasok" placeholder="mis. UD Sumber Susu" /></div>
            <div class="field"><label for="pbMetode">Metode Pembayaran *</label>
              <select class="input" id="pbMetode">${METODE_BAYAR_BELI.map((m) => `<option>${m}</option>`).join('')}</select></div>
            <div class="field"><label for="pbCatatan">Catatan</label>
              <input class="input" id="pbCatatan" placeholder="opsional" /></div>
          </div>

          <div class="items-box">
            <div class="panel-head"><h4>Item Pembelian</h4>
              <button type="button" id="pbTambahItem" class="btn btn-sm btn-primary">+ Tambah Item</button></div>
            <div id="pbItems"></div>
            <div class="total-line">Total: <strong id="pbTotal">Rp0</strong></div>
          </div>

          <div id="pbError" class="form-error" hidden></div>
          <button type="button" id="pbSimpan" class="btn btn-primary">💾 Simpan Pembelian</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>📜 Riwayat Pembelian</h3>
          <button type="button" id="pbMuatUlang" class="btn btn-sm btn-ghost">Muat ulang</button></div>
        <div id="pbRiwayat">${UI.stateHtml('loading', 'Memuat riwayat...')}</div>
      </section>`;

    container.querySelector('#pbTambahItem').addEventListener('click', () => this.tambahItem(container));
    container.querySelector('#pbSimpan').addEventListener('click', (e) => this.simpan(container, e.currentTarget));
    container.querySelector('#pbMuatUlang').addEventListener('click', () => this.muatRiwayat(container));
    window.addEventListener('products-changed', this._onProductsChanged = () => this.muatProduk(container));

    this.tambahItem(container); // satu baris kosong awal
    await Promise.allSettled([this.muatProduk(container), this.muatRiwayat(container)]);
  },

  async muatProduk(container) {
    try {
      this.produk = normalizeArray(await API.get('/api/products'));
      // Perbarui semua dropdown item yang sedang terbuka.
      container.querySelectorAll('select[data-role="produk"]').forEach((sel) => {
        const nilai = sel.value;
        sel.innerHTML = '<option value="">— pilih produk —</option>' +
          this.produk.map((p) => `<option value="${p.id}">${UI.esc(p.nama)} (stok ${UI.angka(p.stok)} ${UI.esc(p.satuan)})</option>`).join('');
        if (nilai) sel.value = nilai;
      });
      this.hitungTotal(container);
    } catch (err) {
      UI.toast('Gagal memuat daftar produk: ' + err.message, 'galat');
    }
  },

  tambahItem(container) {
    const box = container.querySelector('#pbItems');
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <select class="input input-sm" data-role="produk">
        <option value="">— pilih produk —</option>
        ${this.produk.map((p) => `<option value="${p.id}">${UI.esc(p.nama)} (stok ${UI.angka(p.stok)} ${UI.esc(p.satuan)})</option>`).join('')}
      </select>
      <input class="input input-sm" type="number" min="1" step="1" data-role="qty" placeholder="Qty" />
      <input class="input input-sm" type="number" min="0" step="any" data-role="harga" placeholder="Harga beli (opsional)" />
      <span class="item-subtotal" data-role="subtotal">Rp0</span>
      <button type="button" class="btn btn-sm btn-ghost btn-danger-ghost" data-role="hapus" title="Hapus baris">✕</button>`;
    box.appendChild(row);

    row.querySelector('[data-role="produk"]').addEventListener('change', (e) => {
      const p = this.produk.find((x) => String(x.id) === e.target.value);
      if (p) row.querySelector('[data-role="harga"]').value = p.harga_beli;
      this.hitungTotal(container);
    });
    row.querySelector('[data-role="qty"]').addEventListener('input', () => this.hitungTotal(container));
    row.querySelector('[data-role="harga"]').addEventListener('input', () => this.hitungTotal(container));
    row.querySelector('[data-role="hapus"]').addEventListener('click', () => {
      row.remove();
      this.hitungTotal(container);
    });
    this.hitungTotal(container);
  },

  bacaItems(container) {
    const items = [];
    container.querySelectorAll('#pbItems .item-row').forEach((row) => {
      const productId = row.querySelector('[data-role="produk"]').value;
      const qty = row.querySelector('[data-role="qty"]').value;
      const harga = row.querySelector('[data-role="harga"]').value;
      if (!productId && !qty) return; // baris kosong diabaikan
      items.push({ product_id: Number(productId), qty: Number(qty), harga_beli: harga === '' ? undefined : Number(harga) });
      const p = this.produk.find((x) => String(x.id) === productId);
      const sub = (Number(harga) || (p ? Number(p.harga_beli) : 0)) * (Number(qty) || 0);
      row.querySelector('[data-role="subtotal"]').textContent = UI.rupiah(sub);
    });
    return items;
  },

  hitungTotal(container) {
    const items = this.bacaItems(container);
    const total = items.reduce((a, it) => {
      const p = this.produk.find((x) => x.id === it.product_id);
      const harga = it.harga_beli !== undefined ? it.harga_beli : (p ? Number(p.harga_beli) : 0);
      return a + (Number.isFinite(harga) ? harga : 0) * (Number(it.qty) || 0);
    }, 0);
    const el = container.querySelector('#pbTotal');
    if (el) el.textContent = UI.rupiah(total);
  },

  async simpan(container, btn) {
    const errBox = container.querySelector('#pbError');
    errBox.hidden = true;

    const pemasok = container.querySelector('#pbPemasok').value.trim();
    const items = this.bacaItems(container);

    if (!pemasok) { errBox.textContent = 'Nama pemasok wajib diisi.'; errBox.hidden = false; return; }
    if (!items.length) { errBox.textContent = 'Tambahkan minimal satu item pembelian.'; errBox.hidden = false; return; }
    if (items.some((it) => !it.product_id || !Number.isInteger(it.qty) || it.qty <= 0)) {
      errBox.textContent = 'Setiap item harus memiliki produk dan qty bilangan bulat > 0.';
      errBox.hidden = false; return;
    }

    await UI.withBusy(btn, async () => {
      try {
        await API.post('/api/purchases', {
          tanggal: container.querySelector('#pbTanggal').value,
          pemasok,
          metode_bayar: container.querySelector('#pbMetode').value,
          catatan: container.querySelector('#pbCatatan').value.trim(),
          items
        });
        UI.toast('Pembelian tersimpan. Stok produk bertambah.');
        // Reset form
        container.querySelector('#pbPemasok').value = '';
        container.querySelector('#pbCatatan').value = '';
        container.querySelector('#pbItems').innerHTML = '';
        this.tambahItem(container);
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
    const box = container.querySelector('#pbRiwayat');
    box.innerHTML = UI.skeleton(4);
    try {
      const data = normalizeArray(await API.get('/api/purchases?limit=100'));
      if (!data.length) {
        box.innerHTML = UI.stateHtml('kosong', 'Belum ada riwayat pembelian.');
        return;
      }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Tanggal</th><th>Pemasok</th><th>Item</th><th>Metode</th><th>Total</th></tr></thead>
        <tbody>${data.map((p) => `
          <tr>
            <td>${UI.esc(p.tanggal)}</td>
            <td>${UI.esc(p.pemasok)}</td>
            <td>${normalizeArray(p.items).map((it) => `${UI.esc(it.nama_produk)} ×${UI.angka(it.qty)}`).join(', ')}</td>
            <td><span class="badge badge-abu">${UI.esc(p.metode_bayar)}</span></td>
            <td><strong>${UI.rupiah(p.total)}</strong></td>
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
