const express = require('express');
const {
  verifyPassword,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  isLoginRateLimited,
  recordLoginFailure,
  clearLoginFailures,
} = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (isLoginRateLimited(ip)) {
    return res
      .status(429)
      .json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 10 menit.' });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!verifyPassword(password)) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Password salah' });
  }

  clearLoginFailures(ip);
  setSessionCookie(req, res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Belum login' });
  }
  res.json({
    authenticated: true,
    expires_at: new Date(session.exp * 1000).toISOString(),
  });
});

module.exports = router;
