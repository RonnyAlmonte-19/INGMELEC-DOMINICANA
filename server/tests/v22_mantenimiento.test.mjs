// INGMELEC v2.2 — Modo mantenimiento (servidor Express real + MariaDB local desechable 3310, base sintética):
// /health.maintenance, registro de arranque, bloqueo 503 de todas las rutas de escritura, lecturas y reactivación.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import argon2 from 'argon2';
import { withLocalMariaDb } from './helpers/local-mariadb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..');
const MIG = path.join(SERVER, 'database', 'migrations');
const DB = 'ingmelec_v22_actas_test';
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const PASS = `Mnt${crypto.randomBytes(5).toString('hex')}7`;
const JWT = crypto.randomBytes(48).toString('hex');

async function seed(pool) {
  await pool.query(read(path.join(MIG, 'rollback_07_v22_actas_entrega.sql')));
  await pool.query(read(path.join(__dirname, 'fixtures', 'v21_synthetic_fixture.sql')).split('ingmelec_v21_test_isolated').join(DB));
  for (const f of ['migration_03_v21_seguridad_y_esquema.sql', 'migration_04_v21_campamentos_alias.sql', 'migration_05_v21_adapted.sql', 'migration_06_v21_safe.sql', 'migration_07_v22_actas_entrega.sql']) {
    await pool.query(read(path.join(MIG, f)));
  }
}

