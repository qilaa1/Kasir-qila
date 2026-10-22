'use strict';

/** Halaman Penjualan / Kasir: keranjang, simpan transaksi, riwayat + struk. */
window.Pages = window.Pages || {};

const METODE_BAYAR_JUAL = ['Tunai', 'QRIS', 'Transfer', 'Debit', 'Lainnya'];

window.Pages.penjualan = {
  title: 'Penjualan / Kasir',
  produk: [],
  keranjang: [],

  async render(container) {
    this.keranjang = [];
    container.innerHTML = `
      <div class="grid-2 grid-kasir">
        <section class="panel">
          <div class="panel-head"><h3>🛒 Transaksi Baru</h3></div>
          <div class="form-grid">
            <div class="field"><label for="sjProduk">Produk *</label>
              <select class="input" id="sjProduk"><option value="">— pilih produk —</option></select></div>
            <div class="field"><label for="sjQty">Qty *</label>
              <input class="input" id="sjQty" type="number" min="1" step="1" value="1" /></div>
          </div>
          <button type="button" id="sjTambah" class="btn btn-primary btn-block">+ Masukkan ke Keranjang</button>

          <div class="items-box">
            <div class="panel-head"><h4>Keranjang</h4></div>
            <div id="sjKeranjang">${UI.stateHtml('kosong', 'Keranjang masih kosong.')}</div>
            <div class="total-line">Total: <strong id="sjTotal">Rp0</strong></div>
          </div>

          <div class="form-grid">
            <div class="field"><label for="sjMetode">Metode Pembayaran *</label>
              <select class="input" id="sjMetode">${METODE_BAYAR_JUAL.map((m) => `<option>${m}</option>`).join('')}</select></div>
            <div class="field"><label for="sjCatatan">Catatan</label>
              <input class="input" id="sjCatatan" placeholder="opsional" /></div>
          </div>
          <div id="sjError" class="form-error" hidden></div>
          <button type="button" id="sjSimpan" class="btn btn-success btn-block">💾 Simpan Transaksi</button>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>📜 Riwayat Penjualan</h3>
            <button type="button" id="sjMuatUlang" class="btn btn-sm btn-ghost">Muat ulang</button></div>
          <div id="sjRiwayat">${UI.stateHtml('loading', 'Memuat riwayat...')}</div>
        </section>
      </div>`;

    container.querySelector('#sjTambah').addEventListener('click', () => this.tambah(container));
    container.querySelector('#sjSimpan').addEventListener('click', (e) => this.simpan(container, e.currentTarget));
    container.querySelector('#sjMuatUlang').addEventListener('click', () => this.muatRiwayat(container));
    window.addEventListener('products-changed', this._onProductsChanged = () => this.muatProduk(container));

    await Promise.allSettled([this.muatProduk(container), this.muatRiwayat(container)]);
  },


  async muatProduk(container) {
    try {
      const semuaProduk = normalizeArray(await API.get('/api/products'));
  
      // Bahan Baku tidak boleh dijual melalui kasir.
      this.produk = semuaProduk.filter((p) => {
        const kategori = String(p.kategori || '').trim().toLowerCase();
        return kategori !== 'bahan baku' && Number(p.aktif) !== 0;
      });
  
      const sel = container.querySelector('#sjProduk');
      const nilai = sel.value;
  
      sel.innerHTML = '<option value="">— pilih produk —</option>' +
        this.produk.map((p) =>
          `<option value="${p.id}">${UI.esc(p.nama)} — ${UI.rupiah(p.harga_jual)} (stok ${UI.angka(p.stok)})</option>`
        ).join('');
  
      if (nilai && this.produk.some((p) => String(p.id) === nilai)) {
        sel.value = nilai;
      }
    } catch (err) {
      UI.toast('Gagal memuat produk: ' + err.message, 'galat');
    }
  },
  

  tambah(container) {
    const errBox = container.querySelector('#sjError');
    errBox.hidden = true;
    const id = Number(container.querySelector('#sjProduk').value);
    const qty = Number(container.querySelector('#sjQty').value);
    const p = this.produk.find((x) => x.id === id);
    if (!p) { errBox.textContent = 'Pilih produk terlebih dahulu.'; errBox.hidden = false; return; }
    if (!Number.isInteger(qty) || qty <= 0) { errBox.textContent = 'Qty harus bilangan bulat lebih dari 0.'; errBox.hidden = false; return; }

    const diKeranjang = this.keranjang.find((i) => i.product_id === id);
    const jumlahBaru = (diKeranjang ? diKeranjang.qty : 0) + qty;
    if (jumlahBaru > Number(p.stok)) {
      errBox.textContent = `Stok "${p.nama}" tidak mencukupi (tersisa ${p.stok}).`;
      errBox.hidden = false;
      return;
    }
    if (diKeranjang) diKeranjang.qty = jumlahBaru;
    else this.keranjang.push({ product_id: id, nama: p.nama, satuan: p.satuan, harga: Number(p.harga_jual), qty });

    container.querySelector('#sjQty').value = 1;
    this.gambar(container);
  },

  gambar(container) {
    const box = container.querySelector('#sjKeranjang');
    if (!this.keranjang.length) {
      box.innerHTML = UI.stateHtml('kosong', 'Keranjang masih kosong.');
    } else {
      box.innerHTML = `<div class="table-wrap"><table class="table table-compact">
        <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>${this.keranjang.map((i, idx) => `
          <tr>
            <td>${UI.esc(i.nama)}</td>
            <td>${UI.angka(i.qty)} ${UI.esc(i.satuan)}</td>
            <td>${UI.rupiah(i.harga)}</td>
            <td><strong>${UI.rupiah(i.harga * i.qty)}</strong></td>
            <td><button type="button" class="btn btn-sm btn-ghost btn-danger-ghost" data-hapus="${idx}">✕</button></td>
          </tr>`).join('')}
        </tbody></table></div>`;
      box.querySelectorAll('[data-hapus]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.keranjang.splice(Number(btn.getAttribute('data-hapus')), 1);
          this.gambar(container);
        });
      });
    }
    const total = this.keranjang.reduce((a, i) => a + i.harga * i.qty, 0);
    container.querySelector('#sjTotal').textContent = UI.rupiah(total);
  },

  async simpan(container, btn) {
    const errBox = container.querySelector('#sjError');
    errBox.hidden = true;
    if (!this.keranjang.length) { errBox.textContent = 'Keranjang masih kosong.'; errBox.hidden = false; return; }

    await UI.withBusy(btn, async () => {
      try {
        const hasil = await API.post('/api/sales', {
          metode_bayar: container.querySelector('#sjMetode').value,
          catatan: container.querySelector('#sjCatatan').value.trim(),
          items: this.keranjang.map((i) => ({ product_id: i.product_id, qty: i.qty }))
        });
        UI.toast(`Transaksi tersimpan. Total ${UI.rupiah(hasil && hasil.total)}.`);
        this.keranjang = [];
        container.querySelector('#sjCatatan').value = '';
        this.gambar(container);
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
    const box = container.querySelector('#sjRiwayat');
    box.innerHTML = UI.skeleton(4);
  
    try {
      const response = await API.get('/api/sales?limit=100');
  
      // Mendukung respons API berupa array langsung maupun { success, data }.
      const data = normalizeArray(
        Array.isArray(response) ? response : response?.data
      );
  
      if (!data.length) {
        box.innerHTML = UI.stateHtml(
          'kosong',
          'Belum ada penjualan.'
        );
        return;
      }
  
      box.innerHTML = `
        <div class="table-wrap">
          <table class="table table-compact">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Item</th>
                <th>Metode</th>
                <th>Total</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${data.map((sale, index) => {
                const items = normalizeArray(sale.items);
  
                const daftarItem = items.length
                  ? items.map(item =>
                      `${UI.esc(item.nama_produk || '-')} ×${UI.angka(item.qty || 0)}`
                    ).join(', ')
                  : 'Detail item tidak tersedia';
  
                return `
                  <tr>
                    <td>${UI.esc(sale.tanggal || '-')}</td>
                    <td>${daftarItem}</td>
                    <td>
                      <span class="badge badge-abu">
                        ${UI.esc(sale.metode_bayar || '-')}
                      </span>
                    </td>
                    <td><strong>${UI.rupiah(sale.total || 0)}</strong></td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        data-struk-index="${index}"
                        aria-label="Lihat dan cetak struk transaksi ${UI.esc(sale.id)}"
                      >🧾</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
  
      box.querySelectorAll('[data-struk-index]').forEach(button => {
        button.addEventListener('click', () => {
          const index = Number(button.getAttribute('data-struk-index'));
          const sale = data[index];
  
          if (!sale) {
            UI.toast('Data transaksi tidak ditemukan.');
            return;
          }
  
          const items = normalizeArray(sale.items);
  
          if (!items.length) {
            UI.toast('Detail produk transaksi tidak tersedia.');
            return;
          }
  
          // Satu klik membuka satu struk yang berisi semua item transaksi.
          this.tampilkanStruk({
            ...sale,
            items
          });
        });
      });
  
    } catch (err) {
      console.error('[Riwayat Penjualan]', err);
  
      box.innerHTML = UI.stateHtml(
        'error',
        err.message || 'Gagal memuat riwayat penjualan.'
      );
    }
  },
  
tampilkanStruk(sale) {
  const root = document.getElementById('modalRoot');

  if (!root || !sale) {
    alert('Data struk tidak ditemukan.');
    return;
  }

  const items = normalizeArray(sale.items);

  if (items.length === 0) {
    alert('Detail produk pada transaksi ini tidak ditemukan.');
    return;
  }

  const totalItem = items.reduce(
    (sum, item) => sum + Number(item.qty || 0),
    0
  );

  root.hidden = false;

  root.innerHTML = `
    <div class="modal modal-struk" role="dialog" aria-modal="true">

      <div class="struk-header">
        <div class="struk-logo">🍦</div>
        <h2>USAHA ABANG ADEK</h2>
        <p class="struk-tagline">Manisnya Kebersamaan</p>
        <div class="struk-label">STRUK PEMBELIAN</div>
      </div>

      <div class="struk-info">
        <div>
          <span>No. Transaksi</span>
          <strong>SALE-${UI.esc(sale.id)}</strong>
        </div>
        <div>
          <span>Tanggal</span>
          <strong>${UI.esc(sale.tanggal || '-')}</strong>
        </div>
        <div>
          <span>Metode Pembayaran</span>
          <strong>${UI.esc(sale.metode_bayar || '-')}</strong>
        </div>
      </div>

      <div class="struk-divider"></div>

      <div class="struk-section-title">DETAIL PESANAN</div>

      <table class="table table-compact struk-table">
        <thead>
          <tr>
            <th>Produk</th>
            <th class="struk-center">Qty</th>
            <th class="struk-right">Harga</th>
            <th class="struk-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it) => `
            <tr>
              <td>${UI.esc(it.nama_produk || '-')}</td>
              <td class="struk-center">${UI.angka(it.qty)}</td>
              <td class="struk-right">${UI.rupiah(it.harga_jual)}</td>
              <td class="struk-right">${UI.rupiah(
                it.subtotal != null
                  ? it.subtotal
                  : Number(it.qty || 0) * Number(it.harga_jual || 0)
              )}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="struk-divider"></div>

      <div class="struk-summary">
        <div class="struk-summary-row">
          <span>Total jenis produk</span>
          <span>${items.length} jenis</span>
        </div>
        <div class="struk-summary-row">
          <span>Total jumlah item</span>
          <span>${UI.angka(totalItem)} item</span>
        </div>
        <div class="struk-total">
          <span>TOTAL PEMBAYARAN</span>
          <strong>${UI.rupiah(sale.total)}</strong>
        </div>
      </div>

      ${sale.catatan ? `
        <div class="struk-note">
          <strong>Catatan:</strong> ${UI.esc(sale.catatan)}
        </div>
      ` : ''}

      <div class="struk-footer">
        <div class="struk-footer-icon">♡</div>
        <strong>Terima kasih sudah berbelanja!</strong>
        <p>Senang bisa menjadi bagian dari hari manismu.</p>
        <span>USAHA ABANG ADEK · Sampai jumpa kembali!</span>
      </div>

      <div class="modal-actions struk-actions">
        <button type="button" class="btn btn-ghost" data-close>
          Tutup
        </button>
        <button type="button" class="btn btn-primary" id="cetakStruk">
          🖨️ Cetak Struk
        </button>
      </div>
    </div>
  `;

  root.querySelector('[data-close]').addEventListener('click', () => {
    root.hidden = true;
    root.innerHTML = '';
  });

  root.querySelector('#cetakStruk').addEventListener('click', () => {
    // Buat jendela cetak khusus untuk struk ini.
    const printWindow = window.open('', '_blank', 'width=500,height=700');

    if (!printWindow) {
      alert('Jendela cetak diblokir browser. Izinkan pop-up untuk aplikasi kasir ini, lalu coba lagi.');
      return;
    }

    // Salin stylesheet dengan URL absolut agar tetap bisa dimuat.
    const stylesheets = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]')
    ).map((link) => {
      const href = new URL(link.href, window.location.href).href;
      return `<link rel="stylesheet" href="${href}">`;
    }).join('\n');

    // Salin CSS inline dari halaman.
    const inlineStyles = Array.from(
      document.querySelectorAll('style')
    ).map((style) => style.innerHTML).join('\n');

    const struk = root.querySelector('.modal-struk');

    if (!struk) {
      printWindow.close();
      alert('Tampilan struk tidak ditemukan.');
      return;
    }

    // Hilangkan tombol Tutup dan Cetak dari hasil cetak.
    const strukCetak = struk.cloneNode(true);
    strukCetak.querySelector('.struk-actions')?.remove();

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Struk SALE-${UI.esc(sale.id)}</title>

        ${stylesheets}

        <style>
          ${inlineStyles}

          @page {
            size: auto;
            margin: 8mm;
          }

          html,
          body {
            background: #fff !important;
            color: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          *,
          *::before,
          *::after {
            visibility: visible !important;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .modal-struk {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            transform: none !important;
          }

          .struk-table {
            display: table !important;
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: auto !important;
          }

          .struk-table thead {
            display: table-header-group !important;
          }

          .struk-table tbody {
            display: table-row-group !important;
          }

          .struk-table tr {
            display: table-row !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .struk-table th,
          .struk-table td {
            display: table-cell !important;
            padding: 5px 3px !important;
            color: #000 !important;
            overflow-wrap: anywhere;
          }

          .struk-header,
          .struk-info,
          .struk-summary,
          .struk-footer,
          .struk-note {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .struk-actions,
          [data-close],
          #cetakStruk {
            display: none !important;
          }

          @media print {
            html,
            body {
              overflow: visible !important;
              height: auto !important;
            }

            .modal-struk {
              overflow: visible !important;
            }
          }
        </style>
      </head>
      <body>
        ${strukCetak.outerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();

    // Tunggu stylesheet selesai dimuat sebelum membuka dialog cetak.
    printWindow.onload = async () => {
      try {
        if (printWindow.document.fonts?.ready) {
          await printWindow.document.fonts.ready;
        }
      } catch (error) {
        // Tetap lanjutkan cetak jika font gagal dimuat.
      }

      printWindow.focus();
      printWindow.print();
    };
  });
},
}