const { hashPassword } = require('../src/auth');

const password = process.argv[2] || process.env.ADMIN_PASSWORD;

if (!password) {
  console.error("Penggunaan: node scripts/hash-password.js 'password-kuat'");
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password minimal 8 karakter.');
  process.exit(1);
}

console.log(hashPassword(password));
