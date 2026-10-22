'use strict';

/* Halaman Produk: daftar, filter, tambah, edit, hapus/nonaktif, koreksi stok. */
window.Pages = window.Pages || {};

const KATEGORI_PRODUK = [
  'Es Krim Jadul',
  'Bahan Baku',
  'Santan & Kelapa',
  'Lainnya'
];
const KATEGORI_TANPA_HARGA_JUAL = ['Bahan Baku'];
window.Pages.produk = {
  title: 'Produk',
  daftar: [],

  async render(container) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-head">
          <h3>📦 Daftar Produk</h3>
          <div class="toolbar">
            <input type="search" id="produkCari" class="input input-sm" placeholder="🔍 Cari nama produk..." />
            <select id="produkFilterKategori" class="input input-sm">
              <option value="">Semua kategori</option>
              ${KATEGORI_PRODUK.map((k) => `<option value="${UI.esc(k)}">${UI.esc(k)}</option>`).join('')}
            </select>
            <label class="switch"><input type="checkbox" id="produkTampilNonaktif" /> <small>Tampil nonaktif</small></label>
            <button type="button" id="produkTambahBtn" class="btn btn-primary">+ Tambah Produk</button>
          </div>
        </div>
        <div id="produkTabel">${UI.stateHtml('loading', 'Memuat produk...')}</div>
      </section>`;

    const cari = container.querySelector('#produkCari');
    const filter = container.querySelector('#produkFilterKategori');
    const nonaktif = container.querySelector('#produkTampilNonaktif');
    const tambahBtn = container.querySelector('#produkTambahBtn');

    cari.addEventListener('input', () => this.tampilkan(container));
    filter.addEventListener('change', () => this.tampilkan(container));
    nonaktif.addEventListener('change', () => this.muat(container));
    tambahBtn.addEventListener('click', () => this.bukaForm(container, null));

    await this.muat(container);
  },

  async muat(container) {
    const box = container.querySelector('#produkTabel');
    box.innerHTML = UI.skeleton(6);
    try {
      const nonaktif = container.querySelector('#produkTampilNonaktif').checked;
      const data = normalizeArray(await API.get(`/api/products${nonaktif ? '?include_nonaktif=1' : ''}`));
      if (!Array.isArray(data)) throw new API.ApiError('Format data produk tidak sesuai.');
      this.daftar = data;
      this.tampilkan(container);
    } catch (err) {
      box.innerHTML = UI.stateHtml('error', err.message, '<button type="button" class="btn btn-sm btn-primary" id="produkCobaLagi">Coba lagi</button>');
      const coba = box.querySelector('#produkCobaLagi');
      if (coba) coba.addEventListener('click', () => this.muat(container));
    }
  },

  tampilkan(container) {
    const box = container.querySelector('#produkTabel');
    const q = container.querySelector('#produkCari').value.trim().toLowerCase();
    const kat = container.querySelector('#produkFilterKategori').value;

    const rows = this.daftar.filter((p) =>
      (!q || String(p.nama).toLowerCase().includes(q)) &&
      (!kat || p.kategori === kat)
    );

    if (!rows.length) {
      box.innerHTML = this.daftar.length
        ? UI.stateHtml('kosong', 'Tidak ada produk yang cocok dengan pencarian/filter.')
        : UI.stateHtml('kosong', 'Belum ada produk sama sekali. Klik "+ Tambah Produk" untuk memulai.');
      return;
    }

    box.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Kategori</th>
              <th>Satuan</th>
              <th>Stok</th>
              <th>Harga Beli</th>
              <th>Harga Jual</th>
              <th>Status</th>
              <th class="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((p) => {
              const tanpaHargaJual =
                KATEGORI_TANPA_HARGA_JUAL.includes(p.kategori);

              return `
                <tr class="${p.aktif ? '' : 'row-nonaktif'}">
                  <td><strong>${UI.esc(p.nama)}</strong></td>
                  <td><span class="badge badge-abu">${UI.esc(p.kategori || '-')}</span></td>
                  <td>${UI.esc(p.satuan || '-')}</td>
                  <td>${window.rendahBadge(p)}</td>
                  <td>${UI.rupiah(p.harga_beli)}</td>
                  <td>
                    ${tanpaHargaJual
                      ? '—'
                      : `<strong>${UI.rupiah(p.harga_jual)}</strong>`}
                  </td>
                  <td>
                    ${p.aktif
                      ? '<span class="badge badge-hijau">Aktif</span>'
                      : '<span class="badge badge-abu">Nonaktif</span>'}
                  </td>
                  <td class="text-right actions">
                    <button type="button" class="btn btn-sm btn-ghost"
                      data-aksi="koreksi" data-id="${p.id}"
                      title="Koreksi stok">⚖️</button>
                    <button type="button" class="btn btn-sm btn-ghost"
                      data-aksi="edit" data-id="${p.id}"
                      title="Edit">✏️</button>
                    <button type="button"
                      class="btn btn-sm btn-ghost btn-danger-ghost"
                      data-aksi="hapus" data-id="${p.id}"
                      title="Hapus / nonaktif">🗑️</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    box.querySelectorAll('button[data-aksi]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const produk = this.daftar.find((p) => Number(p.id) === id);

        if (!produk) {
          UI.toast('Produk tidak ditemukan di daftar.', 'galat');
          return;
        }

        const aksi = btn.dataset.aksi;

        if (aksi === 'edit') this.bukaForm(container, produk);
        if (aksi === 'hapus') this.hapus(container, produk);
        if (aksi === 'koreksi') this.koreksiStok(container, produk);
      });
    });
  },

  /** Form modal tambah/edit produk. */
  bukaForm(container, produk) {
    const edit = Boolean(produk);
    const root = document.getElementById('modalRoot');

    root.hidden = false;
    root.innerHTML = `
      <div class="modal modal-lg" role="dialog" aria-modal="true">
        <h3>${edit ? '✏️ Edit Produk' : '+ Tambah Produk'}</h3>

        <div id="formProdukError" class="form-error" hidden></div>

        <form id="formProduk" novalidate>
          <div class="form-grid">
            <div class="field field-span">
              <label for="fpNama">Nama Produk *</label>
              <input class="input" id="fpNama"
                value="${UI.esc(produk ? produk.nama : '')}" required />
            </div>

            <div class="field">
              <label for="fpKategori">Kategori *</label>
              <select class="input" id="fpKategori" required>
                ${KATEGORI_PRODUK.map((k) => `
                  <option value="${UI.esc(k)}"
                    ${produk && produk.kategori === k ? 'selected' : ''}>
                    ${UI.esc(k)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="field">
              <label for="fpSatuan">Satuan *</label>
              <input class="input" id="fpSatuan"
                placeholder="pcs / liter / kg"
                value="${UI.esc(produk ? produk.satuan : '')}" required />
            </div>

            <div class="field">
              <label for="fpHargaBeli">Harga Beli (Rp) *</label>
              <input class="input" id="fpHargaBeli" type="number"
                min="0" step="any"
                value="${produk ? produk.harga_beli : ''}" required />
            </div>

            <div class="field" id="fieldHargaJual">
              <label for="fpHargaJual">Harga Jual (Rp) *</label>
              <input class="input" id="fpHargaJual" type="number"
                min="0" step="any"
                value="${produk ? produk.harga_jual : ''}" required />
            </div>

            <div class="field">
              <label for="fpStok">Stok ${edit
                ? '(gunakan koreksi stok untuk perubahan)'
                : 'Awal'}</label>
              <input class="input" id="fpStok" type="number"
                min="0" step="1"
                value="${produk ? produk.stok : 0}"
                ${edit ? 'readonly' : ''} />
            </div>

            <div class="field">
              <label for="fpStokMin">Stok Minimum *</label>
              <input class="input" id="fpStokMin" type="number"
                min="0" step="1"
                value="${produk ? produk.stok_minimum : 0}" required />
            </div>

            ${edit ? `
              <div class="field field-span">
                <label class="switch">
                  <input type="checkbox" id="fpAktif"
                    ${produk.aktif ? 'checked' : ''} />
                  Produk aktif (tampil di dropdown transaksi)
                </label>
              </div>
            ` : ''}
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close>Batal</button>
            <button type="submit" class="btn btn-primary">
              ${edit ? 'Simpan Perubahan' : 'Tambah Produk'}
            </button>
          </div>
        </form>
      </div>
    `;

    const tutup = () => {
      root.hidden = true;
      root.innerHTML = '';
    };

    root.querySelector('[data-close]').addEventListener('click', tutup);

    const kategoriSelect = root.querySelector('#fpKategori');
    const fieldHargaJual = root.querySelector('#fieldHargaJual');
    const inputHargaJual = root.querySelector('#fpHargaJual');

    function aturHargaJual() {
      const tanpaHargaJual =
        KATEGORI_TANPA_HARGA_JUAL.includes(kategoriSelect.value);

      fieldHargaJual.hidden = tanpaHargaJual;
      inputHargaJual.required = !tanpaHargaJual;

      if (tanpaHargaJual) {
        inputHargaJual.value = '0';
      } else if (!edit || !produk || Number(inputHargaJual.value) === 0) {
        inputHargaJual.value = '';
      }
    }

    kategoriSelect.addEventListener('change', aturHargaJual);
    aturHargaJual();

    root.querySelector('#formProduk').addEventListener('submit', async (e) => {
      e.preventDefault();

      const errBox = root.querySelector('#formProdukError');
      errBox.hidden = true;

      const kategori = kategoriSelect.value;
      const tanpaHargaJual =
        KATEGORI_TANPA_HARGA_JUAL.includes(kategori);

      const body = {
        nama: root.querySelector('#fpNama').value.trim(),
        kategori,
        satuan: root.querySelector('#fpSatuan').value.trim(),
        harga_beli: root.querySelector('#fpHargaBeli').value,
        harga_jual: tanpaHargaJual ? '0' : inputHargaJual.value,
        stok: root.querySelector('#fpStok').value,
        stok_minimum: root.querySelector('#fpStokMin').value
      };

      if (edit) {
        body.aktif = root.querySelector('#fpAktif').checked;
      }

      if (!body.nama || !body.satuan) {
        errBox.textContent = 'Nama produk dan satuan wajib diisi.';
        errBox.hidden = false;
        return;
      }

      if (body.harga_beli === '' ||
          (!tanpaHargaJual && body.harga_jual === '')) {
        errBox.textContent = 'Harga beli dan harga jual wajib diisi sesuai kategori.';
        errBox.hidden = false;
        return;
      }

      const btn = e.target.querySelector('button[type="submit"]');

      await UI.withBusy(btn, async () => {
        try {
          if (edit) {
            delete body.stok;
            await API.put(`/api/products/${produk.id}`, body);
            UI.toast('Produk berhasil diperbarui.');
          } else {
            await API.post('/api/products', body);
            UI.toast('Produk berhasil ditambahkan.');
          }

          tutup();
          await this.muat(container);
          window.dispatchEvent(new CustomEvent('products-changed'));
        } catch (err) {
          errBox.textContent = err.message || 'Gagal menyimpan produk.';
          errBox.hidden = false;
        }
      });
    });
  },

  async hapus(container, produk) {
    const yakin = await UI.konfirmasi(
      `Hapus produk "${produk.nama}"? Jika produk memiliki riwayat transaksi, produk akan dinonaktifkan agar riwayat tetap tersimpan.`,
      { judul: 'Hapus / Nonaktifkan Produk' }
    );
    if (!yakin) return;
    try {
      const hasil = await API.del(`/api/products/${produk.id}`);
      UI.toast(hasil && typeof hasil === 'object' && hasil.message ? hasil.message : 'Produk diproses.');
      this.muat(container);
      window.dispatchEvent(new CustomEvent('products-changed'));
    } catch (err) {
      UI.toast(err.message, 'galat');
    }
  },

  koreksiStok(container, produk) {
    const root = document.getElementById('modalRoot');
    root.hidden = false;
    root.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>⚖️ Koreksi Stok — ${UI.esc(produk.nama)}</h3>
        <p class="muted">Stok saat ini: <strong>${UI.angka(produk.stok)} ${UI.esc(produk.satuan)}</strong></p>
        <div id="formKoreksiError" class="form-error" hidden></div>
        <form id="formKoreksi">
          <div class="field">
            <label for="fkStok">Stok Baru *</label>
            <input class="input" id="fkStok" type="number" min="0" step="1" value="${produk.stok}" required />
          </div>
          <div class="field">
            <label for="fkAlasan">Alasan Koreksi *</label>
            <input class="input" id="fkAlasan" placeholder="mis. hasil opname, barang rusak, ..." required />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close>Batal</button>
            <button type="submit" class="btn btn-primary">Simpan Koreksi</button>
          </div>
        </form>
      </div>`;
    const tutup = () => { root.hidden = true; root.innerHTML = ''; };
    root.querySelector('[data-close]').addEventListener('click', tutup);
    root.querySelector('#formKoreksi').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = root.querySelector('#formKoreksiError');
      errBox.hidden = true;
      const btn = e.target.querySelector('button[type="submit"]');
      await UI.withBusy(btn, async () => {
        try {
          await API.post(`/api/products/${produk.id}/koreksi-stok`, {
            stok_baru: root.querySelector('#fkStok').value,
            alasan: root.querySelector('#fkAlasan').value.trim()
          });
          UI.toast('Koreksi stok tersimpan.');
          tutup();
          this.muat(container);
          window.dispatchEvent(new CustomEvent('products-changed'));
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
    });
  }
};
