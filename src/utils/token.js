'use strict';

/**
 * Token autentikasi sederhana berbasis HMAC-SHA256 (format ala JWT: header.payload.signature).
 * Dirancang untuk aplikasi lokal; secret diambil dari environment variable TOKEN_SECRET.
 */

const crypto = require('crypto');
const config = require('../config');

const SECRET = config.TOKEN_SECRET;

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

/** Buat token untuk user. */
function createToken(user, ttlHours = config.TOKEN_TTLHours) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'HMAC' }));
  const payloadObj = {
    sub: user.id,
    username: user.username,
    role: user.role,
    iat: Date.now(),
    exp: Date.now() + ttlHours * 3600 * 1000
  };
  const payload = b64url(JSON.stringify(payloadObj));
  const signature = sign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

/** Verifikasi token. Mengembalikan payload atau null jika tidak valid/kedaluwarsa. */
function verifyToken(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) return null;
  const [header, payload, signature] = token.split('.');
  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
  return data;
}

module.exports = { createToken, verifyToken };
