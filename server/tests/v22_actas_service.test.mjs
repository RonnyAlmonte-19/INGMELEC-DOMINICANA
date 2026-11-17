// INGMELEC v2.2 — Fases B/C/G: pruebas de integración del servicio de actas contra la base
// DESECHABLE ingmelec_v22_actas_test (MariaDB local 127.0.0.1:3310). Nunca producción.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { withLocalMariaDb } from './helpers/local-mariadb.mjs';
import { crearActa, anularActa, listarActas, obtenerActa, ActaError } from '../services/actas/actaService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.join(__dirname, '..', 'database', 'migrations');
const DB_NAME = 'ingmelec_v22_actas_test';
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const uuid = () => crypto.randomUUID();

const GLOBAL = { isGlobal: true, campamentoIds: [], campamentoNombres: [] };

async function seed(pool) {
  await pool.query(read(path.join(MIG, 'rollback_07_v22_actas_entrega.sql')));
  const fx = read(path.join(__dirname, 'fixtures', 'v21_synthetic_fixture.sql')).split('ingmelec_v21_test_isolated').join(DB_NAME);
  await pool.query(fx);
  for (const f of ['migration_03_v21_seguridad_y_esquema.sql', 'migration_04_v21_campamentos_alias.sql', 'migration_05_v21_adapted.sql', 'migration_06_v21_safe.sql', 'migration_07_v22_actas_entrega.sql']) {
    await pool.query(read(path.join(MIG, f)));
  }
}

function makeDeps(pool, user, scope = GLOBAL) {
  const audits = [];
  return {
    audits,
    deps: {
      pool, scope, user, req: { headers: {}, socket: {} },
      canTargetCampamento: (s, id) => s.isGlobal || s.campamentoIds.includes(Number(id)),
      logAudit: async (db, a) => { audits.push(a.accion); await db.query(
        'INSERT INTO inv_auditoria (usuario_id, usuario_nombre, accion, entidad, entidad_id, detalles_previos, detalles_nuevos, ip_origen) VALUES (?,?,?,?,?,?,?,?)',
        [a.usuario_id, a.usuario_nombre, a.accion, a.entidad, a.entidad_id, null, JSON.stringify(a.detalles_nuevos), '127.0.0.1']); }
    }
  };
}

