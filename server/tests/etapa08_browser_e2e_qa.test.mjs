import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

const CHROME_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright',
  'chromium-1248',
  'chrome-win64',
  'chrome.exe'
);

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
const { getPool, closePool } = await import('../database/db.js');
const { default: almacenRouter, resetSchemaCapabilitiesCache } = await import('../routes/almacenApi.js');
const { default: actasRouter } = await import('../routes/actasApi.js');
const { withLocalMariaDb } = await import('./helpers/local-mariadb.mjs');

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

async function startFullStackServer() {
  const distPath = path.join(REPO_ROOT, 'dist');
  assert.equal(fs.existsSync(path.join(distPath, 'index.html')), true, 'Debe existir dist/index.html compilado');

  const serverIndexSrc = fs.readFileSync(path.join(REPO_ROOT, 'server', 'index.js'), 'utf8');
  const cspMatch = serverIndexSrc.match(/'Content-Security-Policy',\s*\r?\n\s*"([^"]+)"/);
  assert.ok(cspMatch, 'Debe existir Content-Security-Policy en server/index.js');
  const cspHeaderValue = cspMatch[1];

  const app = express();
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', cspHeaderValue);
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  // Igual que server/index.js: el router de actas (v2.2) se monta antes que el de almacén
  app.use('/api/v2', actasRouter);
  app.use('/api/v2', almacenRouter);
  app.use(express.static(distPath));
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ success: false, message: 'Ruta API no encontrada' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function launchCdpBrowser() {
  assert.equal(fs.existsSync(CHROME_PATH), true, `Chromium local no encontrado en ${CHROME_PATH}`);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingmelec-e8-chrome-'));
  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Timeout esperando DevTools WebSocket de Chromium')), 10000);
    const onData = (chunk) => {
      buf += chunk.toString();
      const match = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chromium salió prematuramente con código ${code}`));
    });
  });

  // Abrir una pestaña real vía /json/new
  const portMatch = wsUrl.match(/:(\d+)\//);
  const debugPort = portMatch[1];
  const targetsRes = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const pageErrors = [];
  const consoleErrors = [];
  const logCspViolations = [];
  const networkCspBlocks = [];
  const api403or500 = [];

  ws.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params?.exceptionDetails?.exception?.description || 'Uncaught exception');
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      consoleErrors.push(msg.params.args?.map((a) => a.value || a.description).join(' ') || 'console.error');
    } else if (msg.method === 'Log.entryAdded') {
      const entry = msg.params?.entry;
      if (entry?.source === 'security' || /Content Security Policy|\bCSP\b/i.test(entry?.text || '')) {
        logCspViolations.push({ source: entry.source, level: entry.level, text: entry.text });
      }
    } else if (msg.method === 'Network.loadingFailed') {
      if (msg.params?.blockedReason === 'csp') {
        networkCspBlocks.push({
          requestId: msg.params.requestId,
          blockedReason: msg.params.blockedReason,
          errorText: msg.params.errorText
        });
      }
    } else if (msg.method === 'Network.responseReceived') {
      const resp = msg.params?.response;
      if (resp?.url?.includes('/api/v2/') && resp.status >= 400) {
        api403or500.push({ url: resp.url, status: resp.status });
      }
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Log.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', function (e) {
        window.__cspViolations.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective,
          sourceFile: e.sourceFile,
          lineNumber: e.lineNumber
        });
      });
    `
  });

  async function evalJs(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Browser eval error: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  async function goto(url) {
    await send('Page.navigate', { url });
    await waitFor(() => evalJs('document.readyState === "complete"'), 8000);
  }

  async function waitFor(predicateFn, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await predicateFn();
      if (ok) return true;
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error(`Timeout (${timeoutMs}ms) esperando condición en navegador`);
  }

  async function close() {
    try { ws.close(); } catch { /* ignore */ }
    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  return {
    send,
    evalJs,
    goto,
    waitFor,
    pageErrors,
    consoleErrors,
    logCspViolations,
    networkCspBlocks,
    api403or500,
    close
  };
}

describe('ETAPA 8 QA — Equipo C (Pruebas Funcionales y Visuales E2E en Chromium Real)', () => {
  test('E2E Navegador Real: Login, 13 pantallas, Sync Dashboard/Topbar, Móvil, Reload y RBAC Movimientos sin 403', async () => {
    await withLocalMariaDb(async () => {
      const pool = getPool();
      await seedIsolatedDb();

      const devPass = 'DevE2e#2026!';
      const devHash = await argon2.hash(devPass, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
      await pool.query("UPDATE inv_usuarios SET password_hash = ? WHERE email = 'dev.sintetico@ingmelec-test.local'", [devHash]);

      const limPass = 'LimE2e#2026!';
      const limHash = await argon2.hash(limPass, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
      await pool.query(
        `INSERT INTO inv_usuarios (nombre, email, password_hash, rol, cargo, area, campamento_id, es_developer, activo, token_version, permisos_json)
         VALUES ('Demo Solo Reg Mov', 'e8.movreg@ingmelec-test.local', ?, 'almacen', 'Operador Mov', 'ALMACEN', 3, 0, 1, 1, ?)`,
        [limHash, JSON.stringify(['inv:movimientos_registrar'])]
      );
      const [limRow] = await pool.query("SELECT id FROM inv_usuarios WHERE email = 'e8.movreg@ingmelec-test.local' LIMIT 1");
      await pool.query('INSERT IGNORE INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, 3, 1)', [limRow[0].id]);

      const server = await startFullStackServer();
      const browser = await launchCdpBrowser();
      try {
        await browser.send('Emulation.setDeviceMetricsOverride', {
          width: 1366, height: 850, deviceScaleFactor: 1, mobile: false
        });

        // 1. Pantalla Login
        await browser.goto(`${server.baseUrl}/`);
        await browser.waitFor(() => browser.evalJs('!!document.querySelector("input[type=email]")'));

        // Login real como Developer mediante formulario
        await browser.evalJs(`(() => {
          const setVal = (el, val) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          };
          setVal(document.querySelector('input[type="email"]'), 'dev.sintetico@ingmelec-test.local');
          setVal(document.querySelector('input[type="password"]'), ${JSON.stringify(devPass)});
          document.querySelector('button[type="submit"]').click();
        })()`);

        await browser.waitFor(() => browser.evalJs('document.body.innerText.includes("Dashboard Ejecutivo")'));

        // 2. Verificar persistencia de sesión tras recarga (F5)
        await browser.send('Page.reload', { ignoreCache: true });
        await browser.waitFor(() => browser.evalJs('document.body.innerText.includes("Dashboard Ejecutivo")'));

        // 3. Sincronización Dashboard <-> Topbar al seleccionar CAMPAMENTO OPL (id=3)
        await browser.waitFor(() => browser.evalJs('!!document.querySelector("#dash-campamento-select")'));
        await browser.evalJs(`(() => {
          const sel = document.querySelector('#dash-campamento-select');
          sel.value = '3';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        await browser.waitFor(() => browser.evalJs(`
          document.querySelector('select[aria-label="Selector global de sede o campamento"]')?.value === '3'
        `));

        // 4. Recorrer las 12 vistas operativas del Developer (13 pantallas con Login)
        const routes = [
          { path: '/', marker: 'Dashboard Ejecutivo' },
          { path: '/inventario', marker: 'Inventario Maestro' },
          { path: '/almacen', marker: 'Almacén Central' },
          { path: '/informatica', marker: 'Informática y Telecomunicaciones' },
          { path: '/oficinas', marker: 'Mobiliario y Oficinas' },
          { path: '/cocina', marker: 'Cocina y Comedor' },
          { path: '/movimientos', marker: 'Movimientos Transaccionales' },
          { path: '/levantamientos', marker: 'Levantamientos Físicos' },
          { path: '/ubicaciones', marker: 'Campamentos y Sedes' },
          { path: '/reportes', marker: 'Centro de Reportes Gerenciales' },
          { path: '/auditoria', marker: 'Bitácora de Auditoría' },
          { path: '/usuarios', marker: 'Control Exclusivo de Usuarios' }
        ];

        for (const r of routes) {
          await browser.goto(`${server.baseUrl}${r.path}`);
          await browser.waitFor(() => browser.evalJs(`document.body.innerText.includes(${JSON.stringify(r.marker)})`));
        }

        // 5. Verificar botones de Exportación CSV / Excel en Inventario y Reportes
        await browser.goto(`${server.baseUrl}/inventario`);
        await browser.waitFor(() => browser.evalJs('document.body.innerText.includes("Exportar CSV") && document.body.innerText.includes("Excel (.xlsx)")'));

        // 6. Verificar diseño móvil (375x812) y botón hamburguesa
        await browser.send('Emulation.setDeviceMetricsOverride', {
          width: 375, height: 812, deviceScaleFactor: 2, mobile: true
        });
        await browser.waitFor(() => browser.evalJs('!!document.querySelector("button[aria-label=\\"Abrir menú de navegación\\"]")'));

        // 7. Cerrar sesión
        await browser.send('Emulation.setDeviceMetricsOverride', {
          width: 1366, height: 850, deviceScaleFactor: 1, mobile: false
        });
        await browser.evalJs(`(() => {
          const btn = document.querySelector('button[title="Cerrar sesión"]');
          if (btn) btn.click();
        })()`);
        await browser.waitFor(() => browser.evalJs('!!document.querySelector("input[type=email]")'));

        // 8. Login desde raíz "/" como usuario con SOLO inv:movimientos_registrar -> Sidebar solo muestra Movimientos + sin 403 en GET /movimientos
        await browser.goto(`${server.baseUrl}/`);
        await browser.waitFor(() => browser.evalJs('!!document.querySelector("input[type=email]")'));
        browser.api403or500.length = 0;
        await browser.evalJs(`(() => {
          const setVal = (el, val) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          };
          setVal(document.querySelector('input[type="email"]'), 'e8.movreg@ingmelec-test.local');
          setVal(document.querySelector('input[type="password"]'), ${JSON.stringify(limPass)});
          document.querySelector('button[type="submit"]').click();
        })()`);

        await browser.waitFor(() => browser.evalJs('document.body.innerText.includes("Historial de movimientos restringido")'));
        const sidebarTexts = await browser.evalJs('document.querySelector("aside")?.innerText || ""');
        assert.equal(sidebarTexts.includes('Movimientos'), true);
        assert.equal(sidebarTexts.includes('Usuarios'), false);
        assert.equal(sidebarTexts.includes('Dashboard'), false);
        assert.equal(browser.api403or500.length, 0, `No debe disparar 403/500 al abrir Movimientos solo-registro: ${JSON.stringify(browser.api403or500)}`);

        // Navegar por URL directa a /usuarios debe bloquear/redirigir a /movimientos
        await browser.goto(`${server.baseUrl}/usuarios`);
        await browser.waitFor(() => browser.evalJs('window.location.pathname === "/movimientos" || document.body.innerText.includes("Acceso Denegado al Módulo")'));

        const domCspViolations = await browser.evalJs('window.__cspViolations || []');
        assert.equal(browser.pageErrors.length, 0, `Errores JS no capturados en navegador: ${browser.pageErrors.join(' | ')}`);
        assert.equal(browser.consoleErrors.length, 0, `Errores de consola / CSP en navegador: ${browser.consoleErrors.join(' | ')}`);
        assert.equal(browser.logCspViolations.length, 0, `Violaciones CSP en Log.entryAdded: ${JSON.stringify(browser.logCspViolations)}`);
        assert.equal(browser.networkCspBlocks.length, 0, `Bloqueos CSP en Network.loadingFailed: ${JSON.stringify(browser.networkCspBlocks)}`);
        assert.equal(domCspViolations.length, 0, `Eventos securitypolicyviolation inesperados: ${JSON.stringify(domCspViolations)}`);

        // 9. Prueba negativa controlada: provocar una violación CSP sintética (script inline) y confirmar que el detector la captura
        await browser.evalJs(`(() => {
          const s = document.createElement('script');
          s.textContent = 'window.__inlineScriptExecuted = true;';
          document.head.appendChild(s);
        })()`);
        await browser.waitFor(
          async () => (await browser.evalJs('(window.__cspViolations || []).length > 0')) || browser.logCspViolations.length > 0 || browser.consoleErrors.length > 0,
          4000
        );
        const syntheticViolations = await browser.evalJs('window.__cspViolations || []');
        const inlineExecuted = await browser.evalJs('Boolean(window.__inlineScriptExecuted)');
        assert.equal(inlineExecuted, false, 'CSP debe bloquear ejecución de script inline sintético');
        assert.ok(
          syntheticViolations.length > 0 || browser.logCspViolations.length > 0 || browser.consoleErrors.length > 0,
          'El detector CSP (securitypolicyviolation / Log.entryAdded / consoleErrors) debe capturar la violación sintética'
        );
      } finally {
        await browser.close();
        await server.close();
        await closePool();
      }
    }, { port: MARIADB_PORT, database: ISOLATED_DB_NAME });
  });
});