async function arrancar(port, mant) {
  const env = {
    ...process.env, PORT: String(port), NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_PORT: '3310', DB_USER: 'root', DB_PASSWORD: '',
    DB_NAME: DB, DB_SSL: 'false', ISOLATED_LOCAL_ONLY: 'true', BLOCK_REMOTE_DB: 'true', DB_CONNECTION_LIMIT: '4',
    JWT_SECRET: JWT, CORS_ORIGINS: `http://localhost:${port}`, ACTAS_ENABLED: 'true'
  };
  delete env.NODE_TEST_CONTEXT;
  delete env.MAINTENANCE_MODE;
  if (mant !== undefined) env.MAINTENANCE_MODE = mant;
  const logs = [];
  const child = spawn(process.execPath, ['index.js'], { cwd: SERVER, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.ok) return { child, logs, port }; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill();
  throw new Error('El servidor de pruebas no arrancó');
}
const parar = (s) => new Promise((resolve) => { s.child.once('exit', resolve); s.child.kill(); setTimeout(resolve, 3000); });
const http = async (port, method, url, { token, body } = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};

async function huella(pool) {
  const [tabs] = await pool.query('SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE" ORDER BY 1', [DB]);
  const out = {};
  for (const { t } of tabs) {
    const [cols] = await pool.query('SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [DB, t]);
    const expr = cols.map((x) => `IFNULL(CAST(\`${x.c}\` AS CHAR),'~')`).join(",'#',");
    const [[r]] = await pool.query(`SELECT COUNT(*) n, IFNULL(BIT_XOR(CRC32(CONCAT_WS('|',${expr}))),0) h FROM \`${t}\``);
    out[t] = `${r.n}:${r.h}`;
  }
  return out;
}

function rutasEscritura() {
  const out = [];
  for (const f of ['routes/almacenApi.js', 'routes/actasApi.js']) {
    for (const m of read(path.join(SERVER, f)).matchAll(/router\.(post|put|patch|delete)\(\s*'([^']+)'/g)) out.push([m[1].toUpperCase(), '/api/v2' + m[2].replace(/:[A-Za-z]+/g, '1')]);
  }
  return out;
}

describe('v2.2 — modo mantenimiento (servidor real)', () => {
  test('health, registro de arranque, bloqueo de escrituras, lecturas y reactivación', async () => {
    await withLocalMariaDb(async () => {
      const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: DB, multipleStatements: true, connectionLimit: 4, charset: 'utf8mb4' });
      try {
        await seed(pool);
        await pool.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = 1', [await argon2.hash(PASS, { type: argon2.argon2id })]);
        const rutas = rutasEscritura();
        assert.ok(rutas.length >= 25, `se esperaban ≥25 rutas de escritura, se hallaron ${rutas.length}`);

        // 1) Valor exacto "true" activa: /health, registro de arranque y sesión previa
        const normal = await arrancar(5081);
        assert.equal((await (await fetch('http://127.0.0.1:5081/health')).json()).maintenance, false, 'sin variable: maintenance=false');
        assert.ok(!normal.logs.join('').includes('[MANTENIMIENTO] ACTIVO'), 'sin variable no debe registrar mantenimiento');
        const lg = await http(5081, 'POST', '/api/v2/auth/login', { body: { email: 'dev.sintetico@ingmelec-test.local', password: PASS } });
        const token = lg.b?.token || lg.b?.data?.token;
        assert.equal(lg.s, 200); assert.ok(token);
        await parar(normal);

        // 2) Valores que NO activan (sin alias): health=false, sin bloqueo 503
        for (const v of ['false', '1', 'yes', 'on']) {
          const s = await arrancar(5082, v);
          const h = await (await fetch('http://127.0.0.1:5082/health')).json();
          assert.equal(h.maintenance, false, `MAINTENANCE_MODE=${v} no debe activar (health)`);
          const w = await http(5082, 'POST', '/api/v2/movimientos', { token, body: {} });
          assert.notEqual(w.s, 503, `MAINTENANCE_MODE=${v} no debe bloquear escrituras`);
          assert.ok(!s.logs.join('').includes('[MANTENIMIENTO] ACTIVO'));
          await parar(s);
        }

        // 3) MAINTENANCE_MODE=true
        const antes = await huella(pool);
        const M = await arrancar(5083, 'true');
        const h = await (await fetch('http://127.0.0.1:5083/health')).json();
        assert.equal(h.maintenance, true, 'true: maintenance=true');
        assert.equal(h.status, 'ok');
        assert.ok(M.logs.join('').includes('[MANTENIMIENTO] ACTIVO'), 'debe registrar [MANTENIMIENTO] ACTIVO al arrancar');
        const noBloq = [];
        for (const [m, u] of rutas) {
          const r = await http(5083, m, u, { token, body: {} });
          if (!(r.s === 503 && /MODO MANTENIMIENTO/.test(r.b?.message || ''))) noBloq.push(`${m} ${u} -> ${r.s}`);
        }
        assert.deepEqual(noBloq, [], `rutas de escritura sin bloquear: ${noBloq.join('; ')}`);
        const login = await http(5083, 'POST', '/api/v2/auth/login', { body: { email: 'dev.sintetico@ingmelec-test.local', password: PASS } });
        assert.equal(login.s, 503, 'el inicio de sesión también se bloquea (decisión vigente)');
        for (const g of ['/auth/me', '/articulos?facetas=true&limit=5', '/movimientos', '/reportes/consolidado', '/auditoria', '/usuarios', '/campamentos', '/levantamientos', '/actas', '/actas/opciones', '/dashboard/kpis']) {
          const r = await http(5083, 'GET', '/api/v2' + g, { token });
          assert.equal(r.s, 200, `lectura ${g} debe seguir funcionando (HTTP ${r.s})`);
        }
        const despues = await huella(pool);
        assert.deepEqual(despues, antes, 'ninguna tabla debe cambiar durante el mantenimiento');
        await parar(M);

        // 4) Desactivado: las operaciones vuelven a funcionar
        const D = await arrancar(5084, 'false');
        assert.equal((await (await fetch('http://127.0.0.1:5084/health')).json()).maintenance, false);
        const lg2 = await http(5084, 'POST', '/api/v2/auth/login', { body: { email: 'dev.sintetico@ingmelec-test.local', password: PASS } });
        assert.equal(lg2.s, 200, 'login vuelve a funcionar');
        const t2 = lg2.b?.token || lg2.b?.data?.token;
        const op = await http(5084, 'GET', '/api/v2/actas/opciones', { token: t2 });
        const camp = (op.b?.campamentos || op.b?.data?.campamentos || [])[0];
        const lista = await http(5084, 'GET', '/api/v2/articulos?limit=200', { token: t2 });
        const items = lista.b?.data || lista.b?.articulos || lista.b?.items || [];
        const art = items.find((a) => Number(a.cantidad_num) >= 2 && Number(a.campamento_id) === Number(camp?.id)) || items.find((a) => Number(a.cantidad_num) >= 2);
        assert.ok(camp && art, 'datos sintéticos para la escritura de control');
        const w = await http(5084, 'POST', '/api/v2/actas', { token: t2, body: { request_uuid: crypto.randomUUID(), campamento_id: camp.id, colaborador_nombre: 'Prueba', supervisor_nombre: 'Prueba', motivo: 'Escritura de control tras mantenimiento', items: [{ articulo_id: art.id, cantidad: 1 }] } });
        assert.ok(w.s === 201 || w.s === 200, `la escritura real debe funcionar tras desactivar (HTTP ${w.s})`);
        const tras = await huella(pool);
        assert.notDeepEqual(tras, despues, 'control positivo: la escritura sí cambia la base');
        await parar(D);
      } finally {
        await pool.end();
      }
    });
  });
});