describe('v2.2 — servicio de actas (MariaDB local desechable)', () => {
  test('crear, validar stock, idempotencia, concurrencia, anulación y no-regresión', async () => {
    await withLocalMariaDb(async () => {
      const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: DB_NAME, multipleStatements: true, connectionLimit: 8, charset: 'utf8mb4' });
      try {
        assert.equal((await pool.query('SELECT DATABASE() d'))[0][0].d, DB_NAME);
        await seed(pool);
        const [[usr]] = await pool.query('SELECT id, nombre FROM inv_usuarios ORDER BY id LIMIT 1');
        const user = { id: usr.id, nombre: usr.nombre };
        // Dos artículos propios (stock verificado, sede confirmada) en una misma sede.
        const [[camp]] = await pool.query("SELECT id, nombre FROM inv_campamentos WHERE activo = 1 ORDER BY id LIMIT 1");
        const [[base]] = await pool.query('SELECT * FROM inv_articulos WHERE activo = 1 LIMIT 1');
        const ids = [];
        const seedConn = await pool.getConnection(); // modo no estricto solo para sembrar columnas NOT NULL sin default
        await seedConn.query("SET SESSION sql_mode = ''");
        for (const [i, serie] of [[1, null], [2, 'SN-ACTA-0001']]) {
          const [r] = await seedConn.query(
            `INSERT INTO inv_articulos (articulo_nombre, area, ubicacion_nombre, campamento_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, serie_imei, unidad_medida, estado_fisico, activo, es_sintetico, codigo_original, categoria)
             VALUES (?, ?, ?, ?, 'CONFIRMADO', ?, ?, 1, 'VERIFICADO', ?, 'Unidad', 'Bueno', 1, 1, ?, ?)`,
            [`HERRAMIENTA PRUEBA ${i}`, base.area, camp.nombre, camp.id, i === 1 ? 10 : 1, i === 1 ? '10' : '1', serie, `TST-${i}`, base.categoria]);
          ids.push(r.insertId);
        }
        seedConn.release();
        const [a1, a2] = ids;
        const stock = async (id) => Number((await pool.query('SELECT cantidad_num FROM inv_articulos WHERE id=?', [id]))[0][0].cantidad_num);
        const mk = (items, extra = {}) => ({
          request_uuid: uuid(), campamento_id: camp.id, colaborador_nombre: 'Colaborador Prueba', supervisor_nombre: 'Supervisor Prueba',
          departamento: 'Mantenimiento', motivo: 'Entrega de herramientas de prueba', items, ...extra
        });

        // 1) Éxito: descuenta stock, SALIDA vinculada, número ACT-AAAA-000001, auditoría.
        const { deps, audits } = makeDeps(pool, user);
        const movAntes = Number((await pool.query('SELECT COUNT(*) n FROM inv_movimientos'))[0][0].n);
        const r1 = await crearActa(deps, mk([{ articulo_id: a1, cantidad: 3 }, { articulo_id: a2, cantidad: 1 }]));
        assert.match(r1.numero_acta, /^ACT-\d{4}-000001$/);
        assert.equal(await stock(a1), 7);
        assert.equal(await stock(a2), 0);
        const [movs] = await pool.query("SELECT tipo_movimiento, acta_id FROM inv_movimientos WHERE acta_id = ?", [r1.id]);
        assert.equal(movs.length, 2);
        assert.ok(movs.every((m) => m.tipo_movimiento === 'SALIDA'));
        assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM inv_movimientos'))[0][0].n), movAntes + 2);
        assert.ok(audits.includes('ACTA_CONFIRMADA'));

        // 2) Idempotencia: mismo request_uuid no duplica ni descuenta de nuevo.
        const payload = mk([{ articulo_id: a1, cantidad: 1 }]);
        const r2 = await crearActa(deps, payload);
        const r2b = await crearActa(deps, payload);
        assert.equal(r2b.duplicada, true);
        assert.equal(r2b.id, r2.id);
        assert.equal(await stock(a1), 6);

        // 3) Stock insuficiente / serie con cantidad > 1 / duplicado: todo se revierte (atomicidad).
        const antes = await stock(a1);
        await assert.rejects(crearActa(deps, mk([{ articulo_id: a1, cantidad: 1 }, { articulo_id: a1, cantidad: 100 }])), ActaError);
        await assert.rejects(crearActa(deps, mk([{ articulo_id: a1, cantidad: 2 }, { articulo_id: a2, cantidad: 1 }])), (e) => e.status === 400 || e.status === 409);
        assert.equal(await stock(a1), antes, 'una falla no debe dejar descuentos parciales');
        const [[nActas]] = await pool.query('SELECT COUNT(*) n FROM inv_actas_entrega');
        assert.equal(Number(nActas.n), 2);

        // 4) Concurrencia: 6 actas simultáneas sobre stock 6 → exactamente las que caben; sin stock negativo ni números repetidos.
        const resultados = await Promise.allSettled(Array.from({ length: 8 }, () => crearActa(makeDeps(pool, user).deps, mk([{ articulo_id: a1, cantidad: 1 }]))));
        const ok = resultados.filter((r) => r.status === 'fulfilled');
        assert.equal(ok.length, 6);
        assert.equal(await stock(a1), 0);
        const [nums] = await pool.query('SELECT numero_acta FROM inv_actas_entrega');
        assert.equal(new Set(nums.map((n) => n.numero_acta)).size, nums.length);

        // 5) Alcance por sede: usuario sin esa sede no puede emitir ni ver.
        const otro = makeDeps(pool, user, { isGlobal: false, campamentoIds: [camp.id + 999], campamentoNombres: [] }).deps;
        await assert.rejects(crearActa(otro, mk([{ articulo_id: a1, cantidad: 1 }])), (e) => e.status === 403);
        await assert.rejects(obtenerActa(pool, otro.scope, r1.id), (e) => e.status === 403);
        assert.equal((await listarActas(pool, otro.scope, {})).total, 0);

        // 6) Anulación: motivo obligatorio, NO devuelve stock ni toca movimientos/ítems, auditoría, no repetible.
        await assert.rejects(anularActa(deps, r1.id, 'corto'), (e) => e.status === 400);
        const stockA1 = await stock(a1);
        const itemsAntes = JSON.stringify((await pool.query('SELECT * FROM inv_acta_items WHERE acta_id=?', [r1.id]))[0]);
        const movsAntes = JSON.stringify((await pool.query('SELECT * FROM inv_movimientos WHERE acta_id=?', [r1.id]))[0]);
        await anularActa(deps, r1.id, 'Acta emitida por error de digitación');
        assert.equal(await stock(a1), stockA1);
        assert.equal(JSON.stringify((await pool.query('SELECT * FROM inv_acta_items WHERE acta_id=?', [r1.id]))[0]), itemsAntes);
        assert.equal(JSON.stringify((await pool.query('SELECT * FROM inv_movimientos WHERE acta_id=?', [r1.id]))[0]), movsAntes);
        const det = await obtenerActa(pool, GLOBAL, r1.id);
        assert.equal(det.estado, 'ANULADA');
        assert.equal(det.motivo_anulacion, 'Acta emitida por error de digitación');
        assert.equal(det.items.length, 2);
        assert.ok(audits.includes('ACTA_ANULADA'));
        await assert.rejects(anularActa(deps, r1.id, 'Segundo intento de anulación'), (e) => e.status === 409);

        // 7) Historial: búsqueda, filtros y resumen de ítems.
        const l = await listarActas(pool, GLOBAL, { q: 'HERRAMIENTA PRUEBA 2' });
        assert.equal(l.total, 1);
        assert.equal(l.actas[0].items.length, 2);
        assert.equal((await listarActas(pool, GLOBAL, { estado: 'ANULADA' })).total, 1);
        assert.ok((await listarActas(pool, GLOBAL, { q: '%' })).total === 0, 'los comodines LIKE se escapan');
      } finally {
        await pool.end();
      }
    });
  });
});
