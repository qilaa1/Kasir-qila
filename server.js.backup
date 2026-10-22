
'use strict';

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '.env')
});

/**
 * Aplikasi Kasir & Manajemen Usaha Es Krim Jadul
 * Entry point server Express.
 */

const express = require('express');
const bcrypt = require('bcryptjs');

const config = require('./src/config');

const db = require('./src/db/excel');
const { requireAuth } = require('./src/middleware/auth');
const { notFound, errorHandler } = require('./src/middleware/error');
const { cleanStr, toInt, nextId } = require('./src/utils/helpers');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Log ringkas setiap request API.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// ------------------------------------------------------------ bootstrap database & admin
async function bootstrap() {
  db.ensureDirs();
  db.ensureStructure(db.readWorkbook());

  const data = db.readAll();
  const users = data.Users || [];
  const adaAdmin = users.some((u) => cleanStr(u.role).toLowerCase() === 'admin' && toInt(u.aktif) !== 0);

  if (!adaAdmin) {
    console.log(`[ADMIN] Belum ada akun admin. Membuat akun awal: "${config.ADMIN_USERNAME}"`);
    await db.commit((d) => {
      if ((d.Users || []).some((u) => cleanStr(u.username).toLowerCase() === config.ADMIN_USERNAME.toLowerCase())) return;
      const hash = bcrypt.hashSync(config.ADMIN_PASSWORD, 10);
      d.Users.push({
        id: nextId(d.Users),
        username: config.ADMIN_USERNAME,
        password_hash: hash,
        nama: 'Administrator',
        role: 'admin',
        aktif: 1
      });
    });
    console.log(`[ADMIN] Akun dibuat. Username: ${config.ADMIN_USERNAME} | Password: ${config.ADMIN_PASSWORD}`);
    console.log('[ADMIN] SEGERA ganti password! Buat akun baru dengan: npm run create-admin');
  }
}

// ------------------------------------------------------------ rute API
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server berjalan.', waktu: new Date().toISOString() });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/products', requireAuth, require('./src/routes/products'));
app.use('/api/purchases', requireAuth, require('./src/routes/purchases'));
app.use('/api/sales', requireAuth, require('./src/routes/sales'));
app.use('/api/production', requireAuth, require('./src/routes/production'));
app.use('/api/expenses', requireAuth, require('./src/routes/expenses'));
app.use('/api', requireAuth, require('./src/routes/reports')); // /api/summary, /api/reports, /api/meta

// ------------------------------------------------------------ frontend statis
app.use(express.static(config.PUBLIC_DIR, { extensions: ['html'] }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return notFound(req, res);
  res.sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
});

// ------------------------------------------------------------ error handler
app.use(notFound);
app.use(errorHandler);

// ------------------------------------------------------------ jalankan
(async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error('[ERROR] Gagal menginisialisasi database:', err);
    process.exit(1);
  }

  const server = app.listen(config.PORT, () => {
  console.log('====================================================');
  console.log(' Aplikasi Kasir Es Krim Jadul');
  console.log(` Buka di browser : http://localhost:${config.PORT}`);
  console.log(` Database Excel  : ${config.DB_FILE}`);
  console.log(` Zona waktu       : ${config.TIMEZONE}`);
  console.log('====================================================');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[ERROR] Port ${config.PORT} sudah dipakai aplikasi lain. Ubah dengan: set PORT=3100 lalu jalankan ulang.`);
    } else {
      console.error('[ERROR] Server gagal dimulai:', err);
    }
    process.exit(1);
  });
})();

