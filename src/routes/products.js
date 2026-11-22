const express = require('express');
const { db } = require('../../db');
const { badRequest, notFound, toInt } = require('../utils/http');

const router = express.Router();

function validateProduct(body, existing = null) {
  const name = String(body.name ?? existing?.name ?? '').trim();
  const category = String(body.category ?? existing?.category ?? 'Lainnya').trim() || 'Lainnya';
  const price = toInt(body.price ?? existing?.price, NaN);
  let stock = Object.hasOwn(body, 'stock') ? body.stock : existing?.stock ?? null;
  const isActive =
    body.is_active === undefined
      ? existing?.is_active ?? 1
      : body.is_active === false || body.is_active === 0 || body.is_active === '0'
        ? 0
        : 1;

  if (!name) throw badRequest('Nama produk wajib diisi');
  if (name.length > 60) throw badRequest('Nama produk maksimal 60 karakter');
  if (!Number.isInteger(price) || price < 0) throw badRequest('Harga harus angka 0 atau lebih');
  if (stock === '' || stock === null || stock === undefined) {
    stock = null;
  } else {
    stock = toInt(stock, NaN);
    if (!Number.isInteger(stock) || stock < 0) {
      throw badRequest('Stok harus angka 0 atau lebih (kosongkan untuk tanpa batas)');
    }
  }

  return { name, category, price, stock, isActive };
}

router.get('/', (req, res) => {
  const filters = [];
  const params = [];

  if (req.query.q) {
    filters.push('(name LIKE ? OR category LIKE ?)');
    params.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }
  if (req.query.active === '1' || req.query.active === 'true') {
    filters.push('is_active = 1');
  }
  if (req.query.category) {
    filters.push('category = ?');
    params.push(req.query.category);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const products = db
    .prepare(`SELECT * FROM products ${where} ORDER BY category, name`)
    .all(...params);

  res.json({ products });
});

router.post('/', (req, res) => {
  const data = validateProduct(req.body ?? {});
  const result = db
    .prepare(
      `INSERT INTO products (name, category, price, stock, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(data.name, data.category, data.price, data.stock, data.isActive, new Date().toISOString());

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ product });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(toInt(req.params.id));
  if (!existing) throw notFound('Produk tidak ditemukan');

  const data = validateProduct(req.body ?? {}, existing);
  db.prepare(
    `UPDATE products SET name = ?, category = ?, price = ?, stock = ?, is_active = ?
     WHERE id = ?`
  ).run(data.name, data.category, data.price, data.stock, data.isActive, existing.id);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id);
  res.json({ product });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(toInt(req.params.id));
  if (!existing) throw notFound('Produk tidak ditemukan');

  db.prepare('DELETE FROM products WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

module.exports = router;
