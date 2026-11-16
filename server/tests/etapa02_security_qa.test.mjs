import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const MARIADB_PORT = 3310;
const MARIADB_DATADIR = 'C:/Users/gener/.gemini/antigravity/scratch/local-mysql-v21/data';
const ISOLATED_DB_NAME = 'ingmelec_v21_test_isolated';
const FIXTURE_SQL_PATH = path.join(REPO_ROOT, 'server', 'tests', 'fixtures', 'v21_synthetic_fixture.sql');
const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');

// Fijar entorno estrictamente aislado ANTES de importar módulos de aplicación
function applyIsolatedBaselineEnv() {
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
  process.env.JWT_SECRET = EPHEMERAL_JWT_SECRET;
  process.env.JWT_TTL_HOURS = '12';
}

applyIsolatedBaselineEnv();

const { default: express } = await import('express');
const { default: argon2 } = await import('argon2');
const {
  getPool,
  resetPool,
  closePool,
  setPoolOverride,
  getTlsConfigPreview
} = await import('../database/db.js');
const { default: almacenRouter } = await import('../routes/almacenApi.js');
const { withLocalMariaDb } = await import('./helpers/local-mariadb.mjs');
const { wrapMysql8JsonPool } = await import('./fixtures/mysql8_json_shim.mjs');

const ARGON2_TEST_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1
};

async function withEnvOverrides(overrides, fn) {
  const keys = Object.keys(overrides);
  const previous = new Map();
  for (const key of keys) {
    previous.set(
      key,
      Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined
    );
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function getAvailablePort(preferredPort = 5110) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.unref();
    tester.on('error', () => {
      const fallback = net.createServer();
      fallback.unref();
      fallback.on('error', reject);
      fallback.listen(0, '127.0.0.1', () => {
        const addr = fallback.address();
        const chosen = typeof addr === 'object' && addr ? addr.port : 0;
        fallback.close(() => resolve(chosen));
      });
    });
    tester.listen(preferredPort, '127.0.0.1', () => {
      const addr = tester.address();
      const chosen = typeof addr === 'object' && addr ? addr.port : preferredPort;
      tester.close(() => resolve(chosen));
    });
  });
}

function assertPortClosed(host, port, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout verificando cierre de ${host}:${port}`));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      reject(new Error(`El puerto ${host}:${port} continúa escuchando tras el apagado.`));
    });

    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });
  });
}

function buildCustomJwt({
  header = { alg: 'HS256', typ: 'JWT' },
  payload,
  secret = EPHEMERAL_JWT_SECRET,
  rawSignature = null
}) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  if (rawSignature !== null) {
    return `${encodedHeader}.${encodedPayload}.${rawSignature}`;
  }
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function signTestJwt(user, overrides = {}) {
  return buildCustomJwt({
    payload: {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      es_developer: user.es_developer ?? 0,
      tv: user.tv ?? 1,
      iat: Date.now(),
      exp: Date.now() + 60 * 60 * 1000,
      ...overrides
    }
  });
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  assert.equal(parts.length, 3, 'El token JWT debe tener exactamente 3 segmentos.');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

async function apiRequest(baseUrl, pathname, options = {}) {
  const { method = 'GET', token = null, body = undefined, headers = {} } = options;
  const finalHeaders = { ...headers };
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }
  let payload;
  if (body !== undefined) {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: finalHeaders,
    body: payload
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

async function startInProcessApiApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v2', almacenRouter);

  const server = await new Promise((resolve, reject) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    srv.on('error', reject);
  });
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    port: addr.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}

async function waitForServerHealth(baseUrl, childProcess, logsBuffer, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      throw new Error(
        `El servidor salió prematuramente (code=${childProcess.exitCode}, signal=${childProcess.signalCode}). Logs:\n${logsBuffer.join('')}`
      );
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return response;
      }
    } catch {
      // Aún arrancando
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timeout esperando /health en ${baseUrl}. Logs:\n${logsBuffer.join('')}`);
}

async function stopChildProcess(childProcess, timeoutMs = 5000) {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => {
    childProcess.once('exit', () => resolve());
  });
  childProcess.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  if (childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGKILL');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

function spawnRealServerProcess(port, extraEnv = {}) {
  const serverLogs = [];
  const captureLog = (chunk) => {
    serverLogs.push(chunk.toString());
    if (serverLogs.length > 60) {
      serverLogs.shift();
    }
  };

  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: REPO_ROOT,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'test',
      ENVIRONMENT: 'isolated_test',
      ISOLATED_LOCAL_ONLY: 'true',
      BLOCK_REMOTE_DB: 'true',
      ALLOW_LOCAL_PRODUCTION_DB: 'false',
      DOTENV_CONFIG_QUIET: 'true',
      PORT: String(port),
      JWT_SECRET: EPHEMERAL_JWT_SECRET,
      JWT_TTL_HOURS: '12',
      DB_HOST: '127.0.0.1',
      DB_PORT: String(MARIADB_PORT),
      DB_USER: 'root',
      DB_PASSWORD: '',
      DB_NAME: ISOLATED_DB_NAME,
      DB_SSL: 'false',
      DB_SSL_ALLOW_INSECURE: 'false',
      CORS_ORIGINS: '',
      ...extraEnv
    }
  });

  child.stdout.on('data', captureLog);
  child.stderr.on('data', captureLog);

  return { child, serverLogs };
}

function installJsonShimPool() {
  resetPool();
  const rawPool = getPool();
  const wrapped = wrapMysql8JsonPool(rawPool);
  setPoolOverride(wrapped);
  return wrapped;
}

