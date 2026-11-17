// INGMELEC v2.2 — FASE A: pruebas de migration_07 (Actas de Entrega), integridad,
// idempotencia a nivel de base de datos, bandera ACTAS_ENABLED y regresión.
//
// SEGURIDAD: usa una base DEDICADA y desechable ("ingmelec_v22_actas_test") en el
// MariaDB local aislado (127.0.0.1:3310). NO toca "ingmelec_v21_test_isolated" ni
// ninguna base real. Nunca usa credenciales ni hosts de producción.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { assertLocalIsolatedTarget } from '../database/guard.js';
import { isActasEnabled } from '../config/features.js';
import { withLocalMariaDb, DEFAULT_LOCAL_MARIADB_CONFIG } from './helpers/local-mariadb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS = path.join(REPO_ROOT, 'server', 'database', 'migrations');
const P = {
  fixture: path.join(__dirname, 'fixtures', 'v21_synthetic_fixture.sql'),
  m3: path.join(MIGRATIONS, 'migration_03_v21_seguridad_y_esquema.sql'),
  m4: path.join(MIGRATIONS, 'migration_04_v21_campamentos_alias.sql'),
  m5: path.join(MIGRATIONS, 'migration_05_v21_adapted.sql'),
  m6: path.join(MIGRATIONS, 'migration_06_v21_safe.sql'),
  m7: path.join(MIGRATIONS, 'migration_07_v22_actas_entrega.sql'),
  rb7: path.join(MIGRATIONS, 'rollback_07_v22_actas_entrega.sql')
};
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const DB_NAME = 'ingmelec_v22_actas_test';
const PORT = 3310;
const DATADIR = 'C:/Users/gener/.gemini/antigravity/scratch/local-mysql-v21/data';

// Huella de referencia del bloque POST /movimientos en v2.1.1 (main d5d06fe).
// Si cambia, esta prueba falla: la Fase A NO debe modificar ese endpoint.
const POST_MOVIMIENTOS_SHA256 = '455789b8fa28758525b20674abe46ab3d9361ca14c4d6a970723d393dd1413ba';

function extractPostMovimientos(src) {
  const s = src.indexOf("router.post('/movimientos',");
  assert.ok(s >= 0, 'No se encontró POST /movimientos');
  const e = src.indexOf('\nrouter.', s + 10);
  return src.slice(s, e);
}

function stripSqlComments(sql) {
  return sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
}

// ------------------------------------------------------------------ helpers de BD
function newPool() {
  assertLocalIsolatedTarget({ host: '127.0.0.1', database: DB_NAME }, 'v22_actas_migration.test');
  return mysql.createPool({
    host: '127.0.0.1',
    port: PORT,
    user: DEFAULT_LOCAL_MARIADB_CONFIG.user,
    password: DEFAULT_LOCAL_MARIADB_CONFIG.password,
    database: DB_NAME,
    multipleStatements: true,
    connectionLimit: 6,
    charset: 'utf8mb4'
  });
}

async function snapshot(pool) {
  const c = await pool.getConnection();
  try {
    await c.query('SET SESSION group_concat_max_len = 1073741824');
    const one = async (sql) => (await c.query(sql))[0][0];
    return {
      articulos: await one(`SELECT COUNT(*) AS n, MD5(GROUP_CONCAT(CONCAT_WS('|',id,IFNULL(codigo_original,'N'),articulo_nombre,IFNULL(cantidad_num,'N'),IFNULL(asignado_a,'N'),ubicacion_nombre,estado_fisico,activo) ORDER BY id SEPARATOR '#')) AS h FROM inv_articulos`),
      movimientos: await one(`SELECT COUNT(*) AS n, MD5(GROUP_CONCAT(CONCAT_WS('|',id,articulo_id,tipo_movimiento,cantidad,motivo,IFNULL(usuario_id,'N'),fecha_movimiento) ORDER BY id SEPARATOR '#')) AS h FROM inv_movimientos`),
      usuarios: await one(`SELECT COUNT(*) AS n, MD5(GROUP_CONCAT(CONCAT_WS('|',id,email,rol,activo,IFNULL(CAST(permisos_json AS CHAR),'N')) ORDER BY id SEPARATOR '#')) AS h FROM inv_usuarios`),
      auditoria: await one(`SELECT COUNT(*) AS n, MD5(GROUP_CONCAT(CONCAT_WS('|',id,accion) ORDER BY id SEPARATOR '#')) AS h FROM inv_auditoria`),
      enumTipo: (await one(`SELECT COLUMN_TYPE AS h FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND COLUMN_NAME = 'tipo_movimiento'`)).h
    };
  } finally {
    c.release();
  }
}

