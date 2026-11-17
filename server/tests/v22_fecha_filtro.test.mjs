// INGMELEC v2.2 — Filtro de fechas (solo consulta): helper puro + HTTP real sobre la base
// sintética desechable ingmelec_v22_actas_test (127.0.0.1:3310). Nunca producción.
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
import { parseDateRange, dateTimeCondition, dateOnlyCondition, parseOffsetMinutes } from '../services/dateRange.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..');
const MIG = path.join(SERVER, 'database', 'migrations');
const DB = 'ingmelec_v22_actas_test';
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const PASS = `Fec${crypto.randomBytes(5).toString('hex')}7`;

describe('v2.2 — dateRange (unitarias)', () => {
  test('sin parámetros: filtro inactivo y sin condición SQL', () => {
    assert.deepEqual(parseDateRange({}), { active: false });
    assert.deepEqual(parseDateRange({ fecha_desde: '', fecha_hasta: '  ' }), { active: false });
    assert.equal(dateTimeCondition('c', parseDateRange({})), null);
    assert.equal(dateOnlyCondition('c', parseDateRange({})), null);
  });

  test('validación estricta de fechas', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', 'abc', '2026-11-17T00:00:00', '1800-01-01', '2200-01-01', "2026-01-01' OR 1=1"]) {
      assert.ok(parseDateRange({ fecha_desde: bad }).error, `debe rechazar "${bad}"`);
    }
    assert.ok(parseDateRange({ fecha_desde: ['2026-01-01'] }).error);
    assert.ok(parseDateRange({ fecha_desde: '2026-03-02', fecha_hasta: '2026-03-01' }).error, 'desde > hasta');
    assert.equal(parseDateRange({ fecha_desde: '2024-02-29' }).active, true, 'año bisiesto válido');
    assert.ok(parseDateRange({ fecha_desde: '2026-02-29' }).error, '2026 no es bisiesto');
  });

  test('rango inclusivo [desde 00:00, hasta+1 00:00) sin conversión por defecto', () => {
    const r = parseDateRange({ fecha_desde: '2026-03-11', fecha_hasta: '2026-03-11' }, {});
    assert.equal(r.startDb, '2026-03-11 00:00:00');
    assert.equal(r.endDb, '2026-03-12 00:00:00');
    const c = dateTimeCondition('m.fecha_movimiento', r);
    assert.equal(c.sql, '(m.fecha_movimiento >= ? AND m.fecha_movimiento < ?)');
    assert.deepEqual(c.params, ['2026-03-11 00:00:00', '2026-03-12 00:00:00']);
  });

  test('zona horaria: día de Santo Domingo (-04:00) sobre una base en UTC', () => {
    const r = parseDateRange({ fecha_desde: '2026-03-11', fecha_hasta: '2026-03-11' }, { DB_TIME_OFFSET: '+00:00' });
    assert.equal(r.startDb, '2026-03-11 04:00:00');
    assert.equal(r.endDb, '2026-03-12 04:00:00');
    // cruce de fin de año / mes
    const y = parseDateRange({ fecha_hasta: '2026-12-31' }, { DB_TIME_OFFSET: '+00:00' });
    assert.equal(y.endDb, '2027-01-01 04:00:00');
    assert.equal(y.startDb, null);
  });

  test('solo desde / solo hasta y fechas DATE sin zona', () => {
    const d = parseDateRange({ fecha_desde: '2026-03-11' }, {});
    assert.equal(dateTimeCondition('x', d).sql, '(x >= ?)');
    const h = parseDateRange({ fecha_hasta: '2026-03-11' }, {});
    assert.equal(dateTimeCondition('x', h).sql, '(x < ?)');
    const both = parseDateRange({ fecha_desde: '2026-03-01', fecha_hasta: '2026-03-31' }, { DB_TIME_OFFSET: '+00:00' });
    assert.deepEqual(dateOnlyCondition('l.fecha_inicio', both), { sql: '(l.fecha_inicio >= ? AND l.fecha_inicio <= ?)', params: ['2026-03-01', '2026-03-31'] });
  });

  test('offsets mal formados caen al valor por defecto', () => {
    assert.equal(parseOffsetMinutes('-04:00', 0), -240);
    assert.equal(parseOffsetMinutes('xx', -240), -240);
    assert.equal(parseOffsetMinutes('+99:00', -240), -240);
  });
});

async function seed(pool) {
  await pool.query(read(path.join(MIG, 'rollback_07_v22_actas_entrega.sql')));
  await pool.query(read(path.join(__dirname, 'fixtures', 'v21_synthetic_fixture.sql')).split('ingmelec_v21_test_isolated').join(DB));
  for (const f of ['migration_03_v21_seguridad_y_esquema.sql', 'migration_04_v21_campamentos_alias.sql', 'migration_05_v21_adapted.sql', 'migration_06_v21_safe.sql', 'migration_07_v22_actas_entrega.sql']) {
    await pool.query(read(path.join(MIG, f)));
  }
}

