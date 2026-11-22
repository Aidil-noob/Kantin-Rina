const express = require('express');
const { db, withTransaction, getSettings } = require('../../db');
const { badRequest, notFound, toInt } = require('../utils/http');
const { todayJakarta } = require('../utils/date');

const router = express.Router();

function queueState() {
  const date = todayJakarta();
  const prefix = getSettings().queue_prefix || 'A';
  const rows = db
    .prepare('SELECT * FROM queues WHERE date = ? ORDER BY number ASC')
    .all(date);

  const waiting = rows.filter((row) => row.status === 'waiting');
  const current =
    rows
      .filter((row) => row.status === 'called')
      .sort((a, b) => String(b.called_at).localeCompare(String(a.called_at)))[0] ?? null;

  return {
    date,
    prefix,
    last_number: rows.length ? rows[rows.length - 1].number : 0,
    waiting,
    current,
    counts: {
      total: rows.length,
      waiting: waiting.length,
      called: rows.filter((row) => row.status === 'called').length,
      done: rows.filter((row) => row.status === 'done').length,
      skipped: rows.filter((row) => row.status === 'skipped').length,
    },
  };
}

function findQueue(id) {
  const queue = db.prepare('SELECT * FROM queues WHERE id = ?').get(toInt(id));
  if (!queue) throw notFound('Antrean tidak ditemukan');
  return queue;
}

router.get('/today', (req, res) => {
  res.json({ queue: queueState() });
});

router.post('/take', (req, res) => {
  const date = todayJakarta();
  const created = withTransaction(() => {
    const { last } = db
      .prepare('SELECT COALESCE(MAX(number), 0) AS last FROM queues WHERE date = ?')
      .get(date);
    const number = last + 1;
    const result = db
      .prepare('INSERT INTO queues (number, date, status, created_at) VALUES (?, ?, ?, ?)')
      .run(number, date, 'waiting', new Date().toISOString());
    return db.prepare('SELECT * FROM queues WHERE id = ?').get(result.lastInsertRowid);
  });

  res.status(201).json({ created, queue: queueState() });
});

router.post('/call-next', (req, res) => {
  const date = todayJakarta();
  const next = db
    .prepare(
      `SELECT * FROM queues WHERE date = ? AND status = 'waiting'
       ORDER BY number ASC LIMIT 1`
    )
    .get(date);

  if (!next) {
    return res.json({ called: null, queue: queueState() });
  }

  db.prepare("UPDATE queues SET status = 'called', called_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    next.id
  );

  res.json({
    called: db.prepare('SELECT * FROM queues WHERE id = ?').get(next.id),
    queue: queueState(),
  });
});

router.post('/:id/call', (req, res) => {
  const queue = findQueue(req.params.id);
  if (queue.status === 'done' || queue.status === 'skipped') {
    throw badRequest('Antrean yang sudah selesai tidak bisa dipanggil lagi');
  }

  db.prepare("UPDATE queues SET status = 'called', called_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    queue.id
  );

  res.json({ called: db.prepare('SELECT * FROM queues WHERE id = ?').get(queue.id), queue: queueState() });
});

router.post('/:id/done', (req, res) => {
  const queue = findQueue(req.params.id);
  if (queue.status === 'done') throw badRequest('Antrean sudah diselesaikan');

  db.prepare("UPDATE queues SET status = 'done', done_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    queue.id
  );

  res.json({ queue: queueState() });
});

router.post('/:id/skip', (req, res) => {
  const queue = findQueue(req.params.id);
  if (queue.status === 'done' || queue.status === 'skipped') {
    throw badRequest('Antrean sudah selesai');
  }

  db.prepare("UPDATE queues SET status = 'skipped', done_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    queue.id
  );

  res.json({ queue: queueState() });
});

router.post('/reset', (req, res) => {
  const date = todayJakarta();
  db.prepare('DELETE FROM queues WHERE date = ?').run(date);
  res.json({ queue: queueState() });
});

module.exports = router;
