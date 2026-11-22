class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function badRequest(message) {
  return new HttpError(400, message);
}

function notFound(message = 'Data tidak ditemukan') {
  return new HttpError(404, message);
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = { HttpError, badRequest, notFound, toInt };
