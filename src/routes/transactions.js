const express = require('express');
const { db, withTransaction } = require('../../db');
const { badRequest, notFound, toInt } = require('../utils/http');
const { todayJakarta, normalizeDate } = require('../utils/date');

const router = express.Router();

function getTransaction(id) {
  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!transaction) return null;
  transaction.items = db
    .prepare('SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY id')
    .all(id);
  transaction.voided = Boolean(transaction.voided);
  return transaction;
}

function buildCart(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw badRequest('Keranjang masih kosong');
  }

  const merged = new Map();
  for (const item of rawItems) {
    const productId = toInt(item.product_id, NaN);
    const qty = toInt(item.qty, NaN);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw badRequest('Produk pada keranjang tidak valid');
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      throw badRequest('Jumlah produk harus lebih dari 0');
    }
    merged.set(productId, (merged.get(productId) ?? 0) + qty);
  }

  const cart = [];
  for (const [productId, qty] of merged) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) throw badRequest(`Produk dengan id ${productId} tidak ditemukan`);
    if (!product.is_active) throw badRequest(`${product.name} sedang tidak dijual`);
    if (product.stock !== null && qty > product.stock) {
      throw badRequest(`Stok ${product.name} tersisa ${product.stock}`);
    }
    cart.push({
      product,
      qty,
      subtotal: product.price * qty,
    });
  }
  return cart;
}

router.post('/', (req, res) => {
  const date = todayJakarta();
  const body = req.body ?? {};
  const cart = buildCart(body.items);

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const discount = toInt(body.discount, 0);
  if (discount < 0) throw badRequest('Diskon tidak boleh negatif');
  if (discount > subtotal) throw badRequest('Diskon melebihi subtotal');

  const total = subtotal - discount;
  const method = String(body.payment_method ?? 'tunai').toLowerCase();
  const allowedMethods = ['tunai', 'qris', 'transfer'];
  if (!allowedMethods.includes(method)) throw badRequest('Metode pembayaran tidak dikenal');

  let paid = body.paid === undefined || body.paid === '' ? total : toInt(body.paid, NaN);
  if (!Number.isInteger(paid) || paid < 0) throw badRequest('Nominal bayar tidak valid');
  if (method === 'tunai' && paid < total) throw badRequest('Uang bayar kurang dari total');
  if (method !== 'tunai') paid = total;

  const change = paid - total;

  const transactionId = withTransaction(() => {
    const { count } = db
      .prepare('SELECT COUNT(*) AS count FROM transactions WHERE date = ?')
      .get(date);
    const code = `TRX-${date.replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;
    const now = new Date().toISOString();

    const result = db
      .prepare(
        `INSERT INTO transactions
           (code, date, subtotal, discount, total, paid, change, payment_method, voided, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(code, date, subtotal, discount, total, paid, change, method, now);

    const txId = result.lastInsertRowid;
    const insertItem = db.prepare(
      `INSERT INTO transaction_items
         (transaction_id, product_id, name_snapshot, price_snapshot, qty, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of cart) {
      insertItem.run(
        txId,
        item.product.id,
        item.product.name,
        item.product.price,
        item.qty,
        item.subtotal
      );
      if (item.product.stock !== null) {
        updateStock.run(item.qty, item.product.id);
      }
    }

    return Number(txId);
  });

  res.status(201).json({ transaction: getTransaction(transactionId) });
});

router.get('/', (req, res) => {
  const date = normalizeDate(req.query.date);
  const limit = Math.min(Math.max(toInt(req.query.limit, 100), 1), 500);
  const offset = Math.max(toInt(req.query.offset, 0), 0);

  const transactions = db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM transaction_items i WHERE i.transaction_id = t.id) AS item_count,
              (SELECT COALESCE(SUM(i.qty), 0) FROM transaction_items i
                 WHERE i.transaction_id = t.id) AS total_qty
         FROM transactions t
        WHERE t.date = ?
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?`
    )
    .all(date, limit, offset)
    .map((row) => ({ ...row, voided: Boolean(row.voided) }));

  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM transactions WHERE date = ?')
    .get(date);

  res.json({ date, total, transactions });
});

router.get('/:id', (req, res) => {
  const transaction = getTransaction(toInt(req.params.id));
  if (!transaction) throw notFound('Transaksi tidak ditemukan');
  res.json({ transaction });
});

router.post('/:id/void', (req, res) => {
  const id = toInt(req.params.id);
  const transaction = getTransaction(id);
  if (!transaction) throw notFound('Transaksi tidak ditemukan');
  if (transaction.voided) throw badRequest('Transaksi sudah dibatalkan');

  withTransaction(() => {
    db.prepare('UPDATE transactions SET voided = 1 WHERE id = ?').run(id);
    const restoreStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    for (const item of transaction.items) {
      if (!item.product_id) continue;
      const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
      if (!product || product.stock === null) continue;
      restoreStock.run(item.qty, item.product_id);
    }
  });

  res.json({ transaction: getTransaction(id) });
});

module.exports = router;
