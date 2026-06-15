import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const dbPath = path.join(backendDir, 'prisma', 'dev.db');
const backupDir = path.resolve(backendDir, '..', 'backups');

if (!fs.existsSync(dbPath)) {
  console.error(`Database tidak ditemukan: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace('T', '-')
  .slice(0, 15);
const target = path.join(backupDir, `dev-${stamp}.db`);

fs.copyFileSync(dbPath, target);
console.log(`Backup database berhasil: ${target}`);
