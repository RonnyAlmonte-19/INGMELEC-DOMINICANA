// INGMELEC v2.2 — Cantidades a entregar en Actas (HTTP real, base sintética ingmelec_v22_actas_test, 3310).
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
import { isAgotado } from '../../src/utils/stock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..');
const MIG = path.join(SERVER, 'database', 'migrations');
const DB = 'ingmelec_v22_actas_test';
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const PASS = `Can${crypto.randomBytes(5).toString('hex')}7`;
const PORT = 5074;

async function seed(pool) {
  await pool.query(read(path.join(MIG, 'rollback_07_v22_actas_entrega.sql')));
  await pool.query(read(path.join(__dirname, 'fixtures', 'v21_synthetic_fixture.sql')).split('ingmelec_v21_test_isolated').join(DB));
  for (const f of ['migration_03_v21_seguridad_y_esquema.sql', 'migration_04_v21_campamentos_alias.sql', 'migration_05_v21_adapted.sql', 'migration_06_v21_safe.sql', 'migration_07_v22_actas_entrega.sql']) {
    await pool.query(read(path.join(MIG, f)));
  }
}

describe('v2.2 — cantidades a entregar en Actas (HTTP real)', () => {
  test('descuento exacto, agotado, rechazos sin efectos, cantidades distintas por herramienta', async () => {
    await withLocalMariaDb(async () => {
      const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: DB, multipleStatements: true, connectionLimit: 4, charset: 'utf8mb4' });
      let server;
      try {
        await seed(pool);
        await pool.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = 1', [await argon2.hash(PASS, { type: argon2.argon2id })]);
        const conn = await pool.getConnection();
        await conn.query("SET SESSION sql_mode = ''");
        const [[base]] = await conn.query('SELECT area, categoria FROM inv_articulos LIMIT 1');
        const mk = async (nombre, qty, serie = null) => (await conn.query(
          `INSERT INTO inv_articulos (articulo_nombre, area, categoria, ubicacion_nombre, campamento_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, serie_imei, unidad_medida, estado_fisico, activo, es_sintetico, codigo_original)
           VALUES (?, ?, ?, 'ALMACÉN 27 DE FEBRERO', 1, 'CONFIRMADO', ?, ?, 1, 'VERIFICADO', ?, 'Unidad', 'Bueno', 1, 0, ?)`,
          [nombre, base.area, base.categoria, qty, String(qty), serie, nombre.slice(0, 20)]))[0].insertId;
        const A = await mk('CANT-A stock 20', 20);
        const B = await mk('CANT-B stock 10', 10);
        const C = await mk('CANT-C stock 3', 3);
        const D = await mk('CANT-D stock 8', 8);
        const E = await mk('CANT-E stock 6', 6);
        const S = await mk('CANT-S con serie', 5, 'SN-CANT-0001');
        conn.release();

        const env = {
          ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_PORT: '3310', DB_USER: 'root', DB_PASSWORD: '', DB_NAME: DB,
          DB_SSL: 'false', ISOLATED_LOCAL_ONLY: 'true', BLOCK_REMOTE_DB: 'true', DB_CONNECTION_LIMIT: '6', ACTAS_ENABLED: 'true',
          JWT_SECRET: crypto.randomBytes(48).toString('hex'), CORS_ORIGINS: `http://localhost:${PORT}`
        };
        delete env.NODE_TEST_CONTEXT;
        server = spawn(process.execPath, ['index.js'], { cwd: SERVER, env, stdio: 'ignore' });
        for (let i = 0; i < 60; i++) {
          try { if ((await fetch(`http://127.0.0.1:${PORT}/api/v2/actas/disponible`)).status) break; } catch { /* esperando */ }
          await new Promise((r) => setTimeout(r, 500));
        }
        const http = async (p, { method = 'GET', body, token } = {}) => {
          const r = await fetch(`http://127.0.0.1:${PORT}/api/v2${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
          return { s: r.status, b: await r.json().catch(() => null) };
        };
        const tk = (await http('/auth/login', { method: 'POST', body: { email: 'dev.sintetico@ingmelec-test.local', password: PASS } })).b.token;
        const stock = async (id) => Number((await pool.query('SELECT cantidad_num FROM inv_articulos WHERE id=?', [id]))[0][0].cantidad_num);
        const cuenta = async (t) => Number((await pool.query(`SELECT COUNT(*) n FROM ${t}`))[0][0].n);
        const acta = (items, extra = {}) => ({
          request_uuid: crypto.randomUUID(), campamento_id: 1, colaborador_nombre: 'Colab Cantidad', supervisor_nombre: 'Sup Cantidad',
          motivo: 'Prueba de cantidades a entregar', items, ...extra
        });
        const post = (items, extra) => http('/actas', { method: 'POST', token: tk, body: acta(items, extra) });

        // 1) Stock 20, entregar 5 → queda 15 (y no hay duplicación al reintentar con el mismo request_uuid)
        const body1 = acta([{ articulo_id: A, cantidad: 5 }]);
        assert.equal((await http('/actas', { method: 'POST', token: tk, body: body1 })).s, 201);
        assert.equal(await stock(A), 15);
        const reintento = await http('/actas', { method: 'POST', token: tk, body: body1 });
        assert.equal(reintento.b.duplicada, true);
        assert.equal(await stock(A), 15, 'el reintento no descuenta dos veces');
        const [movA] = await pool.query("SELECT cantidad FROM inv_movimientos WHERE articulo_id = ? AND tipo_movimiento = 'SALIDA'", [A]);
        assert.deepEqual(movA.map((m) => Number(m.cantidad)), [5], 'una sola SALIDA de exactamente 5');

        // 2) Stock 10, entregar 10 → queda 0 y es AGOTADO (activo, visible)
        assert.equal((await post([{ articulo_id: B, cantidad: 10 }])).s, 201);
        assert.equal(await stock(B), 0);
        const lista = (await http('/articulos?limit=200&search=CANT-B', { token: tk })).b.articulos.find((a) => a.id === B);
        assert.ok(lista && isAgotado(lista), 'aparece como AGOTADO');
        assert.equal(Number(lista.activo), 1);

        // 3) Stock 3, intentar 4 → rechazo sin descontar, sin movimiento, sin acta y sin gastar número
        const antes = { act: await cuenta('inv_actas_entrega'), mov: await cuenta('inv_movimientos'), items: await cuenta('inv_acta_items') };
        const [[{ ultimo: ult0 }]] = await pool.query('SELECT ultimo FROM inv_acta_secuencia WHERE anio = ?', [new Date().getFullYear()]);
        const r4 = await post([{ articulo_id: C, cantidad: 4 }]);
        assert.equal(r4.s, 400);
        assert.match(r4.b.message, /insuficiente/i);
        assert.equal(await stock(C), 3);
        assert.deepEqual({ act: await cuenta('inv_actas_entrega'), mov: await cuenta('inv_movimientos'), items: await cuenta('inv_acta_items') }, antes);
        const [[{ ultimo: ult1 }]] = await pool.query('SELECT ultimo FROM inv_acta_secuencia WHERE anio = ?', [new Date().getFullYear()]);
        assert.equal(ult1, ult0, 'el rechazo no consume número de acta');

        // 4) 3 unidades de una herramienta y 2 de otra en una sola acta (cantidades distintas por ítem)
        const multi = await post([{ articulo_id: D, cantidad: 3 }, { articulo_id: E, cantidad: 2 }]);
        assert.equal(multi.s, 201);
        assert.equal(await stock(D), 5);
        assert.equal(await stock(E), 4);
        const det = (await http(`/actas/${multi.b.id}`, { token: tk })).b.acta;
        assert.deepEqual(det.items.map((i) => Number(i.cantidad)).sort(), [2, 3]);
        const [movs] = await pool.query('SELECT articulo_id, cantidad FROM inv_movimientos WHERE acta_id = ? ORDER BY articulo_id', [multi.b.id]);
        assert.deepEqual(movs.map((m) => [m.articulo_id, Number(m.cantidad)]), [[D, 3], [E, 2]]);

        // 5) Valores inválidos rechazados (sin efectos): 0, negativo, texto, vacío, nulo, decimal en unidad entera, exceso
        const base2 = { stock: await stock(D), act: await cuenta('inv_actas_entrega') };
        for (const bad of [0, -1, -0.5, 'abc', '', null, undefined, 1.5, 6, 99999, '1e9', NaN]) {
          const r = await post([{ articulo_id: D, cantidad: bad }]);
          assert.equal(r.s, 400, `cantidad ${String(bad)} debe rechazarse (llegó ${r.s})`);
        }
        assert.equal(await stock(D), base2.stock, 'ningún inválido descuenta');
        assert.equal(await cuenta('inv_actas_entrega'), base2.act);
        // Cantidad como texto numérico válido se acepta y descuenta exacto
        assert.equal((await post([{ articulo_id: D, cantidad: '2' }])).s, 201);
        assert.equal(await stock(D), 3);
        // Entregar exactamente todo lo que queda es válido; una más no
        assert.equal((await post([{ articulo_id: D, cantidad: 4 }])).s, 400);
        assert.equal((await post([{ articulo_id: D, cantidad: 3 }])).s, 201);
        assert.equal(await stock(D), 0);

        // 6) Serie real con varias unidades (decisión del propietario): de 1 hasta el stock; más del stock no
        assert.equal((await post([{ articulo_id: S, cantidad: 6 }])).s, 400);
        assert.equal(await stock(S), 5);
        assert.equal((await post([{ articulo_id: S, cantidad: 3 }])).s, 201, 'serie con stock 5: se entregan 3');
        assert.equal(await stock(S), 2);
        const serieItem = (await http(`/actas/${(await post([{ articulo_id: S, cantidad: 1 }])).b.id}`, { token: tk })).b.acta.items[0];
        assert.equal(serieItem.serie, 'SN-CANT-0001', 'la instantánea conserva la serie');
        assert.equal(await stock(S), 1);
        assert.equal((await post([{ articulo_id: S, cantidad: 2 }])).s, 400, 'con stock 1 solo cabe 1');
        assert.equal((await post([{ articulo_id: S, cantidad: 1 }])).s, 201);
        assert.equal(await stock(S), 0);

        // 7) Movimientos antiguos intactos
        assert.equal((await http('/movimientos', { method: 'POST', token: tk, body: { articulo_id: E, tipo_movimiento: 'ENTRADA', cantidad: 3, motivo: 'Regresión' } })).s, 200);
        assert.equal(await stock(E), 7);
      } finally {
        server?.kill();
        await pool.end();
      }
    });
  });
});
