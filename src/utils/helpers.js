'use strict';

/** Utilitas umum: tanggal, angka, validasi, dan ID. */

/** Waktu sekarang dalam zona Asia/Jakarta sebagai objek Date (UTC internal). */
function now() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

/** Format Date/String -> 'YYYY-MM-DD HH:mm:ss' (waktu Asia/Jakarta). */
function formatTanggal(value) {
  const d = value ? new Date(value) : now();
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Format Date/String -> 'YYYY-MM-DD'. */
function formatTanggalPendek(value) {
  return formatTanggal(value).slice(0, 10);
}

/** 'YYYY-MM-DD' hari ini (Asia/Jakarta). */
function hariIni() {
  return formatTanggalPendek(new Date());
}

/** Konversi nilai apa pun menjadi angka bulat non-negatif; bukan angka valid -> null. */
function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded;
}

/** Konversi nilai menjadi number desimal; bukan angka valid -> null. */
function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** String aman: trim, buang karakter kontrol. */
function cleanStr(value, maxLen = 500) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen);
}

/** Validasi ID positif. Mengembalikan angka atau null. */
function parseId(value) {
  const n = toInt(value);
  if (n === null || n <= 0) return null;
  return n;
}

/** ID berikutnya = max(id) + 1 pada sebuah daftar record. */
function nextId(rows) {
  let max = 0;
  for (const r of rows || []) {
    const id = toInt(r && r.id);
    if (id !== null && id > max) max = id;
  }
  return max + 1;
}

/** Membulatkan uang ke 2 desimal. */
function uang(value) {
  const n = toNum(value);
  return n === null ? 0 : Math.round(n * 100) / 100;
}

/** Format Rupiah sederhana untuk log/server. */
function formatRupiah(value) {
  const n = uang(value);
  return 'Rp' + n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Validasi record: semua field wajib terisi. */
function requireFields(body, fields) {
  const missing = [];
  for (const f of fields) {
    const v = body ? body[f] : undefined;
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      missing.push(f);
    }
  }
  return missing;
}

/** Object-error khusus untuk error bisnis (validasi, stok, dsb). */
class AppError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}

module.exports = {
  now,
  formatTanggal,
  formatTanggalPendek,
  hariIni,
  toInt,
  toNum,
  cleanStr,
  parseId,
  nextId,
  uang,
  formatRupiah,
  requireFields,
  AppError
};
