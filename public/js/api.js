'use strict';

/**
 * Modul komunikasi API frontend.
 * Kontrak backend: semua respons JSON berbentuk { success, message?, data?, details? }.
 * Modul ini menangani: status HTTP, respons bukan JSON, respons kosong, koneksi gagal,
 * timeout, dan sesi kedaluwarsa (401) — tanpa pernah melempar error mentah ke UI.
 */

const API = (() => {
  const TOKEN_KEY = 'kasir_token';
  const USER_KEY = 'kasir_user';
  const TIMEOUT_MS = 20000;

  class ApiError extends Error {
    constructor(message, status = 0, details = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  }
  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* abaikan */ }
  }

  const STATUS_MESSAGES = {
    400: 'Data yang dikirim tidak valid.',
    401: 'Sesi berakhir. Silakan login kembali.',
    403: 'Anda tidak memiliki akses untuk tindakan ini.',
    404: 'Data atau halaman tidak ditemukan.',
    409: 'Data bentrok dengan data yang sudah ada.',
    422: 'Data belum lengkap.',
    500: 'Terjadi kesalahan di server. Periksa terminal server.',
    503: 'Server sedang tidak tersedia.'
  };

  /** Panggil API. Mengembalikan `data` dari respons, atau melempar ApiError. */
  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new ApiError('Permintaan melebihi batas waktu. Server mungkin sedang sibuk.', 0);
      }
      throw new ApiError('Tidak dapat terhubung ke server. Pastikan server berjalan (npm start) lalu coba lagi.', 0);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text().catch(() => '');
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }

    if (res.status === 401 && path !== '/api/auth/login') {
      clearSession();
      window.dispatchEvent(new CustomEvent('session-expired'));
    }

    if (!json) {
      const pesan = res.ok
        ? 'Server mengirim respons kosong atau bukan JSON.'
        : (STATUS_MESSAGES[res.status] || `Permintaan gagal (HTTP ${res.status}). Respons bukan JSON.`);
      throw new ApiError(pesan, res.status, { raw: text.slice(0, 300) });
    }

    if (!res.ok || json.success === false) {
      const pesan = (json && json.message) || STATUS_MESSAGES[res.status] || `Permintaan gagal (HTTP ${res.status}).`;
      throw new ApiError(pesan, res.status, json && json.details ? json.details : null);
    }

    if (json.success !== true) {
      throw new ApiError('Format respons server tidak sesuai kontrak (field success hilang).', res.status, json);
    }

    return json.data !== undefined
    ? json.data
    : json;  }

  return {
    ApiError,
    getToken,
    setSession,
    getUser,
    clearSession,
    login: async (username, password) => {
      const result = await request(
        'POST',
        '/api/auth/login',
        { username, password }
      );
    
      if (result?.token && result?.user) {
        return result;
      }
    
      throw new ApiError(
        'Respons login tidak sesuai format. Periksa versi server Anda.'
      );
    },    logoutServer: () => request('POST', '/api/auth/logout').catch(() => undefined),
    me: () => request('GET', '/api/auth/me'),
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path)
  };
})();

/**
 * Normalisasi respons API menjadi array.
 * Dipakai sebagai jaring pengaman TAMBAHAN — bukan pengganti kontrak API yang benar.
 */
function normalizeArray(data, key = null) {
  if (Array.isArray(data)) return data;
  if (key && data && typeof data === 'object' && Array.isArray(data[key])) return data[key];
  if (data && typeof data === 'object' && Array.isArray(data.data)) return data.data;
  console.error('[NORMALISASI] Format data API tidak sesuai ekspektasi array:', data);
  return [];
}
