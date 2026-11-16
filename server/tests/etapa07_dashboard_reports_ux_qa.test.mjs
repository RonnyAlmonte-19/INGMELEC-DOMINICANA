import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { rolldown } from 'rolldown';
import readXlsxNode from 'read-excel-file/node';
import writeXlsxNode from 'write-excel-file/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const MARIADB_PORT = 3310;
const MARIADB_DATADIR = 'C:/Users/gener/.gemini/antigravity/scratch/local-mysql-v21/data';
const ISOLATED_DB_NAME = 'ingmelec_v21_test_isolated';
const FIXTURE_SQL_PATH = path.join(REPO_ROOT, 'server', 'tests', 'fixtures', 'v21_synthetic_fixture.sql');
const MIGRATION_03_PATH = path.join(REPO_ROOT, 'server', 'database', 'migrations', 'migration_03_v21_seguridad_y_esquema.sql');
const MIGRATION_04_PATH = path.join(REPO_ROOT, 'server', 'database', 'migrations', 'migration_04_v21_campamentos_alias.sql');
const MIGRATION_05_PATH = path.join(REPO_ROOT, 'server', 'database', 'migrations', 'migration_05_v21_adapted.sql');
const MIGRATION_06_PATH = path.join(REPO_ROOT, 'server', 'database', 'migrations', 'migration_06_v21_safe.sql');
const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');

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
const {
  getPool,
  resetPool,
  closePool,
  setPoolOverride
} = await import('../database/db.js');
const {
  default: almacenRouter,
  resetSchemaCapabilitiesCache
} = await import('../routes/almacenApi.js');
const { withLocalMariaDb: _rawWithLocalMariaDb } = await import('./helpers/local-mariadb.mjs');
const withLocalMariaDb = (arg1, arg2) =>
  typeof arg1 === 'function' ? _rawWithLocalMariaDb(arg1, arg2) : _rawWithLocalMariaDb(arg2, arg1);
const { wrapMysql8JsonPool } = await import('./fixtures/mysql8_json_shim.mjs');

const REACT_FILE_URL = pathToFileURL(require.resolve('react')).href;
const REACT_JSX_RUNTIME_URL = pathToFileURL(require.resolve('react/jsx-runtime')).href;
const REACT_JSX_DEV_RUNTIME_URL = pathToFileURL(require.resolve('react/jsx-dev-runtime')).href;
const LUCIDE_FILE_URL = pathToFileURL(require.resolve('lucide-react')).href;
const RECHARTS_FILE_URL = pathToFileURL(require.resolve('recharts')).href;
const READ_EXCEL_FILE_URL = pathToFileURL(require.resolve('read-excel-file/browser')).href;
const WRITE_EXCEL_FILE_URL = pathToFileURL(require.resolve('write-excel-file/browser')).href;

async function compileJsxModuleInMemory(entryRelativePath, options = {}) {
  const { mockAppContext = true } = options;
  const entryAbsPath = path.resolve(REPO_ROOT, entryRelativePath);
  const bundle = await rolldown({
    input: entryAbsPath,
    plugins: [
      {
        name: 'qa-etapa07-in-memory-jsx',
        resolveId(source) {
          if (source === 'react') return { id: REACT_FILE_URL, external: true };
          if (source === 'react/jsx-runtime') return { id: REACT_JSX_RUNTIME_URL, external: true };
          if (source === 'react/jsx-dev-runtime') return { id: REACT_JSX_DEV_RUNTIME_URL, external: true };
          if (source === 'lucide-react') return { id: LUCIDE_FILE_URL, external: true };
          if (source === 'recharts') return { id: RECHARTS_FILE_URL, external: true };
          if (source === 'read-excel-file/browser') return { id: READ_EXCEL_FILE_URL, external: true };
          if (source === 'write-excel-file/browser') return { id: WRITE_EXCEL_FILE_URL, external: true };
          if (
            mockAppContext &&
            (source.endsWith('/context/AppContext') ||
              source === './context/AppContext' ||
              source === '../context/AppContext' ||
              source === '../../context/AppContext')
          ) {
            return '\0qa-mock-app-context';
          }
          return null;
        },
        load(id) {
          if (id === '\0qa-mock-app-context') {
            return `
              export const AppProvider = ({ children }) => children;
              export const useApp = () => {
                if (typeof globalThis.__QA_APP_CONTEXT__ === 'function') {
                  return globalThis.__QA_APP_CONTEXT__();
                }
                return globalThis.__QA_APP_CONTEXT__ || {};
              };
            `;
          }
          return null;
        }
      }
    ]
  });

  try {
    const { output } = await bundle.generate({
      format: 'esm',
      codeSplitting: false,
      banner: [
        `import { createRequire as __qaCreateRequire } from 'node:module';`,
        `import { fileURLToPath as __qaFileURLToPath } from 'node:url';`,
        `const __qaNativeRequire = __qaCreateRequire(${JSON.stringify(pathToFileURL(path.join(REPO_ROOT, 'package.json')).href)});`,
        `const require = (spec) => __qaNativeRequire(String(spec).startsWith('file://') ? __qaFileURLToPath(spec) : spec);`
      ].join('\n')
    });
    const code = output[0].code;
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
    return await import(dataUrl);
  } finally {
    await bundle.close();
  }
}

