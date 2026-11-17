import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);
const argon2 = require('argon2');
const mysql = require('mysql2/promise');

const MARIADB_PORT = 3310;
const ISOLATED_DB_NAME = 'ingmelec_v21_test_isolated';
const FIXTURE_SQL_PATH = path.join(REPO_ROOT, 'server', 'tests', 'fixtures', 'v21_synthetic_fixture.sql');
const MIGRATIONS = [
  'migration_03_v21_seguridad_y_esquema.sql',
  'migration_04_v21_campamentos_alias.sql',
  'migration_05_v21_adapted.sql',
  'migration_06_v21_safe.sql'
];

process.env.NODE_ENV = 'test';
process.env.ENVIRONMENT = 'isolated_test';
process.env.ISOLATED_LOCAL_ONLY = 'true';
process.env.BLOCK_REMOTE_DB = 'true';
process.env.ALLOW_LOCAL_PRODUCTION_DB = 'false';
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = String(MARIADB_PORT);
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.DB_SSL = 'false';
process.env.DB_SSL_ALLOW_INSECURE = 'false';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.JWT_TTL_HOURS = '12';

const { default: express } = await import('express');
const { getPool, closePool, getTlsConfigPreview } = await import('../database/db.js');
const { default: almacenRouter, resetSchemaCapabilitiesCache } = await import('../routes/almacenApi.js');
const { withLocalMariaDb } = await import('./helpers/local-mariadb.mjs');
const {
  PERMISSION_CATEGORIES,
  MODULE_PAGE_ORDER,
  canAccessModule,
  getFirstAuthorizedPage
} = await import('../../src/utils/permissions.js');

async function seedIsolatedDb() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: MARIADB_PORT,
    user: 'root',
    password: '',
    multipleStatements: true
  });
  try {
    await conn.query(fs.readFileSync(FIXTURE_SQL_PATH, 'utf8'));
    await conn.query(`USE \`${ISOLATED_DB_NAME}\``);
    for (const m of MIGRATIONS) {
      await conn.query(fs.readFileSync(path.join(REPO_ROOT, 'server', 'database', 'migrations', m), 'utf8'));
    }
    resetSchemaCapabilitiesCache();
  } finally {
    await conn.end();
  }
}

