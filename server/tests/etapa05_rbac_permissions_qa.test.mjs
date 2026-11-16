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
const MIGRATION_04_PATH = path.join(REPO_ROOT, 'server', 'database', 'migrations', 'migration_04_v21_campamentos_alias.sql');
const MIGRATION_05_PATH = path.join(REPO_ROOT, 'server', 'database', 'migrations', 'migration_05_v21_adapted.sql');
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
const { default: argon2 } = await import('argon2');
const {
  getPool,
  resetPool,
  closePool,
  setPoolOverride
} = await import('../database/db.js');
const {
  default: almacenRouter,
  resetSchemaCapabilitiesCache,
  VALID_OPERATIONAL_ROLES,
  KNOWN_PERMISSION_KEYS,
  parsePermisosJson
} = await import('../routes/almacenApi.js');
const { withLocalMariaDb } = await import('./helpers/local-mariadb.mjs');
const { wrapMysql8JsonPool } = await import('./fixtures/mysql8_json_shim.mjs');

const ARGON2_TEST_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1
};

// =========================================================================
// Helpers de compilación JSX en memoria (Rolldown/Oxc) y MiniDOM React 19
// =========================================================================

const REACT_FILE_URL = pathToFileURL(require.resolve('react')).href;
const REACT_JSX_RUNTIME_URL = pathToFileURL(require.resolve('react/jsx-runtime')).href;
const REACT_JSX_DEV_RUNTIME_URL = pathToFileURL(require.resolve('react/jsx-dev-runtime')).href;
const LUCIDE_FILE_URL = pathToFileURL(require.resolve('lucide-react')).href;
const READ_EXCEL_FILE_URL = pathToFileURL(require.resolve('read-excel-file/browser')).href;
const WRITE_EXCEL_FILE_URL = pathToFileURL(require.resolve('write-excel-file/browser')).href;

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
    useReactStateHookProxy = false
  } = options;

  const entryAbsPath = path.resolve(REPO_ROOT, entryRelativePath);
  const bundle = await rolldown({
    input: entryAbsPath,
    plugins: [
      {
        name: 'qa-etapa05-in-memory-jsx',
        resolveId(source) {
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
          if (source === 'read-excel-file/browser') {
            return { id: READ_EXCEL_FILE_URL, external: true };
          }
          if (source === 'write-excel-file/browser') {
            return { id: WRITE_EXCEL_FILE_URL, external: true };
          }
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
          if (id === '\0qa-react-proxy') {
            return VIRTUAL_REACT_PROXY_CODE;
          }
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

async function withMockAppContextAsync(ctxValue, fn) {
  const previous = globalThis.__QA_APP_CONTEXT__;
  globalThis.__QA_APP_CONTEXT__ = ctxValue;
  try {
    return await fn();
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
      this.value = '';
      this.defaultValue = '';
      this.checked = false;
      this.defaultChecked = false;
      this.selected = false;
      this.disabled = false;
      this.type = '';
      this.name = '';
    }

    get options() {
      const result = [];
      const collect = (nodes) => {
        for (const n of nodes) {
          if (n.tagName === 'OPTION') {
            result.push(n);
          } else if (n.childNodes && n.childNodes.length > 0) {
            collect(n.childNodes);
          }
        }
      };
      collect(this.childNodes);
      return result;
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
      if (k === 'value') this.value = String(v);
      if (k === 'type') this.type = String(v);
    }

    getAttribute(k) {
      return Object.hasOwn(this.attributes, k) ? this.attributes[k] : null;
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
// Helpers BD, JWT & HTTP
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

    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      if (err && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')) {
        resolve();
      } else {
        resolve();
      }
    });
  });
}

async function createSyntheticUser(pool, {
  nombre,
  email,
  passwordHash,
  rol,
  esDeveloper = 0,
  campamentoId = null,
  area = 'ALMACEN',
  permisos = [],
  activo = 1
}) {
  const rawPermisos = typeof permisos === 'string' ? permisos : JSON.stringify(permisos);
  const [res] = await pool.query(
    `INSERT INTO inv_usuarios (
      nombre, email, password_hash, rol, cargo, area, activo,
      es_developer, token_version, campamento_id, permisos_json
    ) VALUES (?, ?, ?, ?, 'QA Sintético', ?, ?, ?, 1, ?, ?)`,
    [nombre, email, passwordHash, rol, area, activo, esDeveloper, campamentoId, rawPermisos]
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
    es_developer: esDeveloper,
    campamento_id: campamentoId,
    area,
    permisos,
    tv: 1
  };
}

async function seedDatabaseUpToMigration04() {
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
  const migration04Sql = fs.readFileSync(MIGRATION_04_PATH, 'utf8');

  await setupPool.query(fixtureSql);
  await setupPool.query(migration03Sql);
  await setupPool.query(migration04Sql);
  await closePool();
}

function makeAppContextStub({ user = null, extra = {} } = {}) {
  const noopAsync = async () => ({ success: true });
  return {
    currentUser: user,
    currentRole: user?.rol || null,
    isDeveloper: user?.rol === 'developer' || user?.es_developer === 1,
    activeCampamento: null,
    setActiveCampamento: () => {},
    campamentosCatalog: [
      { id: 1, nombre: 'ALMACÉN 27 DE FEBRERO', codigo: '27F', provincia: 'Distrito Nacional', es_sintetico: 0, activo: 1 },
      { id: 3, nombre: 'CAMPAMENTO OPL', codigo: 'OPL', provincia: 'San Pedro', es_sintetico: 0, activo: 1 },
      { id: 4, nombre: 'MANTENIMIENTO 633', codigo: 'M633', provincia: 'Santiago', es_sintetico: 0, activo: 1 }
    ],
    kpis: {
      totalArticulos: 120,
      porArea: { INFORMATICA: 20, OFICINAS: 30, COCINA: 15, ALMACEN: 55 },
      porEstado: { BUENO: 100, REGULAR: 15, DANADO: 5, FUERA_SERVICIO: 0, PENDIENTE: 0 },
      porCampamento: [
        { id: 1, nombre: 'ALMACÉN 27 DE FEBRERO', total_articulos: 60 },
        { id: 3, nombre: 'CAMPAMENTO OPL', total_articulos: 40 },
        { id: 4, nombre: 'MANTENIMIENTO 633', total_articulos: 20 }
      ]
    },
    kpisLoading: false,
    entornoInfo: { entorno: 'isolated_test' },
    logout: () => {},
    login: noopAsync,
    refreshKpis: async () => {},
    refreshCampamentosCatalog: async () => [],
    fetchEntorno: async () => {},
    fetchArticulos: async () => ({
      success: true,
      articulos: [],
      resumen: { totalRegistros: 0, totalUnidadesFisicas: 0, articulosSinCantidad: 0 },
      pagination: { total: 0, page: 1, limit: 25, totalPages: 1 },
      filtros_disponibles: { areas: [], ubicaciones: [], categorias: [] }
    }),
    getArticuloById: async () => ({
      success: true,
      articulo: {
        id: 1,
        codigo_ingmelec: 'ING-ALM-0001',
        articulo_nombre: 'Taladro Industrial QA',
        categoria: 'HERRAMIENTA',
        marca_modelo: 'Bosch GBH',
        serie_imei: 'QA-SER-1',
        propietario: 'INGMELEC',
        asignado_a: 'Custodio QA',
        cantidad_num: 2,
        unidad_medida: 'Unidad',
        estado_fisico: 'Bueno',
        ubicacion_nombre: 'ALMACÉN 27 DE FEBRERO',
        area: 'ALMACEN'
      },
      historial_movimientos: []
    }),
    updateArticulo: noopAsync,
    createArticulo: noopAsync,
    deleteArticulo: noopAsync,
    registrarMovimiento: noopAsync,
    fetchMovimientos: async () => ({ success: true, movimientos: [] }),
    fetchReporteConsolidado: async () => ({
      success: true,
      kpis: { totalArticulos: 0, totalUnidades: 0, valorEstimadoTotal: 0 },
      por_area: [],
      por_campamento: [],
      por_estado: [],
      top_categorias: []
    }),
    fetchAuditoria: async () => ({ success: true, logs: [] }),
    fetchUsuarios: async () => ({ success: true, usuarios: [] }),
    createUsuario: noopAsync,
    updateUsuario: noopAsync,
    updateUsuarioEstado: noopAsync,
    updateUsuarioPermisos: noopAsync,
    recoverUsuarioPassword: noopAsync,
    fetchUsuariosAuditoria: async () => ({ success: true, logs: [] }),
    fetchCampamentos: async () => ({ success: true, campamentos: [] }),
    createCampamento: noopAsync,
    updateCampamento: noopAsync,
    createAlmacen: noopAsync,
    fetchCampamentoAliases: async () => ({ success: true, aliases: [] }),
    resolverAliasCampamento: noopAsync,
    previewReasignacionAlias: noopAsync,
    aplicarReasignacionAlias: noopAsync,
    fetchLevantamientos: async () => ({ success: true, levantamientos: [] }),
    getLevantamientoById: async () => ({
      success: true,
      levantamiento: {
        id: 1,
        codigo_levantamiento: 'LEV-QA-001',
        titulo: 'Auditoría QA Sede 1',
        estado: 'En proceso',
        campamento_nombre: 'ALMACÉN 27 DE FEBRERO',
        almacen_nombre: 'Almacén Principal',
        responsable_nombre: 'QA User'
      }
    }),
    updateLevantamiento: noopAsync,
    fetchLevantamientoItems: async () => ({ success: true, items: [], resumen: { areas: [], estados: [] } }),
    addLevantamientoItem: noopAsync,
    updateLevantamientoItem: noopAsync,
    deleteLevantamientoItem: noopAsync,
    importLevantamientoItems: noopAsync,
    consolidarLevantamiento: noopAsync,
    fetchNextCode: async () => ({ success: true, nextCode: 'ING-ALM-0999' }),
    fetchCategorias: async () => ({ success: true, categorias: [] }),
    createCategoria: noopAsync,
    fetchCustodios: async () => ({ success: true, custodios: [] }),
    createCustodio: noopAsync,
    fetchUbicaciones: async () => ({ success: true, ubicaciones: [] }),
    showToast: () => {},
    ...extra
  };
}

// =========================================================================
// SUITE DE PRUEBAS ETAPA 5
// =========================================================================

describe('ETAPA 5 QA Independiente - RBAC Granular, C07, A07, M09 y Sidebar/Routing Dinámicos', () => {
  test('1. Migración 05 (migration_05_v21_rbac_y_permisos.sql) en MariaDB 3310 aislado e Idempotencia x2', async () => {
    await withLocalMariaDb(
      async (instance) => {
        assert.equal(instance.port, MARIADB_PORT);
        assert.equal(instance.database, ISOLATED_DB_NAME);
        instance.applyEnv(process.env);
        applyIsolatedBaselineEnv();

        await seedDatabaseUpToMigration04();

        const setupPool = getPool(null, { allowMultipleStatements: true });
        try {
          const dummyHash = await argon2.hash(`QaMig05-${crypto.randomBytes(10).toString('hex')}`, ARGON2_TEST_OPTS);

          // Insertar casos límite previos a migration_05
          await setupPool.query(
            `INSERT INTO inv_usuarios (nombre, email, password_hash, rol, area, activo, es_developer, permisos_json) VALUES
              ('Edge Null', 'edge.null@ingmelec-test.local', ?, 'almacen', 'ALMACEN', 1, 0, NULL),
              ('Edge Wildcard Operativo', 'edge.star@ingmelec-test.local', ?, 'admin', 'ALMACEN', 1, 0, '["*"]'),
              ('Edge Empty', 'edge.empty@ingmelec-test.local', ?, 'almacen', 'ALMACEN', 1, 0, '[]'),
              ('Edge Auditor Sin AudVer', 'edge.auditor@ingmelec-test.local', ?, 'auditor', 'General', 1, 0, '["inv:ver","rep:ver"]'),
              ('Edge NonArray Object JSON', 'edge.object@ingmelec-test.local', ?, 'supervisor', 'OFICINAS', 1, 0, '{"legacy":true}')`,
            [dummyHash, dummyHash, dummyHash, dummyHash, dummyHash]
          );

          const [countsBefore] = await setupPool.query(`
            SELECT
              (SELECT COUNT(*) FROM inv_articulos) AS arts,
              (SELECT COUNT(*) FROM inv_campamentos) AS camps,
              (SELECT COUNT(*) FROM inv_movimientos) AS movs,
              (SELECT COUNT(*) FROM inv_levantamientos) AS levs
          `);

          const migration05Sql = fs.readFileSync(MIGRATION_05_PATH, 'utf8');

          // Ejecución 1
          await setupPool.query(migration05Sql);
          // Ejecución 2 (idempotencia estricta)
          await setupPool.query(migration05Sql);

          const [countsAfter] = await setupPool.query(`
            SELECT
              (SELECT COUNT(*) FROM inv_articulos) AS arts,
              (SELECT COUNT(*) FROM inv_campamentos) AS camps,
              (SELECT COUNT(*) FROM inv_movimientos) AS movs,
              (SELECT COUNT(*) FROM inv_levantamientos) AS levs
          `);
          assert.deepEqual(countsAfter[0], countsBefore[0], 'migration_05 no debe modificar tablas operativas');

          const [edgeRows] = await setupPool.query(`
            SELECT id, email, rol, activo, es_developer, permisos_json
            FROM inv_usuarios
            WHERE email LIKE 'edge.%@ingmelec-test.local' OR id <= 7
            ORDER BY id ASC
          `);

          const byEmail = new Map(edgeRows.map((r) => [r.email, r]));

          const decodeJsonCol = (val) => (typeof val === 'string' ? JSON.parse(val) : val);

          const { parsePermisosJson } = await import('../routes/almacenApi.js');
          const { userHasPermission } = await import('../../src/utils/permissions.js');

          assert.deepEqual(parsePermisosJson(null, 'almacen', 0), []);
          assert.deepEqual(parsePermisosJson('{"legacy":true}', 'supervisor', 0), []);
          assert.deepEqual(parsePermisosJson('[]', 'almacen', 0), []);
          assert.deepEqual(parsePermisosJson('["*"]', 'admin', 0), []);
          assert.deepEqual(parsePermisosJson('["*"]', 'developer', 1), ['*']);

          for (const failClosedEmail of [
            'edge.null@ingmelec-test.local',
            'edge.star@ingmelec-test.local',
            'edge.empty@ingmelec-test.local',
            'edge.object@ingmelec-test.local'
          ]) {
            const row = byEmail.get(failClosedEmail);
            assert.ok(row, `Debe existir usuario ${failClosedEmail}`);
            const parsedPerms = parsePermisosJson(row.permisos_json, row.rol, row.es_developer);
            assert.deepEqual(parsedPerms, [], `${failClosedEmail} debe parsearse fail-closed como []`);
            const normalizedUser = { ...row, permisos: parsedPerms };
            assert.equal(
              userHasPermission(normalizedUser, 'dash:ver'),
              false,
              `${failClosedEmail} debe evaluarse fail-closed (false) en RBAC`
            );
            assert.equal(
              userHasPermission(normalizedUser, 'inv:ver'),
              false,
              `${failClosedEmail} no debe obtener permisos por fallback`
            );
          }

          const auditorEdge = decodeJsonCol(byEmail.get('edge.auditor@ingmelec-test.local').permisos_json);
          assert.ok(auditorEdge.includes('inv:ver'), 'Auditor activo conserva sus permisos previos sin mutación');

          const devRow = edgeRows.find((r) => r.es_developer === 1);
          assert.ok(devRow, 'Developer principal debe existir');
          assert.deepEqual(decodeJsonCol(devRow.permisos_json), ['*'], 'Developer mantiene ["*"]');

          const inactivoRow = byEmail.get('inactivo.sintetico@ingmelec-test.local');
          const inactivoPerms = decodeJsonCol(inactivoRow.permisos_json);
          assert.ok(!inactivoPerms.includes('dash:ver'), 'Cuenta inactiva no recibe auto-asignación de dash:ver');
        } finally {
          await closePool();
        }
      },
      { port: MARIADB_PORT, datadir: MARIADB_DATADIR, database: ISOLATED_DB_NAME, ensureStoppedAfter: true }
    );
    await assertPortClosed('127.0.0.1', MARIADB_PORT);
  });

  test('2. API Usuarios CRUD, C07 (área, múltiples campamentos), validación de contraseña fuerte, anti-autoescalamiento y revocación de JWT', async () => {
    await withLocalMariaDb(
      async (instance) => {
        instance.applyEnv(process.env);
        applyIsolatedBaselineEnv();

        await seedDatabaseUpToMigration04();
        const migPool = getPool(null, { allowMultipleStatements: true });
        await migPool.query(fs.readFileSync(MIGRATION_05_PATH, 'utf8'));
        await closePool();

        const dbPool = installJsonShimPool();
        const devPassword = `DevQa!${crypto.randomBytes(6).toString('hex')}9`;
        const devHash = await argon2.hash(devPassword, ARGON2_TEST_OPTS);
        await dbPool.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = 1', [devHash]);

        const devUser = {
          id: 1,
          nombre: 'Dev Sintético Principal',
          email: 'dev.sintetico@ingmelec-test.local',
          rol: 'developer',
          es_developer: 1,
          tv: 1
        };

        const apiApp = await startInProcessApiApp();
        try {
          const devToken = signTestJwt(devUser);
          const adminToken = signTestJwt({
            id: 2,
            nombre: 'Admin Sintético Operaciones',
            email: 'admin.sintetico@ingmelec-test.local',
            rol: 'admin',
            es_developer: 0,
            tv: 1
          });

          // A. GET /usuarios/permisos-catalogo
          const catForbidden = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios/permisos-catalogo', {
            token: adminToken
          });
          assert.equal(catForbidden.status, 403, 'Operador admin no puede consultar /usuarios/permisos-catalogo');

          const catOk = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios/permisos-catalogo', {
            token: devToken
          });
          assert.equal(catOk.status, 200);
          assert.equal(catOk.json.success, true);
          assert.deepEqual(catOk.json.roles, VALID_OPERATIONAL_ROLES);
          assert.ok(!catOk.json.roles.includes('developer'), 'El catálogo de roles nunca debe incluir developer');
          assert.deepEqual(catOk.json.permisos, KNOWN_PERMISSION_KEYS);
          assert.ok(!catOk.json.permisos.includes('*'), 'El catálogo de permisos nunca debe incluir "*"');

          // B. Validaciones de POST /usuarios
          const badEmail = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: { nombre: 'Bad Email', email: 'correo-invalido', password: 'Password123', rol: 'almacen' }
          });
          assert.equal(badEmail.status, 400);

          for (const weakPwd of ['12345678', 'soloLetras', 'Abc12']) {
            const weakRes = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
              method: 'POST',
              token: devToken,
              body: { nombre: 'Weak Pwd', email: 'weak@ingmelec-test.local', password: weakPwd, rol: 'almacen' }
            });
            assert.equal(weakRes.status, 400, `Password débil "${weakPwd}" debe responder 400`);
          }

          const escalateRole = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: { nombre: 'Escalate', email: 'esc1@ingmelec-test.local', password: 'Password123', rol: 'developer' }
          });
          assert.equal(escalateRole.status, 403);

          const escalateFlag = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: { nombre: 'Escalate Flag', email: 'esc2@ingmelec-test.local', password: 'Password123', rol: 'admin', es_developer: 1 }
          });
          assert.equal(escalateFlag.status, 403);

          const escalateWildcard = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: { nombre: 'Escalate Wildcard', email: 'esc3@ingmelec-test.local', password: 'Password123', rol: 'admin', permisos: ['*'] }
          });
          assert.equal(escalateWildcard.status, 403);

          const unknownPerm = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: { nombre: 'Bad Perm', email: 'badp@ingmelec-test.local', password: 'Password123', rol: 'almacen', permisos: ['perm:falso'] }
          });
          assert.equal(unknownPerm.status, 400);

          const badRol = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: { nombre: 'Bad Rol', email: 'badr@ingmelec-test.local', password: 'Password123', rol: 'superadmin' }
          });
          assert.equal(badRol.status, 400);

          const badCamp = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: { nombre: 'Bad Camp', email: 'badc@ingmelec-test.local', password: 'Password123', rol: 'almacen', campamentos: [99999] }
          });
          assert.equal(badCamp.status, 400);

          // C. Creación fail-closed (permisos: []) + C07 (área + múltiples campamentos)
          const initialOpPass = 'OperadorInicial2026!';
          const createdRes = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: {
              nombre: 'Operador Nuevo C07',
              email: 'c07.operador@ingmelec-test.local',
              password: initialOpPass,
              rol: 'almacen',
              cargo: 'Técnico Senior',
              area: 'INFORMATICA',
              campamento_id: 1,
              campamentos_adicionales: [3],
              permisos: []
            }
          });
          assert.equal(createdRes.status, 201);
          const createdId = createdRes.json.id;
          assert.ok(createdId > 0);

          // Duplicado por correo -> 409
          const dupCreateRes = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', {
            method: 'POST',
            token: devToken,
            body: {
              nombre: 'Otro',
              email: 'C07.OPERADOR@ingmelec-test.local',
              password: initialOpPass,
              rol: 'almacen'
            }
          });
          assert.equal(dupCreateRes.status, 409);

          // Verificar GET /usuarios devuelve área, múltiples sedes y permisos []
          const listRes = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios', { token: devToken });
          assert.equal(listRes.status, 200);
          const listedOp = listRes.json.usuarios.find((u) => u.id === createdId);
          assert.ok(listedOp);
          assert.equal(listedOp.area, 'INFORMATICA');
          assert.deepEqual(listedOp.permisos, []);
          const assignedIds = listedOp.campamentos_asignados.map((c) => Number(c.campamento_id)).sort((a, b) => a - b);
          assert.deepEqual(assignedIds, [1, 3]);

          // Login real con el usuario fail-closed
          const loginOp = await apiRequest(apiApp.baseUrl, '/api/v2/auth/login', {
            method: 'POST',
            body: { email: 'c07.operador@ingmelec-test.local', password: initialOpPass }
          });
          assert.equal(loginOp.status, 200);
          assert.deepEqual(loginOp.json.user.permisos, []);
          assert.equal(loginOp.json.user.area, 'INFORMATICA');
          assert.equal(loginOp.json.user.campamentos.length, 2);

          let opToken = loginOp.json.token;

          // Verificar GET /auth/me coherente y fail-closed 403 en todos los endpoints con permisos: []
          const meRes = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: opToken });
          assert.equal(meRes.status, 200);
          assert.deepEqual(meRes.json.user.permisos, []);

          for (const gatedEndpoint of [
            '/api/v2/dashboard/kpis',
            '/api/v2/articulos',
            '/api/v2/movimientos',
            '/api/v2/levantamientos',
            '/api/v2/campamentos',
            '/api/v2/reportes/consolidado',
            '/api/v2/auditoria',
            '/api/v2/usuarios'
          ]) {
            const denied = await apiRequest(apiApp.baseUrl, gatedEndpoint, { token: opToken });
            assert.equal(denied.status, 403, `Cuenta fail-closed (0 permisos) debe recibir 403 en ${gatedEndpoint}`);
          }

          // D. Editar usuario (PUT /usuarios/:id) cambia área, múltiples sedes y permisos e invalida JWT anterior (401)
          const dupEmailPut = await apiRequest(apiApp.baseUrl, `/api/v2/usuarios/${createdId}`, {
            method: 'PUT',
            token: devToken,
            body: { email: 'admin.sintetico@ingmelec-test.local' }
          });
          assert.equal(dupEmailPut.status, 409, 'PUT /usuarios/:id debe rechazar email duplicado con 409');

          const putEscalateWildcard = await apiRequest(apiApp.baseUrl, `/api/v2/usuarios/${createdId}`, {
            method: 'PUT',
            token: devToken,
            body: { permisos: ['*'] }
          });
          assert.equal(putEscalateWildcard.status, 403);

          const putDevStripWildcard = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios/1', {
            method: 'PUT',
            token: devToken,
            body: { permisos: ['dash:ver'] }
          });
          assert.equal(putDevStripWildcard.status, 403, 'No se puede revocar "*" del developer principal');

          const putPermWildcardDirect = await apiRequest(apiApp.baseUrl, `/api/v2/usuarios/${createdId}/permisos`, {
            method: 'PUT',
            token: devToken,
            body: { permisos: ['*'] }
          });
          assert.equal(putPermWildcardDirect.status, 403);

          const putUpdateRes = await apiRequest(apiApp.baseUrl, `/api/v2/usuarios/${createdId}`, {
            method: 'PUT',
            token: devToken,
            body: {
              area: 'OFICINAS',
              campamentos: [3, 4],
              permisos: ['dash:ver', 'inv:ver']
            }
          });
          assert.equal(putUpdateRes.status, 200);

          // El JWT anterior debe haberse revocado al cambiar permisos/área/sedes
          const staleTokenRes = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: opToken });
          assert.equal(staleTokenRes.status, 401, 'JWT emitido antes de PUT /usuarios debe ser rechazado con 401');

          // Recuperación de contraseña débil -> 400; fuerte -> 200
          const weakRecover = await apiRequest(apiApp.baseUrl, `/api/v2/usuarios/${createdId}/recuperar`, {
            method: 'POST',
            token: devToken,
            body: { nuevaPassword: 'solotexto' }
          });
          assert.equal(weakRecover.status, 400);

          const newOpPass = 'NuevaClave2026!';
          const okRecover = await apiRequest(apiApp.baseUrl, `/api/v2/usuarios/${createdId}/recuperar`, {
            method: 'POST',
            token: devToken,
            body: { nuevaPassword: newOpPass }
          });
          assert.equal(okRecover.status, 200);

          const reloginOp = await apiRequest(apiApp.baseUrl, '/api/v2/auth/login', {
            method: 'POST',
            body: { email: 'c07.operador@ingmelec-test.local', password: newOpPass }
          });
          assert.equal(reloginOp.status, 200);
          assert.deepEqual(reloginOp.json.user.permisos, ['dash:ver', 'inv:ver']);
          assert.equal(reloginOp.json.user.area, 'OFICINAS');
          assert.deepEqual(
            reloginOp.json.user.campamentos.map((c) => Number(c.id)).sort((a, b) => a - b),
            [3, 4]
          );

          opToken = reloginOp.json.token;

          // Verificar protección de cuenta developer ante desactivación
          const devDeactivate = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios/1/estado', {
            method: 'PATCH',
            token: devToken,
            body: { activo: false }
          });
          assert.equal(devDeactivate.status, 403);

          // Desactivar usuario creado -> su token falla inmediatamente con 403 en requireAuth
          const deactivateOp = await apiRequest(apiApp.baseUrl, `/api/v2/usuarios/${createdId}/estado`, {
            method: 'PATCH',
            token: devToken,
            body: { activo: false }
          });
          assert.equal(deactivateOp.status, 200);
          assert.equal(deactivateOp.json.activo, 0);

          const afterDeactivateRes = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: opToken });
          assert.equal(afterDeactivateRes.status, 403);

          // Verificar auditoría de creación/modificación/estado/recuperación
          const usrAuditRes = await apiRequest(apiApp.baseUrl, '/api/v2/usuarios/auditoria', { token: devToken });
          assert.equal(usrAuditRes.status, 200);
          const actions = usrAuditRes.json.logs.map((l) => l.accion);
          assert.ok(actions.includes('CREACION_USUARIO'));
          assert.ok(actions.includes('MODIFICACION_USUARIO'));
          assert.ok(actions.includes('CAMBIO_ESTADO_USUARIO'));
          assert.ok(actions.includes('RECUPERACION_ACCESO_USUARIO'));
        } finally {
          await apiApp.close();
          await closePool();
        }
      },
      { port: MARIADB_PORT, datadir: MARIADB_DATADIR, database: ISOLATED_DB_NAME, ensureStoppedAfter: true }
    );
    await assertPortClosed('127.0.0.1', MARIADB_PORT);
  });

  test('3. Autorización estricta por permiso en API (sin fallback por rol auditor, inactivos e IDOR territorial)', async () => {
    await withLocalMariaDb(
      async (instance) => {
        instance.applyEnv(process.env);
        applyIsolatedBaselineEnv();

        await seedDatabaseUpToMigration04();
        const migPool = getPool(null, { allowMultipleStatements: true });
        await migPool.query(fs.readFileSync(MIGRATION_05_PATH, 'utf8'));
        await closePool();

        const dbPool = installJsonShimPool();
        const dummyHash = await argon2.hash(`QaScope-${crypto.randomBytes(10).toString('hex')}`, ARGON2_TEST_OPTS);

        // Auditor sin 'aud:ver'
        const auditorSinPerm = await createSyntheticUser(dbPool, {
          nombre: 'Auditor Sin AudVer',
          email: 'auditor.sinperm@ingmelec-test.local',
          passwordHash: dummyHash,
          rol: 'auditor',
          campamentoId: 1,
          permisos: ['dash:ver', 'inv:ver']
        });

        // Auditor con 'aud:ver'
        const auditorConPerm = await createSyntheticUser(dbPool, {
          nombre: 'Auditor Con AudVer',
          email: 'auditor.conperm@ingmelec-test.local',
          passwordHash: dummyHash,
          rol: 'auditor',
          campamentoId: 1,
          permisos: ['dash:ver', 'inv:ver', 'aud:ver']
        });

        // Operador solo inv:ver en Sede 1
        const invOnlySede1 = await createSyntheticUser(dbPool, {
          nombre: 'InvOnly Sede 1',
          email: 'invonly.sede1@ingmelec-test.local',
          passwordHash: dummyHash,
          rol: 'almacen',
          campamentoId: 1,
          permisos: ['inv:ver']
        });

        // Crear artículo inactivo en Sede 1 y artículo activo en Sede 3
        const [insInact] = await dbPool.query(
          `INSERT INTO inv_articulos (codigo_original, area, categoria, articulo_nombre, cantidad_num, campamento_id, ubicacion_nombre, propietario, estado_fisico, activo, hoja_origen, fila_origen, es_sintetico)
           VALUES ('QA-INACT-001', 'ALMACEN', 'PRUEBA', 'Artículo Inactivo QA', 1, 1, 'ALMACÉN 27 DE FEBRERO', 'INGMELEC', 'Dañado', 0, 'QA_ETAPA5', 1, 0)`
        );
        const [insSede3] = await dbPool.query(
          `INSERT INTO inv_articulos (codigo_original, area, categoria, articulo_nombre, cantidad_num, campamento_id, ubicacion_nombre, propietario, estado_fisico, activo, hoja_origen, fila_origen, es_sintetico)
           VALUES ('QA-OPL-001', 'ALMACEN', 'PRUEBA', 'Artículo Exclusivo OPL QA', 1, 3, 'CAMPAMENTO OPL', 'INGMELEC', 'Bueno', 1, 'QA_ETAPA5', 2, 0)`
        );
        const inactivoSede1Id = insInact.insertId;
        const activoSede3Id = insSede3.insertId;

        const apiApp = await startInProcessApiApp();
        try {
          const audSinToken = signTestJwt(auditorSinPerm);
          const audConToken = signTestJwt(auditorConPerm);
          const invOnlyToken = signTestJwt(invOnlySede1);

          // Auditor sin aud:ver -> 403 en /auditoria y 404 en artículo inactivo
          const audDenied = await apiRequest(apiApp.baseUrl, '/api/v2/auditoria', { token: audSinToken });
          assert.equal(audDenied.status, 403, 'Rol auditor sin permiso aud:ver NO debe tener fallback en GET /auditoria');

          const inactDenied = await apiRequest(
            apiApp.baseUrl,
            `/api/v2/articulos/${inactivoSede1Id}?incluir_inactivos=true`,
            { token: audSinToken }
          );
          assert.equal(inactDenied.status, 404, 'Sin aud:ver no debe ver artículos inactivos');

          // Auditor con aud:ver -> 200 en ambos
          const audOk = await apiRequest(apiApp.baseUrl, '/api/v2/auditoria', { token: audConToken });
          assert.equal(audOk.status, 200);
          assert.equal(audOk.json.success, true);

          const inactOk = await apiRequest(
            apiApp.baseUrl,
            `/api/v2/articulos/${inactivoSede1Id}?incluir_inactivos=true`,
            { token: audConToken }
          );
          assert.equal(inactOk.status, 200);
          assert.equal(inactOk.json.articulo.id, inactivoSede1Id);

          // parsePermisosJson nunca conserva "*" para no-developers
          assert.deepEqual(parsePermisosJson('["*"]', 'admin', 0), []);
          assert.deepEqual(parsePermisosJson('["*"]', 'developer', 1), ['*']);

          // Usuario inv:ver únicamente (sin dash:ver / inv:crear / rep:ver) + ámbito territorial Sede 1
          const invListOk = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: invOnlyToken });
          assert.equal(invListOk.status, 200);
          assert.ok(
            invListOk.json.articulos.every((a) => Number(a.campamento_id) !== 3),
            'Usuario de Sede 1 nunca debe recibir activos exclusivos de Sede 3'
          );

          const crossSedeDetail = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${activoSede3Id}`, {
            token: invOnlyToken
          });
          assert.equal(crossSedeDetail.status, 403, 'IDOR territorial bloqueado entre Sede 1 y Sede 3');

          const kpisDenied = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis', { token: invOnlyToken });
          assert.equal(kpisDenied.status, 403, 'Usuario sin dash:ver debe recibir 403 en /dashboard/kpis');

          const repDenied = await apiRequest(apiApp.baseUrl, '/api/v2/reportes/consolidado', { token: invOnlyToken });
          assert.equal(repDenied.status, 403, 'Usuario sin rep:ver debe recibir 403 en /reportes/consolidado');

          const createArtDenied = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', {
            method: 'POST',
            token: invOnlyToken,
            body: { area: 'ALMACEN', articulo_nombre: 'Prohibido', ubicacion_nombre: 'ALMACÉN 27 DE FEBRERO', campamento_id: 1 }
          });
          assert.equal(createArtDenied.status, 403, 'Usuario sin inv:crear debe recibir 403 en POST /articulos');

          // Usuarios heredados con permisos_json inválidos (NULL, objeto JSON, ["*"] no-developer) deben quedar fail-closed con HTTP 403
          const legacyHash = await argon2.hash('LegacyPass#2026', ARGON2_TEST_OPTS);
          await dbPool.query(
            `INSERT INTO inv_usuarios (nombre, email, password_hash, rol, area, activo, es_developer, permisos_json, campamento_id)
             VALUES
               ('Legacy Null', 'legacy.null@ingmelec-test.local', ?, 'almacen', 'ALMACEN', 1, 0, NULL, 1),
               ('Legacy Object', 'legacy.obj@ingmelec-test.local', ?, 'supervisor', 'OFICINAS', 1, 0, '{"legacy":true}', 1),
               ('Legacy Star NonDev', 'legacy.star@ingmelec-test.local', ?, 'admin', 'ALMACEN', 1, 0, '["*"]', 1)`,
            [legacyHash, legacyHash, legacyHash]
          );

          for (const legacyEmail of [
            'legacy.null@ingmelec-test.local',
            'legacy.obj@ingmelec-test.local',
            'legacy.star@ingmelec-test.local'
          ]) {
            const loginRes = await apiRequest(apiApp.baseUrl, '/api/v2/auth/login', {
              method: 'POST',
              body: { email: legacyEmail, password: 'LegacyPass#2026' }
            });
            assert.equal(loginRes.status, 200, `${legacyEmail} debe autenticar para probar fail-closed en API`);
            const legacyToken = loginRes.json.token;
            const legacyMe = await apiRequest(apiApp.baseUrl, '/api/v2/auth/me', { token: legacyToken });
            assert.equal(legacyMe.status, 200);
            assert.deepEqual(legacyMe.json.user.permisos, [], `${legacyEmail} debe resolver permisos: []`);

            const legacyDash = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis', { token: legacyToken });
            assert.equal(legacyDash.status, 403, `${legacyEmail} debe recibir HTTP 403 en /dashboard/kpis`);

            const legacyInv = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', { token: legacyToken });
            assert.equal(legacyInv.status, 403, `${legacyEmail} debe recibir HTTP 403 en /articulos`);
          }
        } finally {
          await apiApp.close();
          await closePool();
        }
      },
      { port: MARIADB_PORT, datadir: MARIADB_DATADIR, database: ISOLATED_DB_NAME, ensureStoppedAfter: true }
    );
    await assertPortClosed('127.0.0.1', MARIADB_PORT);
  });

  test('4. Frontend Etapa 5: Sidebar Dinámico, Routing URL Directa en App.jsx, UsuariosPage (C07/M09) y Botones Granulares A07', async () => {
    const [
      permUtilsMod,
      sidebarMod,
      appMod,
      usuariosPageMod,
      inventoryTableMod,
      itemDetailMod,
      movimientosPageMod,
      levantamientosPageMod,
      workspaceMod,
      reportesPageMod
    ] = await Promise.all([
      compileJsxModuleInMemory('src/utils/permissions.js', { mockAppContext: false }),
      compileJsxModuleInMemory('src/components/layout/Sidebar.jsx'),
      compileJsxModuleInMemory('src/App.jsx'),
      compileJsxModuleInMemory('src/pages/UsuariosPage.jsx', { useReactStateHookProxy: true }),
      compileJsxModuleInMemory('src/components/common/InventoryTable.jsx'),
      compileJsxModuleInMemory('src/components/common/ItemDetailModal.jsx'),
      compileJsxModuleInMemory('src/pages/MovimientosPage.jsx'),
      compileJsxModuleInMemory('src/pages/LevantamientosPage.jsx'),
      compileJsxModuleInMemory('src/components/levantamientos/LevantamientoWorkspace.jsx'),
      compileJsxModuleInMemory('src/pages/ReportesPage.jsx')
    ]);

    const Sidebar = sidebarMod.default;
    const App = appMod.default;
    const UsuariosPage = usuariosPageMod.default;
    const InventoryTable = inventoryTableMod.default;
    const ItemDetailModal = itemDetailMod.default;
    const MovimientosPage = movimientosPageMod.default;
    const LevantamientosPage = levantamientosPageMod.default;
    const LevantamientoWorkspace = workspaceMod.default;
    const ReportesPage = reportesPageMod.default;

    // 4.1 permissions.js helpers (bloquea "*" en no-developer y sin_acceso en [])
    assert.equal(
      permUtilsMod.userHasPermission({ id: 2, rol: 'admin', es_developer: 0, permisos: ['*'] }, 'inv:ver'),
      false,
      'Operador no developer con ["*"] inyectado nunca debe recibir permiso'
    );
    assert.equal(
      permUtilsMod.userHasPermission({ id: 1, rol: 'developer', es_developer: 1, permisos: [] }, 'aud:ver'),
      true
    );
    assert.equal(
      permUtilsMod.getFirstAuthorizedPage({ id: 9, rol: 'almacen', es_developer: 0, permisos: [] }),
      'sin_acceso'
    );
    assert.equal(
      permUtilsMod.getFirstAuthorizedPage({ id: 9, rol: 'almacen', es_developer: 0, permisos: ['lev:ver', 'inv:ver'] }),
      'inventario'
    );

    // 4.2 Sidebar.jsx según permisos
    const devUser = { id: 1, nombre: 'Dev Principal', rol: 'developer', es_developer: 1, permisos: ['*'] };
    const partialUser = { id: 3, nombre: 'Solo Inv y Lev', rol: 'almacen', es_developer: 0, permisos: ['inv:ver', 'lev:ver'] };
    const zeroUser = { id: 8, nombre: 'Sin Permisos', rol: 'almacen', es_developer: 0, permisos: [] };

    const devSidebarHtml = withMockAppContext(makeAppContextStub({ user: devUser }), () =>
      renderToStaticMarkup(React.createElement(Sidebar, { activePage: 'dashboard', setActivePage: () => {}, collapsed: false, setCollapsed: () => {} }))
    );
    for (const label of [
      'Dashboard General', 'Inventario Maestro', 'Informática y Telecom', 'Oficinas y Mobiliario',
      'Cocina y Comedor', 'Almacén y Herramientas', 'Levantamientos y Auditorías', 'Sedes y Campamentos',
      'Movimientos de Stock', 'Centro de Reportes', 'Bitácora de Auditoría', 'Usuarios y Permisos'
    ]) {
      assert.ok(devSidebarHtml.includes(label), `Sidebar developer debe incluir "${label}"`);
    }

    const partialSidebarHtml = withMockAppContext(makeAppContextStub({ user: partialUser }), () =>
      renderToStaticMarkup(React.createElement(Sidebar, { activePage: 'inventario', setActivePage: () => {}, collapsed: false, setCollapsed: () => {} }))
    );
    for (const allowedLabel of [
      'Inventario Maestro', 'Informática y Telecom', 'Oficinas y Mobiliario',
      'Cocina y Comedor', 'Almacén y Herramientas', 'Levantamientos y Auditorías'
    ]) {
      assert.ok(partialSidebarHtml.includes(allowedLabel), `Sidebar parcial debe mostrar "${allowedLabel}"`);
    }
    for (const forbiddenLabel of [
      'Dashboard General', 'Sedes y Campamentos', 'Movimientos de Stock',
      'Centro de Reportes', 'Bitácora de Auditoría', 'Usuarios y Permisos'
    ]) {
      assert.ok(!partialSidebarHtml.includes(forbiddenLabel), `Sidebar parcial NO debe mostrar "${forbiddenLabel}"`);
    }

    const zeroSidebarHtml = withMockAppContext(makeAppContextStub({ user: zeroUser }), () =>
      renderToStaticMarkup(React.createElement(Sidebar, { activePage: 'sin_acceso', setActivePage: () => {}, collapsed: false, setCollapsed: () => {} }))
    );
    assert.ok(zeroSidebarHtml.includes('data-testid="sidebar-no-modules"'));
    assert.ok(zeroSidebarHtml.includes('Sin módulos asignados'));

    // 4.3 App.jsx: bloqueo de rutas directas no autorizadas, redirección raíz y 404
    await withDomAndGlobals({ initialPath: '/usuarios' }, async ({ doc }) => {
      await withMockAppContextAsync(makeAppContextStub({ user: partialUser }), async () => {
        const container = doc.createElement('div');
        const root = createRoot(container);
        await act(async () => { root.render(React.createElement(App)); });
        const html = container.outerHTML;
        assert.ok(html.includes('Acceso Restringido'), 'URL directa /usuarios por no-developer debe mostrar Acceso Restringido');
        assert.ok(!html.includes('Gestión Exclusiva de Usuarios'), 'URL directa /usuarios no debe renderizar UsuariosPage');
        await act(async () => { root.unmount(); });
      });
    });

    await withDomAndGlobals({ initialPath: '/reportes' }, async ({ doc }) => {
      await withMockAppContextAsync(makeAppContextStub({ user: partialUser }), async () => {
        const container = doc.createElement('div');
        const root = createRoot(container);
        await act(async () => { root.render(React.createElement(App)); });
        const html = container.outerHTML;
        assert.ok(html.includes('Acceso Denegado al Módulo'), 'URL directa /reportes sin rep:ver debe mostrar Acceso Denegado');
        assert.ok(html.includes('Centro de Reportes'));
        await act(async () => { root.unmount(); });
      });
    });

    await withDomAndGlobals({ initialPath: '/' }, async ({ doc, win }) => {
      await withMockAppContextAsync(makeAppContextStub({ user: partialUser }), async () => {
        const container = doc.createElement('div');
        const root = createRoot(container);
        await act(async () => { root.render(React.createElement(App)); });
        assert.equal(win.location.pathname, '/inventario', 'Entrada raíz sin dash:ver debe redirigir al primer módulo autorizado');
        await act(async () => { root.unmount(); });
      });
    });

    await withDomAndGlobals({ initialPath: '/' }, async ({ doc }) => {
      await withMockAppContextAsync(makeAppContextStub({ user: zeroUser }), async () => {
        const container = doc.createElement('div');
        const root = createRoot(container);
        await act(async () => { root.render(React.createElement(App)); });
        assert.ok(container.outerHTML.includes('Cuenta sin módulos autorizados'));
        await act(async () => { root.unmount(); });
      });
    });

    await withDomAndGlobals({ initialPath: '/ruta-inexistente-etapa5' }, async ({ doc }) => {
      await withMockAppContextAsync(makeAppContextStub({ user: devUser }), async () => {
        const container = doc.createElement('div');
        const root = createRoot(container);
        await act(async () => { root.render(React.createElement(App)); });
        assert.ok(container.outerHTML.includes('404 — Ruta no encontrada'));
        await act(async () => { root.unmount(); });
      });
    });

    // 4.4 UsuariosPage.jsx: C07 (área, múltiples campamentos) y sin developer/*
    const sampleUsers = [
      {
        id: 2,
        nombre: 'Operador Múltiple C07',
        email: 'c07@ingmelec-test.local',
        rol: 'almacen',
        cargo: 'Técnico QA',
        area: 'INFORMATICA',
        activo: 1,
        es_developer: 0,
        permisos: ['dash:ver', 'inv:ver'],
        campamentos_asignados: [
          { campamento_id: 1, nombre: 'ALMACÉN 27 DE FEBRERO', codigo: '27F', es_principal: 1 },
          { campamento_id: 3, nombre: 'CAMPAMENTO OPL', codigo: 'OPL', es_principal: 0 }
        ]
      }
    ];
    const sampleCamps = [
      { id: 1, nombre: 'ALMACÉN 27 DE FEBRERO', codigo: '27F' },
      { id: 3, nombre: 'CAMPAMENTO OPL', codigo: 'OPL' }
    ];

    const usuariosHtml = withMockAppContext(makeAppContextStub({ user: devUser }), () =>
      withUseStateSequence({ 0: sampleUsers, 1: sampleCamps, 2: [], 3: false, 4: 'usuarios' }, () =>
        renderToStaticMarkup(React.createElement(UsuariosPage))
      )
    );
    assert.ok(usuariosHtml.includes('Operador Múltiple C07'));
    assert.ok(usuariosHtml.includes('INFORMATICA'), 'UsuariosPage debe visualizar área asignada (C07)');
    assert.ok(usuariosHtml.includes('ALMACÉN 27 DE FEBRERO') && usuariosHtml.includes('CAMPAMENTO OPL'), 'UsuariosPage debe renderizar múltiples campamentos asignados (C07)');

    // Modal de creación abierto: verifica ausencia de developer/*, botón 0 permisos y modal M09
    const usuariosModalHtml = withMockAppContext(makeAppContextStub({ user: devUser }), () =>
      withUseStateSequence(
        {
          0: sampleUsers,
          1: sampleCamps,
          2: [],
          3: false,
          4: 'usuarios',
          5: true,
          15: sampleUsers[0]
        },
        () => renderToStaticMarkup(React.createElement(UsuariosPage))
      )
    );
    assert.ok(!usuariosModalHtml.includes('value="developer"'), 'Select de roles no debe ofrecer "developer"');
    assert.ok(usuariosModalHtml.includes('Sin acceso (0 permisos)'), 'Modal debe incluir botón "Sin acceso (0 permisos)"');
    assert.ok(usuariosModalHtml.includes('dash:ver'), 'Matriz de permisos debe incluir dash:ver');
    assert.ok(usuariosModalHtml.includes('aud:ver'), 'Matriz de permisos debe incluir aud:ver');
    assert.ok(usuariosModalHtml.includes('Confirmar Desactivación'), 'Modal de confirmación M09 debe renderizarse en React');

    // 4.5 Botones granulares A07 (visibles con permiso vs ocultos sin permiso)
    const readOnlyInvUser = { id: 10, nombre: 'Solo Lectura Inv', rol: 'admin', es_developer: 0, permisos: ['inv:ver', 'lev:ver', 'rep:ver', 'inv:movimientos_ver'] };
    const fullOpsUser = {
      id: 11,
      nombre: 'Operador Granular Completo',
      rol: 'almacen',
      es_developer: 0,
      permisos: [
        'inv:ver', 'inv:crear', 'inv:editar', 'inv:movimientos_ver', 'inv:movimientos_registrar',
        'lev:ver', 'lev:crear', 'lev:capturar', 'lev:editar', 'lev:importar', 'lev:consolidar',
        'rep:ver', 'rep:exportar', 'rep:imprimir', 'camp:ver', 'camp:operar'
      ]
    };

    await withDomAndGlobals({}, async () => {
      const invNoCreateHtml = withMockAppContext(makeAppContextStub({ user: readOnlyInvUser }), () =>
        renderToStaticMarkup(React.createElement(InventoryTable, { fixedArea: null, title: 'Inventario QA', allowCreate: true }))
      );
      assert.ok(!invNoCreateHtml.includes('Registrar Bien'), 'Sin inv:crear debe ocultar Registrar Bien');
      assert.ok(!invNoCreateHtml.includes('Exportar CSV'), 'Sin rep:exportar debe ocultar Exportar CSV');

      const invWithCreateHtml = withMockAppContext(makeAppContextStub({ user: fullOpsUser }), () =>
        renderToStaticMarkup(React.createElement(InventoryTable, { fixedArea: null, title: 'Inventario QA', allowCreate: true }))
      );
      assert.ok(invWithCreateHtml.includes('Registrar Bien'), 'Con inv:crear debe mostrar Registrar Bien');
      assert.ok(invWithCreateHtml.includes('Exportar CSV'), 'Con rep:exportar debe mostrar Exportar CSV');

      const movNoRegHtml = withMockAppContext(makeAppContextStub({ user: readOnlyInvUser }), () =>
        renderToStaticMarkup(React.createElement(MovimientosPage))
      );
      assert.ok(!movNoRegHtml.includes('Registrar Movimiento'), 'Sin inv:movimientos_registrar debe ocultar Registrar Movimiento');

      const movWithRegHtml = withMockAppContext(makeAppContextStub({ user: fullOpsUser }), () =>
        renderToStaticMarkup(React.createElement(MovimientosPage))
      );
      assert.ok(movWithRegHtml.includes('Registrar Movimiento'), 'Con inv:movimientos_registrar debe mostrar Registrar Movimiento');

      const repNoExportHtml = withMockAppContext(makeAppContextStub({ user: readOnlyInvUser }), () =>
        renderToStaticMarkup(React.createElement(ReportesPage))
      );
      assert.ok(!repNoExportHtml.includes('Imprimir / PDF'), 'Sin rep:imprimir debe ocultar Imprimir / PDF');
      assert.ok(!repNoExportHtml.includes('Exportar Todo a CSV'), 'Sin rep:exportar debe ocultar Exportar Todo a CSV');

      const repWithExportHtml = withMockAppContext(makeAppContextStub({ user: fullOpsUser }), () =>
        renderToStaticMarkup(React.createElement(ReportesPage))
      );
      assert.ok(repWithExportHtml.includes('Imprimir / PDF'));
      assert.ok(repWithExportHtml.includes('Exportar Todo a CSV'));

      const levNoCreateHtml = withMockAppContext(makeAppContextStub({ user: readOnlyInvUser }), () =>
        renderToStaticMarkup(React.createElement(LevantamientosPage, { navigateTo: () => {}, pageParams: {} }))
      );
      assert.ok(!levNoCreateHtml.includes('Nuevo Levantamiento'));
      assert.ok(!levNoCreateHtml.includes('Campamentos y Almacenes'));

      const levWithCreateHtml = withMockAppContext(makeAppContextStub({ user: fullOpsUser }), () =>
        renderToStaticMarkup(React.createElement(LevantamientosPage, { navigateTo: () => {}, pageParams: {} }))
      );
      assert.ok(levWithCreateHtml.includes('Nuevo Levantamiento'));
      assert.ok(levWithCreateHtml.includes('Campamentos y Almacenes'));

      // Smoke render de ItemDetailModal y LevantamientoWorkspace sin errores
      const itemModalHtml = withMockAppContext(makeAppContextStub({ user: readOnlyInvUser }), () =>
        renderToStaticMarkup(React.createElement(ItemDetailModal, { itemId: 1, onClose: () => {}, onUpdated: () => {} }))
      );
      assert.ok(itemModalHtml.length > 0);

      const wsHtml = withMockAppContext(makeAppContextStub({ user: readOnlyInvUser }), () =>
        renderToStaticMarkup(React.createElement(LevantamientoWorkspace, { levantamientoId: 1, onBack: () => {}, onConsolidated: () => {} }))
      );
      assert.ok(wsHtml.length > 0);
    });
  });
});
