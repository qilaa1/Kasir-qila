'use strict';

/**
 * Aplikasi utama: autentikasi, router hash, navigasi, sesi.
 * Login terpisah sepenuhnya dari pemuatan data bisnis — kegagalan memuat
 * Dashboard/produk tidak pernah membuat login gagal.
 */

const App = (() => {
  const loginView = document.getElementById('loginView');
  const appView = document.getElementById('appView');
  const mainContent = document.getElementById('mainContent');
  const pageTitle = document.getElementById('pageTitle');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const menuToggle = document.getElementById('menuToggle');
  const logoutBtn = document.getElementById('logoutBtn');

  let halamanSaatIni = null;

  // ----------------------------------------------------------- elemen wajib
  const elemenWajib = { loginView, appView, mainContent, pageTitle, loginForm, loginBtn, logoutBtn };
  for (const [nama, el] of Object.entries(elemenWajib)) {
    if (!el) console.error(`[FATAL] Elemen HTML wajib tidak ditemukan: #${nama}. Periksa public/index.html.`);
  }

  // ----------------------------------------------------------- login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await lakukanLogin();
    });
  }

  async function lakukanLogin() {
    if (!loginForm || !loginBtn) return;
    loginError.hidden = true;

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) {
      loginError.textContent = 'Username dan password wajib diisi.';
      loginError.hidden = false;
      return;
    }

    await UI.withBusy(loginBtn, async () => {
      try {
        const hasil = await API.login(username, password);
        // Validasi respons autentikasi: harus objek dengan token & user, bukan array.
        if (!hasil || typeof hasil !== 'object' || Array.isArray(hasil) || !hasil.token || !hasil.user) {
          throw new API.ApiError('Respons login tidak sesuai format. Periksa versi server Anda.');
        }
        API.setSession(hasil.token, hasil.user);
        UI.toast(`Selamat datang, ${hasil.user.nama || hasil.user.username}!`);
        tampilkanAplikasi();
      } catch (err) {
        loginError.textContent = err.message;
        loginError.hidden = false;
      }
    });
  }

  // ----------------------------------------------------------- logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const yakin = await UI.konfirmasi('Keluar dari aplikasi?', { judul: 'Logout', labelYa: 'Ya, keluar', tipe: 'bahaya' });
      if (!yakin) return;
      await API.logoutServer();
      API.clearSession();
      SembunyikanAplikasi();
      UI.toast('Anda telah keluar.');
    });
  }

  function SembunyikanAplikasi() {
    appView.hidden = true;
    loginView.hidden = false;
    if (mainContent) mainContent.innerHTML = '';
    if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '';
    window.location.hash = '';
  }

  function tampilkanAplikasi() {
    loginView.hidden = true;
    appView.hidden = false;
    const user = API.getUser();
    if (user) {
      const namaEl = document.getElementById('userName');
      const roleEl = document.getElementById('userRole');
      const av = document.getElementById('userAvatar');
      if (namaEl) namaEl.textContent = user.nama || user.username || '—';
      if (roleEl) roleEl.textContent = user.role || '—';
      if (av) av.textContent = (user.nama || user.username || 'A').charAt(0).toUpperCase();
    }
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/dashboard';
    } else {
      router();
    }
  }

  // ----------------------------------------------------------- router
  function ruteDariHash() {
    const h = (window.location.hash || '#/dashboard').replace(/^#\/?/, '');
    const nama = h.split('?')[0] || 'dashboard';
    return window.Pages[nama] ? nama : 'dashboard';
  }

  async function router() {
    if (!API.getToken()) { SembunyikanAplikasi(); return; }
    if (appView.hidden) appView.hidden = false;

    const nama = ruteDariHash();
    const halaman = window.Pages[nama];

    // Bersihkan listener halaman sebelumnya agar tidak dobel.
    if (halamanSaatIni && halamanSaatIni !== halaman && typeof halamanSaatIni.destroy === 'function') {
      try { halamanSaatIni.destroy(); } catch (err) { console.error('Gagal membersihkan halaman:', err); }
    }
    halamanSaatIni = halaman;

    document.querySelectorAll('.nav-link').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-page') === nama);
    });
    if (pageTitle) pageTitle.textContent = halaman.title || nama;
    tutupSidebar();

    if (!mainContent) return;
    mainContent.innerHTML = UI.skeleton(6);
    try {
      await halaman.render(mainContent);
    } catch (err) {
      console.error(`[HALAMAN ${nama}]`, err);
      mainContent.innerHTML = UI.stateHtml('error',
        `Halaman "${halaman.title}" gagal dimuat: ${err.message}`,
        '<button type="button" class="btn btn-sm btn-primary" id="cobaLagiHalaman">Coba lagi</button>');
      const coba = mainContent.querySelector('#cobaLagiHalaman');
      if (coba) coba.addEventListener('click', router);
    }
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('session-expired', () => {
    SembunyikanAplikasi();
    loginError.textContent = 'Sesi Anda berakhir. Silakan login kembali.';
    loginError.hidden = false;
  });

  // ----------------------------------------------------------- sidebar mobile
  function bukaSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.hidden = false;
  }
  function tutupSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.hidden = true;
  }
  if (menuToggle) menuToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) tutupSidebar(); else bukaSidebar();
  });
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', tutupSidebar);

  // ----------------------------------------------------------- jam
  const clock = document.getElementById('clock');
  if (clock) {
    const tick = () => {
      clock.textContent = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    };
    tick();
    setInterval(tick, 30000);
  }

  // ----------------------------------------------------------- mulai
  async function mulai() {
    if (!API.getToken()) { SembunyikanAplikasi(); return; }
    // Verifikasi sesi dulu; gagal verifikasi bukan berarti data bisnis gagal.
    try {
      await API.me();
    } catch (err) {
      if (err.status === 401 || err.status === 0) {
        API.clearSession();
        SembunyikanAplikasi();
        if (err.status === 0) {
          loginError.textContent = 'Tidak dapat terhubung ke server. Pastikan server berjalan lalu muat ulang halaman.';
          loginError.hidden = false;
        }
        return;
      }
      // error lain (mis. 500) tetap izinkan masuk; halaman akan menampilkan error masing-masing.
    }
    tampilkanAplikasi();
  }

  mulai();

  return { router };
})();
