
'use strict';

const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const TOKEN_SECRET = process.env.TOKEN_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const TOKEN_TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS || 12);
const PORT = Number(process.env.PORT || 3000);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT harus berupa angka antara 1 dan 65535.');
}

if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
  throw new Error(
    'TOKEN_SECRET wajib diisi dengan secret acak minimal 32 karakter di .env.'
  );
}

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error(
    'ADMIN_USERNAME dan ADMIN_PASSWORD wajib diisi di .env.'
  );
}

if (
  !Number.isFinite(TOKEN_TTL_HOURS) ||
  TOKEN_TTL_HOURS <= 0
) {
  throw new Error('TOKEN_TTL_HOURS harus lebih besar dari 0.');
}

const DB_FILE = path.resolve(
  ROOT_DIR,
  process.env.DB_FILE || 'data/database-usaha.xlsx'
);

module.exports = {
  ROOT_DIR,
  DATA_DIR: path.join(ROOT_DIR, 'data'),
  DB_FILE,
  BACKUP_DIR: path.join(ROOT_DIR, 'data', 'backup'),
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  PORT,
  TIMEZONE: process.env.TIMEZONE || 'Asia/Jakarta',
  TOKEN_SECRET,
  TOKEN_TTLHours: TOKEN_TTL_HOURS,
  ADMIN_USERNAME,
  ADMIN_PASSWORD
};
