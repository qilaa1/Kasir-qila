'use strict';

/**
 * Membuat akun pengguna baru (default: admin).
 * Pakai: npm run create-admin
 * Lalu ikuti prompt username, nama, role, dan password.
 */


const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../src/db/excel');
const { cleanStr, toInt, nextId } = require('../src/utils/helpers');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const tanya = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a)));

(async () => {
  try {
    db.ensureDirs();
    db.readWorkbook();

    const username = cleanStr(await tanya('Username: '), 50);
    if (!username) throw new Error('Username tidak boleh kosong.');
    const nama = cleanStr(await tanyaNama(), 100) || username;
    const role = cleanStr(await tanya('Role (admin/kasir) [admin]: '), 20) || 'admin';
    const password = await tanya('Password (min. 6 karakter): ');
    if (!password || password.length < 6) throw new Error('Password minimal 6 karakter.');

    const hash = bcrypt.hashSync(password, 10);

    db.commit((data) => {
      if ((data.Users || []).some((u) => cleanStr(u.username).toLowerCase() === username.toLowerCase())) {
        throw new Error(`Username "${username}" sudah terdaftar.`);
      }
      data.Users.push({
        id: nextId(data.Users),
        username,
        password_hash: hash,
        nama,
        role: role === 'kasir' ? 'kasir' : 'admin',
        aktif: 1
      });
    });

    console.log(`Akun "${username}" (role: ${role}) berhasil dibuat.`);
  } catch (err) {
    console.error('Gagal membuat akun:', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
})();

function tanyaNama() {
  return new Promise((resolve) => rl.question('Nama tampilan: ', resolve));
}
