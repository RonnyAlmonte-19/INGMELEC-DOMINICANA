import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { rolldown } from 'rolldown';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const MARIADB_PORT = 3310;
const MARIADB_DATADIR = 'C:/Users/gener/.gemini/antigravity/scratch/local-mysql-v21/data';
const ISOLATED_DB_NAME = 'ingmelec_v21_test_isolated';
const FIXTURE_SQL_PATH = path.join(REPO_ROOT, 'server', 'tests', 'fixtures', 'v21_synthetic_fixture.sql');
const MIGRATION_03_PATH = path.join(REPO_ROOT, 'server', 'database', 'migrations', 'migration_03_v21_seguridad_y_esquema.sql');
const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');

// Fijar entorno estrictamente aislado ANTES de importar módulos de servidor
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
  setPoolOverride
} = await import('../database/db.js');
const {
  default: almacenRouter,
  resetSchemaCapabilitiesCache
} = await import('../routes/almacenApi.js');
const { withLocalMariaDb } = await import('./helpers/local-mariadb.mjs');
const { wrapMysql8JsonPool } = await import('./fixtures/mysql8_json_shim.mjs');
const {
  toSafeDisplayString,
  parseJsonSafely,
  formatAuditDetails
} = await import('../../src/utils/jsonFormat.js');

const ARGON2_TEST_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1
};

// =========================================================================
// Helpers de compilación JSX en memoria (Rolldown/Oxc de Vite, cero archivos)
// =========================================================================

const REACT_FILE_URL = pathToFileURL(require.resolve('react')).href;
const REACT_JSX_RUNTIME_URL = pathToFileURL(require.resolve('react/jsx-runtime')).href;
const REACT_JSX_DEV_RUNTIME_URL = pathToFileURL(require.resolve('react/jsx-dev-runtime')).href;
const LUCIDE_FILE_URL = pathToFileURL(require.resolve('lucide-react')).href;

const VIRTUAL_REACT_PROXY_CODE = `
import * as RealReact from "__qa_real_react__";
export * from "__qa_real_react__";
export default RealReact.default ?? RealReact;
export function useState(initial) {
  const hook = globalThis.__QA_USE_STATE_HOOK__;
  if (typeof hook === 'function') {
    return hook(initial, RealReact.useState);
  }
  return RealReact.useState(initial);
}
`;