async function withMockAppContextAsync(ctxValue, fn) {
  const prev = globalThis.__QA_APP_CONTEXT__;
  globalThis.__QA_APP_CONTEXT__ = ctxValue;
  try {
    return await fn();
  } finally {
    globalThis.__QA_APP_CONTEXT__ = prev;
  }
}

function createMiniDom(initialPath = '/', initialSearch = '') {
  class MiniNode {
    constructor(nodeType, tagName = '') {
      this.nodeType = nodeType;
      this.tagName = tagName;
      this.nodeName = tagName;
      this.childNodes = [];
      this.parentNode = null;
      this.style = {};
      this.attributes = {};
      this._text = '';
      this.nodeValue = '';
      this.ownerDocument = null;
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.type = '';
      this.name = '';
      this.listeners = new Map();
    }

    get options() {
      const result = [];
      const walk = (nodes) => {
        for (const n of nodes) {
          if (n.tagName === 'OPTION') result.push(n);
          else if (n.childNodes?.length) walk(n.childNodes);
        }
      };
      walk(this.childNodes);
      return result;
    }

    get textContent() {
      if (this.nodeType === 3) return this.nodeValue;
      if (this.childNodes.length > 0) return this.childNodes.map((c) => c.textContent).join('');
      return this._text;
    }

    set textContent(val) {
      this._text = String(val ?? '');
      this.childNodes = [];
    }

    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }

    insertBefore(child, ref) {
      child.parentNode = this;
      const idx = this.childNodes.indexOf(ref);
      if (idx === -1) this.childNodes.push(child);
      else this.childNodes.splice(idx, 0, child);
      return child;
    }

    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) this.childNodes.splice(idx, 1);
      child.parentNode = null;
      return child;
    }

    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'value') this.value = String(v);
      if (k === 'type') this.type = String(v);
    }

    getAttribute(k) {
      return Object.hasOwn(this.attributes, k) ? this.attributes[k] : null;
    }

    removeAttribute(k) {
      delete this.attributes[k];
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }

    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }

    dispatchEvent(evt) {
      const eventObj = evt || { type: 'click', target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} };
      if (!eventObj.target) eventObj.target = this;
      eventObj.currentTarget = this;
      const set = this.listeners.get(eventObj.type);
      if (set) {
        for (const fn of set) fn(eventObj);
      }
      if (this.parentNode && !eventObj.cancelBubble) {
        this.parentNode.dispatchEvent(eventObj);
      }
      return true;
    }

    contains(target) {
      if (target === this) return true;
      return this.childNodes.some((c) => c.contains?.(target));
    }

    getBoundingClientRect() {
      return { width: 800, height: 300, top: 0, left: 0, right: 800, bottom: 300 };
    }

    getElementsByClassName(className) {
      const target = String(className || '').trim();
      if (!target) return [];
      const matches = [];
      const walk = (node) => {
        for (const child of node.childNodes || []) {
          const cls = String(child.attributes?.class || child.attributes?.className || '');
          if (cls.split(/\s+/).includes(target)) {
            matches.push(child);
          }
          walk(child);
        }
      };
      walk(this);
      return matches;
    }

    get firstChild() {
      return this.childNodes[0] || null;
    }

    get outerHTML() {
      if (this.nodeType === 3) return this.nodeValue;
      if (this.nodeType === 8) return '';
      const tag = this.tagName.toLowerCase();
      const attrs = Object.entries(this.attributes)
        .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
        .join('');
      const inner = this.childNodes.length > 0
        ? this.childNodes.map((c) => c.outerHTML).join('')
        : this._text;
      return `<${tag}${attrs}>${inner}</${tag}>`;
    }
  }

  const historyCalls = [];
  const winListeners = new Map();
  const win = {
    location: {
      pathname: initialPath,
      search: initialSearch,
      href: `http://127.0.0.1${initialPath}${initialSearch}`
    },
    history: {
      state: null,
      replaceState(state, title, url) {
        historyCalls.push({ type: 'replaceState', state, title, url });
        const [p, s = ''] = String(url).split('?');
        win.location.pathname = p;
        win.location.search = s ? `?${s}` : '';
      },
      pushState(state, title, url) {
        historyCalls.push({ type: 'pushState', state, title, url });
        const [p, s = ''] = String(url).split('?');
        win.location.pathname = p;
        win.location.search = s ? `?${s}` : '';
      }
    },
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatchEvent(evt) {
      const set = winListeners.get(evt?.type);
      if (set) for (const fn of set) fn(evt);
    },
    Event: class { constructor(type) { this.type = type; } preventDefault() {} stopPropagation() {} },
    HTMLIFrameElement: class {},
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '', fontSize: '12px', fontFamily: 'sans-serif' }),
    navigator: { userAgent: 'node-qa' }
  };

  const doc = {
    nodeType: 9,
    defaultView: win,
    activeElement: null,
    createElement(tag) {
      const n = new MiniNode(1, String(tag).toUpperCase());
      n.ownerDocument = doc;
      return n;
    },
    createElementNS(_ns, tag) {
      const n = new MiniNode(1, String(tag));
      n.ownerDocument = doc;
      return n;
    },
    createTextNode(text) {
      const n = new MiniNode(3, '#text');
      n.nodeValue = String(text);
      n.ownerDocument = doc;
      return n;
    },
    createComment(text) {
      const n = new MiniNode(8, '#comment');
      n.nodeValue = String(text);
      n.ownerDocument = doc;
      return n;
    },
    addEventListener() {},
    removeEventListener() {}
  };

  return { doc, win, historyCalls };
}

