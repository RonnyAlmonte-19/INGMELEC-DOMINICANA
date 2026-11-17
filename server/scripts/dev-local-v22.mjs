// Lanzador LOCAL de INGMELEC v2.2 (solo desarrollo). Arranca MariaDB aislada (127.0.0.1:3310),
// opcionalmente resiembra SOLO la base sintética ingmelec_v22_actas_test y levanta la API en :5000.
// Uso: node scripts/dev-local-v22.mjs [--reseed]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import argon2 from 'argon2';
import { startLocalMariaDb } from '../tests/helpers/local-mariadb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..');
const MIG = path.join(SERVER, 'database', 'migrations');
const DB = 'ingmelec_v22_actas_test';
const CRED_FILE = path.join(SERVER, '.env.dev-credenciales'); // ignorado por git
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const db = await startLocalMariaDb({ database: DB });
db.applyEnv(process.env);

if (process.argv.includes('--reseed') || !fs.existsSync(CRED_FILE)) {
  const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: DB, multipleStatements: true, connectionLimit: 2, charset: 'utf8mb4' });
  const [[{ d }]] = await pool.query('SELECT DATABASE() d');
  if (d !== DB) throw new Error('Base inesperada: ' + d);
  await pool.query(read(path.join(MIG, 'rollback_07_v22_actas_entrega.sql')));
  await pool.query(read(path.join(__dirname, '..', 'tests', 'fixtures', 'v21_synthetic_fixture.sql')).split('ingmelec_v21_test_isolated').join(DB));
  for (const f of ['migration_03_v21_seguridad_y_esquema.sql', 'migration_04_v21_campamentos_alias.sql', 'migration_05_v21_adapted.sql', 'migration_06_v21_safe.sql', 'migration_07_v22_actas_entrega.sql']) {
    await pool.query(read(path.join(MIG, f)));
  }
  const pass = `Dev${crypto.randomBytes(6).toString('hex')}9`;
  const hash = await argon2.hash(pass, { type: argon2.argon2id });
  await pool.query("UPDATE inv_usuarios SET password_hash = ? WHERE email = 'dev.sintetico@ingmelec-test.local'", [hash]);
  fs.writeFileSync(CRED_FILE, `# Credenciales LOCALES de la base sintética (no usar en ningún otro sitio)\nEMAIL=dev.sintetico@ingmelec-test.local\nPASSWORD=${pass}\n`);
  await pool.end();
  console.log('[dev-local] Base sintética resembrada. Credenciales en server/.env.dev-credenciales');
}

Object.assign(process.env, {
  PORT: '5000', NODE_ENV: 'development', ACTAS_ENABLED: 'true',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:5000',
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex'),
  DB_CONNECTION_LIMIT: '8'
});
await import('../index.js');
console.log('[dev-local] API lista en http://localhost:5000 (ACTAS_ENABLED=true, BD sintética en 3310)');

const salir = async () => { await db.stop(); process.exit(0); };
process.on('SIGINT', salir);
process.on('SIGTERM', salir);
