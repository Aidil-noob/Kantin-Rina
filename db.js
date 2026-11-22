const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'warung.db');
const memory = dbPath === ':memory:';

if (!memory) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Lainnya',
    price INTEGER NOT NULL CHECK (price >= 0),
    stock INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    discount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    paid INTEGER NOT NULL,
    change INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'tunai',
    voided INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name_snapshot TEXT NOT NULL,
    price_snapshot INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    subtotal INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS queues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting'
      CHECK (status IN ('waiting', 'called', 'done', 'skipped')),
    created_at TEXT NOT NULL,
    called_at TEXT,
    done_at TEXT,
    UNIQUE (date, number)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transaction_items_tx ON transaction_items(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_queues_date_status ON queues(date, status);
`);

const defaultSettings = {
  store_name: 'Warung Bu Rina',
  queue_name: 'Kantin',
  queue_prefix: 'A',
  receipt_footer: 'Terima kasih sudah berbelanja',
};

const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

if (!process.env.SKIP_SEED) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get();
  if (count === 0) {
    const seedProducts = [
      ['Nasi Rames', 'Makanan', 10000, null],
      ['Nasi Uduk', 'Makanan', 8000, null],
      ['Mie Goreng', 'Makanan', 10000, 20],
      ['Ayam Goreng', 'Makanan', 8000, 15],
      ['Tempe Orek', 'Makanan', 3000, 25],
      ['Telur Balado', 'Makanan', 4000, 20],
      ['Pisang Goreng', 'Camilan', 2000, 30],
      ['Kerupuk', 'Camilan', 1000, null],
      ['Es Teh Manis', 'Minuman', 3000, null],
      ['Es Jeruk', 'Minuman', 4000, null],
      ['Air Mineral', 'Minuman', 3000, 40],
      ['Kopi', 'Minuman', 4000, null],
    ];
    const insertProduct = db.prepare(
      `INSERT INTO products (name, category, price, stock, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    for (const [name, category, price, stock] of seedProducts) {
      insertProduct.run(name, category, price, stock, now);
    }
  }
}

function withTransaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

module.exports = { db, dbPath, withTransaction, getSettings };
