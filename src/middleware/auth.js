'use strict';

const { verifyToken } = require('../utils/token');
const { AppError } = require('../utils/helpers');

/** Middleware autentikasi: mewajibkan header Authorization: Bearer <token>. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return next(new AppError('Sesi tidak ditemukan. Silakan login ulang.', 401));
  }
  const payload = verifyToken(token);
  if (!payload) {
    return next(new AppError('Sesi kedaluwarsa atau tidak valid. Silakan login ulang.', 401));
  }
  req.user = { id: payload.sub, username: payload.username, role: payload.role };
  return next();
}

module.exports = { requireAuth };