async function tableExists(pool, name) {
  const [r] = await pool.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [name]);
  return Number(r[0].n) === 1;
}

async function columnInfo(pool, table, col) {
  const [r] = await pool.query('SELECT IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, col]);
  return r[0] ?? null;
}

async function expectSqlError(promise, code, label) {
  await assert.rejects(promise, (e) => {
    assert.equal(e.code, code, `${label}: se esperaba ${code} y llegó ${e.code} (${e.message})`);
    return true;
  });
}

// El fixture v2.1 trae FIJO el nombre de la base "ingmelec_v21_test_isolated"
// (CREATE DATABASE / USE / DROP TABLE). Ejecutarlo tal cual vaciaría la base local de
// desarrollo. Aquí se redirige SIEMPRE a la base desechable de esta suite y se verifica.
const V21_DB_NAME = 'ingmelec_v21_test_isolated';

function adaptFixtureToDisposableDb(sql) {
  const adapted = sql.split(V21_DB_NAME).join(DB_NAME);
  assert.equal(adapted.includes(V21_DB_NAME), false, 'el fixture adaptado no debe referenciar la base v21');
  assert.match(adapted, new RegExp('USE `' + DB_NAME + '`;'));
  return adapted;
}

async function assertConnectedTo(pool, expected) {
  const [r] = await pool.query('SELECT DATABASE() AS db');
  assert.equal(r[0].db, expected, `la conexión debe estar en ${expected}`);
}

async function seedBaseline(pool) {
  await assertConnectedTo(pool, DB_NAME);
  // Una corrida previa deja migration_07 aplicada (FKs hacia las tablas que el fixture
  // recrea). La reversión es idempotente y solo toca esta base desechable.
  await pool.query(read(P.rb7));
  await pool.query(adaptFixtureToDisposableDb(read(P.fixture)));
  for (const k of ['m3', 'm4', 'm5', 'm6']) {
    const sql = read(P[k]);
    assert.equal(sql.includes(V21_DB_NAME), false, `${k} no debe referenciar la base v21`);
    await pool.query(sql);
  }
}

async function inTx(pool, fn) {
  const c = await pool.getConnection();
  try {
    await c.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");
    await c.beginTransaction();
    try { await fn(c); } finally { await c.rollback(); }
  } finally {
    c.release();
  }
}

async function confirmarNumero(pool, anio, actaId) {
  for (let intento = 0; intento < 5; intento++) {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      await c.query('INSERT INTO inv_acta_secuencia (anio, ultimo) VALUES (?, 0) ON DUPLICATE KEY UPDATE anio = anio', [anio]);
      const [r] = await c.query('SELECT ultimo FROM inv_acta_secuencia WHERE anio = ? FOR UPDATE', [anio]);
      const n = Number(r[0].ultimo) + 1;
      await c.query('UPDATE inv_acta_secuencia SET ultimo = ? WHERE anio = ?', [n, anio]);
      const numero = `ACT-${anio}-${String(n).padStart(6, '0')}`;
      const [u] = await c.query("UPDATE inv_actas_entrega SET numero_acta = ?, anio = ?, estado = 'CONFIRMADA', confirmado_en = NOW(), fecha_entrega = NOW() WHERE id = ? AND estado = 'BORRADOR'", [numero, anio, actaId]);
      assert.equal(u.affectedRows, 1);
      await c.commit();
      return numero;
    } catch (e) {
      await c.rollback();
      if (e.code === 'ER_LOCK_DEADLOCK') continue; // reintento permitido por el diseño
      throw e;
    } finally {
      c.release();
    }
  }
  throw new Error('Demasiados reintentos por deadlock');
}

