const express = require('express');
const { db } = require('../../db');
const { normalizeDate, TZ } = require('../utils/date');

const router = express.Router();

function dailyReport(date) {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS transactions,
              COALESCE(SUM(subtotal), 0) AS subtotal,
              COALESCE(SUM(discount), 0) AS discount,
              COALESCE(SUM(total), 0) AS omzet
         FROM transactions
        WHERE date = ? AND voided = 0`
    )
    .get(date);

  const { items } = db
    .prepare(
      `SELECT COALESCE(SUM(i.qty), 0) AS items
         FROM transaction_items i
         JOIN transactions t ON t.id = i.transaction_id
        WHERE t.date = ? AND t.voided = 0`
    )
    .get(date);

  const byPayment = db
    .prepare(
      `SELECT payment_method AS method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM transactions
        WHERE date = ? AND voided = 0
        GROUP BY payment_method
        ORDER BY total DESC`
    )
    .all(date);

  const topProducts = db
    .prepare(
      `SELECT i.name_snapshot AS name, SUM(i.qty) AS qty, SUM(i.subtotal) AS total
         FROM transaction_items i
         JOIN transactions t ON t.id = i.transaction_id
        WHERE t.date = ? AND t.voided = 0
        GROUP BY i.name_snapshot
        ORDER BY qty DESC, total DESC
        LIMIT 10`
    )
    .all(date);

  const { voided } = db
    .prepare('SELECT COUNT(*) AS voided FROM transactions WHERE date = ? AND voided = 1')
    .get(date);

  return {
    date,
    total_transactions: totals.transactions,
    total_items: items,
    total_subtotal: totals.subtotal,
    total_discount: totals.discount,
    total_omzet: totals.omzet,
    average_transaction:
      totals.transactions > 0 ? Math.round(totals.omzet / totals.transactions) : 0,
    voided_transactions: voided,
    by_payment: byPayment,
    top_products: topProducts,
  };
}

function csvField(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

router.get('/daily', (req, res) => {
  const date = normalizeDate(req.query.date);
  res.json({ report: dailyReport(date) });
});

router.get('/export.csv', (req, res) => {
  const date = normalizeDate(req.query.date);
  const rows = db
    .prepare(
      `SELECT t.code, t.date, t.created_at, t.subtotal, t.discount, t.total, t.paid,
              t.change, t.payment_method, t.voided,
              (SELECT GROUP_CONCAT(i.qty || 'x ' || i.name_snapshot, '; ')
                 FROM transaction_items i WHERE i.transaction_id = t.id) AS items
         FROM transactions t
        WHERE t.date = ?
        ORDER BY t.created_at ASC, t.id ASC`
    )
    .all(date);

  const timeFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const header = [
    'Kode',
    'Tanggal',
    'Waktu',
    'Item',
    'Subtotal',
    'Diskon',
    'Total',
    'Dibayar',
    'Kembalian',
    'Metode',
    'Status',
  ];

  const lines = [header.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.code,
        row.date,
        timeFormat.format(new Date(row.created_at)),
        row.items ?? '',
        row.subtotal,
        row.discount,
        row.total,
        row.paid,
        row.change,
        row.payment_method,
        row.voided ? 'Dibatalkan' : 'Lunas',
      ]
        .map(csvField)
        .join(',')
    );
  }

  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="laporan-${date}.csv"`);
  res.send(csv);
});

router.get('/summary', (req, res) => {
  const date = normalizeDate(req.query.date);
  const report = dailyReport(date);

  const { active_products } = db
    .prepare('SELECT COUNT(*) AS active_products FROM products WHERE is_active = 1')
    .get();
  const { waiting } = db
    .prepare("SELECT COUNT(*) AS waiting FROM queues WHERE date = ? AND status = 'waiting'")
    .get(date);

  res.json({
    date,
    omzet: report.total_omzet,
    transactions: report.total_transactions,
    items: report.total_items,
    active_products,
    queue_waiting: waiting,
  });
});

module.exports = { router, dailyReport };
