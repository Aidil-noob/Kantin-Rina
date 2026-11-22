const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kantin-rina-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'rahasia-test';
process.env.SESSION_SECRET = 'test-secret-yang-panjang-dan-acak';
process.env.SESSION_TTL_HOURS = '1';

const app = require('../server');

let server;
let base;
let createdProductId;
let sessionCookie = null;

function todayJakarta() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getSetCookie(response) {
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
  return cookies[0] || response.headers.get('set-cookie') || '';
}

async function request(
  pathname,
  { method = 'GET', body, headers = {}, auth = true, redirect } = {}
) {
  const finalHeaders = { ...headers };
  if (body) finalHeaders['Content-Type'] = 'application/json';
  if (auth && sessionCookie) finalHeaders.Cookie = sessionCookie;

  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    redirect,
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  return { response, data };
}

function login(password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { password },
    auth: false,
  });
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const { response } = await login('rahasia-test');
  assert.equal(response.status, 200);
  sessionCookie = getSetCookie(response).split(';')[0];
  assert.match(sessionCookie, /^kantin_session=/);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const { db } = require('../db');
  try {
    db.close();
  } catch (error) {
    // ignore
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('autentikasi: login dan proteksi akses', async (t) => {
  await t.test('healthz dapat diakses publik', async () => {
    const { response } = await request('/healthz', { auth: false });
    assert.equal(response.status, 200);
  });

  await t.test('API tanpa login ditolak', async () => {
    const { response, data } = await request('/api/products', { auth: false });
    assert.equal(response.status, 401);
    assert.ok(data.error);
  });

  await t.test('halaman tanpa login dialihkan ke /login', async () => {
    const { response } = await request('/kasir', { auth: false, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /^\/login\?next=/);
  });

  await t.test('halaman login dapat diakses publik', async () => {
    const { response } = await request('/login', { auth: false });
    assert.equal(response.status, 200);
  });

  await t.test('password salah ditolak', async () => {
    const { response } = await login('password-salah');
    assert.equal(response.status, 401);
  });

  await t.test('rate limit membatasi percobaan login', async () => {
    const headers = { 'X-Forwarded-For': '203.0.113.50' };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { response } = await request('/api/auth/login', {
        method: 'POST',
        body: { password: 'salah' },
        auth: false,
        headers,
      });
      assert.equal(response.status, 401);
    }

    const { response } = await request('/api/auth/login', {
      method: 'POST',
      body: { password: 'salah' },
      auth: false,
      headers,
    });
    assert.equal(response.status, 429);
  });

  await t.test('cookie sesi valid diterima', async () => {
    const { response, data } = await request('/api/auth/me');
    assert.equal(response.status, 200);
    assert.equal(data.authenticated, true);
  });

  await t.test('cookie palsu ditolak', async () => {
    const { response } = await request('/api/auth/me', {
      auth: false,
      headers: { Cookie: 'kantin_session=palsu' },
    });
    assert.equal(response.status, 401);
  });
});

test('produk: daftar awal dan CRUD', async (t) => {
  await t.test('seed produk tersedia', async () => {
    const { response, data } = await request('/api/products');
    assert.equal(response.status, 200);
    assert.ok(data.products.length >= 10);
  });

  await t.test('tambah produk', async () => {
    const { response, data } = await request('/api/products', {
      method: 'POST',
      body: { name: 'Produk Uji', category: 'Uji', price: 5000, stock: 10 },
    });
    assert.equal(response.status, 201);
    assert.equal(data.product.name, 'Produk Uji');
    assert.equal(data.product.stock, 10);
    createdProductId = data.product.id;
  });

  await t.test('validasi harga negatif ditolak', async () => {
    const { response } = await request('/api/products', {
      method: 'POST',
      body: { name: 'Salah', price: -1 },
    });
    assert.equal(response.status, 400);
  });

  await t.test('stok bisa dikosongkan menjadi tanpa batas', async () => {
    const { response, data } = await request(`/api/products/${createdProductId}`, {
      method: 'PUT',
      body: { name: 'Produk Uji', category: 'Uji', price: 5000, stock: null },
    });
    assert.equal(response.status, 200);
    assert.equal(data.product.stock, null);

    await request(`/api/products/${createdProductId}`, {
      method: 'PUT',
      body: { name: 'Produk Uji', category: 'Uji', price: 5000, stock: 10 },
    });
  });
});

test('kasir: transaksi, stok, void, laporan, CSV', async (t) => {
  const date = todayJakarta();
  let transactionId;

  await t.test('transaksi mengurangi stok', async () => {
    const { response, data } = await request('/api/transactions', {
      method: 'POST',
      body: {
        items: [{ product_id: createdProductId, qty: 2 }],
        discount: 1000,
        paid: 20000,
        payment_method: 'tunai',
      },
    });
    assert.equal(response.status, 201);
    const tx = data.transaction;
    transactionId = tx.id;
    assert.equal(tx.subtotal, 10000);
    assert.equal(tx.discount, 1000);
    assert.equal(tx.total, 9000);
    assert.equal(tx.change, 11000);
    assert.match(tx.code, /^TRX-\d{8}-\d{4}$/);
    assert.equal(tx.items.length, 1);

    const products = await request('/api/products');
    const product = products.data.products.find((p) => p.id === createdProductId);
    assert.equal(product.stock, 8);
  });

  await t.test('uang bayar kurang ditolak', async () => {
    const { response } = await request('/api/transactions', {
      method: 'POST',
      body: {
        items: [{ product_id: createdProductId, qty: 1 }],
        paid: 1,
        payment_method: 'tunai',
      },
    });
    assert.equal(response.status, 400);
  });

  await t.test('stok tidak mencukupi ditolak', async () => {
    const { response } = await request('/api/transactions', {
      method: 'POST',
      body: {
        items: [{ product_id: createdProductId, qty: 999 }],
        paid: 999999,
        payment_method: 'tunai',
      },
    });
    assert.equal(response.status, 400);
  });

  await t.test('riwayat dan detail transaksi', async () => {
    const list = await request(`/api/transactions?date=${date}`);
    assert.equal(list.data.total, 1);
    assert.equal(list.data.transactions[0].id, transactionId);

    const detail = await request(`/api/transactions/${transactionId}`);
    assert.equal(detail.data.transaction.items[0].name_snapshot, 'Produk Uji');
  });

  await t.test('void mengembalikan stok', async () => {
    const { response, data } = await request(`/api/transactions/${transactionId}/void`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);
    assert.equal(data.transaction.voided, true);

    const products = await request('/api/products');
    const product = products.data.products.find((p) => p.id === createdProductId);
    assert.equal(product.stock, 10);
  });

  await t.test('void dua kali ditolak', async () => {
    const { response } = await request(`/api/transactions/${transactionId}/void`, {
      method: 'POST',
    });
    assert.equal(response.status, 400);
  });

  await t.test('transaksi kedua untuk laporan', async () => {
    const { response } = await request('/api/transactions', {
      method: 'POST',
      body: {
        items: [{ product_id: createdProductId, qty: 1 }],
        paid: 5000,
        payment_method: 'qris',
      },
    });
    assert.equal(response.status, 201);
  });

  await t.test('laporan harian menghitung transaksi lunas saja', async () => {
    const { data } = await request(`/api/reports/daily?date=${date}`);
    const report = data.report;
    assert.equal(report.total_transactions, 1);
    assert.equal(report.total_omzet, 5000);
    assert.equal(report.voided_transactions, 1);
    assert.equal(report.total_items, 1);
    assert.equal(report.top_products[0].name, 'Produk Uji');
  });

  await t.test('export CSV tersedia', async () => {
    const { response, data } = await request(`/api/reports/export.csv?date=${date}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(String(data), /"Kode","Tanggal","Waktu"/);
    assert.match(String(data), /TRX-/);
  });
});

test('antrean: ambil, panggil, selesai, reset', async (t) => {
  await t.test('ambil dua nomor', async () => {
    const first = await request('/api/queue/take', { method: 'POST' });
    assert.equal(first.response.status, 201);
    assert.equal(first.data.created.number, 1);

    const second = await request('/api/queue/take', { method: 'POST' });
    assert.equal(second.data.created.number, 2);
    assert.equal(second.data.queue.counts.waiting, 2);
  });

  await t.test('panggil berikutnya', async () => {
    const { data } = await request('/api/queue/call-next', { method: 'POST' });
    assert.equal(data.called.number, 1);
    assert.equal(data.queue.counts.waiting, 1);
    assert.equal(data.queue.current.number, 1);
  });

  await t.test('selesaikan antrean', async () => {
    const current = await request('/api/queue/today');
    const id = current.data.queue.current.id;
    const { data } = await request(`/api/queue/${id}/done`, { method: 'POST' });
    assert.equal(data.queue.counts.done, 1);
    assert.equal(data.queue.current, null);
  });

  await t.test('panggil lalu lewati', async () => {
    const next = await request('/api/queue/call-next', { method: 'POST' });
    assert.equal(next.data.called.number, 2);
    const { data } = await request(`/api/queue/${next.data.called.id}/skip`, {
      method: 'POST',
    });
    assert.equal(data.queue.counts.skipped, 1);
    assert.equal(data.queue.current, null);
  });

  await t.test('reset antrean hari ini', async () => {
    const { data } = await request('/api/queue/reset', { method: 'POST' });
    assert.equal(data.queue.counts.total, 0);
    assert.equal(data.queue.last_number, 0);
  });
});

test('logout menghapus cookie sesi', async () => {
  const { response } = await request('/api/auth/logout', { method: 'POST' });
  assert.equal(response.status, 200);
  const cleared = getSetCookie(response);
  assert.match(cleared, /kantin_session=;/);
  assert.match(cleared, /Max-Age=0/);
});
