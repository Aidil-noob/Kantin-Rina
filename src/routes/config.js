const express = require('express');
const { db, getSettings } = require('../../db');
const { badRequest } = require('../utils/http');

const router = express.Router();

const allowedKeys = ['store_name', 'queue_name', 'queue_prefix', 'receipt_footer'];

router.get('/', (req, res) => {
  res.json({ config: getSettings() });
});

router.put('/', (req, res) => {
  const body = req.body ?? {};
  const update = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  for (const key of allowedKeys) {
    if (body[key] === undefined) continue;
    const value = String(body[key]).trim();
    if (!value) throw badRequest(`${key} tidak boleh kosong`);
    if (key === 'queue_prefix' && !/^[A-Za-z0-9]{1,4}$/.test(value)) {
      throw badRequest('Prefix antrean hanya huruf/angka, maksimal 4 karakter');
    }
    update.run(key, value);
  }

  res.json({ config: getSettings() });
});

module.exports = router;
