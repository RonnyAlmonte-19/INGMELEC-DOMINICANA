// INGMELEC v2.2 — Sede y departamento en Actas según el alcance del usuario (HTTP real, base sintética
// ingmelec_v22_actas_test en 127.0.0.1:3310). MANTENIMIENTO 633 = campamento id 4 (CAMP-M633).
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
const PASS = `Alc${crypto.randomBytes(5).toString('hex')}7`;
const PORT = 5073; // evitar 5060/5061 (bloqueados por fetch)

async function seed(pool) {
  await pool.query(read(path.join(MIG, 'rollback_07_v22_actas_entrega.sql')));
  await pool.query(read(path.join(__dirname, 'fixtures', 'v21_synthetic_fixture.sql')).split('ingmelec_v21_test_isolated').join(DB));
  for (const f of ['migration_03_v21_seguridad_y_esquema.sql', 'migration_04_v21_campamentos_alias.sql', 'migration_05_v21_adapted.sql', 'migration_06_v21_safe.sql', 'migration_07_v22_actas_entrega.sql']) {
    await pool.query(read(path.join(MIG, f)));
  }
}

describe('v2.2 — sede y departamento de Actas según alcance (HTTP real)', () => {
  test('una sede, varias sedes, Developer y accesos no autorizados', async () => {
    await withLocalMariaDb(async () => {
      const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: DB, multipleStatements: true, connectionLimit: 4, charset: 'utf8mb4' });
      let server;
      try {
        await seed(pool);
        const hash = await argon2.hash(PASS, { type: argon2.argon2id });
        await pool.query('UPDATE inv_usuarios SET password_hash = ? WHERE id IN (1,2,3,4,5)', [hash]);
        // Permisos act:* solo a los usuarios de prueba (nadie más los recibe). id 3 (OPL) queda SIN act:*.
        const permisos = JSON.stringify(['act:crear', 'act:ver', 'inv:ver', 'camp:ver']);
        await pool.query('UPDATE inv_usuarios SET permisos_json = ? WHERE id IN (2,4,5)', [permisos]);
        await pool.query('UPDATE inv_usuarios SET permisos_json = ? WHERE id = 3', [JSON.stringify(['inv:ver'])]);
        const [us] = await pool.query('SELECT id, email FROM inv_usuarios WHERE id IN (1,2,3,4,5)');
        const email = Object.fromEntries(us.map((u) => [u.id, u.email]));

        // Variantes de departamento: no deben duplicarse en el catálogo derivado
        await pool.query("INSERT INTO inv_custodios (nombre, departamento, activo, es_sintetico) VALUES ('Custodio Variante', '  mantenimiento  ', 1, 1)");
        await pool.query("INSERT INTO inv_custodios (nombre, departamento, activo, es_sintetico) VALUES ('Dev Sintético Principal', 'Taller M633', 1, 1)");

        // Artículos con stock en las sedes 1, 3 y 4
        const conn = await pool.getConnection();
        await conn.query("SET SESSION sql_mode = ''");
        const [[base]] = await conn.query('SELECT area, categoria FROM inv_articulos LIMIT 1');
        const art = {};
        for (const [campId, nombre] of [[1, 'ALMACÉN 27 DE FEBRERO'], [3, 'OPL'], [4, 'MANTENIMIENTO 633']]) {
          const [r] = await conn.query(
            `INSERT INTO inv_articulos (articulo_nombre, area, categoria, ubicacion_nombre, campamento_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, unidad_medida, estado_fisico, activo, es_sintetico, codigo_original)
             VALUES (?, ?, ?, ?, ?, 'CONFIRMADO', 50, '50', 1, 'VERIFICADO', 'Unidad', 'Bueno', 1, 0, ?)`,
            [`ALC ART SEDE ${campId}`, base.area, base.categoria, nombre, campId, `ALC-${campId}`]);
          art[campId] = r.insertId;
        }
        // Acta histórica con departamento de texto libre (no debe tocarse)
        await conn.query(
          `INSERT INTO inv_actas_entrega (numero_acta, anio, request_uuid, estado, campamento_id, campamento_nombre, colaborador_nombre, departamento, supervisor_nombre, entregado_por_nombre, motivo, fecha_entrega, confirmado_en)
           VALUES ('ACT-2025-000001', 2025, ?, 'CONFIRMADA', 4, 'MANTENIMIENTO 633', 'Histórico', 'Texto Libre Antiguo', 'Sup', 'Dev', 'Acta anterior', '2025-05-05 10:00:00', '2025-05-05 10:00:00')`, [crypto.randomUUID()]);
        conn.release();
        const histAntes = JSON.stringify((await pool.query("SELECT * FROM inv_actas_entrega WHERE numero_acta = 'ACT-2025-000001'"))[0]);

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
        const login = async (id) => {
          const r = await http('/auth/login', { method: 'POST', body: { email: email[id], password: PASS } });
          assert.ok(r.b?.token, `login usuario ${id} (${email[id]}): ${r.s} ${r.b?.message}`);
          return r.b.token;
        };
        const dev = await login(1);
        const admin = await login(2);
        const opl = await login(3);
        const m633 = await login(4);
        const auditor = await login(5);

        const acta = (campamento_id, articulo, extra = {}) => ({
          request_uuid: crypto.randomUUID(), campamento_id, colaborador_nombre: 'Colab Alcance', supervisor_nombre: 'Sup Alcance',
          motivo: 'Entrega de prueba de alcance', items: [{ articulo_id: articulo, cantidad: 1 }], ...extra
        });
        const stock = async (id) => Number((await pool.query('SELECT cantidad_num FROM inv_articulos WHERE id=?', [id]))[0][0].cantidad_num);

        // ===== Usuario con UNA sola sede (MANTENIMIENTO 633) =====
        const oM = (await http('/actas/opciones', { token: m633 })).b;
        assert.deepEqual(oM.campamentos.map((c) => [c.id, c.nombre]), [[4, 'MANTENIMIENTO 633']], 'solo su sede');
        assert.equal(oM.campamento_bloqueado, true, 'una sola sede: seleccionada y bloqueada');
        assert.ok(oM.departamentos.includes('Mantenimiento'));
        assert.equal(oM.departamentos.filter((d) => d.toUpperCase() === 'MANTENIMIENTO').length, 1, 'variantes de mayúsculas/espacios no duplican');
        assert.ok(oM.departamentos.every((d) => d === d.trim()), 'sin espacios sobrantes');
        assert.deepEqual(oM.departamentos, [...oM.departamentos].sort((a, b) => a.localeCompare(b, 'es')));
        const ok633 = await http('/actas', { method: 'POST', token: m633, body: acta(4, art[4], { departamento: 'mantenimiento' }) });
        assert.equal(ok633.s, 201);
        const det = (await http(`/actas/${ok633.b.id}`, { token: m633 })).b.acta;
        assert.equal(det.campamento_nombre, 'MANTENIMIENTO 633', 'instantánea del campamento');
        assert.equal(det.departamento, 'Mantenimiento', 'instantánea del nombre canónico del catálogo');
        // Peticiones manipuladas a mano
        const stock1 = await stock(art[1]);
        const stock3 = await stock(art[3]);
        for (const campId of [1, 3]) {
          assert.equal((await http('/actas', { method: 'POST', token: m633, body: acta(campId, art[campId]) })).s, 403, `sede ${campId} ajena → 403`);
        }
        assert.equal((await http('/actas', { method: 'POST', token: m633, body: acta(999, art[4]) })).s, 403, 'sede inexistente fuera de alcance → 403');
        assert.equal((await http('/actas', { method: 'POST', token: m633, body: acta('4; DROP TABLE inv_articulos', art[4]) })).s, 400);
        assert.equal((await http('/actas', { method: 'POST', token: m633, body: acta(4, art[3]) })).s, 409, 'artículo de otra sede en un acta de su sede → rechazado');
        assert.equal(await stock(art[1]), stock1);
        assert.equal(await stock(art[3]), stock3, 'los rechazos no descuentan stock');
        for (const depto of ['Departamento Inventado', "x'; DROP TABLE inv_actas_entrega;--"]) {
          assert.equal((await http('/actas', { method: 'POST', token: m633, body: acta(4, art[4], { departamento: depto }) })).s, 400, `departamento fuera del catálogo "${depto}" → 400`);
        }
        assert.equal((await http('/actas', { method: 'POST', token: m633, body: acta(4, art[4], { departamento: 'Taller M633 ' }) })).s, 201, 'valor del catálogo con espacios sobrantes se normaliza');
        // Sin departamento sigue siendo válido (campo opcional)
        assert.equal((await http('/actas', { method: 'POST', token: m633, body: acta(4, art[4]) })).s, 201);

        // ===== Usuario con VARIAS sedes (1 y 3) =====
        const oA = (await http('/actas/opciones', { token: admin })).b;
        assert.deepEqual(oA.campamentos.map((c) => c.id).sort(), [1, 3]);
        assert.equal(oA.campamento_bloqueado, false);
        assert.equal((await http('/actas', { method: 'POST', token: admin, body: acta(3, art[3], { departamento: 'Operaciones OPL' }) })).s, 201);
        assert.equal((await http('/actas', { method: 'POST', token: admin, body: acta(4, art[4]) })).s, 403, 'sede no asignada → 403 aunque tenga otras');
        assert.deepEqual((await http('/actas/opciones', { token: auditor })).b.campamentos.map((c) => c.id).sort(), [1, 4]);

        // ===== Developer: todas las sedes registradas (activas, no sintéticas) =====
        const oD = (await http('/actas/opciones', { token: dev })).b;
        const [dbCamps] = await pool.query('SELECT id FROM inv_campamentos WHERE activo = 1 AND COALESCE(es_sintetico,0) = 0 ORDER BY id');
        assert.deepEqual(oD.campamentos.map((c) => c.id).sort((a, b) => a - b), dbCamps.map((c) => c.id));
        assert.equal(oD.campamento_bloqueado, false);
        assert.equal(oD.departamento_sugerido, 'Taller M633', 'sugerido solo si existe un custodio con el nombre del usuario');
        for (const campId of [1, 3, 4]) {
          assert.equal((await http('/actas', { method: 'POST', token: dev, body: acta(campId, art[campId]) })).s, 201, `Developer en sede ${campId}`);
        }

        // ===== Sin permiso del módulo =====
        assert.equal((await http('/actas/opciones', { token: opl })).s, 403, 'sin act:crear → no ve opciones');
        assert.equal((await http('/actas/opciones')).s, 401);
        assert.equal((await http('/actas', { method: 'POST', token: opl, body: acta(3, art[3]) })).s, 403);

        // ===== Historial y no-regresión =====
        assert.equal(JSON.stringify((await pool.query("SELECT * FROM inv_actas_entrega WHERE numero_acta = 'ACT-2025-000001'"))[0]), histAntes, 'el acta histórica no cambia');
        const hist = (await http('/actas?q=Texto Libre', { token: m633 })).b;
        assert.equal(hist.total, 1, 'el acta con departamento de texto libre sigue consultable');
        const [[{ n: conActa }]] = await pool.query("SELECT COUNT(*) n FROM inv_usuarios WHERE CAST(permisos_json AS CHAR) LIKE '%act:%'");
        assert.equal(Number(conActa), 3, 'solo los 3 usuarios de prueba configurados tienen act:*');
        const mv = await http('/movimientos', { method: 'POST', token: dev, body: { articulo_id: art[1], tipo_movimiento: 'ENTRADA', cantidad: 1, motivo: 'Regresión movimientos' } });
        assert.equal(mv.s, 200);
      } finally {
        server?.kill();
        await pool.end();
      }
    });
  });
});
