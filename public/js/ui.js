'use strict';

/** Helper UI: escaping, format, toast, modal konfirmasi, state loading/empty/error. */

const UI = (() => {
  /** Escape teks pengguna sebelum dimasukkan ke innerHTML (anti-XSS). */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Format angka menjadi Rupiah. Angka tidak valid -> 'Rp0'. */
  function rupiah(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Rp0';
    return 'Rp' + Math.round(n).toLocaleString('id-ID');
  }

  /** Angka dengan pemisah ribuan. */
  function angka(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('id-ID') : '0';
  }

  /** Tanggal panjang (Asia/Jakarta) untuk ditampilkan. */
  function tanggalIndo(value) {
    if (!value) return '—';
    const d = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return esc(value);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function tanggalPendek(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    return s;
  }

  /** Toast notifikasi. */
  function toast(pesan, tipe = 'sukses', durasiMs = 3500) {
    const box = document.getElementById('toastContainer');
    if (!box) { console.log(`[TOAST:${tipe}]`, pesan); return; }
    const el = document.createElement('div');
    el.className = `toast toast-${tipe}`;
    el.textContent = pesan;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, durasiMs);
  }

  /** Modal konfirmasi berbasis Promise. Mengembalikan true jika dikonfirmasi. */
  function konfirmasi(pesan, { judul = 'Konfirmasi', labelYa = 'Ya, lanjutkan', labelTidak = 'Batal', tipe = 'bahaya' } = {}) {
    return new Promise((resolve) => {
      const root = document.getElementById('modalRoot');
      if (!root) { resolve(window.confirm(pesan)); return; }
      root.hidden = false;
      root.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <h3>${esc(judul)}</h3>
          <p>${esc(pesan)}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-act="no">${esc(labelTidak)}</button>
            <button type="button" class="btn ${tipe === 'bahaya' ? 'btn-danger' : 'btn-primary'}" data-act="yes">${esc(labelYa)}</button>
          </div>
        </div>`;
      const selesai = (hasil) => {
        root.hidden = true;
        root.innerHTML = '';
        resolve(hasil);
      };
      root.querySelector('[data-act="yes"]').addEventListener('click', () => selesai(true));
      root.querySelector('[data-act="no"]').addEventListener('click', () => selesai(false));
      root.addEventListener('click', (e) => { if (e.target === root) selesai(false); }, { once: true });
    });
  }

  /** Cegah pengiriman form berulang: kunci tombol selama proses berjalan. */
  async function withBusy(btn, fn) {
    if (btn) {
      if (btn.disabled) return; // klik ganda terdeteksi — abaikan
      btn.disabled = true;
      btn.classList.add('busy');
    }
    try {
      return await fn();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('busy');
      }
    }
  }

  /** Kartu status: loading / kosong / error. */
  function stateHtml(tipe, pesan, aksi = '') {
    const ikon = { loading: '⏳', kosong: '📭', error: '⚠️' }[tipe] || 'ℹ️';
    return `<div class="state state-${tipe}"><div class="state-ikon">${ikon}</div><p>${esc(pesan)}</p>${aksi}</div>`;
  }

  function skeleton(jumlah = 5) {
    let html = '';
    for (let i = 0; i < jumlah; i++) html += '<div class="skeleton-line"></div>';
    return `<div class="skeleton">${html}</div>`;
  }

  return { esc, rupiah, angka, tanggalIndo, tanggalPendek, toast, konfirmasi, withBusy, stateHtml, skeleton };
})();