function findNodes(root, predicate) {
  const found = [];
  const walk = (node) => {
    if (!node) return;
    if (predicate(node)) found.push(node);
    if (node.childNodes) {
      for (const c of node.childNodes) walk(c);
    }
  };
  walk(root);
  return found;
}

async function withDomEnv({ initialPath = '/', initialSearch = '' } = {}, fn) {
  const { doc, win, historyCalls } = createMiniDom(initialPath, initialSearch);
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevResizeObs = globalThis.ResizeObserver;
  const prevActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const prevSetTimeout = globalThis.setTimeout;
  const prevClearTimeout = globalThis.clearTimeout;
  const trackedTimers = new Set();

  globalThis.setTimeout = (cb, ms, ...args) => {
    const id = prevSetTimeout((...cbArgs) => {
      trackedTimers.delete(id);
      return cb(...cbArgs);
    }, ms, ...args);
    trackedTimers.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => {
    trackedTimers.delete(id);
    return prevClearTimeout(id);
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.ResizeObserver = win.ResizeObserver;

  try {
    return await fn({ doc, win, historyCalls });
  } finally {
    await new Promise((r) => prevSetTimeout(r, 25));
    for (const tid of trackedTimers) prevClearTimeout(tid);
    trackedTimers.clear();
    globalThis.setTimeout = prevSetTimeout;
    globalThis.clearTimeout = prevClearTimeout;
    if (prevActEnv === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document = prevDocument;
    if (prevResizeObs === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = prevResizeObs;
  }
}

function signTestJwt(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    rol: user.rol,
    es_developer: user.es_developer ?? 0,
    tv: user.tv ?? 1,
    iat: Date.now(),
    exp: Date.now() + 3600 * 1000
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', EPHEMERAL_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function apiRequest(baseUrl, pathname, { method = 'GET', token = null, body = undefined } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${pathname}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
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
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  };
}

function installJsonShimPool() {
  resetPool();
  const rawPool = getPool();
  resetSchemaCapabilitiesCache(rawPool);
  const wrapped = wrapMysql8JsonPool(rawPool);
  resetSchemaCapabilitiesCache(wrapped);
  setPoolOverride(wrapped);
  return wrapped;
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
      reject(new Error(`El puerto ${host}:${port} continúa escuchando.`));
    });
    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });
  });
}

async function seedDatabaseUpToMigration06() {
  await closePool();
  const setupPool = getPool(null, { allowMultipleStatements: true });
  const [metaRows] = await setupPool.query('SELECT @@port AS port, @@datadir AS datadir, DATABASE() AS db');
  assert.equal(Number(metaRows[0].port), MARIADB_PORT);
  assert.equal(path.resolve(metaRows[0].datadir).toLowerCase(), path.resolve(MARIADB_DATADIR).toLowerCase());
  assert.equal(metaRows[0].db, ISOLATED_DB_NAME);

  const fixtureSql = fs.readFileSync(FIXTURE_SQL_PATH, 'utf8');
  const m3 = fs.readFileSync(MIGRATION_03_PATH, 'utf8');
  const m4 = fs.readFileSync(MIGRATION_04_PATH, 'utf8');
  const m5 = fs.readFileSync(MIGRATION_05_PATH, 'utf8');
  const m6 = fs.readFileSync(MIGRATION_06_PATH, 'utf8');

  await setupPool.query(fixtureSql);
  await setupPool.query(m3);
  await setupPool.query(m4);
  await setupPool.query(m5);
  await setupPool.query(m6);
  await closePool();
}

