// INGMELEC v2.2 — Pruebas HTTP reales (servidor Express real + MariaDB local desechable 3310):
// permisos act:*, ACTAS_ENABLED, estado AGOTADO y no-regresión de POST /movimientos.
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
const PASS = `Tst${crypto.randomBytes(5).toString('hex')}7`;

async function seed(pool) {
  await pool.query(read(path.join(MIG, 'rollback_07_v22_actas_entrega.sql')));
  await pool.query(read(path.join(__dirname, 'fixtures', 'v21_synthetic_fixture.sql')).split('ingmelec_v21_test_isolated').join(DB));
  for (const f of ['migration_03_v21_seguridad_y_esquema.sql', 'migration_04_v21_campamentos_alias.sql', 'migration_05_v21_adapted.sql', 'migration_06_v21_safe.sql', 'migration_07_v22_actas_entrega.sql']) {
    await pool.query(read(path.join(MIG, f)));
  }
}

function startServer(port, actas) {
  const env = {
    ...process.env, PORT: String(port), NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_PORT: '3310', DB_USER: 'root', DB_PASSWORD: '',
    DB_NAME: DB, DB_SSL: 'false', ISOLATED_LOCAL_ONLY: 'true', BLOCK_REMOTE_DB: 'true', DB_CONNECTION_LIMIT: '8',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), CORS_ORIGINS: `http://localhost:${port}`
  };
  delete env.ACTAS_ENABLED;
  if (actas !== undefined) env.ACTAS_ENABLED = actas;
  const child = spawn(process.execPath, ['index.js'], { cwd: SERVER, env, stdio: 'ignore' });
  return child;
}