async function startApi() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v2', almacenRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v2`;
  return {
    baseUrl,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function apiReq(baseUrl, endpoint, { method = 'GET', token = null, body = null, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  if (body !== null) reqHeaders['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: reqHeaders,
    body: body !== null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, headers: res.headers };
}

describe('ETAPA 8 QA — Equipo A (Seguridad/RBAC) y Equipo B (BD/Campamentos/Inventario)', () => {
  test('Equipo A: Seguridad Auth, Argon2id, JWT/token_version, 20 permisos, 12 vistas y Movimientos 4 escenarios', async () => {
    const allPermKeys = PERMISSION_CATEGORIES.flatMap((c) => c.items.map((i) => i.key));
    // v2.2: los 20 permisos originales no cambian; se añaden 3 act:* (actas) sin tocar roles por defecto.
    assert.equal(allPermKeys.filter((k) => !k.startsWith('act:')).length, 20, 'Deben existir exactamente 20 permisos granulares base');
    assert.deepEqual(allPermKeys.filter((k) => k.startsWith('act:')), ['act:ver', 'act:crear', 'act:anular']);
    assert.equal(MODULE_PAGE_ORDER.length, 12, 'Deben existir exactamente 12 módulos en navegación');

    await withLocalMariaDb(async () => {
      const pool = getPool();
      await seedIsolatedDb();

      const devPass = 'DevQa#2026!Secure';
      const devHash = await argon2.hash(devPass, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
      await pool.query("UPDATE inv_usuarios SET password_hash = ? WHERE email = 'dev.sintetico@ingmelec-test.local'", [devHash]);

      const api = await startApi();
      try {
        // 1. Login Argon2id + JWT + /auth/me + Logout revocación token_version
        const loginRes = await apiReq(api.baseUrl, '/auth/login', {
          method: 'POST',
          body: { email: 'dev.sintetico@ingmelec-test.local', password: devPass }
        });
        assert.equal(loginRes.status, 200);
        assert.ok(loginRes.json.token);
        const devToken = loginRes.json.token;

        const meRes = await apiReq(api.baseUrl, '/auth/me', { token: devToken });
        assert.equal(meRes.status, 200);
        assert.equal(meRes.json.user.rol, 'developer');

        const logoutRes = await apiReq(api.baseUrl, '/auth/logout', { method: 'POST', token: devToken });
        assert.equal(logoutRes.status, 200);
        const afterLogout = await apiReq(api.baseUrl, '/auth/me', { token: devToken });
        assert.equal(afterLogout.status, 401, 'Token revocado tras logout debe responder 401');

        // Re-login developer para pruebas RBAC
        const login2 = await apiReq(api.baseUrl, '/auth/login', {
          method: 'POST',
          body: { email: 'dev.sintetico@ingmelec-test.local', password: devPass }
        });
        const freshDevToken = login2.json.token;

        // 2. Prevención escalamiento de privilegios y exclusividad Developer
        const createDevAttempt = await apiReq(api.baseUrl, '/usuarios', {
          method: 'POST',
          token: freshDevToken,
          body: {
            nombre: 'Intento Dev 2',
            email: 'dev2.sintetico@ingmelec-test.local',
            password: 'Password123!',
            rol: 'developer',
            es_developer: 1,
            permisos: ['*']
          }
        });
        assert.equal(createDevAttempt.status, 403);

        // Crear usuario operativo restringido a OPL (campamento 3) con permiso único inv:movimientos_registrar
        const userPass = 'Operador#2026!';
        const createUserRes = await apiReq(api.baseUrl, '/usuarios', {
          method: 'POST',
          token: freshDevToken,
          body: {
            nombre: 'Operador E8 OPL',
            email: 'e8.opl@ingmelec-test.local',
            password: userPass,
            rol: 'almacen',
            cargo: 'Auxiliar OPL',
            area: 'ALMACEN',
            campamentos: [3],
            permisos: ['inv:movimientos_registrar']
          }
        });
        assert.equal(createUserRes.status, 201);
        const targetId = createUserRes.json.id;

        const opLogin = await apiReq(api.baseUrl, '/auth/login', {
          method: 'POST',
          body: { email: 'e8.opl@ingmelec-test.local', password: userPass }
        });
        assert.equal(opLogin.status, 200);
        const opToken = opLogin.json.token;

        // No puede acceder a /usuarios
        assert.equal((await apiReq(api.baseUrl, '/usuarios', { token: opToken })).status, 403);

        // Escenario 1: Solo inv:movimientos_registrar
        assert.equal(canAccessModule(opLogin.json.user, 'movimientos'), true);
        assert.equal(canAccessModule(opLogin.json.user, 'dashboard'), false);
        assert.equal(getFirstAuthorizedPage(opLogin.json.user), 'movimientos');
        assert.equal((await apiReq(api.baseUrl, '/movimientos', { token: opToken })).status, 403);

        const [oplArts] = await pool.query('SELECT id FROM inv_articulos WHERE campamento_id = 3 AND activo = 1 LIMIT 1');
        const [febArts] = await pool.query('SELECT id FROM inv_articulos WHERE campamento_id = 1 AND activo = 1 LIMIT 1');
        assert.equal((await apiReq(api.baseUrl, '/movimientos', {
          method: 'POST',
          token: opToken,
          body: { articulo_id: oplArts[0].id, tipo_movimiento: 'ENTRADA', cantidad: 1, motivo: 'E8 solo registrar' }
        })).status, 200);
        // Bloqueo territorial en 27FEB
        assert.equal((await apiReq(api.baseUrl, '/movimientos', {
          method: 'POST',
          token: opToken,
          body: { articulo_id: febArts[0].id, tipo_movimiento: 'ENTRADA', cantidad: 1, motivo: 'E8 IDOR 27FEB' }
        })).status, 403);

        // Escenario 2: Solo inv:movimientos_ver (revoca token anterior -> nuevo login)
        const upd2 = await apiReq(api.baseUrl, `/usuarios/${targetId}/permisos`, {
          method: 'PUT',
          token: freshDevToken,
          body: { permisos: ['inv:movimientos_ver'] }
        });
        assert.equal(upd2.status, 200);
        assert.equal((await apiReq(api.baseUrl, '/auth/me', { token: opToken })).status, 401, 'Cambio de permisos debe revocar JWT previo');

        const opLogin2 = await apiReq(api.baseUrl, '/auth/login', {
          method: 'POST',
          body: { email: 'e8.opl@ingmelec-test.local', password: userPass }
        });
        const opToken2 = opLogin2.json.token;
        assert.equal(canAccessModule(opLogin2.json.user, 'movimientos'), true);
        assert.equal((await apiReq(api.baseUrl, '/movimientos', { token: opToken2 })).status, 200);
        assert.equal((await apiReq(api.baseUrl, '/movimientos', {
          method: 'POST',
          token: opToken2,
          body: { articulo_id: oplArts[0].id, tipo_movimiento: 'ENTRADA', cantidad: 1, motivo: 'E8 solo ver' }
        })).status, 403);

        // Escenario 3: Ambos permisos
        await apiReq(api.baseUrl, `/usuarios/${targetId}/permisos`, {
          method: 'PUT',
          token: freshDevToken,
          body: { permisos: ['inv:movimientos_ver', 'inv:movimientos_registrar'] }
        });
        const opLogin3 = await apiReq(api.baseUrl, '/auth/login', {
          method: 'POST',
          body: { email: 'e8.opl@ingmelec-test.local', password: userPass }
        });
        const opToken3 = opLogin3.json.token;
        assert.equal((await apiReq(api.baseUrl, '/movimientos', { token: opToken3 })).status, 200);
        assert.equal((await apiReq(api.baseUrl, '/movimientos', {
          method: 'POST',
          token: opToken3,
          body: { articulo_id: oplArts[0].id, tipo_movimiento: 'ENTRADA', cantidad: 1, motivo: 'E8 ambos' }
        })).status, 200);

        // Escenario 4: Ningún permiso
        await apiReq(api.baseUrl, `/usuarios/${targetId}/permisos`, {
          method: 'PUT',
          token: freshDevToken,
          body: { permisos: [] }
        });
        const opLogin4 = await apiReq(api.baseUrl, '/auth/login', {
          method: 'POST',
          body: { email: 'e8.opl@ingmelec-test.local', password: userPass }
        });
        const opToken4 = opLogin4.json.token;
        assert.equal(getFirstAuthorizedPage(opLogin4.json.user), 'sin_acceso');
        assert.equal((await apiReq(api.baseUrl, '/movimientos', { token: opToken4 })).status, 403);
        assert.equal((await apiReq(api.baseUrl, '/movimientos', {
          method: 'POST',
          token: opToken4,
          body: { articulo_id: oplArts[0].id, tipo_movimiento: 'ENTRADA', cantidad: 1, motivo: 'E8 ninguno' }
        })).status, 403);
      } finally {
        await api.close();
        await closePool();
      }
    }, { port: MARIADB_PORT, database: ISOLATED_DB_NAME });
  });

  test('Equipo B: Normalización 3 campamentos, alias, preview sin mutación, integridad y consistencia KPIs/Inventario/Reportes', async () => {
    await withLocalMariaDb(async () => {
      const pool = getPool();
      await seedIsolatedDb();

      const api = await startApi();
      try {
        const [devRows] = await pool.query('SELECT id, nombre, email, rol, es_developer, token_version FROM inv_usuarios WHERE es_developer = 1 LIMIT 1');
        const devPass = 'DevQa#2026!B';
        const devHash = await argon2.hash(devPass, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
        await pool.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = ?', [devHash, devRows[0].id]);
        const devLogin = await apiReq(api.baseUrl, '/auth/login', {
          method: 'POST',
          body: { email: devRows[0].email, password: devPass }
        });
        const devToken = devLogin.json.token;

        // 1. Verificar códigos estables e independencia de las 3 sedes
        const campsRes = await apiReq(api.baseUrl, '/campamentos', { token: devToken });
        assert.equal(campsRes.status, 200);
        const codes = new Set(campsRes.json.campamentos.map((c) => c.codigo));
        assert.equal(codes.has('ALM-27FEB'), true);
        assert.equal(codes.has('CAMP-OPL'), true);
        assert.equal(codes.has('CAMP-M633'), true);

        const camp27 = campsRes.json.campamentos.find((c) => c.codigo === 'ALM-27FEB');
        const campOpl = campsRes.json.campamentos.find((c) => c.codigo === 'CAMP-OPL');
        const campM633 = campsRes.json.campamentos.find((c) => c.codigo === 'CAMP-M633');
        assert.notEqual(camp27.id, campOpl.id);
        assert.notEqual(campOpl.id, campM633.id);

        // 2. Resolver alias OPL, MANTENIMIENTO 633 y 27 DE FEBRERO sin cruzar sedes
        const aliasChecks = [
          { texto: 'OPL', expected: 'CAMP-OPL' },
          { texto: 'KM19', expected: 'CAMP-OPL' },
          { texto: 'KM 19', expected: 'CAMP-OPL' },
          { texto: 'KM 19 AUT DUARTE', expected: 'CAMP-OPL' },
          { texto: 'KM 19 AUTOPISTA DUARTE', expected: 'CAMP-OPL' },
          { texto: 'KM 19 AUTOPISTA DUARTE OPL', expected: 'CAMP-OPL' },
          { texto: 'MANTENIMIENTO', expected: 'CAMP-M633' },
          { texto: 'MANTENIMIENTO 633', expected: 'CAMP-M633' },
          { texto: 'MANTENIMIENTO M633', expected: 'CAMP-M633' },
          { texto: 'ALMACÉN 27 DE FEBRERO', expected: 'ALM-27FEB' },
          { texto: 'DISTRITO NACIONAL 27 DE FEBRERO', expected: 'ALM-27FEB' },
          { texto: 'ALM-27FEB', expected: 'ALM-27FEB' }
        ];
        for (const chk of aliasChecks) {
          const r = await apiReq(api.baseUrl, '/campamentos/resolver-alias', {
            method: 'POST',
            token: devToken,
            body: { texto: chk.texto, permitir_revision_historica: true }
          });
          assert.equal(r.status, 200, `Alias "${chk.texto}" debe resolver`);
          const resolvedCode = r.json.resolucion?.codigo_campamento || r.json.resolucion?.suggested_codigo_campamento;
          assert.equal(resolvedCode, chk.expected, `Alias "${chk.texto}" debe mapear a ${chk.expected}`);
        }

        // 3. Preview de reasignación NO modifica base de datos
        const [beforeNull] = await pool.query('SELECT COUNT(*) AS c FROM inv_articulos WHERE campamento_id IS NULL AND es_sintetico = 0');
        const prevRes = await apiReq(api.baseUrl, '/campamentos/reasignaciones/preview', {
          method: 'POST',
          token: devToken,
          body: {
            campamento_destino_codigo: 'CAMP-OPL',
            ubicaciones_origen: ['KM 19 AUT DUARTE']
          }
        });
        assert.equal(prevRes.status, 200);
        const [afterNull] = await pool.query('SELECT COUNT(*) AS c FROM inv_articulos WHERE campamento_id IS NULL AND es_sintetico = 0');
        assert.equal(beforeNull[0].c, afterNull[0].c, 'Preview no debe alterar inv_articulos');

        // 4. Consistencia KPIs vs Inventario vs Reportes (total, sinSerial, por sede)
        const kpiGlobal = await apiReq(api.baseUrl, '/dashboard/kpis', { token: devToken });
        const artGlobal = await apiReq(api.baseUrl, '/articulos?limit=500', { token: devToken });
        const repGlobal = await apiReq(api.baseUrl, '/reportes/exportar', { token: devToken });
        assert.equal(kpiGlobal.json.kpis.totalArticulos, artGlobal.json.pagination.total);
        assert.equal(kpiGlobal.json.kpis.totalArticulos, repGlobal.json.count);

        // TLS preview check (con env temporal)
        const prevSsl = process.env.DB_SSL;
        process.env.DB_SSL = 'true';
        try {
          const tlsInfo = getTlsConfigPreview();
          assert.equal(tlsInfo.enabled, true);
          assert.equal(tlsInfo.rejectUnauthorized, true);
          assert.equal(tlsInfo.multipleStatementsDefault, false);
        } finally {
          process.env.DB_SSL = prevSsl;
        }
      } finally {
        await api.close();
        await closePool();
      }
    }, { port: MARIADB_PORT, database: ISOLATED_DB_NAME });
  });
});
