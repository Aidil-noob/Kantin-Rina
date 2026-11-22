const fs = require('node:fs');
const path = require('node:path');
const { db, dbPath } = require('../db');

const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS) || 14);
const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');

fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19);
const target = path.join(backupDir, `warung-${stamp}.db`);

db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

const now = Date.now();
let removed = 0;
for (const file of fs.readdirSync(backupDir)) {
  if (!/^warung-.*\.db$/.test(file)) continue;
  const filePath = path.join(backupDir, file);
  if (filePath === target) continue;
  const stat = fs.statSync(filePath);
  if (now - stat.mtimeMs > retentionDays * 24 * 60 * 60 * 1000) {
    fs.unlinkSync(filePath);
    removed += 1;
  }
}

const size = fs.statSync(target).size;
console.log(`Backup dibuat: ${target} (${(size / 1024).toFixed(1)} KB)`);
if (removed > 0) console.log(`${removed} backup lama dihapus (retensi ${retentionDays} hari).`);

db.close();