async function esperar(port) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/v2/actas/disponible`); if (r.status) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor de pruebas no arrancó');
}

const api = (port) => async (p, { method = 'GET', body, token } = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/v2${p}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { s: r.status, b: await r.json().catch(() => null) };
};

describe('v2.2 — HTTP real: permisos act:*, bandera, AGOTADO y regresión de movimientos', () => {
  test('flujo completo sobre servidor real', async () => {
    await withLocalMariaDb(async () => {
      const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: DB, multipleStatements: true, connectionLimit: 4, charset: 'utf8mb4' });
      const servers = [];
      try {
        await seed(pool);

        // Ningún usuario existente recibe act:* automáticamente.
        const [conAct] = await pool.query("SELECT COUNT(*) n FROM inv_usuarios WHERE CAST(permisos_json AS CHAR) LIKE '%act:%'");
        assert.equal(Number(conAct[0].n), 0, 'ningún usuario existente debe tener act:*');

        // Usuarios de prueba (solo en la base desechable).
        const hash = await argon2.hash(PASS, { type: argon2.argon2id });
        await pool.query("UPDATE inv_usuarios SET password_hash = ? WHERE id = 1", [hash]);
        const conn = await pool.getConnection();
        await conn.query("SET SESSION sql_mode = ''");
        const users = {
          lector: ['act:ver'], creador: ['act:crear', 'inv:ver'], anulador: ['act:ver', 'act:anular'],
          sinact: ['inv:ver'], ajena: ['act:ver', 'act:crear', 'act:anular']
        };
        for (const [k, perms] of Object.entries(users)) {
          const campId = k === 'ajena' ? 3 : 1;
          const [r] = await conn.query(
            "INSERT INTO inv_usuarios (nombre, email, password_hash, rol, cargo, area, activo, es_developer, campamento_id, permisos_json) VALUES (?, ?, ?, 'almacen', 'QA', 'General', 1, 0, ?, ?)",
            [`QA ${k}`, `${k}@ingmelec-test.local`, hash, campId, JSON.stringify(perms)]);
          await conn.query('INSERT INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, ?, 1)', [r.insertId, campId]);
        }
        const [[camp]] = await conn.query('SELECT id, nombre FROM inv_campamentos WHERE id = 1');
        const [[base]] = await conn.query('SELECT area, categoria FROM inv_articulos LIMIT 1');
        const mkArt = async (nombre, qty) => (await conn.query(
          `INSERT INTO inv_articulos (articulo_nombre, area, categoria, ubicacion_nombre, campamento_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, unidad_medida, estado_fisico, activo, es_sintetico, codigo_original)
           VALUES (?, ?, ?, ?, 1, 'CONFIRMADO', ?, ?, 1, 'VERIFICADO', 'Unidad', 'Bueno', 1, 0, ?)`,
          [nombre, base.area, base.categoria, camp.nombre, qty, String(qty), `QA-${nombre.slice(-3)}`]))[0].insertId;
        const A = await mkArt('QA ARTICULO UNO', 1);
        const B = await mkArt('QA ARTICULO DOS', 20);
        const C = await mkArt('QA ARTICULO TRES', 20);
        conn.release();

        // ---------- servidor con ACTAS_ENABLED=true ----------
        const on = startServer(5057, 'true'); servers.push(on);
        await esperar(5057);
        const http = api(5057);
        const login = async (email) => (await http('/auth/login', { method: 'POST', body: { email, password: PASS } })).b?.token;
        const dev = await login('dev.sintetico@ingmelec-test.local');
        const tk = {};
        for (const k of Object.keys(users)) tk[k] = await login(`${k}@ingmelec-test.local`);
        assert.ok(dev && Object.values(tk).every(Boolean), 'todos los usuarios de prueba deben iniciar sesión');

        const stock = async (id) => Number((await pool.query('SELECT cantidad_num FROM inv_articulos WHERE id=?', [id]))[0][0].cantidad_num);
        const acta = (items, extra = {}) => ({
          request_uuid: crypto.randomUUID(), campamento_id: 1, colaborador_nombre: 'Colab QA', supervisor_nombre: 'Sup QA',
          departamento: 'Mantenimiento', motivo: 'Entrega de prueba automatizada', items, ...extra
        });

        // ===== AGOTADO =====
        const mov = (articulo_id, tipo, cantidad) => http('/movimientos', { method: 'POST', token: dev, body: { articulo_id, tipo_movimiento: tipo, cantidad, motivo: 'Prueba AGOTADO' } });
        assert.equal(isAgotado({ cantidad_num: '1.00' }), false);
        assert.equal((await mov(A, 'SALIDA', 1)).s, 200);                       // stock 1 -> SALIDA 1
        assert.equal(await stock(A), 0);
        assert.equal(isAgotado({ cantidad_num: await stock(A) }), true, 'stock 0 => AGOTADO');
        assert.equal(isAgotado({ cantidad_num: null }), false, 'NULL (pendiente) no es agotado');
        const [[estadoA]] = await pool.query('SELECT activo, estado_fisico FROM inv_articulos WHERE id=?', [A]);
        assert.equal(Number(estadoA.activo), 1, 'un agotado no se desactiva');
        assert.equal(estadoA.estado_fisico, 'Bueno', 'no cambia la condición física');
        const lista = (await http(`/articulos?limit=500&campamento_id=1`, { token: dev })).b.articulos;
        const enLista = lista.find((a) => a.id === A);
        assert.ok(enLista && isAgotado(enLista), 'agotado sigue visible en inventario y se calcula como AGOTADO');
        const hist = (await http('/movimientos?limit=50', { token: dev })).b.movimientos;
        assert.ok(hist.some((m) => m.articulo_id === A && m.tipo_movimiento === 'SALIDA'), 'agotado sigue en el historial');
        // Stock 0: SALIDA, ASIGNACION y acta rechazados sin efectos.
        const movsAntes = Number((await pool.query('SELECT COUNT(*) n FROM inv_movimientos'))[0][0].n);
        assert.equal((await mov(A, 'SALIDA', 1)).s, 400);
        assert.equal((await mov(A, 'ASIGNACION', 1)).s, 400);
        assert.equal((await http('/actas', { method: 'POST', token: dev, body: acta([{ articulo_id: A, cantidad: 1 }]) })).s, 400);
        assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM inv_movimientos'))[0][0].n), movsAntes, 'rechazos no crean movimientos');
        assert.equal(await stock(A), 0);
        // ENTRADA de 3 => deja de estar agotado.
        assert.equal((await mov(A, 'ENTRADA', 3)).s, 200);
        assert.equal(await stock(A), 3);
        assert.equal(isAgotado({ cantidad_num: await stock(A) }), false);
        // DEVOLUCION también sale del estado.
        assert.equal((await mov(A, 'SALIDA', 3)).s, 200);
        assert.equal((await mov(A, 'DEVOLUCION', 1)).s, 200);
        assert.equal(await stock(A), 1);
        // Acta que agota el artículo: queda en 0 y activo.
        const rAg = await http('/actas', { method: 'POST', token: dev, body: acta([{ articulo_id: A, cantidad: 1 }]) });
        assert.equal(rAg.s, 201);
        assert.equal(await stock(A), 0);
        assert.equal(Number((await pool.query('SELECT activo FROM inv_articulos WHERE id=?', [A]))[0][0].activo), 1);

        // ===== Multi-ítem y orden cruzado (sin deadlock) =====
        const multi = await http('/actas', { method: 'POST', token: dev, body: acta([{ articulo_id: B, cantidad: 2 }, { articulo_id: C, cantidad: 3 }]) });
        assert.equal(multi.s, 201);
        assert.equal(await stock(B), 18);
        assert.equal(await stock(C), 17);
        const cruz = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => http('/actas', {
          method: 'POST', token: dev,
          body: acta(i % 2 ? [{ articulo_id: B, cantidad: 1 }, { articulo_id: C, cantidad: 1 }] : [{ articulo_id: C, cantidad: 1 }, { articulo_id: B, cantidad: 1 }])
        })));
        assert.ok(cruz.every((r) => r.s === 201), `sin deadlock: ${cruz.map((r) => r.s)}`);
        assert.equal(await stock(B), 12);
        assert.equal(await stock(C), 11);

        // ===== Fallo a mitad no deja descuentos ni consume número =====
        const [[{ ultimo: ultAntes }]] = await pool.query('SELECT ultimo FROM inv_acta_secuencia WHERE anio = ?', [new Date().getFullYear()]);
        const fallo = await http('/actas', { method: 'POST', token: dev, body: acta([{ articulo_id: B, cantidad: 1 }, { articulo_id: C, cantidad: 999 }]) });
        assert.equal(fallo.s, 400);
        assert.equal(await stock(B), 12, 'el primer ítem se revierte');
        const [[{ ultimo: ultDespues }]] = await pool.query('SELECT ultimo FROM inv_acta_secuencia WHERE anio = ?', [new Date().getFullYear()]);
        assert.equal(ultDespues, ultAntes, 'un fallo no consume número de acta');

        // ===== Permisos act:* =====
        const body = () => acta([{ articulo_id: B, cantidad: 1 }]);
        assert.equal((await http('/actas', { method: 'POST', token: tk.sinact, body: body() })).s, 403, 'sin act:crear → 403');
        assert.equal((await http('/actas', { token: tk.sinact })).s, 403, 'sin act:ver → 403');
        assert.equal((await http('/actas', { method: 'POST', token: tk.lector, body: body() })).s, 403, 'solo act:ver no crea');
        const creada = await http('/actas', { method: 'POST', token: tk.creador, body: body() });
        assert.equal(creada.s, 201, 'act:crear crea');
        assert.equal((await http('/actas', { token: tk.lector })).s, 200, 'act:ver lista');
        assert.equal((await http('/actas', { method: 'POST', token: tk.ajena, body: body() })).s, 403, 'sede ajena → 403');
        const id = creada.b.id;
        assert.equal((await http(`/actas/${id}`, { token: tk.ajena })).s, 403, 'detalle de sede ajena → 403');
        assert.equal((await http(`/actas/${id}/anular`, { method: 'POST', token: tk.lector, body: { motivo: 'Motivo suficientemente largo' } })).s, 403, 'act:ver no anula');
        assert.equal((await http(`/actas/${id}/anular`, { method: 'POST', token: tk.creador, body: { motivo: 'Motivo suficientemente largo' } })).s, 403, 'act:crear no anula');
        assert.equal((await http(`/actas/${id}/anular`, { method: 'POST', token: tk.ajena, body: { motivo: 'Motivo suficientemente largo' } })).s, 403, 'otra sede no anula');
        const stockPrevioAnular = await stock(B);
        assert.equal((await http(`/actas/${id}/anular`, { method: 'POST', token: tk.anulador, body: { motivo: 'Motivo suficientemente largo' } })).s, 200, 'act:anular anula');
        assert.equal(await stock(B), stockPrevioAnular, 'anular no devuelve stock');
        const [[audit]] = await pool.query("SELECT COUNT(*) n FROM inv_auditoria WHERE accion = 'ACTA_ANULADA' AND entidad_id = ?", [id]);
        assert.equal(Number(audit.n), 1, 'la anulación queda auditada');
        assert.equal((await http(`/actas/${id}/anular`, { method: 'POST', token: dev, body: { motivo: 'Segunda anulación del acta' } })).s, 409);
        assert.equal((await http('/actas', { method: 'POST', body: body() })).s, 401);
        // Developer conserva acceso global.
        assert.equal((await http(`/actas/${id}`, { token: dev })).s, 200);
        // Las claves act:* son concedibles por la vía existente (catálogo).
        const cat = (await http('/usuarios/permisos-catalogo', { token: dev })).b;
        assert.ok(['act:ver', 'act:crear', 'act:anular'].every((k) => cat.permisos.includes(k)));
        // Anular conserva el historial: acta, ítems y movimientos intactos.
        const [[{ n: nItems }]] = await pool.query('SELECT COUNT(*) n FROM inv_acta_items WHERE acta_id = ?', [id]);
        assert.equal(Number(nItems), 1);

        // ---------- servidor con la bandera APAGADA (valor por defecto) ----------
        const off = startServer(5058, undefined); servers.push(off);
        await esperar(5058);
        const httpOff = api(5058);
        const tOff = (await httpOff('/auth/login', { method: 'POST', body: { email: 'dev.sintetico@ingmelec-test.local', password: PASS } })).b.token;
        assert.equal((await httpOff('/actas/disponible', { token: tOff })).b.enabled, false);
        assert.equal((await httpOff('/actas', { token: tOff })).s, 404, 'ACTAS_ENABLED apagada → rutas inexistentes');
        assert.equal((await httpOff('/actas', { method: 'POST', token: tOff, body: acta([{ articulo_id: B, cantidad: 1 }]) })).s, 404);
        // POST /movimientos sigue funcionando con la bandera apagada.
        assert.equal((await httpOff('/movimientos', { method: 'POST', token: tOff, body: { articulo_id: B, tipo_movimiento: 'ENTRADA', cantidad: 1, motivo: 'Regresión' } })).s, 200);
      } finally {
        for (const s of servers) s.kill();
        await pool.end();
      }
    });
  });
});
