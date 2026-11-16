import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
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

// Fijar entorno estrictamente aislado ANTES de importar server/database/db.js
// para evitar que dotenv cargue variables remotas/productivas desde .env.
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
}

applyIsolatedBaselineEnv();

const { getPool, resetPool, closePool } = await import('../database/db.js');
const { assertLocalIsolatedTarget } = await import('../database/guard.js');
const { withLocalMariaDb } = await import('./helpers/local-mariadb.mjs');
const { wrapMysql8JsonPool } = await import('./fixtures/mysql8_json_shim.mjs');

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

  resetPool();
  try {
    return await fn();
  } finally {
    resetPool();
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function getAvailablePort(preferredPort = 5099) {
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

function assertPortClosed(host, port, timeoutMs = 1500) {
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

function createSyntheticHs256Jwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Date.now() + 60 * 60 * 1000
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function waitForServerHealth(baseUrl, childProcess, logsBuffer, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      throw new Error(
        `El servidor de prueba salió prematuramente (code=${childProcess.exitCode}, signal=${childProcess.signalCode}). Logs:\n${logsBuffer.join('')}`
      );
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return response;
      }
    } catch {
      // Servidor aún arrancando
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
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
  if (childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGKILL');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

describe('ETAPA 1 QA Independiente - Aislamiento Local v2.1', () => {
  test('1. Verificación de rama Git, cambios preservados e ignorado de server/tests/', () => {
    const branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();
    assert.match(branch, /^(main|develop\/almacen-v2\.1|feature\/estabilizacion-v2\.1\.1)$/);

    assert.equal(fs.existsSync(path.join(REPO_ROOT, '.gitignore')), true);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, 'server', 'scripts', 'recovery-developer.js')), true);

    const auditDocPath = path.join(
      REPO_ROOT,
      'docs',
      'auditorias',
      'AUDITORIA_INTEGRAL_PRE_ACTUALIZACIONES.md'
    );
    assert.equal(fs.existsSync(auditDocPath), true);
    assert.ok(fs.statSync(auditDocPath).size > 0);

    const rootGitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    assert.match(rootGitignore, /^server\/tests\/\*\.db$/m);
    assert.match(rootGitignore, /^server\/tests\/e2e_playwright_cdp_disposable\.mjs$/m);

    const checkIgnoreOutput = execFileSync(
      'git',
      ['check-ignore', '-v', 'server/tests/test.db', 'server/tests/debug.log', 'server/tests/e2e_playwright_cdp_disposable.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    assert.match(checkIgnoreOutput, /\.gitignore:.*(?:server\/)?tests\/(?:\*\*\/)?\*\.db/);
    assert.match(checkIgnoreOutput, /\.gitignore:.*e2e_playwright_cdp_disposable\.mjs/);
  });

  test('2. Prueba negativa de bloqueo de producción en getPool(), guard.js y CLI assertSafeDatabaseTarget()', async () => {
    const cleverCloudHosts = [
      'dummy-test-mysql.services.clever-cloud.com',
      'qa-dummy.services.clever-cloud.com',
      'demo-app.cleverapps.io'
    ];

    for (const remoteHost of cleverCloudHosts) {
      await withEnvOverrides(
        {
          NODE_ENV: 'test',
          ISOLATED_LOCAL_ONLY: 'true',
          BLOCK_REMOTE_DB: 'true',
          DB_HOST: remoteHost,
          DB_NAME: ISOLATED_DB_NAME
        },
        async () => {
          assert.throws(
            () => getPool(),
            /Clever Cloud|BLOQUEO DE SEGURIDAD/i,
            `getPool() debe bloquear host Clever Cloud: ${remoteHost}`
          );
          assert.throws(
            () => assertLocalIsolatedTarget({ host: remoteHost, database: ISOLATED_DB_NAME }),
            /Clever Cloud|BLOQUEO DE SEGURIDAD/i
          );
        }
      );
    }

    for (const remoteTarget of ['192.168.1.50', 'db.example.com']) {
      await withEnvOverrides(
        {
          NODE_ENV: 'test',
          ISOLATED_LOCAL_ONLY: 'true',
          BLOCK_REMOTE_DB: 'true',
          DB_HOST: remoteTarget,
          DB_NAME: ISOLATED_DB_NAME
        },
        async () => {
          assert.throws(
            () => getPool(),
            /Host no local bloqueado|BLOQUEO DE SEGURIDAD/i,
            `getPool() debe bloquear host remoto: ${remoteTarget}`
          );
          assert.throws(
            () => assertLocalIsolatedTarget({ host: remoteTarget, database: ISOLATED_DB_NAME }),
            /Host no local bloqueado|BLOQUEO DE SEGURIDAD/i
          );
        }
      );
    }

    await withEnvOverrides(
      {
        NODE_ENV: 'test',
        ISOLATED_LOCAL_ONLY: 'true',
        BLOCK_REMOTE_DB: 'true',
        DB_HOST: '',
        DB_NAME: ISOLATED_DB_NAME
      },
      async () => {
        assert.throws(
          () => getPool(),
          /DB_HOST vacío|BLOQUEO DE SEGURIDAD/i,
          'getPool() debe rechazar DB_HOST vacío'
        );
        assert.throws(
          () => assertLocalIsolatedTarget({ host: '', database: ISOLATED_DB_NAME }),
          /DB_HOST vacío|BLOQUEO DE SEGURIDAD/i
        );
      }
    );

    await withEnvOverrides(
      {
        NODE_ENV: 'test',
        ISOLATED_LOCAL_ONLY: 'true',
        BLOCK_REMOTE_DB: 'true',
        ALLOW_LOCAL_PRODUCTION_DB: 'false',
        DB_HOST: '127.0.0.1',
        DB_NAME: 'gridops_enterprise'
      },
      async () => {
        assert.throws(
          () => getPool(),
          /gridops_enterprise.*bloqueada|BLOQUEO DE SEGURIDAD/i,
          'getPool() debe bloquear gridops_enterprise sin permiso explícito'
        );
        assert.throws(
          () => assertLocalIsolatedTarget({ host: '127.0.0.1', database: 'gridops_enterprise' }),
          /gridops_enterprise.*bloqueada|BLOQUEO DE SEGURIDAD/i
        );
      }
    );

    const cliCases = [
      {
        label: 'Clever Cloud host',
        dbHost: 'dummy-test-mysql.services.clever-cloud.com',
        expectedPattern: /BLOQUEO DE SEGURIDAD CRÍTICO/i
      },
      {
        label: 'Remote IP',
        dbHost: '192.168.1.50',
        expectedPattern: /BLOQUEO DE SEGURIDAD CRÍTICO/i
      },
      {
        label: 'Empty DB_HOST',
        dbHost: '',
        expectedPattern: /DB_HOST está vacío o no definido/i
      }
    ];

    for (const cliCase of cliCases) {
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import { assertSafeDatabaseTarget } from './server/database/guard.js'; assertSafeDatabaseTarget('QA-CLI-Check');"
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            NODE_ENV: 'test',
            ENVIRONMENT: 'isolated_test',
            ALLOW_DESTRUCTIVE_OPERATIONS: 'true',
            DB_HOST: cliCase.dbHost,
            DB_NAME: ISOLATED_DB_NAME
          }
        }
      );

      assert.equal(
        result.status,
        1,
        `assertSafeDatabaseTarget() debía salir con código 1 para ${cliCase.label}`
      );
      assert.match(result.stderr, cliCase.expectedPattern);
    }
  });

  test('3 y 4. Fixture sintético en MariaDB 3310, shim MySQL 8 JSON, arranque real Express + dist y apagado limpio', async (t) => {
    let observedExpressPort = null;

    await withLocalMariaDb(
      async (instance) => {
        assert.equal(instance.host, '127.0.0.1');
        assert.equal(instance.port, MARIADB_PORT);
        assert.equal(instance.database, ISOLATED_DB_NAME);
        assert.equal(instance.reused, false);

        instance.applyEnv(process.env);
        applyIsolatedBaselineEnv();

        await t.test('3A. Carga íntegra del fixture sintético y verificación de conteos y casos críticos', async () => {
          await closePool();
          const setupPool = getPool(null, { allowMultipleStatements: true });

          const [metaRows] = await setupPool.query(
            'SELECT @@port AS port, @@datadir AS datadir, DATABASE() AS db;'
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
          const pool = getPool();

          const tableCounts = async (table) => {
            const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
            return Number(rows[0].total);
          };

          assert.equal(await tableCounts('inv_campamentos'), 6);
          assert.equal(await tableCounts('inv_almacenes'), 4);
          assert.equal(await tableCounts('inv_usuarios'), 7);
          assert.equal(await tableCounts('inv_articulos'), 29);
          assert.equal(await tableCounts('inv_auditoria'), 5);
          assert.equal(await tableCounts('inv_levantamientos'), 4);
          assert.equal(await tableCounts('inv_levantamiento_items'), 10);

          const [specialRows] = await pool.query(`
            SELECT
              SUM(CASE WHEN campamento_id = 3 OR ubicacion_nombre LIKE '%OPL%' THEN 1 ELSE 0 END) AS casos_opl,
              SUM(CASE WHEN ubicacion_nombre LIKE '%KM%19%' THEN 1 ELSE 0 END) AS casos_km19,
              SUM(CASE WHEN ubicacion_nombre LIKE '%MANTENIMIENTO%' THEN 1 ELSE 0 END) AS casos_mantenimiento,
              SUM(CASE WHEN codigo_original = 'HER-258' THEN 1 ELSE 0 END) AS casos_her258,
              SUM(CASE WHEN codigo_original = 'HER-252' THEN 1 ELSE 0 END) AS casos_her252,
              SUM(CASE WHEN cantidad_num IS NULL THEN 1 ELSE 0 END) AS casos_cantidad_null,
              SUM(
                CASE
                  WHEN serie_imei IS NULL
                    OR TRIM(serie_imei) = ''
                    OR UPPER(TRIM(serie_imei)) IN ('N/A', 'S/N', 'SIN SERIAL', 'NO APLICA', 'SIN SERIE', '--', '-', 'NONE', 'NULL')
                  THEN 1 ELSE 0
                END
              ) AS casos_sin_serial,
              SUM(CASE WHEN es_sintetico = 1 THEN 1 ELSE 0 END) AS casos_sinteticos,
              SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) AS casos_inactivos,
              SUM(CASE WHEN activo = 1 AND es_sintetico = 0 THEN 1 ELSE 0 END) AS casos_activos_operativos
            FROM inv_articulos
          `);

          const stats = specialRows[0];
          assert.equal(Number(stats.casos_opl), 6);
          assert.equal(Number(stats.casos_km19), 7);
          assert.equal(Number(stats.casos_mantenimiento), 7);
          assert.equal(Number(stats.casos_her258), 2);
          assert.equal(Number(stats.casos_her252), 2);
          assert.equal(Number(stats.casos_cantidad_null), 5);
          assert.equal(Number(stats.casos_sin_serial), 10);
          assert.equal(Number(stats.casos_sinteticos), 3);
          assert.equal(Number(stats.casos_inactivos), 2);
          assert.equal(Number(stats.casos_activos_operativos), 25);
        });

        await t.test('3B. Simulación MySQL 8 JSON con wrapMysql8JsonPool sobre MariaDB 3310', async () => {
          const rawPool = getPool();

          // En mysql2@3.24.6+, MariaDB puede entregar columnas JSON como string u object
          const [rawAuditRows] = await rawPool.query(
            'SELECT id, detalles_previos, detalles_nuevos FROM inv_auditoria WHERE id = 1'
          );
          assert.notEqual(rawAuditRows[0].detalles_previos, null);
          assert.notEqual(rawAuditRows[0].detalles_nuevos, null);
          assert.ok(
            ['string', 'object'].includes(typeof rawAuditRows[0].detalles_previos),
            `Tipo inesperado para detalles_previos crudo: ${typeof rawAuditRows[0].detalles_previos}`
          );
          assert.ok(
            ['string', 'object'].includes(typeof rawAuditRows[0].detalles_nuevos),
            `Tipo inesperado para detalles_nuevos crudo: ${typeof rawAuditRows[0].detalles_nuevos}`
          );

          const jsonPool = wrapMysql8JsonPool(rawPool);

          const [auditRows] = await jsonPool.query(
            'SELECT id, detalles_previos, detalles_nuevos FROM inv_auditoria ORDER BY id ASC'
          );
          assert.equal(auditRows.length, 5);
          assert.equal(typeof auditRows[0].detalles_previos, 'object');
          assert.notEqual(auditRows[0].detalles_previos, null);
          assert.equal(Object.hasOwn(auditRows[0].detalles_previos, 'activo'), true);
          assert.equal(auditRows[0].detalles_previos.activo, 1);

          assert.equal(typeof auditRows[0].detalles_nuevos, 'object');
          assert.notEqual(auditRows[0].detalles_nuevos, null);
          assert.equal(Object.hasOwn(auditRows[0].detalles_nuevos, 'activo'), true);
          assert.equal(auditRows[0].detalles_nuevos.activo, 0);

          assert.equal(Array.isArray(auditRows[2].detalles_nuevos.permisos), true);
          assert.equal(auditRows[4].detalles_previos, null);
          assert.equal(auditRows[4].detalles_nuevos, null);

          const [userRows] = await jsonPool.query(
            'SELECT id, rol, permisos_json FROM inv_usuarios ORDER BY id ASC'
          );
          assert.equal(userRows.length, 7);
          for (const user of userRows) {
            assert.equal(
              Array.isArray(user.permisos_json),
              true,
              `permisos_json de usuario id=${user.id} debe ser Array`
            );
          }
          assert.deepEqual(userRows[0].permisos_json, ['*']);

          const conn = await jsonPool.getConnection();
          try {
            const [execUsers] = await conn.execute(
              'SELECT id, permisos_json FROM inv_usuarios WHERE id = ?',
              [2]
            );
            assert.equal(Array.isArray(execUsers[0].permisos_json), true);
            assert.ok(execUsers[0].permisos_json.includes('inv:ver'));
          } finally {
            conn.release();
          }

          await closePool();
        });

        await t.test('4. Arranque real de server/index.js sobre MariaDB 3310 y verificación HTTP end-to-end', async () => {
          const port = await getAvailablePort(5099);
          observedExpressPort = port;
          const baseUrl = `http://127.0.0.1:${port}`;
          const ephemeralJwtSecret = crypto.randomBytes(32).toString('hex');
          assert.ok(ephemeralJwtSecret.length >= 40);

          const serverLogs = [];
          const captureLog = (chunk) => {
            serverLogs.push(chunk.toString());
            if (serverLogs.length > 60) {
              serverLogs.shift();
            }
          };

          const serverProc = spawn(process.execPath, ['server/index.js'], {
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
              JWT_SECRET: ephemeralJwtSecret,
              DB_HOST: '127.0.0.1',
              DB_PORT: String(MARIADB_PORT),
              DB_USER: 'root',
              DB_PASSWORD: '',
              DB_NAME: ISOLATED_DB_NAME,
              DB_SSL: 'false'
            }
          });

          serverProc.stdout.on('data', captureLog);
          serverProc.stderr.on('data', captureLog);

          try {
            const healthRes = await waitForServerHealth(baseUrl, serverProc, serverLogs);
            assert.equal(healthRes.status, 200);
            const healthJson = await healthRes.json();
            assert.equal(healthJson.status, 'ok');
            assert.match(healthJson.service, /INGMELEC/);

            const legacyRes = await fetch(`${baseUrl}/api/articulos`);
            assert.equal(legacyRes.status, 404);
            const legacyJson = await legacyRes.json();
            assert.equal(legacyJson.success, false);
            assert.match(legacyJson.message, /\/api\/v2/);

            const unauthRes = await fetch(`${baseUrl}/api/v2/articulos`);
            assert.equal(unauthRes.status, 401);
            const unauthJson = await unauthRes.json();
            assert.equal(unauthJson.success, false);

            const syntheticDevJwt = createSyntheticHs256Jwt(
              {
                id: 1,
                email: 'dev.sintetico@ingmelec-test.local',
                nombre: 'Dev Sintético Principal',
                rol: 'developer',
                es_developer: 1
              },
              ephemeralJwtSecret
            );

            const authRes = await fetch(`${baseUrl}/api/v2/articulos`, {
              headers: {
                Authorization: `Bearer ${syntheticDevJwt}`
              }
            });
            assert.equal(authRes.status, 200);
            const authJson = await authRes.json();
            assert.equal(authJson.success, true);
            assert.equal(Array.isArray(authJson.articulos), true);
            assert.equal(authJson.articulos.length, 25);
            assert.equal(authJson.resumen.totalRegistros, 25);
            assert.ok(authJson.articulos.some((a) => a.codigo_original === 'INF-9001'));
            assert.equal(
              authJson.articulos.filter((a) => a.codigo_original === 'HER-258').length,
              2
            );

            const synthRes = await fetch(`${baseUrl}/api/v2/articulos?incluir_sinteticos=true`, {
              headers: {
                Authorization: `Bearer ${syntheticDevJwt}`
              }
            });
            assert.equal(synthRes.status, 200);
            const synthJson = await synthRes.json();
            assert.equal(synthJson.articulos.length, 27);

            const spaRes = await fetch(`${baseUrl}/`);
            assert.equal(spaRes.status, 200);
            assert.match(spaRes.headers.get('content-type') || '', /text\/html/i);
            const spaHtml = await spaRes.text();
            assert.match(spaHtml, /INGMELEC/);
            assert.match(spaHtml, /<div id="root"><\/div>/);
          } finally {
            await stopChildProcess(serverProc);
          }
        });
      },
      {
        host: '127.0.0.1',
        port: MARIADB_PORT,
        datadir: MARIADB_DATADIR,
        database: ISOLATED_DB_NAME
      }
    );

    await closePool();

    await t.test('5. Confirmación de apagado limpio sin procesos huérfanos en puertos de prueba', async () => {
      await assertPortClosed('127.0.0.1', MARIADB_PORT);
      if (observedExpressPort !== null) {
        await assertPortClosed('127.0.0.1', observedExpressPort);
      }
    });
  });
});
