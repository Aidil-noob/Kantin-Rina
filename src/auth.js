const crypto = require('node:crypto');

const COOKIE_NAME = 'kantin_session';
const DEFAULT_TTL_HOURS = 168;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

const loginAttempts = new Map();

function ttlSeconds() {
  const hours = Number(process.env.SESSION_TTL_HOURS);
  return Math.max(1, Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_TTL_HOURS) * 3600;
}

function assertAuthConfigured() {
  const missing = [];
  if (!process.env.SESSION_SECRET) missing.push('SESSION_SECRET');

  const hasHash = Boolean(process.env.ADMIN_PASSWORD_HASH);
  const hasPlain = Boolean(process.env.ADMIN_PASSWORD);
  const production = process.env.NODE_ENV === 'production';

  if (!hasHash && !hasPlain) missing.push('ADMIN_PASSWORD_HASH');
  if (production && !hasHash) missing.push('ADMIN_PASSWORD_HASH (wajib di produksi)');

  if (missing.length) {
    throw new Error(
      `Konfigurasi autentikasi belum lengkap: ${missing.join(', ')}. ` +
        'Salin .env.example menjadi .env lalu isi nilainya.'
    );
  }

  if (production && hasPlain && !hasHash) {
    console.warn('[auth] Gunakan ADMIN_PASSWORD_HASH, bukan ADMIN_PASSWORD plaintext, di produksi.');
  }
}

function parseHash(encoded) {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const [, n, r, p, salt, key] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (![N, R, P].every(Number.isInteger) || N < 2 || N > 2 ** 17 || R < 1 || P < 1) {
    return null;
  }
  if (!/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(key)) return null;

  return {
    N,
    R,
    P,
    salt: Buffer.from(salt, 'hex'),
    key: Buffer.from(key, 'hex'),
  };
}

function scryptOptions(N, R, P) {
  return { N, r: R, p: P, maxmem: 128 * N * R + 32 * 1024 * 1024 };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(
    password,
    salt,
    SCRYPT_KEYLEN,
    scryptOptions(SCRYPT_N, SCRYPT_R, SCRYPT_P)
  );
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password) {
  if (typeof password !== 'string') return false;

  const encoded = process.env.ADMIN_PASSWORD_HASH;
  if (encoded) {
    const parsed = parseHash(encoded);
    if (!parsed || parsed.key.length === 0) return false;
    const derived = crypto.scryptSync(
      password,
      parsed.salt,
      parsed.key.length,
      scryptOptions(parsed.N, parsed.R, parsed.P)
    );
    return derived.length === parsed.key.length && crypto.timingSafeEqual(derived, parsed.key);
  }

  const plain = process.env.ADMIN_PASSWORD;
  if (!plain) return false;
  const provided = crypto.createHash('sha256').update(password).digest();
  const expected = crypto.createHash('sha256').update(plain).digest();
  return crypto.timingSafeEqual(provided, expected);
}

function signSession() {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds();
  const data = Buffer.from(JSON.stringify({ sub: 'admin', exp })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return { token: `${data}.${signature}`, exp };
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const separator = token.lastIndexOf('.');
  if (separator < 1) return null;

  const data = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(data)
    .digest();
  const provided = Buffer.from(signature, 'base64url');

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }

  if (!payload || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch (error) {
      cookies[name] = value;
    }
  }
  return cookies;
}

function isSecureRequest(req) {
  return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
}

function buildCookie(req, value, maxAge) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(req, res) {
  const { token } = signSession();
  res.append('Set-Cookie', buildCookie(req, token, ttlSeconds()));
}

function clearSessionCookie(req, res) {
  res.append('Set-Cookie', buildCookie(req, '', 0));
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (session) {
    req.session = session;
    return next();
  }

  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  }

  const target = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login?next=${target}`);
}

function isLoginRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (entry) loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }

  if (loginAttempts.size > 1000) {
    for (const [key, value] of loginAttempts) {
      if (value.resetAt <= now) loginAttempts.delete(key);
    }
  }
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

module.exports = {
  assertAuthConfigured,
  hashPassword,
  verifyPassword,
  getSession,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  isLoginRateLimited,
  recordLoginFailure,
  clearLoginFailures,
};
