// INGMELEC v2.2 — Filtros combinados y contadores del inventario (HTTP real, base sintética 3310).
// Propiedad clave: el contador junto a cada opción == total que devuelve el listado al elegir esa opción.
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
const PASS = `Inv${crypto.randomBytes(5).toString('hex')}7`;
const PORT = 5075;

async function seed(pool) {
  await pool.query(read(path.join(MIG, 'rollback_07_v22_actas_entrega.sql')));
  await pool.query(read(path.join(__dirname, 'fixtures', 'v21_synthetic_fixture.sql')).split('ingmelec_v21_test_isolated').join(DB));
  for (const f of ['migration_03_v21_seguridad_y_esquema.sql', 'migration_04_v21_campamentos_alias.sql', 'migration_05_v21_adapted.sql', 'migration_06_v21_safe.sql', 'migration_07_v22_actas_entrega.sql']) {
    await pool.query(read(path.join(MIG, f)));
  }
}

describe('v2.2 — filtros combinados y contadores del inventario (HTTP real)', () => {
  test('combinaciones, contadores facetados, fechas, paginación, cero resultados y alcance', async () => {
    await withLocalMariaDb(async () => {
      const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: DB, multipleStatements: true, connectionLimit: 4, charset: 'utf8mb4' });
      let server;
      try {
        await seed(pool);
        const hash = await argon2.hash(PASS, { type: argon2.argon2id });
        await pool.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = 1', [hash]);
        const conn = await pool.getConnection();
        await conn.query("SET SESSION sql_mode = ''");
        const [u] = await conn.query("INSERT INTO inv_usuarios (nombre, email, password_hash, rol, cargo, area, activo, es_developer, campamento_id, permisos_json) VALUES ('QA Sede1', 'sede1@ingmelec-test.local', ?, 'almacen', 'QA', 'General', 1, 0, 1, ?)", [hash, JSON.stringify(['inv:ver', 'camp:ver'])]);
        await conn.query('INSERT INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, 1, 1)', [u.insertId]);

        // Datos controlados (nombres "FLT-*"): sedes 1 y 3, áreas, categorías, ubicaciones y fechas
        const filas = [
          // nombre, area, categoria, ubicacion, camp, fecha_creacion
          ['FLT exte uno', 'INFORMATICA', 'Cat Redes', 'OPL', 3, '2026-03-10 10:00:00'],
          ['FLT exte dos', 'INFORMATICA', 'Cat Redes', 'KM 19 AUTOPISTA DUARTE OPL', 3, '2026-03-11 10:00:00'],
          ['FLT exte tres', 'OFICINAS', 'Cat Muebles', 'OPL', 3, '2026-03-11 12:00:00'],
          ['FLT cable uno', 'INFORMATICA', 'Cat Redes', 'ALMACÉN 27 DE FEBRERO', 1, '2026-03-11 09:00:00'],
          ['FLT cable dos', 'INFORMATICA', 'Cat Equipos', 'ALMACÉN 27 DE FEBRERO', 1, '2026-03-12 09:00:00'],
          ['FLT cable tres', 'COCINA', 'Cat Equipos', 'ALMACÉN 27 DE FEBRERO', 1, '2026-03-12 11:00:00'],
          ['FLT mesa uno', 'OFICINAS', 'Cat Muebles', 'ALMACÉN 27 DE FEBRERO', 1, '2026-03-13 09:00:00']
        ];
        for (const [nombre, area, cat, ubic, camp, fecha] of filas) {
          await conn.query(
            `INSERT INTO inv_articulos (articulo_nombre, area, categoria, ubicacion_nombre, campamento_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, unidad_medida, estado_fisico, activo, es_sintetico, codigo_original, fecha_creacion)
             VALUES (?, ?, ?, ?, ?, 'CONFIRMADO', 5, '5', 1, 'VERIFICADO', 'Unidad', 'Bueno', 1, 0, ?, ?)`,
            [nombre, area, cat, ubic, camp, nombre.slice(0, 20), fecha]);
        }
        conn.release();

        const env = {
          ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_PORT: '3310', DB_USER: 'root', DB_PASSWORD: '', DB_NAME: DB,
          DB_SSL: 'false', ISOLATED_LOCAL_ONLY: 'true', BLOCK_REMOTE_DB: 'true', DB_CONNECTION_LIMIT: '6',
          JWT_SECRET: crypto.randomBytes(48).toString('hex'), CORS_ORIGINS: `http://localhost:${PORT}`
        };
        delete env.NODE_TEST_CONTEXT;
        server = spawn(process.execPath, ['index.js'], { cwd: SERVER, env, stdio: 'ignore' });
        for (let i = 0; i < 60; i++) {
          try { if ((await fetch(`http://127.0.0.1:${PORT}/api/v2/actas/disponible`)).status) break; } catch { /* esperando */ }
          await new Promise((r) => setTimeout(r, 500));
        }
        const get = async (p, token) => {
          const r = await fetch(`http://127.0.0.1:${PORT}/api/v2${p}`, { headers: { Authorization: `Bearer ${token}` } });
          return { s: r.status, b: await r.json().catch(() => null) };
        };
        const login = async (email) => (await (await fetch(`http://127.0.0.1:${PORT}/api/v2/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) })).json()).token;
        const dev = await login('dev.sintetico@ingmelec-test.local');
        const sede1 = await login('sede1@ingmelec-test.local');
        assert.ok(dev && sede1);

        const L = async (qs, t = dev) => (await get(`/articulos?limit=500&${qs}`, t));
        const flt = (r) => r.b.articulos.filter((a) => a.articulo_nombre.startsWith('FLT')).map((a) => a.articulo_nombre).sort();
        const [[{ n: totalBD }]] = await pool.query('SELECT COUNT(*) n FROM inv_articulos WHERE activo = 1 AND es_sintetico = 0');

        // ===== Sin filtros: igual que antes (sin facetas en la respuesta) =====
        const sin = await L('');
        assert.equal(sin.b.pagination.total, Number(totalBD));
        assert.equal(sin.b.facetas, undefined, 'sin ?facetas la respuesta es idéntica a la anterior');
        const conF = await L('facetas=true');
        assert.deepEqual(conF.b.articulos.map((a) => a.id), sin.b.articulos.map((a) => a.id), 'mismas filas y mismo orden');
        assert.equal(conF.b.pagination.total, sin.b.pagination.total);
        assert.equal(conF.b.facetas.totales.alcance, Number(totalBD));

        // ===== Búsqueda por nombre sin filtros =====
        assert.deepEqual(flt(await L('search=FLT exte')), ['FLT exte dos', 'FLT exte tres', 'FLT exte uno']);
        assert.equal((await L('search=exte')).b.pagination.total, 3);

        // ===== Área y categoría; combinación completa de la captura (texto + sede + área + categoría + ubicación) =====
        assert.deepEqual(flt(await L('search=FLT&area=INFORMATICA')), ['FLT cable dos', 'FLT cable uno', 'FLT exte dos', 'FLT exte uno']);
        assert.deepEqual(flt(await L('search=FLT&area=INFORMATICA&categoria=Cat Redes')), ['FLT cable uno', 'FLT exte dos', 'FLT exte uno']);
        assert.deepEqual(flt(await L('search=exte&campamento_id=3&area=INFORMATICA&categoria=Cat Redes&ubicacion=OPL')), ['FLT exte uno']);
        // Combinación que NO tiene resultados (todos los filtros a la vez): total 0, pero existen artículos en cada filtro por separado
        const cero = await L('search=exte&campamento_id=3&area=OFICINAS&categoria=Cat Redes&ubicacion=OPL&facetas=true');
        assert.equal(cero.b.pagination.total, 0);
        assert.equal(cero.b.articulos.length, 0);
        assert.ok(cero.b.facetas.totales.alcance > 0, 'el total existente sigue informado');
        assert.ok(cero.b.facetas.totales.area > 0 && cero.b.facetas.totales.categoria > 0, 'área y categoría tienen artículos por separado');

        // ===== Propiedad: cada contador == total del listado al elegir esa opción (manteniendo los demás filtros) =====
        const verificar = async (base, dimension, param) => {
          const f = (await L(`${base}&facetas=true`)).b.facetas;
          const lista = dimension === 'areas'
            ? Object.entries(f.areas).map(([valor, total]) => ({ valor, total }))
            : f[dimension].map((x) => ({ valor: dimension === 'campamentos' ? (x.campamento_id === null ? 'SIN_SEDE' : x.campamento_id) : x.valor, total: x.total }));
          assert.ok(lista.length > 0, `hay opciones en ${dimension}`);
          for (const op of lista) {
            const r = await L(`${base}&${param}=${encodeURIComponent(op.valor)}`);
            assert.equal(r.b.pagination.total, op.total, `${dimension}: contador de "${op.valor}" (${op.total}) debe igualar el listado (${r.b.pagination.total}) con base "${base}"`);
          }
        };
        for (const base of ['search=FLT', 'search=FLT&campamento_id=1', 'search=FLT&area=INFORMATICA', 'search=FLT&categoria=Cat Redes&fecha_desde=2026-03-11&fecha_hasta=2026-03-12']) {
          if (!base.includes('area=')) await verificar(base, 'areas', 'area');
          if (!base.includes('categoria=')) await verificar(base, 'categorias', 'categoria');
          await verificar(base, 'ubicaciones', 'ubicacion');
        }
        await verificar('search=FLT&area=INFORMATICA', 'campamentos', 'campamento_id');
        // Las demás áreas siguen visibles con área ya elegida (se puede cambiar de opción)
        const fArea = (await L('search=FLT&area=INFORMATICA&facetas=true')).b.facetas;
        assert.ok(fArea.areas.OFICINAS >= 2 && fArea.areas.COCINA >= 1);
        // Las categorías NO se reducen a la ya elegida
        const fCat = (await L('search=FLT&categoria=Cat Redes&facetas=true')).b.facetas;
        assert.ok(fCat.categorias.length >= 3);

        // ===== Calendario: aplicar y limpiar =====
        const dia = await L('search=FLT&fecha_desde=2026-03-11&fecha_hasta=2026-03-11&facetas=true');
        assert.deepEqual(flt(dia), ['FLT cable uno', 'FLT exte dos', 'FLT exte tres']);
        assert.equal(dia.b.facetas.totales.alcance, Number(totalBD), 'el total existente no depende del calendario');
        assert.equal(dia.b.facetas.areas.INFORMATICA, 2);
        assert.equal((await L('search=FLT&facetas=true')).b.pagination.total, 7, 'al limpiar vuelve todo');
        assert.equal((await L('fecha_desde=2026-02-30&facetas=true')).s, 400);

        // ===== Paginación y total real =====
        const p1 = await get('/articulos?limit=3&page=1&search=FLT&facetas=true', dev);
        const p3 = await get('/articulos?limit=3&page=3&search=FLT&facetas=true', dev);
        assert.equal(p1.b.pagination.total, 7);
        assert.equal(p1.b.pagination.totalPages, 3);
        assert.equal(p1.b.articulos.length, 3);
        assert.equal(p3.b.articulos.length, 1, 'última página con 1 fila, total sigue siendo 7');
        assert.equal(p3.b.pagination.total, 7);
        assert.deepEqual(p1.b.facetas.areas, p3.b.facetas.areas, 'los contadores no dependen de la página');

        // ===== Alcance por campamento =====
        const s1 = await L('search=FLT&facetas=true', sede1);
        assert.deepEqual(flt(s1), ['FLT cable dos', 'FLT cable tres', 'FLT cable uno', 'FLT mesa uno']);
        assert.deepEqual(s1.b.facetas.campamentos.map((c) => c.campamento_id), [1], 'el usuario solo ve su sede en los contadores');
        assert.ok(s1.b.facetas.totales.alcance < Number(totalBD), 'total existente = solo su alcance');
        const s1Sin = await L('facetas=true', sede1);
        assert.ok(s1Sin.b.facetas.ubicaciones.every((u) => !String(u.valor).includes('OPL')), 'no se filtran ubicaciones de otras sedes');
        const intento = await L('search=FLT&campamento_id=3&facetas=true', sede1);
        assert.ok(intento.s === 403 || intento.b.pagination.total === 0, 'no puede consultar la sede 3');
        // Para usuario limitado, el contador de campamentos conserva su alcance aunque se quite el filtro de sede
        await verificar2(L, sede1);
        async function verificar2(Lfn, tok) {
          const f = (await Lfn('search=FLT&campamento_id=1&facetas=true', tok)).b.facetas;
          assert.deepEqual(f.campamentos.map((c) => c.campamento_id), [1]);
          assert.equal(f.campamentos[0].total, 4);
        }
        // Developer sí ve ambas sedes
        assert.deepEqual((await L('search=FLT&facetas=true')).b.facetas.campamentos.map((c) => c.campamento_id).sort(), [1, 3]);

        // ===== Solo lectura: no se modificó nada =====
        const [[{ n: activos }]] = await pool.query("SELECT COUNT(*) n FROM inv_articulos WHERE articulo_nombre LIKE 'FLT%' AND activo = 1");
        assert.equal(Number(activos), 7);
      } finally {
        server?.kill();
        await pool.end();
      }
    });
  });
});
