'use strict';

/** Halaman Pengeluaran: form + riwayat + filter periode + total. */
window.Pages = window.Pages || {};

const KATEGORI_USAHA_EX = ['Es Krim Jadul', 'Santan & Kelapa', 'Umum'];
const KATEGORI_EX = ['Bahan baku', 'Operasional', 'Gaji', 'Sewa', 'Listrik & Air', 'Lainnya'];
const METODE_BAYAR_EX = ['Tunai', 'Transfer', 'QRIS', 'Lainnya'];

window.Pages.pengeluaran = {
  title: 'Pengeluaran',

  async render(container) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>💸 Tambah Pengeluaran</h3></div>
        <div class="form-grid">
          <div class="field"><label for="exTanggal">Tanggal *</label>
            <input class="input" type="date" id="exTanggal" value="${window.hariIniJakarta()}" /></div>
          <div class="field"><label for="exUsaha">Kategori Usaha *</label>
            <select class="input" id="exUsaha">${KATEGORI_USAHA_EX.map((k) => `<option>${k}</option>`).join('')}</select></div>
          <div class="field"><label for="exKategori">Kategori Pengeluaran *</label>
            <select class="input" id="exKategori">${KATEGORI_EX.map((k) => `<option>${k}</option>`).join('')}</select></div>
          <div class="field"><label for="exJumlah">Jumlah (Rp) *</label>
            <input class="input" id="exJumlah" type="number" min="1" step="any" placeholder="mis. 50000" /></div>
          <div class="field"><label for="exMetode">Metode Pembayaran *</label>
            <select class="input" id="exMetode">${METODE_BAYAR_EX.map((m) => `<option>${m}</option>`).join('')}</select></div>
          <div class="field field-span"><label for="exDeskripsi">Deskripsi *</label>
            <input class="input" id="exDeskripsi" placeholder="mis. beli gas LPG tabung 3kg" /></div>
        </div>
        <div id="exError" class="form-error" hidden></div>
        <button type="button" id="exSimpan" class="btn btn-primary">💾 Simpan Pengeluaran</button>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>📜 Riwayat Pengeluaran</h3>
          <div class="toolbar">
            <label class="muted">Dari</label><input class="input input-sm" type="date" id="exDari" value="${window.hariIniJakarta()}" />
            <label class="muted">Sampai</label><input class="input input-sm" type="date" id="exSampai" value="${window.hariIniJakarta()}" />
            <button type="button" id="exFilter" class="btn btn-sm btn-primary">Terapkan</button>
            <button type="button" id="exSemuaPeriode" class="btn btn-sm btn-ghost">Semua periode</button>
          </div>
        </div>
        <div id="exTotal" class="total-line"></div>
        <div id="exRiwayat">${UI.stateHtml('loading', 'Memuat riwayat...')}</div>
      </section>`;

    container.querySelector('#exSimpan').addEventListener('click', (e) => this.simpan(container, e.currentTarget));
    container.querySelector('#exFilter').addEventListener('click', () => this.muatRiwayat(container));
    container.querySelector('#exSemuaPeriode').addEventListener('click', () => {
      container.querySelector('#exDari').value = '2000-01-01';
      container.querySelector('#exSampai').value = '2100-01-01';
      this.muatRiwayat(container);
    });

    await this.muatRiwayat(container);
  },

  async simpan(container, btn) {
    const errBox = container.querySelector('#exError');
    errBox.hidden = true;

    const body = {
      tanggal: container.querySelector('#exTanggal').value,
      kategori_usaha: container.querySelector('#exUsaha').value,
      kategori: container.querySelector('#exKategori').value,
      deskripsi: container.querySelector('#exDeskripsi').value.trim(),
      jumlah: container.querySelector('#exJumlah').value,
      metode_bayar: container.querySelector('#exMetode').value
    };
    if (!body.deskripsi) { errBox.textContent = 'Deskripsi wajib diisi.'; errBox.hidden = false; return; }
    if (!body.jumlah || Number(body.jumlah) <= 0) { errBox.textContent = 'Jumlah pengeluaran harus angka lebih dari 0.'; errBox.hidden = false; return; }

    await UI.withBusy(btn, async () => {
      try {
        await API.post('/api/expenses', body);
        UI.toast('Pengeluaran tersimpan.');
        container.querySelector('#exDeskripsi').value = '';
        container.querySelector('#exJumlah').value = '';
        this.muatRiwayat(container);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  },

  async muatRiwayat(container) {
    const box = container.querySelector('#exRiwayat');
    const totalBox = container.querySelector('#exTotal');
    box.innerHTML = UI.skeleton(4);
    const dari = container.querySelector('#exDari').value;
    const sampai = container.querySelector('#exSampai').value;
    try {
      const data = normalizeArray(await API.get(`/api/expenses?dari=${dari}&sampai=${sampai}`));
      const total = data.reduce((a, e) => a + (Number(e.jumlah) || 0), 0);
      totalBox.innerHTML = `Total pengeluaran ${UI.esc(dari)} s/d ${UI.esc(sampai)}: <strong>${UI.rupiah(total)}</strong> <small class="muted">(${UI.angka(data.length)} catatan)</small>`;
      if (!data.length) {
        box.innerHTML = UI.stateHtml('kosong', 'Tidak ada pengeluaran pada periode ini.');
        return;
      }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Tanggal</th><th>Usaha</th><th>Kategori</th><th>Deskripsi</th><th>Metode</th><th>Jumlah</th></tr></thead>
        <tbody>${data.map((e) => `
          <tr>
            <td>${UI.esc(String(e.tanggal).slice(0, 10))}</td>
            <td><span class="badge badge-abu">${UI.esc(e.kategori_usaha)}</span></td>
            <td>${UI.esc(e.kategori)}</td>
            <td>${UI.esc(e.deskripsi)}</td>
            <td>${UI.esc(e.metode_bayar)}</td>
            <td><strong>${UI.rupiah(e.jumlah)}</strong></td>
          </tr>`).join('')}
        </tbody></table></div>`;
    } catch (err) {
      totalBox.innerHTML = '';
      box.innerHTML = UI.stateHtml('error', err.message);
    }
  }
};
