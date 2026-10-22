'use strict';

/**
 * Rute autentikasi.
 * Kontrak:
 * - POST /api/auth/login  { username, password } -> { success, message, token, user }
 * - GET  /api/auth/me                             -> { success, data: user }
 * - POST /api/auth/logout                         -> { success, message } (token dibuang di sisi klien)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../src/db/excel');
const { createToken } = require('../utils/token');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../middleware/error');
const { cleanStr, requireFields, AppError, toInt } = require('../utils/helpers');

const router = express.Router();

router.post('/login', wrap(async (req, res) => {
  const body = req.body || {};
  const missing = requireFields(body, ['username', 'password']);
  if (missing.length) {
    throw new AppError('Username dan password wajib diisi.', 400, { missing });
  }

  const username = cleanStr(body.username, 50).toLowerCase();
  const password = String(body.password);

  const data = await db.readAll();
  const user = (data.Users || []).find(
    (u) => cleanStr(u.username).toLowerCase() === username && toInt(u.aktif) !== 0
  );

  if (!user || !user.password_hash) {
    throw new AppError('Username atau password salah.', 401);
  }

  const ok = await bcrypt.compare(password, String(user.password_hash));
  if (!ok) {
    throw new AppError('Username atau password salah.', 401);
  }

  const publicUser = {
    id: toInt(user.id),
    username: cleanStr(user.username),
    nama: cleanStr(user.nama) || cleanStr(user.username),
    role: cleanStr(user.role) || 'admin'
  };

  const token = createToken(publicUser);
  res.json({ success: true, message: 'Login berhasil.', token, user: publicUser });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const data = db.readAll();
  const user = (data.Users || []).find((u) => toInt(u.id) === toInt(req.user.id) && toInt(u.aktif) !== 0);
  if (!user) throw new AppError('Akun tidak ditemukan atau sudah nonaktif.', 401);
  res.json({
    success: true,
    data: {
      id: toInt(user.id),
      username: cleanStr(user.username),
      nama: cleanStr(user.nama) || cleanStr(user.username),
      role: cleanStr(user.role) || 'admin'
    }
  });
}));

router.post('/logout', requireAuth, (req, res) => {
  // Token stateless: klien cukup membuang token. Sesi berakhir maksimal saat token kedaluwarsa.
  res.json({ success: true, message: 'Logout berhasil.' });
});

module.exports = router;