// ================================================================== ESTÁTICAS
describe('v2.2 Fase A — bandera ACTAS_ENABLED', () => {
  test('desactivada por defecto y solo el valor exacto "true" la activa', () => {
    assert.equal(isActasEnabled({}), false);
    assert.equal(isActasEnabled({ ACTAS_ENABLED: '' }), false);
    for (const v of ['1', 'yes', 'on', 'TRUEE', 'verdadero', 'false']) {
      assert.equal(isActasEnabled({ ACTAS_ENABLED: v }), false, `"${v}" no debe activar`);
    }
    assert.equal(isActasEnabled({ ACTAS_ENABLED: 'true' }), true);
    assert.equal(isActasEnabled({ ACTAS_ENABLED: ' TRUE ' }), true);
  });

  test('.env.example documenta ACTAS_ENABLED=false', () => {
    assert.match(read(path.join(REPO_ROOT, 'server', '.env.example')), /^ACTAS_ENABLED=false$/m);
  });
});

describe('v2.2 Fase A — migration_07 es exclusivamente aditiva (análisis estático)', () => {
  const sql = stripSqlComments(read(P.m7))
    .replace(/ON DELETE (RESTRICT|SET NULL|CASCADE)/gi, '')
    .replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '');

  test('sin DELETE, UPDATE, DROP, TRUNCATE, RENAME, MODIFY, CHANGE ni triggers', () => {
    assert.doesNotMatch(sql, /\b(DELETE|UPDATE|DROP|TRUNCATE|RENAME|MODIFY|CHANGE|TRIGGER|REPLACE\s+INTO|INSERT)\b/i);
  });

  test('los únicos ALTER apuntan a inv_movimientos y son ADD', () => {
    const alters = sql.match(/ALTER TABLE `?[a-z_]+`?[^'\n]*/gi) ?? [];
    assert.ok(alters.length >= 3);
    for (const a of alters) {
      assert.match(a, /ALTER TABLE `inv_movimientos` ADD /);
    }
  });

  test('todo CREATE TABLE es IF NOT EXISTS y solo crea las 3 tablas nuevas', () => {
    const creates = sql.match(/CREATE TABLE[^`]*`[a-z_]+`/gi) ?? [];
    assert.equal(creates.length, 3);
    for (const c of creates) assert.match(c, /IF NOT EXISTS/i);
    assert.deepEqual(
      creates.map((c) => c.match(/`([a-z_]+)`/)[1]).sort(),
      ['inv_acta_items', 'inv_acta_secuencia', 'inv_actas_entrega']
    );
  });

  test('es idempotente por diseño (information_schema) y compatible con MySQL 8/MariaDB', () => {
    assert.match(sql, /information_schema\.COLUMNS/);
    assert.match(sql, /information_schema\.STATISTICS/);
    assert.match(sql, /information_schema\.KEY_COLUMN_USAGE/);
    assert.doesNotMatch(sql, /ADD COLUMN IF NOT EXISTS/i);
  });

  test('existe reversión local y declara su alcance', () => {
    const rb = read(P.rb7);
    assert.match(rb, /SOLO BASE LOCAL/);
    assert.match(rb, /DROP TABLE IF EXISTS `inv_acta_items`/);
  });
});

describe('v2.2 Fase A — regresión estática: nada existente cambió', () => {
  const api = read(path.join(REPO_ROOT, 'server', 'routes', 'almacenApi.js'));

  test('POST /movimientos permanece idéntico a v2.1.1', () => {
    const hash = crypto.createHash('sha256').update(extractPostMovimientos(api)).digest('hex');
    assert.equal(hash, POST_MOVIMIENTOS_SHA256);
  });

  test('ASIGNACION histórico y tipos válidos sin cambios', () => {
    assert.match(api, /const TIPOS_MOVIMIENTO_VALIDOS = \['ENTRADA', 'SALIDA', 'TRASLADO', 'ASIGNACION', 'DEVOLUCION', 'AJUSTE'\];/);
    assert.match(api, /tipo_movimiento === 'TRASLADO' \|\| tipo_movimiento === 'ASIGNACION'/);
    assert.match(read(path.join(REPO_ROOT, 'server', 'database', 'schema_almacen.sql')), /ENUM\('ENTRADA', 'SALIDA', 'TRASLADO', 'ASIGNACION', 'DEVOLUCION', 'AJUSTE'\)/);
  });

  test('catálogo de permisos: 20 claves originales intactas + 3 act:* y roles por defecto sin act:*', () => {
    const block = api.match(/export const KNOWN_PERMISSION_KEYS = \[([\s\S]*?)\];/)[1];
    const keys = block.match(/'[^']+'/g) ?? [];
    assert.equal(keys.filter((k) => !k.startsWith("'act:")).length, 20);
    assert.deepEqual(keys.filter((k) => k.startsWith("'act:")), ["'act:ver'", "'act:crear'", "'act:anular'"]);
    const front = read(path.join(REPO_ROOT, 'src', 'utils', 'permissions.js'));
    const roles = front.match(/export const DEFAULT_ROLE_PERMISSIONS = \{[\s\S]*?\n\};/)[1 - 1];
    assert.doesNotMatch(roles, /'act:/);
  });

  test('v2.2 solo añade importación/montaje de actas; el módulo existente no contiene lógica de actas', () => {
    const index = read(path.join(REPO_ROOT, 'server', 'index.js'));
    assert.doesNotMatch(api, /\/actas|inv_actas|actasApi/);
    assert.match(index, /app\.use\('\/api\/v2', actasRouter\)/);
  });
});

// ================================================================== BASE DE DATOS
describe('v2.2 Fase A — migration_07 en MariaDB local desechable', () => {
  test('aplicación idempotente, sin alterar datos históricos, y reversión limpia', async () => {
    await withLocalMariaDb(async () => {
      const pool = newPool();
      try {
        await seedBaseline(pool);
        await assertConnectedTo(pool, DB_NAME);
        const antes = await snapshot(pool);
        assert.ok(antes.articulos.n > 0 && antes.movimientos.n >= 0);

        await pool.query(read(P.m7));
        await pool.query(read(P.m7)); // segunda ejecución: idempotencia

        for (const t of ['inv_actas_entrega', 'inv_acta_items', 'inv_acta_secuencia']) {
          assert.equal(await tableExists(pool, t), true, `falta ${t}`);
        }
        const col = await columnInfo(pool, 'inv_movimientos', 'acta_id');
        assert.equal(col.IS_NULLABLE, 'YES');
        const [nn] = await pool.query('SELECT COUNT(*) AS n FROM inv_movimientos WHERE acta_id IS NOT NULL');
        assert.equal(Number(nn[0].n), 0, 'ningún movimiento histórico debe tener acta_id');

        const [fks] = await pool.query(`SELECT TABLE_NAME t, COLUMN_NAME c, REFERENCED_TABLE_NAME r FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND (TABLE_NAME IN ('inv_actas_entrega','inv_acta_items') OR (TABLE_NAME = 'inv_movimientos' AND COLUMN_NAME = 'acta_id'))`);
        const set = new Set(fks.map((f) => `${f.t}.${f.c}->${f.r}`));
        for (const esperado of [
          'inv_actas_entrega.campamento_id->inv_campamentos',
          'inv_actas_entrega.colaborador_id->inv_custodios',
          'inv_actas_entrega.supervisor_id->inv_custodios',
          'inv_actas_entrega.entregado_por_id->inv_usuarios',
          'inv_acta_items.acta_id->inv_actas_entrega',
          'inv_acta_items.articulo_id->inv_articulos',
          'inv_acta_items.movimiento_id->inv_movimientos',
          'inv_movimientos.acta_id->inv_actas_entrega'
        ]) assert.ok(set.has(esperado), `falta FK ${esperado}`);

        const despues = await snapshot(pool);
        assert.deepEqual(despues, antes, 'migration_07 no debe alterar datos ni el ENUM de tipos');

        // Reversión local y re-aplicación
        await pool.query(read(P.rb7));
        await pool.query(read(P.rb7)); // idempotente
        for (const t of ['inv_actas_entrega', 'inv_acta_items', 'inv_acta_secuencia']) {
          assert.equal(await tableExists(pool, t), false, `${t} debe desaparecer`);
        }
        assert.equal(await columnInfo(pool, 'inv_movimientos', 'acta_id'), null);
        assert.deepEqual(await snapshot(pool), antes, 'la reversión debe dejar el estado original');
        await pool.query(read(P.m7));
        assert.equal(await tableExists(pool, 'inv_actas_entrega'), true);
      } finally {
        await pool.end();
      }
    }, { port: PORT, datadir: DATADIR, database: DB_NAME });
  });

  test('integridad: unicidad, claves foráneas RESTRICT y valores de estado', async () => {
    await withLocalMariaDb(async () => {
      const pool = newPool();
      try {
        const [[camp]] = await pool.query('SELECT id, nombre FROM inv_campamentos LIMIT 1');
        const [[cus]] = await pool.query('SELECT id, nombre FROM inv_custodios LIMIT 1');
        const [[usr]] = await pool.query('SELECT id, nombre FROM inv_usuarios LIMIT 1');
        const [[art]] = await pool.query('SELECT id, articulo_nombre FROM inv_articulos LIMIT 1');
        assert.ok(camp && cus && usr && art, 'el fixture debe aportar campamento, custodio, usuario y artículo');

        const nuevaActa = (c, uuid, over = {}) => c.query(
          `INSERT INTO inv_actas_entrega (request_uuid, campamento_id, campamento_nombre, colaborador_id, colaborador_nombre, supervisor_id, supervisor_nombre, entregado_por_id, entregado_por_nombre, motivo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'prueba')`,
          [uuid, over.campamento_id ?? camp.id, camp.nombre, cus.id, cus.nombre, cus.id, cus.nombre, usr.id, usr.nombre]);

        await inTx(pool, async (c) => {
          const u1 = crypto.randomUUID();
          const [a1] = await nuevaActa(c, u1);
          // idempotencia: el mismo request_uuid no puede crear una segunda acta
          await expectSqlError(nuevaActa(c, u1), 'ER_DUP_ENTRY', 'request_uuid duplicado');
          // varios borradores sin número conviven (NULL no choca con UNIQUE)
          await nuevaActa(c, crypto.randomUUID());
          // campamento inexistente
          await expectSqlError(nuevaActa(c, crypto.randomUUID(), { campamento_id: 999999999 }), 'ER_NO_REFERENCED_ROW_2', 'FK campamento');
          // estado inválido (modo estricto): debe rechazarse
          await assert.rejects(c.query("UPDATE inv_actas_entrega SET estado = 'INEXISTENTE' WHERE id = ?", [a1.insertId]));
          // número de acta único
          await c.query("UPDATE inv_actas_entrega SET numero_acta = 'ACT-2099-000001' WHERE id = ?", [a1.insertId]);
          const [a2] = await nuevaActa(c, crypto.randomUUID());
          await expectSqlError(c.query("UPDATE inv_actas_entrega SET numero_acta = 'ACT-2099-000001' WHERE id = ?", [a2.insertId]), 'ER_DUP_ENTRY', 'numero_acta duplicado');

          // ítems: sin duplicar artículo dentro del acta
          const addItem = (acta, extra = {}) => c.query(
            'INSERT INTO inv_acta_items (acta_id, articulo_id, movimiento_id, descripcion, cantidad) VALUES (?, ?, ?, ?, 1)',
            [acta, extra.articulo ?? art.id, extra.mov ?? null, art.articulo_nombre]);
          await addItem(a1.insertId);
          await expectSqlError(addItem(a1.insertId), 'ER_DUP_ENTRY', 'artículo duplicado en el acta');
          await expectSqlError(addItem(a1.insertId, { articulo: 999999999 }), 'ER_NO_REFERENCED_ROW_2', 'FK artículo');

          // RESTRICT: no se puede borrar un acta con ítems ni un artículo incluido en un acta
          await expectSqlError(c.query('DELETE FROM inv_actas_entrega WHERE id = ?', [a1.insertId]), 'ER_ROW_IS_REFERENCED_2', 'borrar acta con ítems');
          await expectSqlError(c.query('DELETE FROM inv_articulos WHERE id = ?', [art.id]), 'ER_ROW_IS_REFERENCED_2', 'borrar artículo en acta');

          // movimiento enlazado: acta_id válido, inválido y un solo movimiento por ítem
          const mov = () => c.query("INSERT INTO inv_movimientos (articulo_id, tipo_movimiento, cantidad, motivo, acta_id) VALUES (?, 'SALIDA', 1, 'prueba', ?)", [art.id, a1.insertId]);
          const [m1] = await mov();
          await expectSqlError(c.query("INSERT INTO inv_movimientos (articulo_id, tipo_movimiento, cantidad, motivo, acta_id) VALUES (?, 'SALIDA', 1, 'prueba', 999999999)", [art.id]), 'ER_NO_REFERENCED_ROW_2', 'FK acta_id en movimiento');
          const [m2] = await mov();
          await c.query('UPDATE inv_acta_items SET movimiento_id = ? WHERE acta_id = ? AND articulo_id = ?', [m1.insertId, a1.insertId, art.id]);
          const [it2] = await nuevaActa(c, crypto.randomUUID());
          await expectSqlError(c.query('INSERT INTO inv_acta_items (acta_id, articulo_id, movimiento_id, descripcion, cantidad) VALUES (?, ?, ?, ?, 1)', [it2.insertId, art.id, m1.insertId, 'x']), 'ER_DUP_ENTRY', 'movimiento usado en dos ítems');
          assert.ok(m2.insertId > m1.insertId);
          await expectSqlError(c.query('DELETE FROM inv_movimientos WHERE id = ?', [m1.insertId]), 'ER_ROW_IS_REFERENCED_2', 'borrar movimiento enlazado');
        });
        // Todo lo anterior se revirtió: no quedan filas de prueba
        const [[cnt]] = await pool.query('SELECT COUNT(*) AS n FROM inv_actas_entrega');
        assert.equal(Number(cnt.n), 0);
      } finally {
        await pool.end();
      }
    }, { port: PORT, datadir: DATADIR, database: DB_NAME, ensureDatabase: false });
  });

  test('numeración: 12 confirmaciones concurrentes producen números únicos y consecutivos', async () => {
    await withLocalMariaDb(async () => {
      const pool = newPool();
      try {
        const [[camp]] = await pool.query('SELECT id, nombre FROM inv_campamentos LIMIT 1');
        const [[cus]] = await pool.query('SELECT id, nombre FROM inv_custodios LIMIT 1');
        const ids = [];
        for (let i = 0; i < 12; i++) {
          const [r] = await pool.query(
            `INSERT INTO inv_actas_entrega (request_uuid, campamento_id, campamento_nombre, colaborador_nombre, supervisor_nombre, entregado_por_nombre, motivo)
             VALUES (?, ?, ?, ?, ?, 'prueba', 'concurrencia')`, [crypto.randomUUID(), camp.id, camp.nombre, cus.nombre, cus.nombre]);
          ids.push(r.insertId);
        }
        const numeros = await Promise.all(ids.map((id) => confirmarNumero(pool, 2099, id)));
        assert.equal(new Set(numeros).size, 12, 'no deben repetirse números');
        assert.deepEqual([...numeros].sort(), Array.from({ length: 12 }, (_, i) => `ACT-2099-${String(i + 1).padStart(6, '0')}`));
        const [[sec]] = await pool.query('SELECT ultimo FROM inv_acta_secuencia WHERE anio = 2099');
        assert.equal(Number(sec.ultimo), 12);

        // Idempotencia de estado: una acta ya CONFIRMADA no se vuelve a confirmar ni consume número
        await assert.rejects(confirmarNumero(pool, 2099, ids[0]));
        const [[sec2]] = await pool.query('SELECT ultimo FROM inv_acta_secuencia WHERE anio = 2099');
        assert.equal(Number(sec2.ultimo), 12, 'una confirmación rechazada no debe consumir número');

        await pool.query('DELETE FROM inv_actas_entrega WHERE campamento_id = ? AND motivo = ?', [camp.id, 'concurrencia']);
        await pool.query('DELETE FROM inv_acta_secuencia WHERE anio = 2099');
      } finally {
        await pool.end();
      }
    }, { port: PORT, datadir: DATADIR, database: DB_NAME, ensureDatabase: false });
  });
});

// ================================================================== PENDIENTES REALES
// Las demas pruebas de la Fase B se convirtieron en reales en v22_actas_service.test.mjs y v22_actas_http.test.mjs
// (idempotencia, multi-item, atomicidad, concurrencia, orden cruzado, anulacion, permisos act:*, bandera, sin permisos automaticos).
describe('v2.2 - funcionalidad aun no implementada', () => {
  test.todo('la devolucion vinculada al acta no puede exceder lo entregado por item (la operacion de devolucion vinculada aun no existe)');
});
