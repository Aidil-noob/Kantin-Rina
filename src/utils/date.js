const TZ = 'Asia/Jakarta';

function todayJakarta() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDate(value) {
  return isDateString(value) ? value : todayJakarta();
}

module.exports = { TZ, todayJakarta, isDateString, normalizeDate };