async function compileJsxModuleInMemory(entryRelativePath, options = {}) {
  const {
    mockAppContext = true,
    stubPagesAndLayout = false,
    useReactStateHookProxy = false
  } = options;

  const entryAbsPath = path.resolve(REPO_ROOT, entryRelativePath);
  const bundle = await rolldown({
    input: entryAbsPath,
    plugins: [
      {
        name: 'qa-in-memory-jsx',
        resolveId(source, importer) {
          if (source === '__qa_real_react__') {
            return { id: REACT_FILE_URL, external: true };
          }
          if (source === 'react') {
            return useReactStateHookProxy
              ? '\0qa-react-proxy'
              : { id: REACT_FILE_URL, external: true };
          }
          if (source === 'react/jsx-runtime') {
            return { id: REACT_JSX_RUNTIME_URL, external: true };
          }
          if (source === 'react/jsx-dev-runtime') {
            return { id: REACT_JSX_DEV_RUNTIME_URL, external: true };
          }
          if (source === 'lucide-react') {
            return { id: LUCIDE_FILE_URL, external: true };
          }
          if (mockAppContext && (source.endsWith('/context/AppContext') || source === '../context/AppContext' || source === '../../context/AppContext')) {
            return '\0qa-mock-app-context';
          }
          if (stubPagesAndLayout && importer && path.resolve(importer) === entryAbsPath) {
            if (source.startsWith('./pages/') || source.startsWith('./components/layout/')) {
              return `\0qa-stub:${source}`;
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0qa-react-proxy') {
            return VIRTUAL_REACT_PROXY_CODE;
          }
          if (id === '\0qa-mock-app-context') {
            return `
              export const useApp = () => {
                if (typeof globalThis.__QA_APP_CONTEXT__ === 'function') {
                  return globalThis.__QA_APP_CONTEXT__();
                }
                return globalThis.__QA_APP_CONTEXT__ || {};
              };
            `;
          }
          if (id.startsWith('\0qa-stub:')) {
            const label = id.slice('\0qa-stub:'.length);
            return `
              import React from 'react';
              export default function StubComponent(props) {
                return React.createElement('div', { 'data-stub': ${JSON.stringify(label)} }, ${JSON.stringify(label)});
              }
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
      codeSplitting: false
    });
    const code = output[0].code;
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
    return await import(dataUrl);
  } finally {
    await bundle.close();
  }
}

function withUseStateSequence(valuesByCallIndex, fn) {
  let callIndex = 0;
  const previousHook = globalThis.__QA_USE_STATE_HOOK__;
  globalThis.__QA_USE_STATE_HOOK__ = (initial) => {
    const idx = callIndex;
    callIndex += 1;
    if (Object.hasOwn(valuesByCallIndex, idx)) {
      return [valuesByCallIndex[idx], () => {}];
    }
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  };
  try {
    return fn();
  } finally {
    globalThis.__QA_USE_STATE_HOOK__ = previousHook;
  }
}

function withMockAppContext(ctxValue, fn) {
  const previous = globalThis.__QA_APP_CONTEXT__;
  globalThis.__QA_APP_CONTEXT__ = ctxValue;
  try {
    return fn();
  } finally {
    globalThis.__QA_APP_CONTEXT__ = previous;
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
    }

    get textContent() {
      if (this.nodeType === 3) return this.nodeValue;
      if (this.childNodes.length > 0) {
        return this.childNodes.map((c) => c.textContent).join('');
      }
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
      if (idx === -1) {
        this.childNodes.push(child);
      } else {
        this.childNodes.splice(idx, 0, child);
      }
      return child;
    }

    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        this.childNodes.splice(idx, 1);
      }
      child.parentNode = null;
      return child;
    }

    setAttribute(k, v) {
      this.attributes[k] = String(v);
    }

    removeAttribute(k) {
      delete this.attributes[k];
    }

    addEventListener() {}
    removeEventListener() {}
    contains(target) {
      if (target === this) return true;
      return this.childNodes.some((c) => c.contains?.(target));
    }

    get firstChild() {
      return this.childNodes[0] || null;
    }
  }

  const historyCalls = [];
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
    addEventListener() {},
    removeEventListener() {},
    Event: class {},
    HTMLIFrameElement: class {},
    navigator: { userAgent: 'node-qa' }
  };

  const doc = {
    nodeType: 9,
    defaultView: win,
    activeElement: null,
    createElement(tag) {
      const node = new MiniNode(1, String(tag).toUpperCase());
      node.ownerDocument = doc;
      return node;
    },
    createElementNS(_ns, tag) {
      const node = new MiniNode(1, String(tag));
      node.ownerDocument = doc;
      return node;
    },
    createTextNode(text) {
      const node = new MiniNode(3, '#text');
      node.nodeValue = String(text);
      node.ownerDocument = doc;
      return node;
    },
    createComment(text) {
      const node = new MiniNode(8, '#comment');
      node.nodeValue = String(text);
      node.ownerDocument = doc;
      return node;
    },
    addEventListener() {},
    removeEventListener() {}
  };

  return { doc, win, historyCalls };
}

function createMemoryStorage(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, val) {
      store.set(String(key), String(val));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    snapshot() {
      return Object.fromEntries(store.entries());
    }
  };
}

async function withDomAndGlobals({ initialPath = '/', initialSearch = '', storageEntries = {}, fetchMock = null }, fn) {
  const { doc, win, historyCalls } = createMiniDom(initialPath, initialSearch);
  const storage = createMemoryStorage(storageEntries);

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevStorage = globalThis.localStorage;
  const prevFetch = globalThis.fetch;
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
  globalThis.localStorage = storage;
  if (fetchMock) {
    globalThis.fetch = fetchMock;
  }

  try {
    return await fn({ doc, win, historyCalls, storage });
  } finally {
    await new Promise((resolve) => prevSetTimeout(resolve, 25));
    for (const timerId of trackedTimers) {
      prevClearTimeout(timerId);
    }
    trackedTimers.clear();

    globalThis.setTimeout = prevSetTimeout;
    globalThis.clearTimeout = prevClearTimeout;

    if (prevActEnv === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = prevActEnv;

    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;

    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document = prevDocument;

    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;

    if (prevFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = prevFetch;
  }
}

// =========================================================================
// Helpers BD & HTTP
// =========================================================================

function buildCustomJwt({
  header = { alg: 'HS256', typ: 'JWT' },
  payload,
  secret = EPHEMERAL_JWT_SECRET
}) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
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
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    port: addr.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
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
      reject(new Error(`El puerto ${host}:${port} continúa escuchando tras el apagado.`));
    });

    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });
  });
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

// =========================================================================
// SUITE DE PRUEBAS ETAPA 3
// =========================================================================

describe('ETAPA 3 QA Independiente - React Error #31, MySQL 8, Resiliencia BD y R-E2-01', () => {
  test('1. Validación unitaria y SSR React contra Error #31 (C01)', async (t) => {
    await t.test('1A. src/utils/jsonFormat.js con objetos, previo->nuevo, circulares, getters con excepción y null/undefined', () => {
      assert.equal(toSafeDisplayString({ activo: 0 }), '{"activo":0}');
      assert.equal(toSafeDisplayString({ permisos: ['inv:ver'] }), '{"permisos":["inv:ver"]}');
      assert.equal(toSafeDisplayString(null), '—');
      assert.equal(toSafeDisplayString(undefined), '—');
      assert.equal(toSafeDisplayString('   ', 'N/A'), 'N/A');
      assert.equal(toSafeDisplayString(0), '0');
      assert.equal(toSafeDisplayString(false), 'false');
      assert.equal(toSafeDisplayString(Number.NaN, 'N/A'), 'N/A');
      assert.equal(toSafeDisplayString(BigInt('9007199254740993')), '9007199254740993');
      assert.equal(toSafeDisplayString(new Error('Fallo controlado')), 'Fallo controlado');
      assert.equal(toSafeDisplayString(() => {}, 'FN'), 'FN');

      const circular = { etiqueta: 'nodo' };
      circular.self = circular;
      const circularText = toSafeDisplayString(circular);
      assert.equal(typeof circularText, 'string');
      assert.match(circularText, /\[Circular\]/);

      const throwingGetter = {
        get boom() {
          throw new Error('Getter boom');
        }
      };
      assert.equal(toSafeDisplayString(throwingGetter, 'SAFE_FALLBACK'), 'SAFE_FALLBACK');

      // parseJsonSafely
      assert.deepEqual(parseJsonSafely('{"activo":0}'), { activo: 0 });
      assert.deepEqual(parseJsonSafely({ activo: 0 }), { activo: 0 });
      assert.deepEqual(parseJsonSafely(['inv:ver']), ['inv:ver']);
      assert.equal(parseJsonSafely('{json roto', 'FALLBACK'), 'FALLBACK');
      assert.equal(parseJsonSafely(null, 'FALLBACK'), 'FALLBACK');
      assert.equal(parseJsonSafely(undefined, 'FALLBACK'), 'FALLBACK');
      assert.equal(parseJsonSafely('   ', 'FALLBACK'), 'FALLBACK');

      // formatAuditDetails
      assert.equal(formatAuditDetails({ activo: 0 }), 'activo: Inactivo (0)');
      assert.equal(
        formatAuditDetails({ activo: 0 }, { activo: 1 }),
        'activo: Activo (1) → activo: Inactivo (0)'
      );
      assert.equal(
        formatAuditDetails({ permisos: ['inv:ver', 'camp:ver'] }, { permisos: ['inv:ver'] }),
        'permisos: [inv:ver] → permisos: [inv:ver, camp:ver]'
      );
      assert.equal(
        formatAuditDetails({ activo: 1 }, { activo: 1 }),
        'activo: Activo (1)'
      );
      assert.equal(formatAuditDetails(null, null), '-');
      assert.equal(formatAuditDetails(undefined, undefined, 'SIN_CAMBIOS'), 'SIN_CAMBIOS');

      const circularAudit = formatAuditDetails(circular, { activo: 1 });
      assert.equal(typeof circularAudit, 'string');
      assert.match(circularAudit, /\[Circular\]/);

      const getterAudit = formatAuditDetails(throwingGetter, { activo: 1 });
      assert.equal(typeof getterAudit, 'string');
      assert.ok(getterAudit.length > 0);
    });

    // Compilar módulos JSX reales en memoria (cero archivos temporales)
    const [
      ErrorBoundaryMod,
      UsuariosPageMod,
      AuditoriaPageMod,
      SearchableSelectMod,
      TopbarMod,
      AppContextMod,
      AppMod
    ] = await Promise.all([
      compileJsxModuleInMemory('src/components/common/ErrorBoundary.jsx', { mockAppContext: false }),
      compileJsxModuleInMemory('src/pages/UsuariosPage.jsx', { mockAppContext: true, useReactStateHookProxy: true }),
      compileJsxModuleInMemory('src/pages/AuditoriaPage.jsx', { mockAppContext: true, useReactStateHookProxy: true }),
      compileJsxModuleInMemory('src/components/common/SearchableSelect.jsx', { mockAppContext: false, useReactStateHookProxy: true }),
      compileJsxModuleInMemory('src/components/layout/Topbar.jsx', { mockAppContext: true }),
      compileJsxModuleInMemory('src/context/AppContext.jsx', { mockAppContext: false }),
      compileJsxModuleInMemory('src/App.jsx', { mockAppContext: false, stubPagesAndLayout: true })
    ]);

    const ErrorBoundary = ErrorBoundaryMod.default;
    const UsuariosPage = UsuariosPageMod.default;
    const AuditoriaPage = AuditoriaPageMod.default;
    const SearchableSelect = SearchableSelectMod.default;
    const Topbar = TopbarMod.default;
    const { AppProvider, useApp } = AppContextMod;
    const App = AppMod.default;

    await t.test('1B. <ErrorBoundary> modo normal, captura de Test Render Boom y limpieza de claves locales INGMELEC', async () => {
      // Modo normal vía renderToStaticMarkup
      const normalHtml = renderToStaticMarkup(
        React.createElement(ErrorBoundary, null, React.createElement('div', null, 'Vista Estable INGMELEC'))
      );
      assert.match(normalHtml, /Vista Estable INGMELEC/);
      assert.doesNotMatch(normalHtml, /Error inesperado al mostrar este módulo/);

      // Captura real de error lanzado por hijo en árbol React (Test Render Boom)
      const Bomb = () => {
        throw new Error('Test Render Boom');
      };

      const origConsoleError = console.error;
      const capturedConsoleErrors = [];
      console.error = (...args) => {
        capturedConsoleErrors.push(args.map((a) => String(a)).join(' '));
      };

      try {
        await withDomAndGlobals({}, async ({ doc }) => {
          const container = doc.createElement('div');
          const root = createRoot(container);
          try {
            await act(async () => {
              root.render(
                React.createElement(ErrorBoundary, null, React.createElement(Bomb))
              );
            });
            const renderedText = container.textContent;
            assert.match(renderedText, /INGMELEC \| ALMACÉN GENERAL v2\.1/);
            assert.match(renderedText, /Test Render Boom/);
            assert.equal(/gridops/i.test(renderedText), false, 'ErrorBoundary no debe mencionar GridOps');
          } finally {
            await act(async () => {
              root.unmount();
            });
          }
        });
      } finally {
        console.error = origConsoleError;
      }

      // Render SSR de fallback usando getDerivedStateFromError incluso con payload circular (anti Error #31)
      const derivedNormal = ErrorBoundary.getDerivedStateFromError(new Error('Test Render Boom'));
      const ebInstance = new ErrorBoundary({});
      ebInstance.state = {
        ...derivedNormal,
        errorInfo: { componentStack: '\n    at Bomb' }
      };
      const fallbackHtml = renderToStaticMarkup(ebInstance.render());
      assert.match(fallbackHtml, /INGMELEC \| ALMACÉN GENERAL v2\.1/);
      assert.match(fallbackHtml, /Test Render Boom/);
      assert.equal(/gridops/i.test(fallbackHtml), false);

      const circularErr = { detail: 'obj' };
      circularErr.self = circularErr;
      const ebCircular = new ErrorBoundary({});
      ebCircular.state = {
        ...ErrorBoundary.getDerivedStateFromError(circularErr),
        errorInfo: { componentStack: { raw: 'stack' } }
      };
      const circularFallbackHtml = renderToStaticMarkup(ebCircular.render());
      assert.match(circularFallbackHtml, /\[Circular\]/);

      // Verificación en fuente de ErrorBoundary.jsx
      const ebSource = fs.readFileSync(
        path.join(REPO_ROOT, 'src', 'components', 'common', 'ErrorBoundary.jsx'),
        'utf8'
      );
      assert.match(ebSource, /localStorage\.removeItem\('ingmelec_token'\)/);
      assert.match(ebSource, /localStorage\.removeItem\('ingmelec_user'\)/);
      assert.match(ebSource, /localStorage\.removeItem\('ingmelec_active_campamento'\)/);
      assert.equal(ebSource.includes('gridops_auth_token'), false);
      assert.equal(/gridops/i.test(ebSource), false);
    });

    await t.test('1C. <UsuariosPage /> pestaña auditoria con objetos JS {activo: 0}/{activo: 1} NO lanza React Error #31', () => {
      const circularPayload = { clave: 'circular' };
      circularPayload.self = circularPayload;
      const mockAuditLogs = [
        {
          id: 1,
          fecha: '2026-11-01T09:00:00Z',
          usuario_nombre: 'Dev Sintético Principal',
          accion: 'CAMBIO_ESTADO_USUARIO',
          entidad: 'inv_usuarios',
          entidad_id: 7,
          detalles_previos: { activo: 1 },
          detalles_nuevos: { activo: 0 }
        },
        {
          id: 2,
          fecha: '2026-11-01T09:10:00Z',
          usuario_nombre: 'Dev Sintético Principal',
          accion: 'ASIGNACION_PERMISOS',
          entidad: 'inv_usuarios',
          entidad_id: 3,
          detalles_previos: { permisos: ['inv:ver'] },
          detalles_nuevos: { permisos: ['inv:ver', 'camp:ver'] }
        },
        {
          id: 3,
          fecha: '2026-11-01T09:20:00Z',
          usuario_nombre: { nombre_obj: 'Objeto Inesperado' },
          accion: { code: 'EVENTO_OBJ' },
          entidad_id: 9,
          detalles_previos: circularPayload,
          detalles_nuevos: { extra: { nested: true } }
        }
      ];

      const html = withMockAppContext(
        {
          currentUser: { id: 1, nombre: 'Dev Sintético', rol: 'developer', es_developer: 1 },
          currentRole: 'developer',
          fetchUsuarios: async () => ({ success: true, usuarios: [] }),
          fetchCampamentos: async () => ({ success: true, campamentos: [] }),
          fetchUsuariosAuditoria: async () => ({ success: true, logs: mockAuditLogs }),
          showToast: () => {}
        },
        () =>
          // En UsuariosPage: 0=usuarios, 1=campamentos, 2=auditorias, 3=loading, 4=activeTab
          withUseStateSequence(
            {
              2: mockAuditLogs,
              3: false,
              4: 'auditoria'
            },
            () => renderToStaticMarkup(React.createElement(UsuariosPage))
          )
      );

      assert.match(html, /Bitácora de Modificaciones de Acceso/);
      assert.match(html, /CAMBIO_ESTADO_USUARIO/);
      assert.match(html, /activo: Activo \(1\) → activo: Inactivo \(0\)/);
      assert.match(html, /permisos: \[inv:ver\] → permisos: \[inv:ver, camp:ver\]/);
      assert.match(html, /\[Circular\]/);
    });

    await t.test('1D. <AuditoriaPage /> y <SearchableSelect /> con valores complejos/no-string sin errores', () => {
      const circularObj = { ref: 'loop' };
      circularObj.self = circularObj;
      const throwingObj = {
        get boom() {
          throw new Error('Getter explosion');
        }
      };

      const auditLogs = [
        {
          id: 101,
          fecha: '2026-11-02T10:20:00Z',
          usuario_nombre: 'Admin Sintético',
          accion: 'EDICION_ARTICULO',
          entidad: 'inv_articulos',
          entidad_id: 3,
          detalles_previos: { estado_fisico: 'Bueno', cantidad_num: 1 },
          detalles_nuevos: { estado_fisico: 'Regular', cantidad_num: 1 },
          ip_origen: '127.0.0.1'
        },
        {
          id: 102,
          fecha: '2026-11-02T10:30:00Z',
          usuario_nombre: { nested: 'UserObj' },
          accion: { act: 'OBJ_ACT' },
          entidad: { tbl: 'inv_usuarios' },
          entidad_id: { raw: 7 },
          detalles_previos: circularObj,
          detalles_nuevos: throwingObj,
          ip_origen: { ip: '127.0.0.1' }
        }
      ];

      const auditHtml = withMockAppContext(
        {
          fetchAuditoria: async () => ({ success: true, logs: auditLogs })
        },
        () =>
          // En AuditoriaPage: 0=logs, 1=loading, 2=search
          withUseStateSequence(
            {
              0: auditLogs,
              1: false,
              2: ''
            },
            () => renderToStaticMarkup(React.createElement(AuditoriaPage))
          )
      );

      assert.match(auditHtml, /Bitácora Inmutable de Auditoría y Cumplimiento/);
      assert.match(auditHtml, /EDICION_ARTICULO/);
      assert.match(auditHtml, /estado_fisico: Bueno/);
      assert.match(auditHtml, /\[Circular\]/);

      // SearchableSelect cerrado y abierto con opciones y valores no-string
      const sharedValObj = { id: 1 };
      const complexOptions = [
        { label: { codigo: 'SEDE-1', nombre: 'Sede Norte' }, value: sharedValObj, sublabel: ['Operativa', 2026] },
        { nombre: { alias: 'OPL' }, cargo: { nivel: 'Senior' } },
        { label: circularObj, value: 'circ-val' },
        circularObj,
        throwingObj,
        42,
        null
      ];

      const matchedSelectHtml = renderToStaticMarkup(
        React.createElement(SearchableSelect, {
          label: 'Sede Compleja',
          value: sharedValObj,
          onChange: () => {},
          options: complexOptions,
          placeholder: { hint: 'Seleccione' }
        })
      );
      assert.match(matchedSelectHtml, /Sede Compleja/);
      assert.match(matchedSelectHtml, /Sede Norte/);

      const unmatchedObjSelectHtml = renderToStaticMarkup(
        React.createElement(SearchableSelect, {
          label: 'Valor Objeto',
          value: { id: 1 },
          onChange: () => {},
          options: complexOptions,
          placeholder: { hint: 'Seleccione' }
        })
      );
      assert.match(unmatchedObjSelectHtml, /Valor Objeto/);
      assert.match(unmatchedObjSelectHtml, /\{&quot;id&quot;:1\}/);

      const openSelectHtml = withUseStateSequence(
        {
          0: true, // isOpen = true para renderizar todo el listado de opciones
          1: ''
        },
        () =>
          renderToStaticMarkup(
            React.createElement(SearchableSelect, {
              label: 'Sede Abierta',
              value: { rawValue: 99 },
              onChange: () => {},
              options: complexOptions,
              allowCreate: true
            })
          )
      );
      assert.match(openSelectHtml, /Sede Abierta/);
      assert.match(openSelectHtml, /\[Circular\]/);
    });

    await t.test('1E. Fallback 404 y normalización en src/App.jsx, título levantamientos en Topbar.jsx y AppContext.logout()', async () => {
      // Topbar título 'levantamientos'
      const topbarHtml = withMockAppContext(
        {
          currentUser: { id: 1, nombre: 'Dev', rol: 'developer', es_developer: 1 },
          currentRole: 'developer',
          refreshKpis: () => {},
          kpisLoading: false,
          activeCampamento: null,
          setActiveCampamento: () => {},
          entornoInfo: { esPruebas: true },
          kpis: { totalArticulos: 25 }
        },
        () => renderToStaticMarkup(React.createElement(Topbar, { activePage: 'levantamientos' }))
      );
      assert.match(topbarHtml, /Levantamientos Físicos y Auditorías/);

      const topbar404Html = withMockAppContext(
        {
          currentUser: { id: 1, nombre: 'Dev', rol: 'developer', es_developer: 1 },
          currentRole: 'developer',
          refreshKpis: () => {},
          kpisLoading: false,
          activeCampamento: null,
          setActiveCampamento: () => {},
          entornoInfo: { esPruebas: true },
          kpis: {}
        },
        () => renderToStaticMarkup(React.createElement(Topbar, { activePage: 'not_found' }))
      );
      assert.match(topbar404Html, /Ruta No Encontrada \(404\)/);

      // App.jsx: 404 para ruta desconocida y normalización de slash final (/inventario/)
      const fakeUserJson = JSON.stringify({
        id: 1,
        nombre: 'Dev QA',
        rol: 'developer',
        es_developer: 1,
        permisos: ['*']
      });
      const mockFetchForApp = async () => ({
        status: 200,
        ok: true,
        json: async () => ({ success: true, kpis: {}, esPruebas: true })
      });

      await withDomAndGlobals(
        {
          initialPath: '/ruta-inexistente-etapa3',
          storageEntries: {
            ingmelec_token: 'jwt-qa-dummy',
            ingmelec_user: fakeUserJson
          },
          fetchMock: mockFetchForApp
        },
        async ({ doc }) => {
          const container = doc.createElement('div');
          const root = createRoot(container);
          try {
            await act(async () => {
              root.render(React.createElement(App));
            });
            assert.match(container.textContent, /404 — Ruta no encontrada/);
            assert.match(container.textContent, /\/ruta-inexistente-etapa3/);
          } finally {
            await act(async () => {
              root.unmount();
            });
          }
        }
      );

      await withDomAndGlobals(
        {
          initialPath: '/inventario/',
          initialSearch: '?area=ALMACEN',
          storageEntries: {
            ingmelec_token: 'jwt-qa-dummy',
            ingmelec_user: fakeUserJson
          },
          fetchMock: mockFetchForApp
        },
        async ({ doc, win, historyCalls }) => {
          const container = doc.createElement('div');
          const root = createRoot(container);
          try {
            await act(async () => {
              root.render(React.createElement(App));
            });
            assert.equal(win.location.pathname, '/inventario');
            assert.equal(
              historyCalls.some((c) => c.type === 'replaceState' && c.url === '/inventario?area=ALMACEN'),
              true,
              'App.jsx debe normalizar el slash final conservando query string'
            );
            assert.match(container.textContent, /\.\/pages\/InventarioGeneralPage/);
          } finally {
            await act(async () => {
              root.unmount();
            });
          }
        }
      );

      // AppContext.jsx: logout() debe invocar POST /api/v2/auth/logout y limpiar storage local
      const fetchRequests = [];
      await withDomAndGlobals(
        {
          storageEntries: {
            ingmelec_token: 'jwt-logout-verify',
            ingmelec_user: fakeUserJson,
            ingmelec_active_campamento: JSON.stringify({ id: 1, nombre: 'ALM-27FEB' })
          },
          fetchMock: async (url, init = {}) => {
            fetchRequests.push({ url, method: init.method || 'GET', headers: init.headers || {} });
            return {
              status: 200,
              ok: true,
              json: async () => ({ success: true, kpis: {}, esPruebas: true })
            };
          }
        },
        async ({ doc, storage }) => {
          let capturedCtx = null;
          const Probe = () => {
            capturedCtx = useApp();
            return React.createElement('span', null, 'probe');
          };
          const container = doc.createElement('div');
          const root = createRoot(container);
          try {
            await act(async () => {
              root.render(React.createElement(AppProvider, null, React.createElement(Probe)));
            });
            assert.ok(capturedCtx && typeof capturedCtx.logout === 'function');
            await act(async () => {
              await capturedCtx.logout();
            });

            const logoutCall = fetchRequests.find((r) => r.url === '/api/v2/auth/logout');
            assert.ok(logoutCall, 'logout() debe invocar /api/v2/auth/logout');
            assert.equal(logoutCall.method, 'POST');
            assert.equal(logoutCall.headers.Authorization, 'Bearer jwt-logout-verify');

            assert.equal(storage.getItem('ingmelec_token'), null);
            assert.equal(storage.getItem('ingmelec_user'), null);
            assert.equal(storage.getItem('ingmelec_active_campamento'), null);
          } finally {
            await act(async () => {
              root.unmount();
            });
          }
        }
      );
    });
  });

  test('2, 3 y 4. Compatibilidad MySQL 8, Resiliencia BD/No-DDL y R-E2-01 sobre MariaDB 3310 aislado', async (t) => {
    await withLocalMariaDb(
      async (instance) => {
        assert.equal(instance.host, '127.0.0.1');
        assert.equal(instance.port, MARIADB_PORT);
        assert.equal(instance.database, ISOLATED_DB_NAME);

        instance.applyEnv(process.env);
        applyIsolatedBaselineEnv();

        // -----------------------------------------------------------------
        // 2A. Fixture + migration_03_v21_seguridad_y_esquema.sql idempotente (x2)
        // -----------------------------------------------------------------
        await t.test('2A. Fixture sintético y migration_03_v21_seguridad_y_esquema.sql idempotente (2 ejecuciones seguidas)', async () => {
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
          const migration03Sql = fs.readFileSync(MIGRATION_03_PATH, 'utf8');

          await setupPool.query(fixtureSql);

          // 2 ejecuciones seguidas sobre el esquema completo sin error
          await setupPool.query(migration03Sql);
          await setupPool.query(migration03Sql);

          // Simular además columna ausente (p.ej. inv_custodios.telefono) en BD aislada y confirmar re-creación + idempotencia
          await setupPool.query('ALTER TABLE `inv_custodios` DROP COLUMN `telefono`');
          await setupPool.query(migration03Sql);
          await setupPool.query(migration03Sql);

          // Recargar fixture limpio para estado determinista de pruebas API
          await setupPool.query(fixtureSql);
          await setupPool.query(migration03Sql);
          await setupPool.query(migration03Sql);

          const [colRows] = await setupPool.query(
            `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND (
                 (TABLE_NAME = 'inv_usuarios' AND COLUMN_NAME = 'token_version')
                 OR (TABLE_NAME = 'inv_almacenes' AND COLUMN_NAME IN ('estado_verificacion', 'origen_registro'))
                 OR (TABLE_NAME = 'inv_campamentos' AND COLUMN_NAME = 'clasificacion_sede')
                 OR (TABLE_NAME = 'inv_custodios' AND COLUMN_NAME IN ('departamento', 'telefono'))
                 OR (TABLE_NAME = 'inv_articulos' AND COLUMN_NAME IN ('area', 'estado_vinculacion_sede', 'cantidad_num'))
                 OR (TABLE_NAME = 'inv_levantamientos' AND COLUMN_NAME = 'estado')
               )`
          );
          const colMap = new Map(
            colRows.map((r) => [`${r.TABLE_NAME}.${r.COLUMN_NAME}`, r])
          );

          assert.ok(colMap.has('inv_usuarios.token_version'));
          assert.ok(colMap.has('inv_almacenes.estado_verificacion'));
          assert.ok(colMap.has('inv_almacenes.origen_registro'));
          assert.ok(colMap.has('inv_custodios.departamento'));
          assert.ok(colMap.has('inv_custodios.telefono'));
          assert.match(colMap.get('inv_campamentos.clasificacion_sede').COLUMN_TYPE, /'PENDIENTE_VALIDACION'/);
          assert.match(colMap.get('inv_articulos.area').COLUMN_TYPE, /'OTRA'/);
          assert.match(colMap.get('inv_articulos.estado_vinculacion_sede').COLUMN_TYPE, /'SIN_VINCULAR'/);
          assert.match(colMap.get('inv_articulos.estado_vinculacion_sede').COLUMN_TYPE, /'SIN_SEDE'/);
          assert.match(colMap.get('inv_articulos.cantidad_num').COLUMN_TYPE, /decimal\(12,2\)/i);
          assert.equal(colMap.get('inv_articulos.cantidad_num').IS_NULLABLE, 'YES');
          assert.match(colMap.get('inv_levantamientos.estado').COLUMN_TYPE, /'Cancelado'/);
          assert.equal(colMap.get('inv_levantamientos.estado').IS_NULLABLE, 'NO');

          await closePool();
        });

        // Instalar shim MySQL 8 JSON y levantar Express router /api/v2 en proceso
        const shimPool = installJsonShimPool();
        const dummyHash = await argon2.hash(`QaEtapa3-${crypto.randomBytes(12).toString('hex')}`, ARGON2_TEST_OPTS);

        const devUser = {
          id: 1,
          nombre: 'Dev Sintético Principal',
          email: 'dev.sintetico@ingmelec-test.local',
          rol: 'developer',
          es_developer: 1,
          tv: 1
        };

        const userSede1Lev = await createSyntheticUser(shimPool, {
          nombre: 'QA Etapa3 Sede 1 Levantamientos',
          email: 'qa.etapa3.sede1@ingmelec-test.local',
          passwordHash: dummyHash,
          rol: 'admin',
          campamentoId: 1,
          permisos: [
            'inv:ver',
            'lev:ver',
            'lev:crear',
            'lev:capturar',
            'lev:editar',
            'lev:importar',
            'lev:consolidar'
          ]
        });

        const apiApp = await startInProcessApiApp();
        try {
          const devToken = signTestJwt(devUser);
          const sede1Token = signTestJwt(userSede1Lev);

          // -----------------------------------------------------------------
          // 2B. Endpoints incompatibles MySQL 8 vs almacenApi.js (C02)
          // -----------------------------------------------------------------
          await t.test('2B. Endpoints MySQL 8: KPIs, sortBy=creado_en, custodios, SIN_SEDE y auditoría JSON', async () => {
            // 1) GET /api/v2/dashboard/kpis como Developer
            const kpiRes = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis', { token: devToken });
            assert.equal(kpiRes.status, 200);
            assert.equal(kpiRes.json?.success, true);
            const kpis = kpiRes.json.kpis;
            assert.equal(kpis.totalAlmacenes, 3);
            assert.equal(Array.isArray(kpis.porAlmacen), true);
            assert.equal(kpis.porAlmacen.length, 3);
            assert.equal(kpis.totalCampamentosPendientesValidacion, 1);
            assert.equal(Array.isArray(kpis.campamentosPendientesValidacion), true);
            const sanCristobal = kpis.campamentosPendientesValidacion.find(
              (c) => c.nombre === 'SAN CRISTÓBAL'
            );
            assert.ok(sanCristobal, 'Debe incluir SAN CRISTÓBAL en campamentosPendientesValidacion');
            assert.equal(sanCristobal.clasificacion_sede, 'PENDIENTE_VALIDACION');

            // 2) GET /api/v2/articulos?sortBy=creado_en&sortOrder=desc -> HTTP 200
            const sortRes = await apiRequest(
              apiApp.baseUrl,
              '/api/v2/articulos?sortBy=creado_en&sortOrder=desc',
              { token: devToken }
            );
            assert.equal(sortRes.status, 200);
            assert.equal(sortRes.json?.success, true);
            assert.equal(Array.isArray(sortRes.json?.articulos), true);
            assert.ok(sortRes.json.articulos.length > 0);
            assert.ok(
              Number(sortRes.json.articulos[0].id) >= Number(sortRes.json.articulos[sortRes.json.articulos.length - 1].id) ||
              sortRes.json.articulos[0].fecha_creacion >= sortRes.json.articulos[sortRes.json.articulos.length - 1].fecha_creacion
            );

            // 3) POST /api/v2/catalogos/custodios con departamento y telefono -> 201 y GET refleja valores
            const createCustRes = await apiRequest(apiApp.baseUrl, '/api/v2/catalogos/custodios', {
              method: 'POST',
              token: devToken,
              body: {
                nombre: 'Custodio QA Etapa3',
                cargo: 'Inspector Técnico QA',
                departamento: 'Ingeniería QA',
                telefono: '809-555-0888'
              }
            });
            assert.equal(createCustRes.status, 201);
            assert.equal(createCustRes.json?.success, true);

            const listCustRes = await apiRequest(apiApp.baseUrl, '/api/v2/catalogos/custodios', {
              token: devToken
            });
            assert.equal(listCustRes.status, 200);
            const createdCust = listCustRes.json.custodios.find((c) => c.nombre === 'Custodio QA Etapa3');
            assert.ok(createdCust, 'GET /catalogos/custodios debe incluir el custodio creado');
            assert.equal(createdCust.departamento, 'Ingeniería QA');
            assert.equal(createdCust.telefono, '809-555-0888');

            // 4) POST /api/v2/articulos para ubicación desconocida sin campamento_id -> SIN_SEDE y HTTP 201
            const createArtRes = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', {
              method: 'POST',
              token: devToken,
              body: {
                area: 'ALMACEN',
                categoria: 'Herramienta Eléctrica',
                articulo_nombre: 'Equipo Ubicación Desconocida QA',
                ubicacion_nombre: 'ALMACÉN EXTERNO TEMPORAL DESCONOCIDO QA',
                cantidad_num: 1,
                estado_fisico: 'Bueno'
              }
            });
            assert.equal(createArtRes.status, 201);
            assert.equal(createArtRes.json?.success, true);
            const createdArtId = createArtRes.json.id;
            assert.ok(Number(createdArtId) > 0);

            const getArtRes = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${createdArtId}`, {
              token: devToken
            });
            assert.equal(getArtRes.status, 200);
            assert.equal(getArtRes.json?.articulo?.campamento_id, null);
            assert.equal(getArtRes.json?.articulo?.estado_vinculacion_sede, 'SIN_SEDE');

            // 5) GET /api/v2/usuarios/auditoria y GET /api/v2/auditoria compatibles con MySQL 8 JSON + SSR
            const [usrAuditRes, genAuditRes] = await Promise.all([
              apiRequest(apiApp.baseUrl, '/api/v2/usuarios/auditoria', { token: devToken }),
              apiRequest(apiApp.baseUrl, '/api/v2/auditoria', { token: devToken })
            ]);
            assert.equal(usrAuditRes.status, 200);
            assert.equal(usrAuditRes.json?.success, true);
            assert.ok(Array.isArray(usrAuditRes.json?.logs) && usrAuditRes.json.logs.length > 0);

            assert.equal(genAuditRes.status, 200);
            assert.equal(genAuditRes.json?.success, true);
            assert.ok(Array.isArray(genAuditRes.json?.logs) && genAuditRes.json.logs.length > 0);

            const cambioEstadoLog = usrAuditRes.json.logs.find(
              (l) => l.accion === 'CAMBIO_ESTADO_USUARIO' && l.entidad_id === 7
            );
            assert.ok(cambioEstadoLog);
            assert.deepEqual(cambioEstadoLog.detalles_previos, { activo: 1 });
            assert.deepEqual(cambioEstadoLog.detalles_nuevos, { activo: 0 });

            // Renderizar logs reales de la API en UsuariosPage y AuditoriaPage vía SSR sin Error #31
            const UsuariosPageMod = await compileJsxModuleInMemory('src/pages/UsuariosPage.jsx', {
              mockAppContext: true,
              useReactStateHookProxy: true
            });
            const AuditoriaPageMod = await compileJsxModuleInMemory('src/pages/AuditoriaPage.jsx', {
              mockAppContext: true,
              useReactStateHookProxy: true
            });

            const usrHtml = withMockAppContext(
              {
                currentUser: devUser,
                currentRole: 'developer',
                fetchUsuarios: async () => ({ success: true, usuarios: [] }),
                fetchCampamentos: async () => ({ success: true, campamentos: [] }),
                fetchUsuariosAuditoria: async () => usrAuditRes.json,
                showToast: () => {}
              },
              () =>
                withUseStateSequence(
                  { 2: usrAuditRes.json.logs, 3: false, 4: 'auditoria' },
                  () => renderToStaticMarkup(React.createElement(UsuariosPageMod.default))
                )
            );
            assert.match(usrHtml, /activo: Activo \(1\) → activo: Inactivo \(0\)/);

            const audHtml = withMockAppContext(
              { fetchAuditoria: async () => genAuditRes.json },
              () =>
                withUseStateSequence(
                  { 0: genAuditRes.json.logs, 1: false, 2: '' },
                  () => renderToStaticMarkup(React.createElement(AuditoriaPageMod.default))
                )
            );
            assert.match(audHtml, /ALTA_ARTICULO/);
          });

          // -----------------------------------------------------------------
          // 3. Resiliencia getConnection()/rollback() y No DDL HTTP (M04)
          // -----------------------------------------------------------------
          await t.test('3. Resiliencia getConnection()/rollback() (HTTP 503 sin UnhandledRejection) y fuente sin DDL/catch vacío', async () => {
            const unhandledRejections = [];
            const onUnhandled = (reason) => {
              unhandledRejections.push(reason);
            };
            process.on('unhandledRejection', onUnhandled);

            const connDownErr = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3310'), {
              code: 'ECONNREFUSED',
              errno: -4078
            });

            try {
              // Delegar query/execute al pool real (para que requireAuth pase) y simular fallo en getConnection()
              setPoolOverride({
                query: (...args) => shimPool.query(...args),
                execute: (...args) => shimPool.execute(...args),
                getConnection: async () => {
                  throw connDownErr;
                },
                end: async () => {}
              });

              const endpoints = [
                {
                  label: 'POST /api/v2/movimientos',
                  path: '/api/v2/movimientos',
                  method: 'POST',
                  body: {
                    articulo_id: 1,
                    tipo_movimiento: 'AJUSTE',
                    cantidad: 1,
                    motivo: 'Prueba resiliencia ECONNREFUSED'
                  }
                },
                {
                  label: 'POST /api/v2/levantamientos/1/items',
                  path: '/api/v2/levantamientos/1/items',
                  method: 'POST',
                  body: {
                    area: 'ALMACEN',
                    categoria: 'Equipos de Taller',
                    articulo_nombre: 'Item resiliencia ECONNREFUSED',
                    cantidad: 1
                  }
                },
                {
                  label: 'PUT /api/v2/levantamientos/1',
                  path: '/api/v2/levantamientos/1',
                  method: 'PUT',
                  body: {
                    titulo: 'Actualización resiliencia ECONNREFUSED'
                  }
                },
                {
                  label: 'POST /api/v2/levantamientos/1/import-items',
                  path: '/api/v2/levantamientos/1/import-items',
                  method: 'POST',
                  body: {
                    items: [{ articulo_nombre: 'Import resiliencia ECONNREFUSED', cantidad: 1 }]
                  }
                },
                {
                  label: 'POST /api/v2/levantamientos/1/consolidar',
                  path: '/api/v2/levantamientos/1/consolidar',
                  method: 'POST',
                  body: {}
                }
              ];

              for (const ep of endpoints) {
                const res = await apiRequest(apiApp.baseUrl, ep.path, {
                  method: ep.method,
                  token: devToken,
                  body: ep.body
                });
                assert.equal(res.status, 503, `${ep.label} debía responder HTTP 503 ante ECONNREFUSED en getConnection()`);
                assert.equal(res.json?.success, false);
                assert.match(res.json?.message || '', /no disponible/i);
              }

              // Probar además fallo de query dentro de transacción + fallo simultáneo en rollback()
              let releasedCount = 0;
              setPoolOverride({
                query: (...args) => shimPool.query(...args),
                execute: (...args) => shimPool.execute(...args),
                getConnection: async () => ({
                  beginTransaction: async () => {},
                  query: async () => {
                    throw Object.assign(new Error('Connection lost during query'), {
                      code: 'PROTOCOL_CONNECTION_LOST'
                    });
                  },
                  commit: async () => {},
                  rollback: async () => {
                    throw new Error('Rollback connection already closed');
                  },
                  release: () => {
                    releasedCount += 1;
                  }
                }),
                end: async () => {}
              });

              const txFailRes = await apiRequest(apiApp.baseUrl, '/api/v2/movimientos', {
                method: 'POST',
                token: devToken,
                body: {
                  articulo_id: 1,
                  tipo_movimiento: 'AJUSTE',
                  cantidad: 1,
                  motivo: 'Prueba rollback resiliente'
                }
              });
              assert.equal(txFailRes.status, 503);
              assert.equal(txFailRes.json?.success, false);
              assert.equal(releasedCount, 1, 'safeRelease debe liberar la conexión incluso tras fallo de rollback');
              assert.equal(unhandledRejections.length, 0, 'No debe producirse ningún UnhandledRejection');
            } finally {
              process.off('unhandledRejection', onUnhandled);
              resetPool();
              installJsonShimPool();
            }

            // Confirmar recuperación real tras restablecer pool
            const recoveredMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: devToken });
            assert.equal(recoveredMe.status, 200);

            // Verificar en fuente de server/routes/almacenApi.js ausencia total de CREATE TABLE y catch vacíos
            const apiSource = fs.readFileSync(
              path.join(REPO_ROOT, 'server', 'routes', 'almacenApi.js'),
              'utf8'
            );
            assert.equal(
              /CREATE\s+TABLE/i.test(apiSource),
              false,
              'almacenApi.js no debe contener sentencias CREATE TABLE en tiempo de petición'
            );
            const emptyCatchPattern = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\n|\s|\/\*[\s\S]*?\*\/)*\}/g;
            const emptyCatches = [...apiSource.matchAll(emptyCatchPattern)];
            assert.equal(
              emptyCatches.length,
              0,
              `almacenApi.js no debe tener bloques catch vacíos (encontrados: ${emptyCatches.length})`
            );
          });

          // -----------------------------------------------------------------
          // 4. Seguridad R-E2-01 (orden scope antes de estado en levantamientos)
          // -----------------------------------------------------------------
          await t.test('4. Seguridad R-E2-01: usuario Sede 1 sobre levantamiento OPL Finalizado (id=2) recibe HTTP 403 (nunca 409)', async () => {
            const postItemRes = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2/items', {
              method: 'POST',
              token: sede1Token,
              body: {
                area: 'ALMACEN',
                categoria: 'Equipos de Taller',
                articulo_nombre: 'Intento R-E2-01 POST item OPL finalizado',
                cantidad: 1
              }
            });
            assert.equal(postItemRes.status, 403, 'POST /levantamientos/2/items debe devolver 403 antes de 409 Finalizado');

            const putItemRes = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2/items/5', {
              method: 'PUT',
              token: sede1Token,
              body: {
                articulo_nombre: 'Intento R-E2-01 PUT item OPL finalizado'
              }
            });
            assert.equal(putItemRes.status, 403, 'PUT /levantamientos/2/items/5 debe devolver 403 antes de 409 Finalizado');

            const delItemRes = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2/items/5', {
              method: 'DELETE',
              token: sede1Token
            });
            assert.equal(delItemRes.status, 403, 'DELETE /levantamientos/2/items/5 debe devolver 403 antes de 409 Finalizado');

            const consolidarRes = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2/consolidar', {
              method: 'POST',
              token: sede1Token,
              body: {}
            });
            assert.equal(consolidarRes.status, 403, 'POST /levantamientos/2/consolidar debe devolver 403 antes de 409 Finalizado');

            // Cobertura adicional en el mismo levantamiento Finalizado ajeno: PUT e import-items
            const putLevRes = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2', {
              method: 'PUT',
              token: sede1Token,
              body: { titulo: 'Intento R-E2-01 PUT levantamiento ajeno finalizado' }
            });
            assert.equal(putLevRes.status, 403);

            const importItemsRes = await apiRequest(apiApp.baseUrl, '/api/v2/levantamientos/2/import-items', {
              method: 'POST',
              token: sede1Token,
              body: { items: [{ articulo_nombre: 'Intento R-E2-01 import ajeno', cantidad: 1 }] }
            });
            assert.equal(importItemsRes.status, 403);
          });
        } finally {
          await apiApp.close();
        }

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

    await t.test('5. Confirmación de cierre limpio sin procesos huérfanos en puerto 3310', async () => {
      await assertPortClosed('127.0.0.1', MARIADB_PORT);
    });
  });
});
