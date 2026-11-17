// Respaldo y comprobación de una base MariaDB LOCAL aislada (INGMELEC v2.2).
// Seguridad: rechaza hosts no locales (guard) y nombres de BD sin "test"/"sandbox"/"qa_isolated".
// Solo LEE la base origen. La comprobación de restauración usa una BD temporal propia
// "<base>_restorecheck_test", que se crea y se elimina al terminar (nunca toca la original).
//
// Uso (PowerShell, con el servidor MariaDB local en marcha):
//   node server/tests/helpers/backup-local-db.mjs [--database=ingmelec_v21_test_isolated] [--verify-restore]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { assertLocalIsolatedTarget } from '../../database/guard.js';
import { DEFAULT_LOCAL_MARIADB_CONFIG } from './local-mariadb.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CRITICAL_TABLES = ['inv_articulos', 'inv_movimientos', 'inv_usuarios', 'inv_auditoria'];

function assertTestLikeName(db) {
  if (!/^[a-zA-Z0-9_]+$/.test(db)) throw new Error(`Nombre de BD inválido: ${db}`);
  if (!/(test|sandbox|qa_isolated)/.test(db)) {
    throw new Error(`BD "${db}" rechazada: el nombre debe contener test, sandbox o qa_isolated.`);
  }
}

function dumpExe(binDir) {
  for (const name of ['mariadb-dump.exe', 'mysqldump.exe']) {
    const p = path.join(binDir, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`No se encontró mariadb-dump.exe ni mysqldump.exe en ${binDir}`);
}

function run(exe, args, { stdoutFile, stdinFile } = {}) {
  return new Promise((resolve, reject) => {
    const out = stdoutFile ? fs.openSync(stdoutFile, 'w') : 'ignore';
    const inp = stdinFile ? fs.openSync(stdinFile, 'r') : 'ignore';
    const child = spawn(exe, args, { stdio: [inp, out, 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (typeof out === 'number') fs.closeSync(out);
      if (typeof inp === 'number') fs.closeSync(inp);
      code === 0 ? resolve() : reject(new Error(`${path.basename(exe)} salió con código ${code}: ${err.trim().slice(0, 300)}`));
    });
  });
}

async function counts(conn, db) {
  const result = {};
  for (const t of CRITICAL_TABLES) {
    const [r] = await conn.query(`SELECT COUNT(*) AS n FROM \`${db}\`.\`${t}\``);
    result[t] = Number(r[0].n);
  }
  return result;
}

export async function backupLocalDatabase({ database = DEFAULT_LOCAL_MARIADB_CONFIG.database, outDir, verifyRestore = false } = {}) {
  const cfg = DEFAULT_LOCAL_MARIADB_CONFIG;
  assertTestLikeName(database);
  assertLocalIsolatedTarget({ host: cfg.host, database }, 'backup-local-db');
  const dir = outDir ?? path.join(REPO_ROOT, 'scratch', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const file = path.join(dir, `${database}_${stamp}.sql`);
  const auth = ['--host=' + cfg.host, '--port=' + cfg.port, '--user=' + cfg.user];
  if (cfg.password) auth.push('--password=' + cfg.password);

  const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, multipleStatements: false });
  try {
    const before = await counts(conn, database);
    await run(dumpExe(cfg.binDir), [...auth, '--single-transaction', '--routines', '--triggers', '--databases', database], { stdoutFile: file });

    const text = fs.readFileSync(file, 'utf8');
    const checks = { tamanoBytes: Buffer.byteLength(text), terminoCompleto: /-- Dump completed/.test(text) };
    for (const t of CRITICAL_TABLES) checks[`tabla_${t}`] = new RegExp('CREATE TABLE `?' + t + '`?').test(text);
    if (!checks.terminoCompleto || !CRITICAL_TABLES.every((t) => checks[`tabla_${t}`]) || checks.tamanoBytes < 1000) {
      throw new Error('Respaldo incompleto: ' + JSON.stringify(checks));
    }
    const sha256 = crypto.createHash('sha256').update(text).digest('hex');
    fs.writeFileSync(file + '.sha256', `${sha256}  ${path.basename(file)}\n`);

    let restore = null;
    if (verifyRestore) {
      const tmp = `${database}_restorecheck_test`;
      assertTestLikeName(tmp);
      await conn.query(`DROP DATABASE IF EXISTS \`${tmp}\``);
      await conn.query(`CREATE DATABASE \`${tmp}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      try {
        // El volcado incluye CREATE DATABASE/USE de la base original: se redirige a la temporal.
        const redirected = file + '.restorecheck.tmp';
        fs.writeFileSync(redirected, text
          .replace(new RegExp('CREATE DATABASE[^;]*`' + database + '`[^;]*;', 'g'), '')
          .replace(new RegExp('USE `' + database + '`;', 'g'), `USE \`${tmp}\`;`));
        await run(path.join(cfg.binDir, fs.existsSync(path.join(cfg.binDir, 'mariadb.exe')) ? 'mariadb.exe' : 'mysql.exe'), [...auth, tmp], { stdinFile: redirected });
        fs.unlinkSync(redirected);
        const after = await counts(conn, tmp);
        restore = { ok: CRITICAL_TABLES.every((t) => before[t] === after[t]), original: before, restaurada: after };
        if (!restore.ok) throw new Error('La restauración de prueba no coincide: ' + JSON.stringify(restore));
      } finally {
        await conn.query(`DROP DATABASE IF EXISTS \`${tmp}\``);
      }
    }
    return { archivo: file, sha256, filasOriginales: before, controles: checks, restauracion: restore };
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
  backupLocalDatabase({ database: arg('database'), verifyRestore: process.argv.includes('--verify-restore') })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); })
    .catch((e) => { console.error('RESPALDO FALLIDO:', e.message); process.exit(1); });
}
