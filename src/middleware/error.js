'use strict';

/** 404 untuk endpoint API yang tidak dikenal. */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Endpoint tidak ditemukan: ${req.method} ${req.originalUrl}`
  });
}

/** Middleware penanganan error terpusat. Tidak pernah mengirim stack trace ke klien. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err && err.status ? err.status : 500;
  const message = err && err.message ? err.message : 'Terjadi kesalahan pada server.';

  if (status >= 500) {
    // Detail teknis hanya untuk log server.
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Terjadi kesalahan pada server. Periksa log terminal server untuk detail.' : message,
    details: err && err.details ? err.details : undefined
  });
}

/** Bungkus handler async agar error langsung diteruskan ke errorHandler. */
function wrap(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { notFound, errorHandler, wrap };