async function createSyntheticUser(pool, { nombre, email, passwordHash, rol, campamentoId = null, permisos = [], activo = 1 }) {
  const [res] = await pool.query(
    `INSERT INTO inv_usuarios (
      nombre, email, password_hash, rol, cargo, area, activo,
      es_developer, token_version, campamento_id, permisos_json
    ) VALUES (?, ?, ?, ?, 'QA Sintético', 'ALMACEN', ?, 0, 1, ?, ?)`,
    [nombre, email, passwordHash, rol, activo, campamentoId, JSON.stringify(permisos)]
  );
  const userId = res.insertId;
  if (campamentoId) {
    await pool.query(
      'INSERT INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, ?, 1)',
      [userId, campamentoId]
    );
  }
  return {
    id: userId,
    nombre,
    email,
    rol,
    es_developer: 0,
    campamento_id: campamentoId,
    permisos,
    tv: 1
  };
}

describe('ETAPA 2 QA Independiente - Autenticación, Autorización y Seguridad v2.1', () => {
  test('Suite completa de seguridad Etapa 2 sobre MariaDB 3310 aislado', async (t) => {
    const spawnedServerPorts = [];

    await withLocalMariaDb(
      async (instance) => {
        assert.equal(instance.host, '127.0.0.1');
        assert.equal(instance.port, MARIADB_PORT);
        assert.equal(instance.database, ISOLATED_DB_NAME);

        instance.applyEnv(process.env);
        applyIsolatedBaselineEnv();

        // Verificar aislamiento estricto de BD y cargar fixture sintético limpio
        await closePool();
        const setupPool = getPool(null, { allowMultipleStatements: true });
        const [metaRows] = await setupPool.query(
          'SELECT @@port AS port, @@datadir AS datadir, DATABASE() AS db'
        );
        assert.equal(Number(metaRows[0].port), MARIADB_PORT);
        assert.equal(
          path.resolve(metaRows[0].datadir).toLowerCase(),
          path.resolve(MARIADB_DATADIR).toLowerCase()
        );
        assert.equal(metaRows[0].db, ISOLATED_DB_NAME);

        const fixtureSql = fs.readFileSync(FIXTURE_SQL_PATH, 'utf8');
        await setupPool.query(fixtureSql);
        await closePool();

        // -----------------------------------------------------------------
        // 1. TLS CA y multipleStatements: false (A04)
        // -----------------------------------------------------------------
        await t.test('1. TLS CA (DB_SSL=true) y bloqueo de multipleStatements por defecto (A04)', async () => {
          await withEnvOverrides({ DB_SSL: 'true', DB_SSL_ALLOW_INSECURE: 'false' }, async () => {
            const tls = getTlsConfigPreview();
            assert.equal(tls.enabled, true);
            assert.equal(tls.rejectUnauthorized, true);
            assert.equal(tls.ssl.rejectUnauthorized, true);
            assert.equal(tls.ssl.hasCa, true);
            assert.equal(tls.caExists, true);
            assert.equal(tls.caLoaded, true);
            assert.ok(tls.caBytes > 0);
            assert.equal(tls.multipleStatementsDefault, false);
          });

          await withEnvOverrides({ DB_SSL: 'false', DB_SSL_ALLOW_INSECURE: 'false' }, async () => {
            const tlsOff = getTlsConfigPreview();
            assert.equal(tlsOff.enabled, false);
            assert.equal(tlsOff.ssl, undefined);
            assert.equal(tlsOff.multipleStatementsDefault, false);
          });

          resetPool();
          const defaultPool = getPool();
          await assert.rejects(
            () => defaultPool.query('SELECT 1; SELECT 2'),
            (err) => err?.code === 'ER_PARSE_ERROR'
          );

          const multiPool = getPool(null, { allowMultipleStatements: true });
          const [multiRows] = await multiPool.query('SELECT 1 AS a; SELECT 2 AS b');
          assert.equal(multiRows.length, 2);
          assert.equal(multiRows[0][0].a, 1);
          assert.equal(multiRows[1][0].b, 2);

          await closePool();
        });

        // Sembrar usuarios sintéticos para pruebas de seguridad con contraseñas efímeras en memoria
        const seedPool = installJsonShimPool();
        const passRevTargetInitial = `QaSynth-${crypto.randomBytes(12).toString('hex')}`;
        const passRevTargetUpdated = `QaSynth-${crypto.randomBytes(12).toString('hex')}`;
        const hashInitial = await argon2.hash(passRevTargetInitial, ARGON2_TEST_OPTS);

        const devUser = {
          id: 1,
          nombre: 'Dev Sintético Principal',
          email: 'dev.sintetico@ingmelec-test.local',
          rol: 'developer',
          es_developer: 1,
          tv: 1
        };

        const gerenciaSinSedeUser = {
          id: 6,
          nombre: 'Gerente Sintético Global',
          email: 'gerencia.sintetico@ingmelec-test.local',
          rol: 'gerencia',
          es_developer: 0,
          tv: 1
        };

        const userRevTarget = await createSyntheticUser(seedPool, {
          nombre: 'QA Revocación JWT',
          email: 'qa.revocacion@ingmelec-test.local',
          passwordHash: hashInitial,
          rol: 'almacen',
          campamentoId: 1,
          permisos: ['inv:ver', 'camp:ver']
        });

        const dummyHash = await argon2.hash(`QaDummy-${crypto.randomBytes(12).toString('hex')}`, ARGON2_TEST_OPTS);

        const userSinSedeOps = await createSyntheticUser(seedPool, {
          nombre: 'QA Sin Sede Operativo',
          email: 'qa.sinsede@ingmelec-test.local',
          passwordHash: dummyHash,
          rol: 'almacen',
          campamentoId: null,
          permisos: ['dash:ver', 'inv:ver', 'inv:movimientos_ver', 'lev:ver', 'rep:ver', 'camp:ver', 'camp:stock']
        });

        const userSede1Ops = await createSyntheticUser(seedPool, {
          nombre: 'QA Sede 1 Completo',
          email: 'qa.sede1.ops@ingmelec-test.local',
          passwordHash: dummyHash,
          rol: 'almacen',
          campamentoId: 1,
          permisos: [
            'dash:ver',
            'inv:ver',
            'inv:crear',
            'inv:editar',
            'inv:eliminar',
            'inv:movimientos_registrar',
            'inv:movimientos_ver',
            'lev:ver',
            'lev:crear',
            'lev:capturar',
            'lev:editar',
            'rep:ver',
            'camp:ver',
            'camp:stock',
            'camp:operar'
          ]
        });

        const userSede1NoCampOper = await createSyntheticUser(seedPool, {
          nombre: 'QA Sede 1 Sin CampOper',
          email: 'qa.sede1.nooper@ingmelec-test.local',
          passwordHash: dummyHash,
          rol: 'almacen',
          campamentoId: 1,
          permisos: ['inv:ver', 'camp:ver']
        });

        const apiApp = await startInProcessApiApp();
        try {
          const devToken = signTestJwt(devUser);
          const sede1Token = signTestJwt(userSede1Ops);
          const sede1NoOperToken = signTestJwt(userSede1NoCampOper);
          const sinSedeToken = signTestJwt(userSinSedeOps);
          const gerenciaSinSedeToken = signTestJwt(gerenciaSinSedeUser);

          // -----------------------------------------------------------------
          // 2. requireAuth Fail-Closed (C05)
          // -----------------------------------------------------------------
          await t.test('2. requireAuth Fail-Closed devuelve HTTP 503 ante caída de BD (C05)', async () => {
            const baselineMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: devToken });
            assert.equal(baselineMe.status, 200);

            const dbDownErr = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3310'), {
              code: 'ECONNREFUSED',
              errno: -4078
            });
            setPoolOverride({
              query: async () => {
                throw dbDownErr;
              },
              execute: async () => {
                throw dbDownErr;
              },
              getConnection: async () => {
                throw dbDownErr;
              },
              end: async () => {}
            });

            try {
              const artRes = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: devToken });
              assert.equal(artRes.status, 503);
              assert.equal(artRes.json?.success, false);
              assert.match(artRes.json?.message || '', /no disponible/i);

              const meRes = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: devToken });
              assert.equal(meRes.status, 503);
              assert.equal(meRes.json?.success, false);
              assert.match(meRes.json?.message || '', /no disponible/i);
            } finally {
              resetPool();
              installJsonShimPool();
            }

            const recoveredMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: devToken });
            assert.equal(recoveredMe.status, 200);
          });

          // -----------------------------------------------------------------
          // 3. JWT Hardening y Revocación Real (C06)
          // -----------------------------------------------------------------
          await t.test('3. JWT Hardening y Revocación Real con token_version (C06)', async () => {
            // 3A. Rechazo 401 ante tokens inválidos o manipulados
            const validDevJwt = signTestJwt(devUser);
            const parts = validDevJwt.split('.');
            const lastChar = parts[2].slice(-1);
            const tamperedSig = parts[2].slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');
            const tamperedJwt = `${parts[0]}.${parts[1]}.${tamperedSig}`;

            const algNoneEmptySig = buildCustomJwt({
              header: { alg: 'none', typ: 'JWT' },
              payload: { id: devUser.id, tv: 1, exp: Date.now() + 3600000 },
              rawSignature: ''
            });
            const algNoneWithSig = buildCustomJwt({
              header: { alg: 'none', typ: 'JWT' },
              payload: { id: devUser.id, tv: 1, exp: Date.now() + 3600000 },
              rawSignature: 'forged'
            });
            const noExpJwt = buildCustomJwt({
              payload: { id: devUser.id, rol: 'developer', es_developer: 1, tv: 1 }
            });
            const nonNumericExpJwt = buildCustomJwt({
              payload: { id: devUser.id, rol: 'developer', es_developer: 1, tv: 1, exp: 'never' }
            });
            const expiredJwt = buildCustomJwt({
              payload: { id: devUser.id, rol: 'developer', es_developer: 1, tv: 1, exp: Date.now() - 1000 }
            });
            const wrongTvJwt = signTestJwt(devUser, { tv: 999 });

            const rejectedCases = [
              { label: 'sin header Authorization', token: null },
              { label: 'firma alterada', token: tamperedJwt },
              { label: 'alg: none sin firma', token: algNoneEmptySig },
              { label: 'alg: none con firma falsa', token: algNoneWithSig },
              { label: 'payload sin exp', token: noExpJwt },
              { label: 'exp no numérico ("never")', token: nonNumericExpJwt },
              { label: 'exp vencido (Date.now() - 1000)', token: expiredJwt },
              { label: 'tv distinto al de BD', token: wrongTvJwt }
            ];

            for (const tc of rejectedCases) {
              const rMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: tc.token });
              assert.equal(rMe.status, 401, `/auth/me debió devolver 401 para ${tc.label}`);
              const rArt = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: tc.token });
              assert.equal(rArt.status, 401, `/articulos debió devolver 401 para ${tc.label}`);
            }

            // 3B. Login real con Argon2 en BD 3310: verifica tv y TTL <= 12h
            const login1 = await apiRequest(apiApp.baseUrl, '/api/v2/auth/login', {
              method: 'POST',
              body: { email: userRevTarget.email, password: passRevTargetInitial }
            });
            assert.equal(login1.status, 200);
            assert.equal(login1.json?.success, true);
            assert.equal(typeof login1.json?.token, 'string');

            const token1 = login1.json.token;
            const decoded1 = decodeJwtPayload(token1);
            assert.equal(decoded1.tv, 1);
            assert.equal(typeof decoded1.iat, 'number');
            assert.equal(typeof decoded1.exp, 'number');
            const ttlMs = decoded1.exp - decoded1.iat;
            assert.ok(ttlMs > 0 && ttlMs <= 12 * 60 * 60 * 1000, `TTL fuera de rango: ${ttlMs}ms`);

            // 3C. POST /api/v2/auth/logout incrementa token_version a 2 y revoca token1
            const preLogout = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: token1 });
            assert.equal(preLogout.status, 200);

            const logoutRes = await apiRequest(apiApp.baseUrl, '/api/v2/auth/logout', {
              method: 'POST',
              token: token1
            });
            assert.equal(logoutRes.status, 200);
            assert.equal(logoutRes.json?.success, true);

            const activePool = getPool();
            const [[tvAfterLogout]] = await activePool.query(
              'SELECT token_version FROM inv_usuarios WHERE id = ?',
              [userRevTarget.id]
            );
            assert.equal(Number(tvAfterLogout.token_version), 2);

            const postLogoutMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: token1 });
            assert.equal(postLogoutMe.status, 401);
            const postLogoutArt = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: token1 });
            assert.equal(postLogoutArt.status, 401);

            // 3D. Revocación tras POST /usuarios/:id/recuperar
            const login2 = await apiRequest(apiApp.baseUrl, '/api/v2/auth/login', {
              method: 'POST',
              body: { email: userRevTarget.email, password: passRevTargetInitial }
            });
            assert.equal(login2.status, 200);
            const token2 = login2.json.token;
            assert.equal(decodeJwtPayload(token2).tv, 2);

            const recRes = await apiRequest(
              apiApp.baseUrl,
              `/api/v2/usuarios/${userRevTarget.id}/recuperar`,
              {
                method: 'POST',
                token: devToken,
                body: { nuevaPassword: passRevTargetUpdated }
              }
            );
            assert.equal(recRes.status, 200);

            const [[tvAfterRec]] = await activePool.query(
              'SELECT token_version FROM inv_usuarios WHERE id = ?',
              [userRevTarget.id]
            );
            assert.equal(Number(tvAfterRec.token_version), 3);

            const postRecMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: token2 });
            assert.equal(postRecMe.status, 401);
            const postRecArt = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: token2 });
            assert.equal(postRecArt.status, 401);

            const oldPassLogin = await apiRequest(apiApp.baseUrl, '/api/v2/auth/login', {
              method: 'POST',
              body: { email: userRevTarget.email, password: passRevTargetInitial }
            });
            assert.equal(oldPassLogin.status, 401);

            const login3 = await apiRequest(apiApp.baseUrl, '/api/v2/auth/login', {
              method: 'POST',
              body: { email: userRevTarget.email, password: passRevTargetUpdated }
            });
            assert.equal(login3.status, 200);
            const token3 = login3.json.token;
            assert.equal(decodeJwtPayload(token3).tv, 3);

            // 3E. Revocación tras PATCH /usuarios/:id/estado (Opción A: 403 desactivado, 401 tras reactivar)
            const deactRes = await apiRequest(
              apiApp.baseUrl,
              `/api/v2/usuarios/${userRevTarget.id}/estado`,
              {
                method: 'PATCH',
                token: devToken,
                body: { activo: false }
              }
            );
            assert.equal(deactRes.status, 200);
            assert.equal(deactRes.json?.activo, 0);

            const [[tvAfterDeact]] = await activePool.query(
              'SELECT token_version FROM inv_usuarios WHERE id = ?',
              [userRevTarget.id]
            );
            assert.equal(Number(tvAfterDeact.token_version), 4);

            // Mientras activo = 0, debe recibir HTTP 403 ("desactivada o suspendida")
            const deactivatedMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: token3 });
            assert.equal(deactivatedMe.status, 403);
            assert.match(deactivatedMe.json?.message || '', /desactivada|suspendida/i);

            const deactivatedArt = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: token3 });
            assert.equal(deactivatedArt.status, 403);
            assert.match(deactivatedArt.json?.message || '', /desactivada|suspendida/i);

            // Reactivar usuario (activo = 1) y verificar que token3 antiguo sigue rechazado con 401
            const reactRes = await apiRequest(
              apiApp.baseUrl,
              `/api/v2/usuarios/${userRevTarget.id}/estado`,
              {
                method: 'PATCH',
                token: devToken,
                body: { activo: true }
              }
            );
            assert.equal(reactRes.status, 200);
            assert.equal(reactRes.json?.activo, 1);

            const [[tvAfterReact]] = await activePool.query(
              'SELECT token_version FROM inv_usuarios WHERE id = ?',
              [userRevTarget.id]
            );
            assert.equal(Number(tvAfterReact.token_version), 5);

            const reactivatedOldTokenMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', {
              token: token3
            });
            assert.equal(reactivatedOldTokenMe.status, 401);
            const reactivatedOldTokenArt = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', {
              token: token3
            });
            assert.equal(reactivatedOldTokenArt.status, 401);

            // 3F. Revocación tras PUT /usuarios/:id/permisos
            const login4 = await apiRequest(apiApp.baseUrl, '/api/v2/auth/login', {
              method: 'POST',
              body: { email: userRevTarget.email, password: passRevTargetUpdated }
            });
            assert.equal(login4.status, 200);
            const token4 = login4.json.token;
            assert.equal(decodeJwtPayload(token4).tv, 5);

            const permsRes = await apiRequest(
              apiApp.baseUrl,
              `/api/v2/usuarios/${userRevTarget.id}/permisos`,
              {
                method: 'PUT',
                token: devToken,
                body: { permisos: ['inv:ver', 'camp:ver', 'rep:ver'] }
              }
            );
            assert.equal(permsRes.status, 200);

            const [[tvAfterPerms]] = await activePool.query(
              'SELECT token_version FROM inv_usuarios WHERE id = ?',
              [userRevTarget.id]
            );
            assert.equal(Number(tvAfterPerms.token_version), 6);

            const postPermsMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: token4 });
            assert.equal(postPermsMe.status, 401);
            const postPermsArt = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: token4 });
            assert.equal(postPermsArt.status, 401);
          });

          // -----------------------------------------------------------------
          // 4. Exposición /api/v2/config/entorno (A03)
          // -----------------------------------------------------------------
          await t.test('4. Exposición restringida en /api/v2/config/entorno (A03)', async () => {
            const unauth = await apiRequest(apiApp.baseUrl, '/api/v2/config/entorno');
            assert.equal(unauth.status, 401);

            for (const opToken of [sede1Token, sinSedeToken]) {
              const opRes = await apiRequest(apiApp.baseUrl, '/api/v2/config/entorno', { token: opToken });
              assert.equal(opRes.status, 200);
              assert.equal(opRes.json?.success, true);
              assert.equal(Object.hasOwn(opRes.json, 'fuenteActiva'), false);
              assert.equal(Object.hasOwn(opRes.json, 'aviso'), false);
              const serialized = JSON.stringify(opRes.json);
              assert.equal(serialized.includes(':3308'), false);
              assert.equal(serialized.includes('3308'), false);
              assert.equal(serialized.includes('ingmelec_readonly'), false);
            }

            const devRes = await apiRequest(apiApp.baseUrl, '/api/v2/config/entorno', { token: devToken });
            assert.equal(devRes.status, 200);
            assert.equal(typeof devRes.json?.fuenteActiva, 'string');
            const devSerialized = JSON.stringify(devRes.json);
            assert.equal(devSerialized.includes(':3308'), false);
            assert.equal(devSerialized.includes('ingmelec_readonly'), false);
          });

          // -----------------------------------------------------------------
          // 5. Control de Acceso, IDOR y Defecto Seguro (A01, A02)
          // -----------------------------------------------------------------
          await t.test('5. Control de Acceso Territorial, IDOR y Defecto Seguro (A01, A02)', async () => {
            const activePool = getPool();

            // 5A. Usuario sin sede y gerencia sin '*' ni sedes asignadas -> defecto seguro sin acceso
            for (const emptyUserToken of [sinSedeToken, gerenciaSinSedeToken]) {
              const artRes = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: emptyUserToken });
              assert.equal(artRes.status, 200);
              assert.deepEqual(artRes.json?.articulos, []);
              assert.equal(artRes.json?.resumen?.totalRegistros, 0);

              const campRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos', {
                token: emptyUserToken
              });
              assert.equal(campRes.status, 200);
              assert.deepEqual(campRes.json?.campamentos, []);
              assert.equal(campRes.json?.sin_sede_verificada, null);

              const kpiRes = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis', {
                token: emptyUserToken
              });
              assert.equal(kpiRes.status, 200);
              assert.equal(kpiRes.json?.kpis?.totalArticulos, 0);
              assert.equal(kpiRes.json?.kpis?.totalCampamentos, 0);
              assert.equal(kpiRes.json?.kpis?.totalAlmacenes, 0);
              assert.deepEqual(kpiRes.json?.kpis?.porCampamento, []);
              assert.deepEqual(kpiRes.json?.kpis?.porAlmacen, []);
              assert.equal(kpiRes.json?.kpis?.sinSedeVerificada, null);
              assert.deepEqual(kpiRes.json?.kpis?.campamentosPendientesValidacion, []);
              assert.deepEqual(kpiRes.json?.kpis?.levantamientosResumen, []);

              const levRes = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos', {
                token: emptyUserToken
              });
              assert.equal(levRes.status, 200);
              assert.deepEqual(levRes.json?.levantamientos, []);

              const custRes = await apiRequest(apiApp.baseUrl, '/api/v2/catalogos/custodios', {
                token: emptyUserToken
              });
              assert.equal(custRes.status, 200);
              assert.deepEqual(custRes.json?.custodios, []);

              const ubicRes = await apiRequest(apiApp.baseUrl, '/api/v2/catalogos/ubicaciones', {
                token: emptyUserToken
              });
              assert.equal(ubicRes.status, 200);
              assert.deepEqual(ubicRes.json?.ubicaciones, []);

              const detailSede1 = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/1', {
                token: emptyUserToken
              });
              assert.equal(detailSede1.status, 403);

              const detailSinSede = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/15', {
                token: emptyUserToken
              });
              assert.equal(detailSinSede.status, 403);
            }

            // 5B. Usuario restringido a Sede 1 (ALM-27FEB): Dashboard KPIs acotado y bloqueos
            const devKpiRes = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis', {
              token: devToken
            });
            assert.equal(devKpiRes.status, 200);
            assert.equal(Number(devKpiRes.json?.kpis?.totalCampamentos), 3);

            const sede1KpiRes = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis', {
              token: sede1Token
            });
            assert.equal(sede1KpiRes.status, 200);
            const kpis1 = sede1KpiRes.json.kpis;

            assert.equal(kpis1.porCampamento.length, 1);
            assert.equal(Number(kpis1.porCampamento[0].id), 1);
            assert.equal(Number(kpis1.totalCampamentos), 1);
            assert.ok(Number(kpis1.totalAlmacenes) <= 1);
            assert.equal(kpis1.sinSedeVerificada, null);
            assert.deepEqual(kpis1.campamentosPendientesValidacion, []);

            assert.equal(
              kpis1.porAlmacen.some((a) => [3, 4, 6].includes(Number(a.campamento_id))),
              false,
              'porAlmacen no debe filtrar almacenes de Sede 3, 4 o 6'
            );
            assert.equal(kpis1.levantamientosResumen.length, 1);
            assert.equal(kpis1.levantamientosResumen[0].codigo_levantamiento, 'LEV-2026-ALM-27FEB-001');
            assert.equal(
              kpis1.levantamientosResumen.some((l) => l.campamento_nombre !== 'ALMACÉN 27 DE FEBRERO'),
              false
            );

            const kpiCamp3 = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis?campamento_id=3', {
              token: sede1Token
            });
            assert.equal(kpiCamp3.status, 403);

            const kpiSinSede = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis?sin_sede=true', {
              token: sede1Token
            });
            assert.equal(kpiSinSede.status, 403);

            // 5C. POST /campamentos/:id/almacenes sin sede autorizada o sin permiso camp:operar
            const almSede3Res = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/3/almacenes', {
              method: 'POST',
              token: sede1Token,
              body: { nombre: 'Almacén IDOR OPL' }
            });
            assert.equal(almSede3Res.status, 403);

            const almNoPermRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/1/almacenes', {
              method: 'POST',
              token: sede1NoOperToken,
              body: { nombre: 'Almacén Sin Permiso' }
            });
            assert.equal(almNoPermRes.status, 403);

            // 5D. IDOR sobre artículo de OPL (id=7, campamento_id=3)
            const getOpl = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/7', { token: sede1Token });
            assert.equal(getOpl.status, 403);

            const putOpl = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/7', {
              method: 'PUT',
              token: sede1Token,
              body: { articulo_nombre: 'Modificación IDOR OPL' }
            });
            assert.equal(putOpl.status, 403);

            const delOpl = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/7', {
              method: 'DELETE',
              token: sede1Token
            });
            assert.equal(delOpl.status, 403);

            const movOpl = await apiRequest(apiApp.baseUrl, '/api/v2/movimientos', {
              method: 'POST',
              token: sede1Token,
              body: {
                articulo_id: 7,
                tipo_movimiento: 'AJUSTE',
                cantidad: 1,
                motivo: 'Intento movimiento IDOR OPL'
              }
            });
            assert.equal(movOpl.status, 403);

            // 5E. Prueba anti-.includes() (subcadena, supercadena y mismo nombre en otra sede)
            const insertPartialArticle = async ({ code, ubicacion, campId }) => {
              const [ins] = await activePool.query(
                `INSERT INTO inv_articulos (
                  codigo_original, area, categoria, articulo_nombre, serie_imei, propietario,
                  asignado_a, cantidad_num, cantidad_texto, cantidad_verificada, unidad_medida,
                  estado_fisico, ubicacion_nombre, activo, hoja_origen, fila_origen, creado_por,
                  campamento_id, es_sintetico, origen_datos, estado_vinculacion_sede
                ) VALUES (?, 'ALMACEN', 'Equipos de Taller', ?, 'SN-ANTI-INC', 'INGMELEC',
                  'Custodio AntiIncludes OPL', 1, '1', 1, 'Unidad', 'Bueno', ?, 1, 'QA', 0, 1,
                  ?, 0, 'OPERATIVO_REAL', ?)`,
                [
                  code,
                  `Activo Anti-Includes (${code})`,
                  ubicacion,
                  campId,
                  campId ? 'CONFIRMADO' : 'SEDE_AMBIGUA'
                ]
              );
              return ins.insertId;
            };

            const antiIncSubId = await insertPartialArticle({
              code: 'QA-INC-SUB',
              ubicacion: '27 DE FEBRERO',
              campId: null
            });
            const antiIncSupId = await insertPartialArticle({
              code: 'QA-INC-SUP',
              ubicacion: 'ALMACÉN 27 DE FEBRERO ANEXO OPL',
              campId: null
            });
            const antiIncOtherCampId = await insertPartialArticle({
              code: 'QA-INC-CAMP3',
              ubicacion: 'ALMACÉN 27 DE FEBRERO',
              campId: 3
            });

            for (const targetArtId of [antiIncSubId, antiIncSupId, antiIncOtherCampId]) {
              const gRes = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${targetArtId}`, {
                token: sede1Token
              });
              assert.equal(gRes.status, 403);

              const pRes = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${targetArtId}`, {
                method: 'PUT',
                token: sede1Token,
                body: { observaciones: 'Bypass partial match' }
              });
              assert.equal(pRes.status, 403);

              const dRes = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${targetArtId}`, {
                method: 'DELETE',
                token: sede1Token
              });
              assert.equal(dRes.status, 403);

              const mRes = await apiRequest(apiApp.baseUrl, '/api/v2/movimientos', {
                method: 'POST',
                token: sede1Token,
                body: {
                  articulo_id: targetArtId,
                  tipo_movimiento: 'AJUSTE',
                  cantidad: 1,
                  motivo: 'Bypass partial match'
                }
              });
              assert.equal(mRes.status, 403);
            }

            const createPartialUbicRes = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', {
              method: 'POST',
              token: sede1Token,
              body: {
                area: 'ALMACEN',
                articulo_nombre: 'Intento Alta Subcadena',
                ubicacion_nombre: '27 DE FEBRERO'
              }
            });
            assert.equal(createPartialUbicRes.status, 403);

            const listSede1Arts = await apiRequest(apiApp.baseUrl, '/api/v2/articulos?limit=500', {
              token: sede1Token
            });
            assert.equal(listSede1Arts.status, 200);
            const visibleIds = new Set(listSede1Arts.json.articulos.map((a) => Number(a.id)));
            assert.equal(visibleIds.has(antiIncSubId), false);
            assert.equal(visibleIds.has(antiIncSupId), false);
            assert.equal(visibleIds.has(antiIncOtherCampId), false);

            // 5F. Mover o editar artículo de Sede 1 (id=1) hacia campamento_id=3 -> 403
            const editDestCamp3 = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/1', {
              method: 'PUT',
              token: sede1Token,
              body: { campamento_id: 3, ubicacion_nombre: 'OPL' }
            });
            assert.equal(editDestCamp3.status, 403);

            const editDestCamp3Only = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/1', {
              method: 'PUT',
              token: sede1Token,
              body: { campamento_id: 3 }
            });
            assert.equal(editDestCamp3Only.status, 403);

            const editDestUbicOpl = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/1', {
              method: 'PUT',
              token: sede1Token,
              body: { ubicacion_nombre: 'OPL' }
            });
            assert.equal(editDestUbicOpl.status, 403);

            const moveDestCamp3 = await apiRequest(apiApp.baseUrl, '/api/v2/movimientos', {
              method: 'POST',
              token: sede1Token,
              body: {
                articulo_id: 1,
                tipo_movimiento: 'TRASLADO',
                cantidad: 1,
                campamento_id: 3,
                ubicacion_destino: 'OPL',
                motivo: 'Intento traslado a OPL'
              }
            });
            assert.equal(moveDestCamp3.status, 403);

            const moveDestCamp3Only = await apiRequest(apiApp.baseUrl, '/api/v2/movimientos', {
              method: 'POST',
              token: sede1Token,
              body: {
                articulo_id: 1,
                tipo_movimiento: 'TRASLADO',
                cantidad: 1,
                campamento_id: 3,
                motivo: 'Intento traslado camp 3'
              }
            });
            assert.equal(moveDestCamp3Only.status, 403);

            // 5G. Acceso/edición/movimiento sobre artículo activo = 0 (id=28) bloqueado
            const getInact = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/28', { token: sede1Token });
            assert.ok([400, 403, 404].includes(getInact.status));
            assert.equal(getInact.status, 404);

            const getInactFlag = await apiRequest(
              apiApp.baseUrl,
              '/api/v2/articulos/28?incluir_inactivos=true',
              { token: sede1Token }
            );
            assert.equal(getInactFlag.status, 404);

            const putInact = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/28', {
              method: 'PUT',
              token: sede1Token,
              body: { articulo_nombre: 'Editar Inactivo' }
            });
            assert.ok([400, 403, 404].includes(putInact.status));
            assert.equal(putInact.status, 404);

            const delInact = await apiRequest(apiApp.baseUrl, '/api/v2/articulos/28', {
              method: 'DELETE',
              token: sede1Token
            });
            assert.ok([400, 403, 404].includes(delInact.status));
            assert.equal(delInact.status, 404);

            const movInact = await apiRequest(apiApp.baseUrl, '/api/v2/movimientos', {
              method: 'POST',
              token: sede1Token,
              body: {
                articulo_id: 28,
                tipo_movimiento: 'ENTRADA',
                cantidad: 1,
                motivo: 'Intento mover inactivo'
              }
            });
            assert.ok([400, 403, 404].includes(movInact.status));
            assert.equal(movInact.status, 404);

            // 5H. Catálogos custodios y ubicaciones acotados a Sede 1 (sin fugas externas)
            const custRes = await apiRequest(apiApp.baseUrl, '/api/v2/catalogos/custodios', {
              token: sede1Token
            });
            assert.equal(custRes.status, 200);
            const custNames = custRes.json.custodios.map((c) => c.nombre);
            assert.ok(custNames.includes('Custodio Sintético Alfa'));
            assert.ok(custNames.includes('Custodio Sintético Beta'));
            assert.equal(custNames.includes('Custodio Sintético Epsilon'), false);
            assert.equal(custNames.includes('Custodio Sintético Zeta'), false);
            assert.equal(custNames.includes('Custodio Sandbox Sintético'), false);
            assert.equal(custNames.includes('Custodio AntiIncludes OPL'), false);
            assert.equal(
              custRes.json.custodios.every((c) => c.departamento === null && c.telefono === null),
              true
            );

            const ubicRes = await apiRequest(apiApp.baseUrl, '/api/v2/catalogos/ubicaciones', {
              token: sede1Token
            });
            assert.equal(ubicRes.status, 200);
            const ubicNames = ubicRes.json.ubicaciones.map((u) => u.nombre);
            assert.ok(ubicNames.includes('ALMACÉN 27 DE FEBRERO'));
            for (const forbiddenUbic of [
              'OPL',
              'KM 19 AUTOPISTA DUARTE OPL',
              'MANTENIMIENTO 633',
              'SAN CRISTÓBAL',
              'KM 19 AUT DUARTE',
              'CAMPAMENTO SANDBOX SINTETICO',
              '27 DE FEBRERO',
              'ALMACÉN 27 DE FEBRERO ANEXO OPL'
            ]) {
              assert.equal(
                ubicNames.includes(forbiddenUbic),
                false,
                `No debía exponer ubicación ajena: ${forbiddenUbic}`
              );
            }

            // 5I. Verificaciones IDOR adicionales en usuarios, levantamientos, movimientos y reportes
            const usersNonDev = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', { token: sede1Token });
            assert.equal(usersNonDev.status, 403);

            const levOpl = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2', { token: sede1Token });
            assert.equal(levOpl.status, 403);

            const levOplItems = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2/items', {
              token: sede1Token
            });
            assert.equal(levOplItems.status, 403);

            const putLevOpl = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2', {
              method: 'PUT',
              token: sede1Token,
              body: { titulo: 'Intento IDOR OPL' }
            });
            assert.equal(putLevOpl.status, 403);

            const [openOplLevIns] = await activePool.query(
              `INSERT INTO inv_levantamientos (
                codigo_levantamiento, titulo, campamento_id, almacen_id, fecha_inicio,
                responsable_levantamiento, estado, creado_por, es_sintetico
              ) VALUES ('LEV-QA-OPL-OPEN', 'Sesión Abierta OPL QA', 3, 2, '2026-11-10', 'QA', 'En proceso', 1, 0)`
            );
            const openOplLevId = openOplLevIns.insertId;

            const levItemOplOpen = await apiRequest(
              apiApp.baseUrl,
              `/api/v2/levantamientos/${openOplLevId}/items`,
              {
                method: 'POST',
                token: sede1Token,
                body: { area: 'ALMACEN', categoria: 'General', articulo_nombre: 'IDOR Item OPL', cantidad: 1 }
              }
            );
            assert.equal(levItemOplOpen.status, 403);

            const movListRes = await apiRequest(apiApp.baseUrl, '/api/v2/movimientos', { token: sede1Token });
            assert.equal(movListRes.status, 200);
            assert.equal(
              movListRes.json.movimientos.some((m) => Number(m.campamento_id) !== 1),
              false,
              'GET /movimientos no debe incluir movimientos de otras sedes'
            );

            const repOpl = await apiRequest(
              apiApp.baseUrl,
              '/api/v2/reportes/consolidado?campamento_id=3',
              { token: sede1Token }
            );
            assert.equal(repOpl.status, 403);
          });
        } finally {
          await apiApp.close();
        }

        // -----------------------------------------------------------------
        // 6. CORS Whitelist, Headers HTTP, Límite 1MB vs 10MB y Rate Limit (M05, A05)
        // -----------------------------------------------------------------
        await t.test('6A. CORS Whitelist, Headers HTTP y límites 1MB vs 10MB en server/index.js', async () => {
          const port = await getAvailablePort(5111);
          spawnedServerPorts.push(port);
          const baseUrl = `http://127.0.0.1:${port}`;
          const { child, serverLogs } = spawnRealServerProcess(port);

          try {
            await waitForServerHealth(baseUrl, child, serverLogs);

            // CORS rechazado (403 JSON sin Access-Control-Allow-Origin)
            const badOriginGet = await apiRequest(baseUrl, '/api/v2/articulos', {
              headers: { Origin: 'https://attacker.example' }
            });
            assert.equal(badOriginGet.status, 403);
            assert.equal(badOriginGet.json?.success, false);
            assert.equal(badOriginGet.headers.get('access-control-allow-origin'), null);

            const badOriginPreflight = await apiRequest(baseUrl, '/api/v2/auth/login', {
              method: 'OPTIONS',
              headers: {
                Origin: 'https://attacker.example',
                'Access-Control-Request-Method': 'POST'
              }
            });
            assert.equal(badOriginPreflight.status, 403);
            assert.equal(badOriginPreflight.headers.get('access-control-allow-origin'), null);

            const nullOriginRes = await apiRequest(baseUrl, '/health', {
              headers: { Origin: 'null' }
            });
            assert.equal(nullOriginRes.status, 403);
            assert.equal(nullOriginRes.headers.get('access-control-allow-origin'), null);

            // CORS permitido en test/dev (http://localhost:5173)
            const devOriginRes = await apiRequest(baseUrl, '/health', {
              headers: { Origin: 'http://localhost:5173' }
            });
            assert.equal(devOriginRes.status, 200);
            assert.equal(devOriginRes.headers.get('access-control-allow-origin'), 'http://localhost:5173');

            const devOriginPreflight = await apiRequest(baseUrl, '/api/v2/auth/login', {
              method: 'OPTIONS',
              headers: {
                Origin: 'http://localhost:5173',
                'Access-Control-Request-Method': 'POST'
              }
            });
            assert.equal(devOriginPreflight.status, 204);
            assert.equal(
              devOriginPreflight.headers.get('access-control-allow-origin'),
              'http://localhost:5173'
            );

            // Headers de seguridad HTTP defensiva
            assert.match(devOriginRes.headers.get('content-security-policy') || '', /default-src 'self'/);
            assert.match(devOriginRes.headers.get('permissions-policy') || '', /camera=\(\)/);
            assert.equal(devOriginRes.headers.get('x-content-type-options'), 'nosniff');
            assert.equal(devOriginRes.headers.get('x-frame-options'), 'SAMEORIGIN');
            assert.equal(devOriginRes.headers.get('x-powered-by'), null);
            assert.equal(devOriginRes.headers.get('x-xss-protection'), null);

            // Límite > 1 MB rechazado con 413 en /api/v2/auth/login
            const oversizedLoginBody = JSON.stringify({
              email: 'oversize@ingmelec-test.local',
              password: 'DummyPassword123',
              padding: 'A'.repeat(1_250_000)
            });
            const login413 = await apiRequest(baseUrl, '/api/v2/auth/login', {
              method: 'POST',
              body: oversizedLoginBody
            });
            assert.equal(login413.status, 413);
            assert.equal(login413.json?.success, false);

            // Límite > 1 MB y < 10 MB aceptado en POST /api/v2/levantamientos/:id/items
            const sede1Token = signTestJwt(userSede1Ops);
            const largePhotoPayload = JSON.stringify({
              area: 'ALMACEN',
              categoria: 'Equipos de Taller',
              articulo_nombre: 'Equipo Evidencia Base64 >1MB QA',
              cantidad: 1,
              estado_fisico: 'Bueno',
              evidencia_foto: `data:image/jpeg;base64,${'A'.repeat(1_400_000)}`
            });
            assert.ok(Buffer.byteLength(largePhotoPayload, 'utf8') > 1_048_576);
            assert.ok(Buffer.byteLength(largePhotoPayload, 'utf8') < 10 * 1024 * 1024);

            const levItemRes = await apiRequest(baseUrl, '/api/v2/levantamientos/1/items', {
              method: 'POST',
              token: sede1Token,
              body: largePhotoPayload
            });
            assert.equal(levItemRes.status, 201);
            assert.equal(levItemRes.json?.success, true);
            assert.ok(Number(levItemRes.json?.id) > 0);
          } finally {
            await stopChildProcess(child);
          }
        });

        await t.test('6B. Rate Limit en subproceso separado con TRUST_PROXY=false bloquea rotación X-Forwarded-For (429)', async () => {
          const port = await getAvailablePort(5112);
          spawnedServerPorts.push(port);
          const baseUrl = `http://127.0.0.1:${port}`;
          const { child, serverLogs } = spawnRealServerProcess(port, { TRUST_PROXY: 'false' });

          try {
            await waitForServerHealth(baseUrl, child, serverLogs);

            const statuses = [];
            for (let i = 0; i < 16; i += 1) {
              const res = await apiRequest(baseUrl, '/api/v2/auth/login', {
                method: 'POST',
                headers: {
                  'X-Forwarded-For': `203.0.113.${i + 1}`
                },
                body: {
                  email: `ratelimit-${i}@ingmelec-test.local`,
                  password: 'InvalidSyntheticPassword123'
                }
              });
              statuses.push(res.status);
            }

            for (let i = 0; i < 15; i += 1) {
              assert.equal(statuses[i], 401, `Intento ${i + 1} debía devolver 401`);
            }
            assert.equal(
              statuses[15],
              429,
              'El intento 16 debía ser bloqueado con HTTP 429 aunque rotara X-Forwarded-For'
            );
          } finally {
            await stopChildProcess(child);
          }
        });

        await closePool();
      },
      {
        host: '127.0.0.1',
        port: MARIADB_PORT,
        datadir: MARIADB_DATADIR,
        database: ISOLATED_DB_NAME
      }
    );

    await closePool();

    await t.test('7. Confirmación de cierre limpio sin procesos huérfanos en puertos de prueba', async () => {
      await assertPortClosed('127.0.0.1', MARIADB_PORT);
      for (const port of spawnedServerPorts) {
        await assertPortClosed('127.0.0.1', port);
      }
    });
  });
});
