const path = require('node:path');
const express = require('express');

const { assertAuthConfigured, getSession, requireAuth } = require('./src/auth');
const authRouter = require('./src/routes/auth');
const productsRouter = require('./src/routes/products');
const transactionsRouter = require('./src/routes/transactions');
const { router: reportsRouter } = require('./src/routes/reports');
const queueRouter = require('./src/routes/queue');
const configRouter = require('./src/routes/config');

assertAuthConfigured();

const app = express();
const publicDir = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);

app.get('/login', (req, res) => {
  if (getSession(req)) return res.redirect('/');
  res.sendFile(path.join(publicDir, 'login.html'));
});

function isPublicPath(pathname) {
  return (
    pathname === '/login' ||
    pathname === '/login.html' ||
    pathname === '/healthz' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/css/') ||
    pathname.startsWith('/js/')
  );
}

app.use((req, res, next) => {
  if (isPublicPath(req.path)) return next();
  return requireAuth(req, res, next);
});

app.use(express.static(publicDir));

app.use('/api/products', productsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/queue', queueRouter);
app.use('/api/config', configRouter);

const pages = ['kasir', 'produk', 'riwayat', 'laporan', 'antrean', 'layar'];
for (const page of pages) {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(publicDir, `${page}.html`));
  });
}

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Terjadi kesalahan pada server' : err.message,
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  app.listen(port, host, () => {
    console.log(`Kasir Warung Bu Rina berjalan di http://localhost:${port}`);
    console.log(`Login   : http://localhost:${port}/login`);
    console.log(`Kasir   : http://localhost:${port}/kasir`);
    console.log(`Antrean : http://localhost:${port}/antrean`);
    console.log(`Layar   : http://localhost:${port}/layar`);
  });
}

module.exports = app;