describe('Etapa 7 QA Independiente — KPIs/Campamentos, Exportación Segura, M01/M03/M08 y UX/A11y/CSS', () => {
  test('1. Backend (M01, A08, B03): equivalencia exacta sinSerial en Dashboard/Inventario/Reportes, filtros exportación y exclusión Base64', async () => {
    try {
      await withLocalMariaDb({ port: MARIADB_PORT, datadir: MARIADB_DATADIR }, async () => {
        await seedDatabaseUpToMigration06();
        const pool = installJsonShimPool();
        const server = await startInProcessApiApp();
        try {
          const [devRows] = await pool.query('SELECT id, nombre, email, rol, es_developer, token_version FROM inv_usuarios WHERE es_developer = 1 LIMIT 1');
          const devToken = signTestJwt({ ...devRows[0], tv: devRows[0].token_version });

          // 1.1 M01: Dashboard, Inventario y Exportar deben devolver exactamente la misma cuenta sinSerial
          for (const campParam of ['', '1', '3', '4', 'SIN_SEDE']) {
            const qs = campParam ? `campamento_id=${campParam}` : '';
            const kpiRes = await apiRequest(server.baseUrl, `/api/v2/dashboard/kpis${qs ? `?${qs}` : ''}`, { token: devToken });
            assert.equal(kpiRes.status, 200);
            const kpiSinSerial = Number(kpiRes.json.kpis.articulosSinSerial);

            const artRes = await apiRequest(server.baseUrl, `/api/v2/articulos?sinSerial=true${qs ? `&${qs}` : ''}`, { token: devToken });
            assert.equal(artRes.status, 200);
            const artSinSerial = Number(artRes.json.pagination.total);

            const expRes = await apiRequest(server.baseUrl, `/api/v2/reportes/exportar?sinSerial=true${qs ? `&${qs}` : ''}`, { token: devToken });
            assert.equal(expRes.status, 200);
            const expSinSerial = Number(expRes.json.count);

            assert.equal(kpiSinSerial, artSinSerial, `Divergencia M01 Dashboard vs Artículos (${campParam || 'GLOBAL'})`);
            assert.equal(kpiSinSerial, expSinSerial, `Divergencia M01 Dashboard vs Reportes (${campParam || 'GLOBAL'})`);
          }

          // 1.2 A08: GET /reportes/exportar respeta búsqueda, categoría, ordenamiento completo y paginación sin recorte
          const fullExport = await apiRequest(
            server.baseUrl,
            '/api/v2/reportes/exportar?search=Sint%C3%A9tico&sortBy=articulo_nombre&sortOrder=DESC',
            { token: devToken }
          );
          assert.equal(fullExport.status, 200);
          assert.equal(fullExport.json.count > 1, true);
          const names = fullExport.json.data.map((r) => r.articulo_nombre);
          for (let i = 1; i < names.length; i++) {
            assert.equal(names[i - 1].localeCompare(names[i], 'es', { sensitivity: 'base' }) >= 0, true);
          }

          // 1.3 B03: Listas no transfieren cadenas pesadas evidencia_foto/Base64
          const largeBase64 = `data:image/png;base64,${'A'.repeat(2048)}`;
          await pool.query('UPDATE inv_levantamiento_items SET evidencia_foto = ? WHERE id = 1', [largeBase64]);
          const levItemsRes = await apiRequest(server.baseUrl, '/api/v2/levantamientos/1/items', { token: devToken });
          assert.equal(levItemsRes.status, 200);
          const item1 = levItemsRes.json.items.find((it) => it.id === 1);
          assert.equal(Number(item1.tiene_foto), 1);
          assert.equal(item1.evidencia_foto, undefined, 'GET /levantamientos/:id/items no debe enviar evidencia_foto Base64');

          // En inv_articulos si hay una ruta o payload > 255 caracteres en evidencia_foto, GET /articulos lo sanitiza pero mantiene tiene_foto=1
          await pool.query('UPDATE inv_articulos SET evidencia_foto = ? WHERE id = 1', [`data:image/jpeg;base64,${'B'.repeat(200)}`]);
          const artListRes = await apiRequest(server.baseUrl, '/api/v2/articulos?search=INF-9001', { token: devToken });
          assert.equal(artListRes.status, 200);
          assert.equal(artListRes.json.articulos[0].evidencia_foto, null);
          assert.equal(Number(artListRes.json.articulos[0].tiene_foto), 1);
          const artDetailRes = await apiRequest(server.baseUrl, '/api/v2/articulos/1', { token: devToken });
          assert.equal(artDetailRes.status, 200);
          assert.equal(String(artDetailRes.json.articulo.evidencia_foto).startsWith('data:image/jpeg'), true);
        } finally {
          await server.close();
          await closePool();
        }
      });
    } finally {
      await closePool();
      await assertPortClosed('127.0.0.1', MARIADB_PORT);
    }
  });

  test('2. Seguridad Dependencias y Exportación (A11, A08): cero xlsx vulnerable, CSV formula injection y Excel real .xlsx', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.equal(Object.hasOwn(pkg.dependencies || {}, 'xlsx'), false, 'La dependencia vulnerable xlsx debe estar eliminada');
    assert.equal(Boolean(pkg.dependencies?.['read-excel-file']), true);
    assert.equal(Boolean(pkg.dependencies?.['write-excel-file']), true);

    const exportUtils = await compileJsxModuleInMemory('src/utils/exportUtils.js', { mockAppContext: false });

    // Vectores de inyección de fórmulas (CWE-1236)
    const dangerousPayloads = ['=CMD()', '+SUM(1,1)', '-2+3', '@SUM(A1)', '\t=1+1', '\r=1+1', '  =HYPERLINK("http://evil")'];
    for (const payload of dangerousPayloads) {
      const neutralized = exportUtils.neutralizeSpreadsheetFormula(payload);
      assert.equal(neutralized.startsWith("'"), true, `Debe anteponer comilla simple a vector: ${JSON.stringify(payload)}`);
    }
    assert.equal(exportUtils.neutralizeSpreadsheetFormula(-5), -5, 'Números puros negativos deben conservarse como número');
    assert.equal(exportUtils.neutralizeSpreadsheetFormula(12.5), 12.5);

    const csv = exportUtils.buildCsvContent(
      ['Código', 'Artículo', 'Cantidad'],
      [['INF-1', '=CMD("calc")', 3]]
    );
    assert.equal(csv.startsWith('\uFEFF'), true);
    assert.equal(csv.includes(`"'=CMD(""calc"")"`), true);

    // Roundtrip binario real .xlsx en Node usando write-excel-file/node y read-excel-file/node
    const safeSheet = exportUtils.buildSafeXlsxSheet(
      'ALMACEN',
      ['Artículo', 'Cantidad', 'Serie'],
      [['=1+1', 2.5, 'SN-XLSX-QA-01']]
    );
    const xlsxBuf = await writeXlsxNode([safeSheet]).toBuffer();
    const parsedSheets = await readXlsxNode(xlsxBuf);
    assert.equal(parsedSheets.length, 1);
    assert.equal(parsedSheets[0].sheet, 'ALMACEN');
    assert.equal(parsedSheets[0].data[1][0], "'=1+1");
    assert.equal(Number(parsedSheets[0].data[1][1]), 2.5);

    // Rechazar formato binario heredado .xls en readSpreadsheetFileToSheets
    await assert.rejects(
      async () => exportUtils.readSpreadsheetFileToSheets({ name: 'legacy_old.xls' }),
      /heredado \.xls binario/i
    );

    // Leer CSV con comillas escapadas
    const csvSheets = await exportUtils.readSpreadsheetFileToSheets({
      name: 'lote_campo.csv',
      text: async () => 'Artículo,Cantidad,Area\n"Taladro, 1/2""",2.5,ALMACEN'
    });
    assert.equal(csvSheets.length, 1);
    assert.equal(csvSheets[0].objects[0]['Artículo'], 'Taladro, 1/2"');
    assert.equal(Number(csvSheets[0].objects[0]['Cantidad']), 2.5);
  });

  test('3. Dashboard, Áreas (M03) y Propagación Territorial Global activeCampamento (C08)', async () => {
    // 3.1 Cero cifras históricas fijas en archivos UI (M03)
    const filesToCheckNoHardcodes = [
      'src/pages/DashboardPage.jsx',
      'src/pages/InventarioGeneralPage.jsx',
      'src/pages/AlmacenPage.jsx',
      'src/pages/InformaticaPage.jsx',
      'src/pages/OficinasPage.jsx',
      'src/pages/CocinaPage.jsx'
    ];
    for (const rel of filesToCheckNoHardcodes) {
      const code = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      assert.equal(/\b(433|329|104|1,971)\b/.test(code), false, `${rel} contiene cifras estáticas prohibidas M03`);
      assert.equal(/registros iniciales|0 Reales/i.test(code), false, `${rel} contiene etiquetas estáticas prohibidas M03`);
    }

    const [
      { default: DashboardPage },
      { default: Topbar },
      { default: ReportesPage },
      { default: MovimientosPage }
    ] = await Promise.all([
      compileJsxModuleInMemory('src/pages/DashboardPage.jsx'),
      compileJsxModuleInMemory('src/components/layout/Topbar.jsx'),
      compileJsxModuleInMemory('src/pages/ReportesPage.jsx'),
      compileJsxModuleInMemory('src/pages/MovimientosPage.jsx')
    ]);

    const dynamicKpis = {
      totalArticulos: 512,
      cantidadFisicaTotal: 2540,
      articulosSinCantidad: 7,
      articulosEstadoPendiente: 4,
      totalCampamentos: 3,
      totalCampamentosPendientesValidacion: 0,
      totalAlmacenes: 3,
      porArea: { INFORMATICA: 100, OFICINAS: 112, COCINA: 20, ALMACEN: 280 },
      unidadesPorArea: { INFORMATICA: 200, OFICINAS: 300, COCINA: 40, ALMACEN: 2000 },
      porEstado: { Bueno: 490, Regular: 15, 'Dañado': 3, 'Fuera de servicio': 0, 'Pendiente de verificación': 4 },
      porCampamento: [
        { id: 1, nombre: 'ALMACÉN 27 DE FEBRERO', total_articulos: 200, total_fisico: 1000, almacenes_count: 1, por_departamento: {} },
        { id: 3, nombre: 'CAMPAMENTO OPL', total_articulos: 200, total_fisico: 1000, almacenes_count: 1, por_departamento: {} }
      ],
      sinSedeVerificada: { nombre: 'SIN SEDE', ubicacion_historica: 'KM 19', total_articulos: 112, total_fisico: 540 },
      consistenciaMatematica: { sumaArticulosCampamentosConfirmados: 400 },
      articulosSinSerial: 45,
      articulosPendientesVerificacion: 7,
      levantamientosEnProceso: 2,
      levantamientosFinalizados: 5,
      recientesMovimientos: []
    };

    const refreshCalls = [];
    let selectedGlobalCamp = null;
    const reporteCalls = [];
    const movCalls = [];

    await withDomEnv({}, async ({ doc }) => {
      // 3.2 Dashboard renderiza valores dinámicos 512 / 400 / 112 / 7 y propaga activeCampamento -> refreshKpis
      const container = doc.createElement('div');
      const root = createRoot(container);
      await withMockAppContextAsync(
        {
          currentUser: { id: 1, rol: 'developer', es_developer: 1, nombre: 'Dev QA', permisos: ['*'] },
          currentRole: 'developer',
          activeCampamento: { id: 3, nombre: 'CAMPAMENTO OPL' },
          kpis: dynamicKpis,
          kpisLoading: false,
          refreshKpis: async (p) => { refreshCalls.push(p); },
          setActiveCampamento: (c) => { selectedGlobalCamp = c; },
          campamentosCatalog: [{ id: 1, nombre: 'ALMACÉN 27 DE FEBRERO', activo: 1 }, { id: 3, nombre: 'CAMPAMENTO OPL', activo: 1 }]
        },
        async () => {
          await act(async () => {
            root.render(React.createElement(DashboardPage, { navigateTo: () => {}, setActivePage: () => {} }));
          });
          const html = container.outerHTML;
          assert.equal(html.includes('512 artículos empresariales activos'), true);
          assert.equal(html.includes('2 Sedes Confirmadas (400 bienes)'), true);
          assert.equal(html.includes('7 artículos con cantidad pendiente'), true);
          assert.equal(refreshCalls.some((c) => c?.campamento_id === '3'), true, 'Dashboard debe pasar activeCampamento=3 a refreshKpis');
          const dashSelect = findNodes(container, (n) => n.getAttribute?.('id') === 'dash-campamento-select')[0];
          assert.ok(dashSelect, 'DashboardPage debe renderizar selector dash-campamento-select');
          await act(async () => {
            dashSelect.value = '1';
            dashSelect.dispatchEvent({ type: 'change', target: dashSelect, preventDefault() {}, stopPropagation() {} });
          });
          assert.equal(selectedGlobalCamp?.id, 1, 'Cambiar sede en Dashboard debe sincronizar activeCampamento global');
          await act(async () => { root.unmount(); });
        }
      );

      // 3.3 Topbar para developer expone selector global de campamentos y actualiza activeCampamento
      const topContainer = doc.createElement('div');
      const topRoot = createRoot(topContainer);
      await withMockAppContextAsync(
        {
          currentUser: { id: 1, rol: 'developer', es_developer: 1, nombre: 'Dev QA' },
          currentRole: 'developer',
          activeCampamento: null,
          setActiveCampamento: (c) => { selectedGlobalCamp = c; },
          campamentosCatalog: [{ id: 1, nombre: 'ALMACÉN 27 DE FEBRERO', activo: 1 }, { id: 3, nombre: 'CAMPAMENTO OPL', activo: 1 }],
          kpis: dynamicKpis,
          kpisLoading: false,
          refreshKpis: () => {},
          entornoInfo: { esPruebas: true }
        },
        async () => {
          await act(async () => {
            topRoot.render(React.createElement(Topbar, { activePage: 'dashboard', onOpenMobileMenu: () => {} }));
          });
          const selectEl = findNodes(topContainer, (n) => n.tagName === 'SELECT')[0];
          assert.ok(selectEl, 'Topbar para developer debe mostrar selector global de campamentos');
          const menuBtn = findNodes(topContainer, (n) => n.tagName === 'BUTTON' && n.getAttribute('aria-label') === 'Abrir menú de navegación')[0];
          assert.ok(menuBtn, 'Topbar debe incluir botón menú móvil accesible');
          await act(async () => {
            selectEl.value = '3';
            selectEl.dispatchEvent({ type: 'change', target: selectEl, preventDefault() {}, stopPropagation() {} });
          });
          assert.equal(selectedGlobalCamp?.id, 3);
          await act(async () => { topRoot.unmount(); });
        }
      );

      // 3.4 ReportesPage muestra error explícito ante fallo API y propaga activeCampamento; MovimientosPage filtra por activeCampamento
      const repContainer = doc.createElement('div');
      const repRoot = createRoot(repContainer);
      await withMockAppContextAsync(
        {
          currentUser: { id: 1, rol: 'developer', es_developer: 1, permisos: ['rep:ver', 'rep:exportar', 'rep:imprimir'] },
          activeCampamento: { id: 3, nombre: 'CAMPAMENTO OPL' },
          campamentosCatalog: [{ id: 3, nombre: 'CAMPAMENTO OPL', activo: 1 }],
          kpis: dynamicKpis,
          fetchReporteConsolidado: async (params) => {
            reporteCalls.push(params);
            return { success: false, message: 'Fallo controlado en reporte QA' };
          },
          showToast: () => {}
        },
        async () => {
          await act(async () => { repRoot.render(React.createElement(ReportesPage)); });
          await new Promise((r) => setTimeout(r, 20));
          await act(async () => {});
          assert.equal(reporteCalls[0]?.campamento_id, '3');
          assert.equal(repContainer.outerHTML.includes('Fallo controlado en reporte QA'), true);
          await act(async () => { repRoot.unmount(); });
        }
      );

      const movContainer = doc.createElement('div');
      const movRoot = createRoot(movContainer);
      await withMockAppContextAsync(
        {
          currentUser: { id: 1, rol: 'developer', es_developer: 1, permisos: ['inv:movimientos_ver'] },
          activeCampamento: { id: 3, nombre: 'CAMPAMENTO OPL' },
          fetchMovimientos: async (arg) => {
            movCalls.push(arg);
            return { success: true, movimientos: [] };
          },
          fetchArticulos: async () => ({ success: true, articulos: [] }),
          registrarMovimiento: async () => ({ success: true })
        },
        async () => {
          await act(async () => { movRoot.render(React.createElement(MovimientosPage)); });
          await new Promise((r) => setTimeout(r, 20));
          await act(async () => {});
          assert.equal(movCalls[0]?.campamento_id, 3);
          assert.equal(movContainer.outerHTML.includes('Sede: CAMPAMENTO OPL'), true);
          await act(async () => { movRoot.unmount(); });
        }
      );

      // 3.5 RBAC Movimientos: usuario con solo inv:movimientos_registrar NO debe disparar GET /movimientos
      const movOnlyRegCalls = [];
      const movRegContainer = doc.createElement('div');
      const movRegRoot = createRoot(movRegContainer);
      await withMockAppContextAsync(
        {
          currentUser: { id: 9, rol: 'almacen', es_developer: 0, permisos: ['inv:movimientos_registrar'] },
          activeCampamento: { id: 3, nombre: 'CAMPAMENTO OPL' },
          fetchMovimientos: async (arg) => {
            movOnlyRegCalls.push(arg);
            return { success: true, movimientos: [] };
          },
          fetchArticulos: async () => ({ success: true, articulos: [] }),
          registrarMovimiento: async () => ({ success: true })
        },
        async () => {
          await act(async () => { movRegRoot.render(React.createElement(MovimientosPage)); });
          await new Promise((r) => setTimeout(r, 20));
          await act(async () => {});
          assert.equal(movOnlyRegCalls.length, 0, 'Usuario con solo inv:movimientos_registrar no debe consultar GET /movimientos');
          assert.equal(movRegContainer.outerHTML.includes('Registrar Movimiento'), true);
          assert.equal(movRegContainer.outerHTML.includes('Historial de movimientos restringido'), true);
          await act(async () => { movRegRoot.unmount(); });
        }
      );
    });
  });

  test('4. UX, Routing M08, Responsive Móvil A09, CSS B04, Media Print y Accesibilidad B05', async () => {
    const [
      { default: InventoryTable },
      { default: App }
    ] = await Promise.all([
      compileJsxModuleInMemory('src/components/common/InventoryTable.jsx'),
      compileJsxModuleInMemory('src/App.jsx')
    ]);

    const fetchCalls = [];
    await withDomEnv(
      { initialPath: '/inventario', initialSearch: '?estado=REGULAR&search=Switch&sortBy=articulo_nombre&sortOrder=DESC&sinSerial=true' },
      async ({ doc, win }) => {
        const container = doc.createElement('div');
        const root = createRoot(container);

        await withMockAppContextAsync(
          {
            currentUser: { id: 1, rol: 'developer', es_developer: 1, nombre: 'Dev', permisos: ['*'] },
            currentRole: 'developer',
            activeCampamento: null,
            campamentosCatalog: [{ id: 3, nombre: 'CAMPAMENTO OPL', activo: 1 }],
            kpis: { totalArticulos: 10, porArea: {}, porCampamento: [] },
            fetchArticulos: async (params) => {
              fetchCalls.push(params);
              return {
                success: true,
                articulos: [{ id: 7, codigo_original: 'INF-9007', articulo_nombre: 'Switch OPL', area: 'INFORMATICA', estado_fisico: 'Regular', cantidad_num: 2, ubicacion_nombre: 'OPL' }],
                resumen: { totalRegistros: 1, totalUnidadesFisicas: 2, articulosSinCantidad: 0 },
                pagination: { total: 1, page: 1, limit: 25, totalPages: 1 }
              };
            },
            showToast: () => {}
          },
          async () => {
            await act(async () => {
              root.render(React.createElement(InventoryTable, { fixedArea: null, title: 'Inventario QA' }));
            });
            await new Promise((r) => setTimeout(r, 20));
            await act(async () => {});

            assert.equal(fetchCalls[0].estado, 'Regular');
            assert.equal(fetchCalls[0].search, 'Switch');
            assert.equal(fetchCalls[0].sortBy, 'articulo_nombre');
            assert.equal(fetchCalls[0].sortOrder, 'DESC');
            assert.equal(fetchCalls[0].sinSerial, 'true');
            assert.equal(win.location.search.includes('sortBy=articulo_nombre'), true);
            assert.equal(win.location.search.includes('sinSerial=true'), true);

            const sortedTh = findNodes(container, (n) => n.tagName === 'TH' && n.getAttribute('aria-sort') === 'descending')[0];
            assert.ok(sortedTh, 'La columna ordenada debe declarar aria-sort="descending"');

            const codigoSortBtn = findNodes(container, (n) => n.tagName === 'BUTTON' && n.textContent.includes('Código'))[0];
            assert.ok(codigoSortBtn);
            await act(async () => {
              codigoSortBtn.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
            });
            await new Promise((r) => setTimeout(r, 20));
            await act(async () => {});
            assert.equal(fetchCalls.some((c) => c.sortBy === 'codigo_original' && c.sortOrder === 'ASC'), true);

            await act(async () => { root.unmount(); });
          }
        );

        // App shell responsivo A09: sin pl-64 fijo en móvil (usa md:pl-64) + navegación Suspense lazy
        const appEl = doc.createElement('div');
        const appRoot = createRoot(appEl);
        await withMockAppContextAsync(
          {
            currentUser: { id: 1, rol: 'developer', es_developer: 1, nombre: 'Dev', permisos: ['*'] },
            currentRole: 'developer',
            logout: () => {},
            refreshKpis: async () => {},
            fetchArticulos: async () => ({
              success: true,
              articulos: [],
              resumen: { totalRegistros: 0, totalUnidadesFisicas: 0, articulosSinCantidad: 0 },
              pagination: { total: 0, page: 1, limit: 25, totalPages: 1 }
            }),
            kpis: { totalArticulos: 10, porArea: {}, porCampamento: [] }
          },
          async () => {
            await act(async () => { appRoot.render(React.createElement(App)); });
            await new Promise((r) => setTimeout(r, 30));
            await act(async () => {});
            const html = appEl.outerHTML;
            assert.equal(html.includes('pl-0 md:pl-64'), true, 'Contenedor principal debe usar pl-0 en móvil y md:pl-64 en escritorio');
            assert.equal(html.includes('-translate-x-full md:translate-x-0'), true, 'Sidebar móvil debe ocultarse fuera de viewport por defecto');
            await act(async () => { appRoot.unmount(); });
          }
        );
      }
    );

    // B04 CSS Cleanup & A08 @media print
    const appCss = fs.readFileSync(path.join(REPO_ROOT, 'src', 'App.css'), 'utf8');
    const indexCss = fs.readFileSync(path.join(REPO_ROOT, 'src', 'index.css'), 'utf8');
    assert.equal(appCss.includes('.hero') || appCss.includes('.vite') || appCss.includes('#docs'), false);
    assert.equal(indexCss.includes('div.fixed.inset-0.bg-black'), false);
    assert.equal(indexCss.includes('text-xs {\n  font-size:'), false);
    assert.equal(indexCss.includes('@media print'), true);
    assert.equal(indexCss.includes(':focus-visible'), true);
  });
});