function startServer(port, extraEnv = {}) {
  const env = {
    ...process.env, PORT: String(port), NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_PORT: '3310', DB_USER: 'root', DB_PASSWORD: '',
    DB_NAME: DB, DB_SSL: 'false', ISOLATED_LOCAL_ONLY: 'true', BLOCK_REMOTE_DB: 'true', DB_CONNECTION_LIMIT: '6',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), CORS_ORIGINS: `http://localhost:${port}`, ...extraEnv
  };
  delete env.DB_TIME_OFFSET;
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, extraEnv);
  const child = spawn(process.execPath, ['index.js'], { cwd: SERVER, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderrText = '';
  child.stdout.on('data', (d) => { child.stderrText += d; });
  child.stderr.on('data', (d) => { child.stderrText += d; });
  return child;
}
async function esperar(port, child) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/v2/actas/disponible`); if (r.status) return; } catch (e) { child.lastErr = e.cause?.code || e.message; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor de pruebas no arrancó (exit=' + child?.exitCode + ', puerto ' + port + ', err=' + child?.lastErr + '): ' + String(child?.stderrText).slice(-600));
}
const api = (port) => async (p, token) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/v2${p}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { s: r.status, b: await r.json().catch(() => null) };
};

describe('v2.2 — filtro de fechas HTTP real', () => {
  test('artículos, movimientos, auditoría, levantamientos, reportes, alcance y zona horaria', async () => {
    await withLocalMariaDb(async () => {
      const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: DB, multipleStatements: true, connectionLimit: 4, charset: 'utf8mb4' });
      const servers = [];
      try {
        await seed(pool);
        const hash = await argon2.hash(PASS, { type: argon2.argon2id });
        await pool.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = 1', [hash]);
        const conn = await pool.getConnection();
        await conn.query("SET SESSION sql_mode = ''");
        const perms = ['inv:ver', 'inv:movimientos_ver', 'rep:ver', 'rep:exportar', 'lev:ver', 'aud:ver', 'camp:ver'];
        const [u] = await conn.query("INSERT INTO inv_usuarios (nombre, email, password_hash, rol, cargo, area, activo, es_developer, campamento_id, permisos_json) VALUES ('QA Sede1', 'sede1@ingmelec-test.local', ?, 'almacen', 'QA', 'General', 1, 0, 1, ?)", [hash, JSON.stringify(perms)]);
        await conn.query('INSERT INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, 1, 1)', [u.insertId]);
        const [[base]] = await conn.query('SELECT area, categoria FROM inv_articulos LIMIT 1');
        const [[camp1]] = await conn.query('SELECT nombre FROM inv_campamentos WHERE id = 1');
        const [[camp3]] = await conn.query('SELECT nombre FROM inv_campamentos WHERE id = 3');

        // Artículos con marcas de tiempo en los límites del día 2026-03-11 (nombres únicos "FECHA-*")
        const casos = [
          ['FECHA-A-ANTES', '2026-03-10 23:59:59', 1], ['FECHA-B-INICIO', '2026-03-11 00:00:00', 1],
          ['FECHA-C-FIN', '2026-03-11 23:59:59', 1], ['FECHA-D-DESPUES', '2026-03-12 00:00:00', 1],
          ['FECHA-E-OTRA-SEDE', '2026-03-11 12:00:00', 3], ['FECHA-F-SIN-FECHA', null, 1]
        ];
        const ids = {};
        for (const [nombre, fecha, camp] of casos) {
          const [r] = await conn.query(
            `INSERT INTO inv_articulos (articulo_nombre, area, categoria, ubicacion_nombre, campamento_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, unidad_medida, estado_fisico, activo, es_sintetico, codigo_original, fecha_creacion)
             VALUES (?, ?, ?, ?, ?, 'CONFIRMADO', 5, '5', 1, 'VERIFICADO', 'Unidad', 'Bueno', 1, 0, ?, ?)`,
            [nombre, base.area, base.categoria, camp === 1 ? camp1.nombre : camp3.nombre, camp, nombre.slice(-8), fecha]);
          ids[nombre] = r.insertId;
        }
        // Movimientos / auditoría / levantamientos con fechas en los límites
        const movFechas = ['2026-03-10 23:59:59', '2026-03-11 00:00:00', '2026-03-11 23:59:59', '2026-03-12 00:00:00'];
        for (const f of movFechas) {
          await conn.query("INSERT INTO inv_movimientos (articulo_id, tipo_movimiento, cantidad, unidad_medida, motivo, usuario_id, es_sintetico, fecha_movimiento) VALUES (?, 'AJUSTE', 5, 'Unidad', 'Prueba fecha', 1, 0, ?)", [ids['FECHA-B-INICIO'], f]);
        }
        await conn.query("INSERT INTO inv_movimientos (articulo_id, tipo_movimiento, cantidad, unidad_medida, motivo, usuario_id, es_sintetico, fecha_movimiento) VALUES (?, 'AJUSTE', 5, 'Unidad', 'Prueba otra sede', 1, 0, '2026-03-11 12:00:00')", [ids['FECHA-E-OTRA-SEDE']]);
        for (const f of movFechas) {
          await conn.query("INSERT INTO inv_auditoria (usuario_id, usuario_nombre, accion, entidad, entidad_id, ip_origen, fecha) VALUES (1, 'QA', 'PRUEBA_FECHA', 'inv_articulos', ?, '127.0.0.1', ?)", [ids['FECHA-B-INICIO'], f]);
        }
        for (const [t, f] of [['LEV-FECHA-1', '2026-03-10'], ['LEV-FECHA-2', '2026-03-11'], ['LEV-FECHA-3', '2026-03-12']]) {
          await conn.query("INSERT INTO inv_levantamientos (codigo_levantamiento, codigo, titulo, responsable_levantamiento, campamento_id, estado, fecha_inicio, es_sintetico, creado_por) VALUES (?, ?, ?, 'QA', 1, 'En proceso', ?, 0, 1)", [t, t, t, f]);
        }
        conn.release();

        const snapArticulos = async () => JSON.stringify((await pool.query('SELECT id, fecha_creacion, fecha_actualizacion, cantidad_num, activo, estado_fisico FROM inv_articulos ORDER BY id'))[0]);
        const snapMovs = async () => JSON.stringify((await pool.query('SELECT * FROM inv_movimientos ORDER BY id'))[0]);
        const antesArt = await snapArticulos();
        const antesMov = await snapMovs();
        const on = startServer(5071); servers.push(on); await esperar(5071, on);
        const http = api(5071);
        const login = async (email) => (await (await fetch('http://127.0.0.1:5071/api/v2/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) })).json()).token;
        const dev = await login('dev.sintetico@ingmelec-test.local');
        const sede1 = await login('sede1@ingmelec-test.local');
        assert.ok(dev && sede1);

        const nombres = (r) => r.b.articulos.filter((a) => a.articulo_nombre.startsWith('FECHA-')).map((a) => a.articulo_nombre).sort();
        const q = (extra) => `/articulos?limit=200&search=FECHA-${extra}`;

        // Sin filtro: todos (incluido el que no tiene fecha) — comportamiento actual
        assert.equal(nombres(await http(q(''), dev)).length, 6);
        // Día exacto: inclusivo en ambos extremos, excluye 23:59:59 del día anterior y 00:00:00 del siguiente
        assert.deepEqual(nombres(await http(q('&fecha_desde=2026-03-11&fecha_hasta=2026-03-11'), dev)), ['FECHA-B-INICIO', 'FECHA-C-FIN', 'FECHA-E-OTRA-SEDE']);
        // Solo desde / solo hasta
        assert.deepEqual(nombres(await http(q('&fecha_desde=2026-03-12'), dev)), ['FECHA-D-DESPUES']);
        assert.deepEqual(nombres(await http(q('&fecha_hasta=2026-03-10'), dev)), ['FECHA-A-ANTES']);
        // Registros sin fecha: fuera con filtro activo, de vuelta al limpiar
        assert.ok(!nombres(await http(q('&fecha_desde=2000-01-01&fecha_hasta=2100-01-01'), dev)).includes('FECHA-F-SIN-FECHA'));
        // Inválidos → 400 sin tocar datos
        assert.equal((await http(q('&fecha_desde=2026-02-30'), dev)).s, 400);
        assert.equal((await http(q('&fecha_desde=2026-03-12&fecha_hasta=2026-03-11'), dev)).s, 400);
        // Se mantienen los otros filtros y la paginación/total coherente
        const pag = await http(`/articulos?limit=1&page=1&search=FECHA-&fecha_desde=2026-03-11&fecha_hasta=2026-03-11`, dev);
        assert.equal(pag.b.pagination.total, 3);
        assert.equal(pag.b.articulos.length, 1);
        assert.equal(pag.b.pagination.totalPages, 3);
        const combo = await http(q(`&fecha_desde=2026-03-11&fecha_hasta=2026-03-11&campamento_id=3`), dev);
        assert.deepEqual(nombres(combo), ['FECHA-E-OTRA-SEDE']);
        // Alcance por sede: el usuario de la sede 1 jamás ve la sede 3, con o sin fecha
        assert.deepEqual(nombres(await http(q('&fecha_desde=2026-03-11&fecha_hasta=2026-03-11'), sede1)), ['FECHA-B-INICIO', 'FECHA-C-FIN']);
        assert.ok(!nombres(await http(q(''), sede1)).includes('FECHA-E-OTRA-SEDE'));

        // Reportes: consolidado y exportación respetan el período y el alcance
        const rep = (await http('/reportes/consolidado?fecha_desde=2026-03-11&fecha_hasta=2026-03-11', sede1)).b.reporte;
        const repAll = (await http('/reportes/consolidado', sede1)).b.reporte;
        assert.ok(rep.totales.totalArticulos < repAll.totales.totalArticulos);
        const exp = (await http('/reportes/exportar?fecha_desde=2026-03-11&fecha_hasta=2026-03-11&search=FECHA-', sede1)).b.data;
        assert.deepEqual(exp.map((a) => a.articulo_nombre).sort(), ['FECHA-B-INICIO', 'FECHA-C-FIN']);
        assert.equal((await http('/reportes/consolidado?fecha_desde=xx', dev)).s, 400);

        // Movimientos (fecha_movimiento) + alcance
        const movs = async (extra, t) => (await http(`/movimientos?limit=500&${extra}`, t)).b.movimientos.filter((m) => String(m.motivo).startsWith('Prueba'));
        assert.equal((await movs('', dev)).length, 5);
        assert.equal((await movs('fecha_desde=2026-03-11&fecha_hasta=2026-03-11', dev)).length, 3, '2 de sede 1 + 1 de sede 3 (dev global)');
        assert.equal((await movs('fecha_desde=2026-03-11&fecha_hasta=2026-03-11', sede1)).length, 2);
        assert.equal((await movs('fecha_desde=2026-03-12', dev)).length, 1);
        assert.equal((await http('/movimientos?fecha_hasta=nope', dev)).s, 400);

        // Auditoría (fecha del evento), global y con alcance
        const auds = async (extra, t) => (await http(`/auditoria?limit=500&${extra}`, t)).b.logs.filter((l) => l.accion === 'PRUEBA_FECHA');
        assert.equal((await auds('', dev)).length, 4);
        assert.equal((await auds('fecha_desde=2026-03-11&fecha_hasta=2026-03-11', dev)).length, 2);
        assert.equal((await auds('fecha_desde=2026-03-11&fecha_hasta=2026-03-11', sede1)).length, 2);
        assert.equal((await auds('fecha_hasta=2026-03-10', dev)).length, 1);

        // Levantamientos (fecha_inicio, DATE)
        const levs = async (extra, t) => (await http(`/levantamientos?${extra}`, t)).b.levantamientos.filter((l) => l.codigo?.startsWith('LEV-FECHA'));
        assert.equal((await levs('', dev)).length, 3);
        assert.deepEqual((await levs('fecha_desde=2026-03-11&fecha_hasta=2026-03-11', dev)).map((l) => l.codigo), ['LEV-FECHA-2']);
        assert.equal((await levs('fecha_desde=2026-03-10&fecha_hasta=2026-03-11', dev)).length, 2, 'rango inclusivo');

        // Solo lectura: ninguna fila cambió por consultar con filtros
        assert.equal(await snapArticulos(), antesArt, 'los filtros no modifican artículos');
        assert.equal(await snapMovs(), antesMov, 'los filtros no modifican movimientos');

        // ---------- Zona horaria: base en UTC, día de Santo Domingo (-04:00) ----------
        const utc = startServer(5072, { DB_TIME_OFFSET: '+00:00' }); servers.push(utc); await esperar(5072, utc);
        const httpUtc = api(5072);
        const devUtc = (await (await fetch('http://127.0.0.1:5072/api/v2/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev.sintetico@ingmelec-test.local', password: PASS }) })).json()).token;
        // Con la base en UTC, el 11-mar RD = [11-mar 04:00, 12-mar 04:00) UTC: entran 12:00 y 23:59:59 y 00:00:00 del 12; sale 00:00 del 11.
        const res = await httpUtc(`/articulos?limit=200&search=FECHA-&fecha_desde=2026-03-11&fecha_hasta=2026-03-11`, devUtc);
        assert.deepEqual(nombres(res), ['FECHA-C-FIN', 'FECHA-D-DESPUES', 'FECHA-E-OTRA-SEDE']);
      } finally {
        for (const s of servers) s.kill();
        await pool.end();
      }
    });
  });
});









