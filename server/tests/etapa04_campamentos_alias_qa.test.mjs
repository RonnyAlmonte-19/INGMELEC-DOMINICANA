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
  resetSchemaCapabilitiesCache,
  normalizeAliasKey,
  resolveCampamentoVinculacion
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
        name: 'qa-etapa04-in-memory-jsx',
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
          if (mockAppContext && (source.endsWith('/context/AppContext') || source === '../context/AppContext' || source === '../../context/AppContext')) {
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

async function seedCleanDatabaseWithMigrations() {
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

function stripJsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// =========================================================================
// SUITE DE PRUEBAS ETAPA 4
// =========================================================================

describe('ETAPA 4 QA Independiente - Alias Canónicos, Sin IDs Fijos 3/12/13, Preview & Reasignación Segura', () => {
  test('1, 2 y 3. Migración 04, Eliminación de IDs Fijos y Reasignación Transaccional en MariaDB 3310 aislado', async (t) => {
    await withLocalMariaDb(
      async (instance) => {
        assert.equal(instance.host, '127.0.0.1');
        assert.equal(instance.port, MARIADB_PORT);
        assert.equal(instance.database, ISOLATED_DB_NAME);

        instance.applyEnv(process.env);
        applyIsolatedBaselineEnv();

        const fixtureSql = fs.readFileSync(FIXTURE_SQL_PATH, 'utf8');
        const migration03Sql = fs.readFileSync(MIGRATION_03_PATH, 'utf8');
        const migration04Sql = fs.readFileSync(MIGRATION_04_PATH, 'utf8');

        // -----------------------------------------------------------------
        // 1. Migración migration_04_v21_campamentos_alias.sql en BD real
        // -----------------------------------------------------------------
        await t.test('1. Migración 04 idempotente (x2), uk_alias_normalizado, FK ON DELETE RESTRICT y 0 cambios en inv_articulos', async () => {
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

          // Sembrar fixture + migration_03
          await setupPool.query(fixtureSql);
          await setupPool.query(migration03Sql);

          // Snapshot previo de los 29 artículos antes de migration_04
          const [[preArtSummary]] = await setupPool.query(
            'SELECT COUNT(*) AS total, COALESCE(SUM(COALESCE(cantidad_num, 0)), 0) AS sum_cant FROM inv_articulos'
          );
          const [prePendingRows] = await setupPool.query(
            'SELECT id, campamento_id, almacen_id, estado_vinculacion_sede, ubicacion_nombre, cantidad_num, cantidad_texto FROM inv_articulos WHERE id BETWEEN 15 AND 22 ORDER BY id ASC'
          );
          assert.equal(Number(preArtSummary.total), 29);
          assert.equal(prePendingRows.length, 8);

          // Ejecutar 2 veces consecutivas migration_04 (0 errores SQL e idempotencia)
          await setupPool.query(migration04Sql);
          await setupPool.query(migration04Sql);

          const [[aliasCountAfterSeed]] = await setupPool.query(
            'SELECT COUNT(*) AS total FROM inv_campamento_alias'
          );
          assert.equal(Number(aliasCountAfterSeed.total), 17);

          // Probar también escenario sin tabla previa inv_campamento_alias (DROP -> 2x migration_04)
          await setupPool.query('DROP TABLE `inv_campamento_alias`');
          await setupPool.query(migration04Sql);
          await setupPool.query(migration04Sql);

          const [[aliasCountRecreated]] = await setupPool.query(
            'SELECT COUNT(*) AS total FROM inv_campamento_alias'
          );
          assert.equal(Number(aliasCountRecreated.total), 17);

          // Verificar índice único uk_alias_normalizado y FK fk_alias_campamento (ON DELETE RESTRICT)
          const [idxRows] = await setupPool.query(
            `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND LOWER(TABLE_NAME) = 'inv_campamento_alias'
               AND LOWER(INDEX_NAME) = 'uk_alias_normalizado'`
          );
          assert.equal(idxRows.length, 1);
          assert.equal(Number(idxRows[0].NON_UNIQUE), 0);
          assert.equal(idxRows[0].COLUMN_NAME, 'alias_normalizado');

          const [fkRows] = await setupPool.query(
            `SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE, kcu.REFERENCED_TABLE_NAME
             FROM information_schema.REFERENTIAL_CONSTRAINTS rc
             JOIN information_schema.KEY_COLUMN_USAGE kcu
               ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
              AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
              AND rc.TABLE_NAME = kcu.TABLE_NAME
             WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
               AND LOWER(rc.TABLE_NAME) = 'inv_campamento_alias'
               AND LOWER(rc.CONSTRAINT_NAME) = 'fk_alias_campamento'`
          );
          assert.equal(fkRows.length, 1);
          assert.equal(fkRows[0].REFERENCED_TABLE_NAME.toLowerCase(), 'inv_campamentos');
          assert.equal(fkRows[0].DELETE_RULE.toUpperCase(), 'RESTRICT');

          // Intentar INSERT sin IGNORE con duplicado 'OPL' -> ER_DUP_ENTRY
          await assert.rejects(
            () => setupPool.query(
              `INSERT INTO inv_campamento_alias (campamento_id, codigo_campamento, alias_original, alias_normalizado)
               VALUES (3, 'CAMP-OPL', 'opl', 'OPL')`
            ),
            (err) => err?.code === 'ER_DUP_ENTRY'
          );

          // Intentar INSERT sin IGNORE con clave normalizada duplicada de 'km  19' ('KM 19') -> ER_DUP_ENTRY
          await assert.rejects(
            () => setupPool.query(
              `INSERT INTO inv_campamento_alias (campamento_id, codigo_campamento, alias_original, alias_normalizado)
               VALUES (3, 'CAMP-OPL', 'km  19', ?)`,
              [normalizeAliasKey('km  19')]
            ),
            (err) => err?.code === 'ER_DUP_ENTRY'
          );

          // Intentar DELETE sobre campamento referenciado (id=3) -> falla por FK ON DELETE RESTRICT
          await assert.rejects(
            () => setupPool.query('DELETE FROM inv_campamentos WHERE id = 3'),
            (err) => err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.errno === 1451
          );

          // Confirmar CERO alteraciones automáticas sobre los 29 artículos del fixture
          const [[postArtSummary]] = await setupPool.query(
            'SELECT COUNT(*) AS total, COALESCE(SUM(COALESCE(cantidad_num, 0)), 0) AS sum_cant FROM inv_articulos'
          );
          assert.equal(Number(postArtSummary.total), 29);
          assert.equal(Number(postArtSummary.sum_cant), Number(preArtSummary.sum_cant));

          const [postPendingRows] = await setupPool.query(
            'SELECT id, campamento_id, almacen_id, estado_vinculacion_sede, ubicacion_nombre, cantidad_num, cantidad_texto FROM inv_articulos WHERE id BETWEEN 15 AND 22 ORDER BY id ASC'
          );
          assert.deepEqual(postPendingRows, prePendingRows);
          for (const row of postPendingRows) {
            assert.equal(row.campamento_id, null);
            assert.equal(row.almacen_id, null);
            assert.equal(row.estado_vinculacion_sede, 'SEDE_AMBIGUA');
          }

          await closePool();
        });

        // Recargar estado limpio e iniciar Express + MySQL8 JSON Shim
        await seedCleanDatabaseWithMigrations();
        const shimPool = installJsonShimPool();
        const dummyHash = await argon2.hash(`QaEtapa4-${crypto.randomBytes(12).toString('hex')}`, ARGON2_TEST_OPTS);

        const devUser = {
          id: 1,
          nombre: 'Dev Sintético Principal',
          email: 'dev.sintetico@ingmelec-test.local',
          rol: 'developer',
          es_developer: 1,
          tv: 1
        };

        // Usuario #3 del fixture (almacen.opl, scope sede 3 sin camp:operar)
        const almacenOplFixtureUser = {
          id: 3,
          nombre: 'Operador Sintético Almacén OPL',
          email: 'almacen.opl.sintetico@ingmelec-test.local',
          rol: 'almacen',
          es_developer: 0,
          tv: 1
        };

        // Usuario no-global adicional en OPL CON permiso camp:operar (para probar guarda !scope.isGlobal)
        const oplOperarScopedUser = await createSyntheticUser(shimPool, {
          nombre: 'QA Scoped OPL Con CampOperar',
          email: 'qa.opl.operar@ingmelec-test.local',
          passwordHash: dummyHash,
          rol: 'admin',
          campamentoId: 3,
          permisos: ['inv:ver', 'camp:ver', 'camp:operar']
        });

        const apiApp = await startInProcessApiApp();
        try {
          const devToken = signTestJwt(devUser);
          const oplToken = signTestJwt(almacenOplFixtureUser);
          const oplOperarToken = signTestJwt(oplOperarScopedUser);

          // -----------------------------------------------------------------
          // 2. Eliminación de IDs Fijos 3/12/13 y Colisión 27 de Febrero != OPL
          // -----------------------------------------------------------------
          await t.test('2. Eliminación de IDs Fijos 3/12/13, colisión 27FEB vs OPL, resolver-alias y campamento dinámico', async () => {
            // 2A. Validación directa de normalizeAliasKey
            assert.equal(normalizeAliasKey('  ALMACÉN   27 de Febrero '), 'ALMACEN 27 DE FEBRERO');
            assert.equal(normalizeAliasKey('  km  19   Autopista   Duarte   opl '), 'KM 19 AUTOPISTA DUARTE OPL');
            assert.equal(normalizeAliasKey('opl'), 'OPL');
            assert.equal(normalizeAliasKey('km  19'), 'KM 19');
            assert.equal(normalizeAliasKey(null), '');
            assert.equal(normalizeAliasKey(undefined), '');

            // Validación directa de resolveCampamentoVinculacion(db, ...)
            const res27Feb = await resolveCampamentoVinculacion(shimPool, null, 'ALMACÉN 27 DE FEBRERO');
            assert.equal(res27Feb.campamento_id, 1);
            assert.equal(res27Feb.codigo_campamento, 'ALM-27FEB');
            assert.equal(res27Feb.almacen_id, 1);
            assert.equal(res27Feb.estado_vinculacion_sede, 'CONFIRMADO');

            const res27FebHist = await resolveCampamentoVinculacion(shimPool, null, 'DISTRITO NACIONAL 27 DE FEBRERO');
            assert.equal(res27FebHist.campamento_id, 1);
            assert.equal(res27FebHist.codigo_campamento, 'ALM-27FEB');

            const resOpl = await resolveCampamentoVinculacion(shimPool, null, 'OPL');
            assert.equal(resOpl.campamento_id, 3);
            assert.equal(resOpl.codigo_campamento, 'CAMP-OPL');
            assert.equal(resOpl.almacen_id, 2);
            assert.equal(resOpl.estado_vinculacion_sede, 'CONFIRMADO');
            assert.notEqual(res27Feb.campamento_id, resOpl.campamento_id);

            const resM633 = await resolveCampamentoVinculacion(shimPool, null, 'MANTENIMIENTO 633');
            assert.equal(resM633.campamento_id, 4);
            assert.equal(resM633.codigo_campamento, 'CAMP-M633');
            assert.equal(resM633.almacen_id, 3);
            assert.equal(resM633.estado_vinculacion_sede, 'CONFIRMADO');

            // 2B. HTTP POST /api/v2/campamentos/alias -> 409 en duplicados normalizados
            const dupKm19Res = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/alias', {
              method: 'POST',
              token: devToken,
              body: { campamento_id: 3, alias_original: 'km  19' }
            });
            assert.equal(dupKm19Res.status, 409);
            assert.equal(dupKm19Res.json?.success, false);

            const dupOplRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/alias', {
              method: 'POST',
              token: devToken,
              body: { campamento_id: 3, alias_original: 'OPL' }
            });
            assert.equal(dupOplRes.status, 409);

            const listAliasRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/alias', {
              token: devToken
            });
            assert.equal(listAliasRes.status, 200);
            assert.equal(listAliasRes.json?.success, true);
            assert.equal(listAliasRes.json?.aliases?.length, 17);

            // HTTP POST /api/v2/campamentos/resolver-alias sin crear duplicados en inv_campamentos
            const [[campCountBefore]] = await shimPool.query('SELECT COUNT(*) AS total FROM inv_campamentos');

            const directCases = [
              { input: 'ALMACÉN 27 DE FEBRERO', expectedId: 1, expectedCode: 'ALM-27FEB' },
              { input: 'DISTRITO NACIONAL 27 DE FEBRERO', expectedId: 1, expectedCode: 'ALM-27FEB' },
              { input: 'opl', expectedId: 3, expectedCode: 'CAMP-OPL' },
              { input: '  KM 19   AUTOPISTA DUARTE OPL ', expectedId: 3, expectedCode: 'CAMP-OPL' },
              { input: 'CAMP-OPL', expectedId: 3, expectedCode: 'CAMP-OPL' },
              { input: 'MANTENIMIENTO 633', expectedId: 4, expectedCode: 'CAMP-M633' },
              { input: 'CAMP-M633', expectedId: 4, expectedCode: 'CAMP-M633' }
            ];
            for (const c of directCases) {
              const directDirect = await resolveCampamentoVinculacion(shimPool, null, c.input);
              assert.equal(directDirect.campamento_id, c.expectedId, `Directo: ${c.input}`);
              assert.equal(directDirect.codigo_campamento, c.expectedCode, `Directo codigo: ${c.input}`);

              const httpRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/resolver-alias', {
                method: 'POST',
                token: devToken,
                body: { ubicacion_nombre: c.input }
              });
              assert.equal(httpRes.status, 200);
              assert.equal(httpRes.json?.success, true);
              assert.equal(httpRes.json?.resolucion?.campamento_id, c.expectedId, `HTTP: ${c.input}`);
              assert.equal(httpRes.json?.resolucion?.codigo_campamento, c.expectedCode, `HTTP codigo: ${c.input}`);
              assert.equal(httpRes.json?.resolucion?.estado_vinculacion_sede, 'CONFIRMADO');
            }

            // Alias con requiere_revision_historica = 1 -> NO auto-vincular (campamento_id: null, SEDE_AMBIGUA + sugerencia)
            const ambiguousCases = [
              { input: 'KM 19 AUT DUARTE', suggestedCode: 'CAMP-OPL' },
              { input: 'KM19', suggestedCode: 'CAMP-OPL' },
              { input: 'KM 19', suggestedCode: 'CAMP-OPL' },
              { input: 'KM 19 AUTOPISTA DUARTE', suggestedCode: 'CAMP-OPL' },
              { input: 'MANTENIMIENTO', suggestedCode: 'CAMP-M633' },
              { input: 'MANTENIMIENTO M633', suggestedCode: 'CAMP-M633' }
            ];
            for (const c of ambiguousCases) {
              const directAmb = await resolveCampamentoVinculacion(shimPool, null, c.input);
              assert.equal(directAmb.campamento_id, null, `Ambiguo directo no debe vincular: ${c.input}`);
              assert.equal(directAmb.estado_vinculacion_sede, 'SEDE_AMBIGUA');
              assert.equal(directAmb.requiere_revision_historica, true);
              assert.equal(directAmb.suggested_codigo_campamento, c.suggestedCode);

              const httpAmb = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/resolver-alias', {
                method: 'POST',
                token: devToken,
                body: { texto: c.input }
              });
              assert.equal(httpAmb.status, 200);
              assert.equal(httpAmb.json?.resolucion?.campamento_id, null, `Ambiguo HTTP no debe vincular: ${c.input}`);
              assert.equal(httpAmb.json?.resolucion?.estado_vinculacion_sede, 'SEDE_AMBIGUA');
              assert.equal(httpAmb.json?.resolucion?.requiere_revision_historica, true);
              assert.equal(httpAmb.json?.resolucion?.suggested_codigo_campamento, c.suggestedCode);
            }

            const [[campCountAfter]] = await shimPool.query('SELECT COUNT(*) AS total FROM inv_campamentos');
            assert.equal(Number(campCountAfter.total), Number(campCountBefore.total));

            // 2C. Campamento dinámico con ID > 4 + PUT /campamentos/:id + POST/PUT articulo + filtro campamento_codigo
            const createCampRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos', {
              method: 'POST',
              token: devToken,
              body: {
                nombre: 'BASE NORTE DINAMICA QA',
                codigo: 'CAMP-NORTE-TMP',
                provincia: 'Santiago',
                responsable: 'Encargado Norte QA'
              }
            });
            assert.equal(createCampRes.status, 201);
            assert.equal(createCampRes.json?.success, true);
            const dynCampId = Number(createCampRes.json.id);
            assert.ok(dynCampId > 4, `ID dinámico (${dynCampId}) debe ser > 4`);

            const putCampRes = await apiRequest(apiApp.baseUrl, `/api/v2/campamentos/${dynCampId}`, {
              method: 'PUT',
              token: devToken,
              body: {
                codigo: 'CAMP-NORTE-QA',
                clasificacion_sede: 'CONFIRMADO',
                ubicacion_historica_equivalente: 'BASE NORTE HISTORICA QA',
                provincia: 'Santiago Oeste'
              }
            });
            assert.equal(putCampRes.status, 200);
            assert.equal(putCampRes.json?.success, true);
            assert.equal(putCampRes.json?.campamento?.codigo, 'CAMP-NORTE-QA');
            assert.equal(putCampRes.json?.campamento?.clasificacion_sede, 'CONFIRMADO');

            const [dynAlmRows] = await shimPool.query(
              'SELECT id FROM inv_almacenes WHERE campamento_id = ? AND activo = 1 ORDER BY id ASC LIMIT 1',
              [dynCampId]
            );
            assert.equal(dynAlmRows.length, 1);
            const dynAlmId = Number(dynAlmRows[0].id);

            // Crear artículo vinculado al campamento dinámico
            const createArtDynRes = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', {
              method: 'POST',
              token: devToken,
              body: {
                area: 'ALMACEN',
                categoria: 'Equipos de Taller',
                articulo_nombre: 'Generador Base Norte QA',
                ubicacion_nombre: 'BASE NORTE DINAMICA QA',
                campamento_id: dynCampId,
                cantidad_num: 2,
                estado_fisico: 'Bueno'
              }
            });
            assert.equal(createArtDynRes.status, 201);
            assert.equal(createArtDynRes.json?.campamento_id, dynCampId);
            assert.equal(createArtDynRes.json?.almacen_id, dynAlmId);
            assert.equal(createArtDynRes.json?.estado_vinculacion_sede, 'CONFIRMADO');
            const artDynId = createArtDynRes.json.id;

            // Crear artículo inicialmente en Sede 1 (campamento_id=1, almacen_id=1) y trasladar a Sede Dinámica (bug prev.almacen_id)
            const createArtSede1Res = await apiRequest(apiApp.baseUrl, '/api/v2/articulos', {
              method: 'POST',
              token: devToken,
              body: {
                area: 'INFORMATICA',
                categoria: 'Redes y Telecomunicaciones',
                articulo_nombre: 'Switch Traslado Almacen BugFix QA',
                ubicacion_nombre: 'ALMACÉN 27 DE FEBRERO',
                campamento_id: 1,
                cantidad_num: 1,
                estado_fisico: 'Bueno'
              }
            });
            assert.equal(createArtSede1Res.status, 201);
            assert.equal(createArtSede1Res.json?.campamento_id, 1);
            assert.equal(createArtSede1Res.json?.almacen_id, 1);
            const movedArtId = createArtSede1Res.json.id;

            // Editar campamento_id vía PUT /articulos/:id -> almacen_id DEBE cambiar de 1 a dynAlmId
            const putArtToDynRes = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${movedArtId}`, {
              method: 'PUT',
              token: devToken,
              body: {
                campamento_id: dynCampId,
                ubicacion_nombre: 'BASE NORTE DINAMICA QA'
              }
            });
            assert.equal(putArtToDynRes.status, 200);

            const getMovedDyn = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${movedArtId}`, {
              token: devToken
            });
            assert.equal(getMovedDyn.status, 200);
            assert.equal(getMovedDyn.json?.articulo?.campamento_id, dynCampId);
            assert.equal(getMovedDyn.json?.articulo?.almacen_id, dynAlmId, 'almacen_id debe actualizarse al almacén destino y no conservar prev.almacen_id=1');
            assert.equal(getMovedDyn.json?.articulo?.estado_vinculacion_sede, 'CONFIRMADO');

            // Editar SOLO ubicacion_nombre hacia 'OPL' sin enviar campamento_id -> debe pasar a campamento_id=3, almacen_id=2
            const putArtToOplRes = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${movedArtId}`, {
              method: 'PUT',
              token: devToken,
              body: {
                ubicacion_nombre: 'OPL'
              }
            });
            assert.equal(putArtToOplRes.status, 200);

            const getMovedOpl = await apiRequest(apiApp.baseUrl, `/api/v2/articulos/${movedArtId}`, {
              token: devToken
            });
            assert.equal(getMovedOpl.status, 200);
            assert.equal(getMovedOpl.json?.articulo?.campamento_id, 3);
            assert.equal(getMovedOpl.json?.articulo?.almacen_id, 2, 'almacen_id debe actualizarse a 2 (OPL) y no conservar dynAlmId');

            // Filtrar con GET /api/v2/articulos?campamento_codigo=CAMP-NORTE-QA
            const filterByCodeRes = await apiRequest(
              apiApp.baseUrl,
              '/api/v2/articulos?campamento_codigo=CAMP-NORTE-QA',
              { token: devToken }
            );
            assert.equal(filterByCodeRes.status, 200);
            assert.equal(filterByCodeRes.json?.success, true);
            assert.equal(filterByCodeRes.json?.articulos?.length, 1);
            assert.equal(filterByCodeRes.json.articulos[0].id, artDynId);
            assert.equal(filterByCodeRes.json.articulos[0].campamento_codigo, 'CAMP-NORTE-QA');
          });

          // -----------------------------------------------------------------
          // 3. Dry-run Preview y Reasignación Transaccional Segura
          // -----------------------------------------------------------------
          await t.test('3. Dry-run Preview, Bloqueo 409, Rollback Atómico, Reasignación Segura y KPIs Dinámicos', async () => {
            // Re-sembrar fixture limpio para validar conteos deterministas sobre #1..#29
            await seedCleanDatabaseWithMigrations();
            installJsonShimPool();

            const oplOperarUserClean = await createSyntheticUser(getPool(), {
              nombre: 'QA Scoped OPL Con CampOperar Clean',
              email: 'qa.opl.operar.clean@ingmelec-test.local',
              passwordHash: dummyHash,
              rol: 'admin',
              campamentoId: 3,
              permisos: ['inv:ver', 'camp:ver', 'camp:operar']
            });
            const oplOperarCleanToken = signTestJwt(oplOperarUserClean);

            // 3A. Usuario almacen.opl (no global) recibe HTTP 403 en /preview y /aplicar
            for (const tok of [oplToken, oplOperarCleanToken]) {
              const prevForbidden = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/reasignaciones/preview', {
                method: 'POST',
                token: tok,
                body: { campamento_destino_codigo: 'CAMP-OPL' }
              });
              assert.equal(prevForbidden.status, 403, 'Usuario no global debe recibir 403 en /preview');

              const appForbidden = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/reasignaciones/aplicar', {
                method: 'POST',
                token: tok,
                body: { campamento_destino_codigo: 'CAMP-OPL', articulo_ids: [15] }
              });
              assert.equal(appForbidden.status, 403, 'Usuario no global debe recibir 403 en /aplicar');
            }

            // Snapshot previo de todos los artículos antes de preview
            const pool = getPool();
            const [artSnapshotBefore] = await pool.query(
              'SELECT id, codigo_original, serie_imei, ubicacion_nombre, campamento_id, almacen_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, observaciones FROM inv_articulos ORDER BY id ASC'
            );

            // 3B. Developer ejecuta preview hacia CAMP-OPL
            const previewRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/reasignaciones/preview', {
              method: 'POST',
              token: devToken,
              body: { campamento_destino_codigo: 'CAMP-OPL' }
            });
            assert.equal(previewRes.status, 200);
            assert.equal(previewRes.json?.success, true);

            const pv = previewRes.json;
            assert.equal(pv.campamento_destino?.id, 3);
            assert.equal(pv.campamento_destino?.codigo, 'CAMP-OPL');
            assert.equal(pv.almacen_destino?.id, 2);

            // Verificar antes vs despues_simulado
            assert.equal(pv.antes.total_articulos_global, 25);
            assert.equal(pv.despues_simulado.total_articulos_global, pv.antes.total_articulos_global);
            assert.equal(pv.despues_simulado.total_unidades_global, pv.antes.total_unidades_global);
            assert.equal(pv.antes.sin_sede_articulos, 8);
            assert.equal(pv.despues_simulado.sin_sede_articulos, 3);
            assert.equal(pv.antes.campamento_destino_articulos, 5);
            assert.equal(pv.despues_simulado.campamento_destino_articulos, 10);
            assert.equal(pv.resumen.impacto_fusiones_articulos, 0);
            assert.equal(pv.resumen.impacto_cantidades_alteradas, 0);

            // Verificar elegibles #15..#19 y bloqueo individual en #20 (HER-252 en ALMACEN KM 19 AUDITADO)
            const candById = new Map(pv.candidatos.map((c) => [c.id, c]));
            for (const eid of [15, 16, 17, 18, 19]) {
              const cand = candById.get(eid);
              assert.ok(cand, `Candidato #${eid} debe estar en preview`);
              assert.equal(cand.requiere_confirmacion_individual, false, `#${eid} debe ser elegible sin bloqueo`);
            }
            const cand20 = candById.get(20);
            assert.ok(cand20, 'Candidato #20 debe aparecer en preview de CAMP-OPL');
            assert.equal(cand20.codigo_original, 'HER-252');
            assert.equal(cand20.ubicacion_nombre, 'ALMACEN KM 19 AUDITADO');
            assert.equal(cand20.duplicado_codigo_detectado, true);
            assert.equal(cand20.es_ubicacion_no_homologada, true);
            assert.equal(cand20.requiere_confirmacion_individual, true);
            assert.ok(cand20.conflictos_codigo.some((cf) => cf.id === 5), '#20 debe reportar conflicto de código con #5');

            // Verificar cero mutaciones en BD tras preview
            const [artSnapshotAfterPreview] = await pool.query(
              'SELECT id, codigo_original, serie_imei, ubicacion_nombre, campamento_id, almacen_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, observaciones FROM inv_articulos ORDER BY id ASC'
            );
            assert.deepEqual(artSnapshotAfterPreview, artSnapshotBefore);

            // Probar además detección de HER-258 y serial duplicado en ítem pendiente sin sede
            const [insDupItem] = await pool.query(
              `INSERT INTO inv_articulos (
                codigo_original, area, categoria, articulo_nombre, serie_imei,
                cantidad_num, cantidad_texto, cantidad_verificada, unidad_medida,
                estado_fisico, ubicacion_nombre, activo, hoja_origen, fila_origen,
                campamento_id, almacen_id, es_sintetico, origen_datos, estado_vinculacion_sede
              ) VALUES (
                'HER-258', 'ALMACEN', 'Equipos de Taller', 'Taladro Pendiente Duplicado QA', 'SN-SYNTH-INF-9007',
                1.00, '1', 1, 'Unidad', 'Bueno', 'KM 19', 1, 'ALMACEN', 99,
                NULL, NULL, 0, 'OPERATIVO_REAL', 'SEDE_AMBIGUA'
              )`
            );
            const tempDupId = insDupItem.insertId;
            try {
              const dupPreviewRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/reasignaciones/preview', {
                method: 'POST',
                token: devToken,
                body: { campamento_destino_codigo: 'CAMP-OPL' }
              });
              assert.equal(dupPreviewRes.status, 200);
              const dupCand = dupPreviewRes.json.candidatos.find((c) => c.id === tempDupId);
              assert.ok(dupCand, 'Ítem temporal con HER-258 y serial duplicado debe evaluarse en preview');
              assert.equal(dupCand.duplicado_codigo_detectado, true);
              assert.equal(dupCand.duplicado_serie_detectado, true);
              assert.equal(dupCand.requiere_confirmacion_individual, true);
              assert.ok(dupCand.conflictos_codigo.some((cf) => cf.id === 4 || cf.id === 11));
              assert.ok(dupCand.conflictos_serie.some((cf) => cf.id === 7));
            } finally {
              await pool.query('DELETE FROM inv_articulos WHERE id = ?', [tempDupId]);
            }

            // 3C. POST /api/v2/campamentos/reasignaciones/aplicar
            // Caso 1: Incluir #20 SIN confirmar_revision_individual_ids -> HTTP 409 + Rollback atómico (0 cambios parciales)
            const conflictApplyRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/reasignaciones/aplicar', {
              method: 'POST',
              token: devToken,
              body: {
                campamento_destino_codigo: 'CAMP-OPL',
                articulo_ids: [15, 16, 17, 18, 20],
                confirmar_revision_individual_ids: [],
                motivo: 'Intento sin confirmación individual de #20'
              }
            });
            assert.equal(conflictApplyRes.status, 409);
            assert.equal(conflictApplyRes.json?.success, false);
            assert.equal(conflictApplyRes.json?.code, 'REVISION_INDIVIDUAL_REQUERIDA');
            assert.ok(conflictApplyRes.json?.bloqueados?.some((b) => b.id === 20));

            const [afterRollbackRows] = await pool.query(
              'SELECT id, codigo_original, serie_imei, ubicacion_nombre, campamento_id, almacen_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, observaciones FROM inv_articulos ORDER BY id ASC'
            );
            assert.deepEqual(afterRollbackRows, artSnapshotBefore, 'Rollback atómico: cero cambios parciales en #15..#20');

            // Caso 2: Aplicar únicamente aprobados [15, 16, 17, 18] -> HTTP 200
            const validApplyRes = await apiRequest(apiApp.baseUrl, '/api/v2/campamentos/reasignaciones/aplicar', {
              method: 'POST',
              token: devToken,
              body: {
                campamento_destino_codigo: 'CAMP-OPL',
                articulo_ids: [15, 16, 17, 18],
                motivo: 'Homologación QA aprobada de alias KM 19 -> CAMP-OPL'
              }
            });
            assert.equal(validApplyRes.status, 200);
            assert.equal(validApplyRes.json?.success, true);
            assert.equal(validApplyRes.json?.reasignados, 4);
            assert.equal(validApplyRes.json?.campamento_destino?.id, 3);
            assert.equal(validApplyRes.json?.almacen_destino?.id, 2);
            assert.equal(validApplyRes.json?.integridad_cantidades?.intacto, true);
            assert.equal(
              validApplyRes.json?.integridad_cantidades?.total_articulos_antes,
              validApplyRes.json?.integridad_cantidades?.total_articulos_despues
            );
            assert.equal(
              validApplyRes.json?.integridad_cantidades?.total_unidades_antes,
              validApplyRes.json?.integridad_cantidades?.total_unidades_despues
            );

            // Verificar BD tras aplicar [15, 16, 17, 18]
            const [[totalCountAfterApply]] = await pool.query('SELECT COUNT(*) AS total FROM inv_articulos');
            assert.equal(Number(totalCountAfterApply.total), 29, 'No debe fusionar ni eliminar filas');

            const [reassignedRows] = await pool.query(
              'SELECT id, campamento_id, almacen_id, estado_vinculacion_sede, ubicacion_nombre, cantidad_num, cantidad_texto FROM inv_articulos WHERE id IN (15, 16, 17, 18) ORDER BY id ASC'
            );
            const expectedOriginalById = new Map(
              artSnapshotBefore
                .filter((r) => [15, 16, 17, 18].includes(r.id))
                .map((r) => [r.id, r])
            );
            for (const r of reassignedRows) {
              const orig = expectedOriginalById.get(r.id);
              assert.equal(r.campamento_id, 3);
              assert.equal(r.almacen_id, 2);
              assert.equal(r.estado_vinculacion_sede, 'CONFIRMADO');
              assert.equal(r.ubicacion_nombre, orig.ubicacion_nombre, 'Debe conservar ubicacion_nombre histórica');
              assert.equal(Number(r.cantidad_num), Number(orig.cantidad_num), 'No debe alterar cantidad_num');
              assert.equal(r.cantidad_texto, orig.cantidad_texto, 'No debe alterar cantidad_texto');
            }

            // Verificar evento en inv_auditoria
            const [auditEvents] = await pool.query(
              "SELECT * FROM inv_auditoria WHERE accion = 'REASIGNACION_CAMPAMENTO_ALIAS' AND entidad = 'inv_campamentos' AND entidad_id = 3 ORDER BY id DESC LIMIT 1"
            );
            assert.equal(auditEvents.length, 1);
            assert.equal(auditEvents[0].detalles_nuevos?.reasignados, 4);
            assert.deepEqual(auditEvents[0].detalles_nuevos?.articulo_ids, [15, 16, 17, 18]);

            // Verificar GET /api/v2/dashboard/kpis dinámico tras reasignación
            const kpisAfterRes = await apiRequest(apiApp.baseUrl, '/api/v2/dashboard/kpis', { token: devToken });
            assert.equal(kpisAfterRes.status, 200);
            const sinSede = kpisAfterRes.json?.kpis?.sinSedeVerificada;
            assert.ok(sinSede, 'KPIs deben incluir sinSedeVerificada');
            assert.equal(sinSede.total_articulos, 4, 'Deben quedar 4 ítems sin sede (#19..#22)');
            assert.deepEqual(sinSede.por_departamento, {
              INFORMATICA: 0,
              OFICINAS: 0,
              COCINA: 0,
              ALMACEN: 4
            });
            assert.match(sinSede.motivo, /ALMACEN \(4\)/);
            assert.doesNotMatch(sinSede.motivo, /INFORMATICA \(61\)|OFICINAS \(43\)/);
            assert.equal(kpisAfterRes.json?.kpis?.consistenciaMatematica?.cuadraArticulos, true);
            assert.equal(kpisAfterRes.json?.kpis?.consistenciaMatematica?.cuadraUnidades, true);
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

    await t.test('5. Confirmación de cierre limpio sin procesos residuales en puerto 3310', async () => {
      await assertPortClosed('127.0.0.1', MARIADB_PORT);
    });
  });

  test('4. Verificación Frontend Etapa 4 (Sin Hardcodes 3/12/13 + Compilación Rolldown + Render React sin Error #31)', async (t) => {
    await t.test('4A. Verificación estática en InventoryTable.jsx, ReportesPage.jsx y UbicacionesPage.jsx', () => {
      const targetFiles = [
        'src/components/common/InventoryTable.jsx',
        'src/pages/ReportesPage.jsx',
        'src/pages/UbicacionesPage.jsx'
      ];

      for (const relPath of targetFiles) {
        const raw = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
        const codeOnly = stripJsComments(raw);

        assert.equal(
          /<option\s+value=["'](?:3|12|13)["']/.test(codeOnly),
          false,
          `${relPath} no debe contener opciones fijas <option value="3|12|13">`
        );
        assert.equal(
          /\b(?:433|1971)\b/.test(codeOnly),
          false,
          `${relPath} no debe contener cifras quemadas 433 ni 1971 en código ejecutable`
        );
        assert.equal(
          /61\s*\/\s*43|INFORMATICA\s*\(61\)|OFICINAS\s*\(43\)/i.test(codeOnly),
          false,
          `${relPath} no debe contener textos quemados 61 / 43`
        );
        assert.equal(
          /DISTRITO NACIONAL 27 DE FEBRERO/.test(codeOnly),
          false,
          `${relPath} no debe contener DISTRITO NACIONAL 27 DE FEBRERO quemado como default`
        );
      }
    });

    await t.test('4B. Compilación Rolldown + Render React (renderToStaticMarkup y createRoot+act) con IDs dinámicos 44 y 91', async () => {
      const [
        AppContextMod,
        InventoryTableMod,
        ReportesPageMod,
        UbicacionesPageMod
      ] = await Promise.all([
        compileJsxModuleInMemory('src/context/AppContext.jsx', { mockAppContext: false }),
        compileJsxModuleInMemory('src/components/common/InventoryTable.jsx', { mockAppContext: true, useReactStateHookProxy: true }),
        compileJsxModuleInMemory('src/pages/ReportesPage.jsx', { mockAppContext: true, useReactStateHookProxy: true }),
        compileJsxModuleInMemory('src/pages/UbicacionesPage.jsx', { mockAppContext: true, useReactStateHookProxy: true })
      ]);

      const dynamicCampamentos = [
        {
          id: 44,
          nombre: 'SEDE DINAMICA NORTE 44',
          codigo: 'CAMP-DIN-44',
          clasificacion_sede: 'CONFIRMADO',
          ubicacion_historica_equivalente: 'BASE NORTE 44',
          total_articulos: 12,
          total_fisico: 30,
          cantidad_almacenes: 1,
          almacenes: [{ id: 401, nombre: 'Almacén Dinámico 44', es_principal: 1 }],
          aliases: [
            { id: 1, alias_original: 'CAMP-DIN-44', requiere_revision_historica: 0, estado_validacion: 'CONFIRMADO' },
            { id: 2, alias_original: 'NORTE KM 44', requiere_revision_historica: 1, estado_validacion: 'CONFIRMADO' }
          ]
        },
        {
          id: 91,
          nombre: 'SEDE DINAMICA SUR 91',
          codigo: 'CAMP-DIN-91',
          clasificacion_sede: 'CONFIRMADO',
          ubicacion_historica_equivalente: 'BASE SUR 91',
          total_articulos: 8,
          total_fisico: 19,
          cantidad_almacenes: 1,
          almacenes: [{ id: 901, nombre: 'Almacén Dinámico 91', es_principal: 1 }],
          aliases: [
            { id: 3, alias_original: 'CAMP-DIN-91', requiere_revision_historica: 0, estado_validacion: 'CONFIRMADO' }
          ]
        }
      ];

      const dynamicKpis = {
        totalArticulos: 25,
        cantidadFisicaTotal: 55,
        porArea: { INFORMATICA: 9, OFICINAS: 5, COCINA: 3, ALMACEN: 8 },
        porCampamento: dynamicCampamentos,
        sinSedeVerificada: {
          id: 'SIN_SEDE',
          nombre: 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)',
          ubicacion_historica: 'NORTE KM 44 (5)',
          total_articulos: 5,
          total_fisico: 6,
          por_departamento: { INFORMATICA: 2, ALMACEN: 3 }
        },
        consistenciaMatematica: {
          totalGeneralArticulos: 25,
          sumaArticulosCampamentosConfirmados: 20,
          articulosSinSedeVerificada: 5,
          totalUnidadesFisicasConocidas: 55
        },
        ubicaciones: [
          { ubicacion_nombre: 'SEDE DINAMICA NORTE 44', count: 12 },
          { ubicacion_nombre: 'NORTE KM 44', count: 5 }
        ],
        campamentosPendientesValidacion: []
      };

      const baseCtx = {
        currentUser: { id: 1, nombre: 'Dev QA', rol: 'developer', es_developer: 1, permisos: ['*'] },
        currentRole: 'developer',
        hasPermission: () => true,
        activeCampamento: dynamicCampamentos[0],
        campamentosCatalog: dynamicCampamentos,
        kpis: dynamicKpis,
        refreshKpis: async () => {},
        refreshCampamentosCatalog: async () => dynamicCampamentos,
        fetchArticulos: async () => ({
          success: true,
          articulos: [
            {
              id: 501,
              codigo_original: 'HER-440',
              area: 'ALMACEN',
              categoria: 'Herramientas',
              articulo_nombre: 'Taladro Dinámico 44',
              marca_modelo: 'BrandSim',
              serie_imei: 'SN-440',
              cantidad_num: 3,
              unidad_medida: 'Unidad',
              estado_fisico: 'Bueno',
              campamento_id: 44,
              campamento_nombre: 'SEDE DINAMICA NORTE 44',
              ubicacion_nombre: 'BASE NORTE 44',
              propietario: 'INGMELEC',
              asignado_a: 'Custodio 44',
              observaciones: { detalle_obj: 'Objeto seguro contra Error #31' }
            }
          ],
          resumen: { totalRegistros: 1, totalUnidadesFisicas: 3, articulosSinCantidad: 0 },
          pagination: { total: 1, page: 1, limit: 25, totalPages: 1 }
        }),
        fetchReporteConsolidado: async () => ({
          success: true,
          reporte: {
            totales: { totalArticulos: 25, totalUnidades: 55, totalSinCantidad: 0 },
            areaEstado: [{ area: 'ALMACEN', estado_fisico: 'Bueno', registros: 8, total_unidades: 20 }],
            porCustodio: [{ custodio: 'Custodio Dinámico 44', articulos: 12 }],
            porUbicacion: [{ ubicacion_nombre: 'BASE NORTE 44', area: 'ALMACEN', registros: 12 }]
          }
        }),
        previewReasignacionAlias: async () => ({ success: true, candidatos: [], alertas: [] }),
        aplicarReasignacionAlias: async () => ({ success: true, reasignados: 0 })
      };

      // 1) InventoryTable: SSR + createRoot/act
      await withDomAndGlobals({ initialPath: '/inventario', initialSearch: '?campamento_id=44' }, async ({ doc }) => {
        const invSsrHtml = withMockAppContext(baseCtx, () =>
          renderToStaticMarkup(React.createElement(InventoryTableMod.default, { title: 'Inventario QA E4' }))
        );
        assert.match(invSsrHtml, /<option value="44"/);
        assert.match(invSsrHtml, /<option value="91"/);
        assert.match(invSsrHtml, /SEDE DINAMICA NORTE 44/);
        assert.match(invSsrHtml, /SEDE DINAMICA SUR 91/);
        assert.doesNotMatch(invSsrHtml, /<option value="(?:3|12|13)"/);

        const container = doc.createElement('div');
        const root = createRoot(container);
        await withMockAppContextAsync(baseCtx, async () => {
          try {
            await act(async () => {
              root.render(React.createElement(InventoryTableMod.default, { title: 'Inventario Dinámico Act' }));
            });
            assert.match(container.outerHTML, /Taladro Dinámico 44/);
            assert.match(container.outerHTML, /Objeto seguro contra Error #31/);
          } finally {
            await act(async () => {
              root.unmount();
            });
          }
        });
      });

      // 2) ReportesPage: SSR + createRoot/act
      await withDomAndGlobals({ initialPath: '/reportes' }, async ({ doc }) => {
        const repSsrHtml = withMockAppContext(baseCtx, () =>
          renderToStaticMarkup(React.createElement(ReportesPageMod.default))
        );
        assert.match(repSsrHtml, /<option value="44"/);
        assert.match(repSsrHtml, /<option value="91"/);
        assert.doesNotMatch(repSsrHtml, /<option value="(?:3|12|13)"/);

        const container = doc.createElement('div');
        const root = createRoot(container);
        await withMockAppContextAsync(baseCtx, async () => {
          try {
            await act(async () => {
              root.render(React.createElement(ReportesPageMod.default));
            });
            assert.match(container.outerHTML, /Custodio Dinámico 44/);
            assert.match(container.outerHTML, /BASE NORTE 44/);
          } finally {
            await act(async () => {
              root.unmount();
            });
          }
        });
      });

      // 3) UbicacionesPage: createRoot/act + SSR con previewData, alertas complejas (objetos) y candidatos bloqueados
      await withDomAndGlobals({ initialPath: '/ubicaciones' }, async ({ doc }) => {
        const container = doc.createElement('div');
        const root = createRoot(container);
        await withMockAppContextAsync(baseCtx, async () => {
          try {
            await act(async () => {
              root.render(React.createElement(UbicacionesPageMod.default));
            });
            const mountedHtml = container.outerHTML;
            assert.match(mountedHtml, /SEDE DINAMICA NORTE 44/);
            assert.match(mountedHtml, /SEDE DINAMICA SUR 91/);
            assert.match(mountedHtml, /NORTE KM 44/);
            assert.match(mountedHtml, /<option value="44"/);
            assert.match(mountedHtml, /<option value="91"/);
            assert.doesNotMatch(mountedHtml, /<option value="(?:3|12|13)"/);
          } finally {
            await act(async () => {
              root.unmount();
            });
          }
        });

        // SSR con el contrato JSON real exacto de /campamentos/reasignaciones/preview y 409 /aplicar
        const circularAlert = { tipo: 'DUPLICADO_CIRCULAR' };
        circularAlert.self = circularAlert;
        const previewState = {
          antes: {
            total_articulos_global: 25,
            total_unidades_global: 55,
            sin_sede_articulos: 5,
            sin_sede_unidades: 6,
            campamento_destino_articulos: 12,
            campamento_destino_unidades: 30
          },
          despues_simulado: {
            total_articulos_global: 25,
            total_unidades_global: 55,
            sin_sede_articulos: 1,
            sin_sede_unidades: 2,
            campamento_destino_articulos: 16,
            campamento_destino_unidades: 34,
            pendientes_revision_individual: 1
          },
          resumen: {
            total_candidatos: 2,
            elegibles: 1,
            bloqueados_revision_individual: 1,
            impacto_fusiones_articulos: 0,
            impacto_cantidades_alteradas: 0
          },
          alertas: [
            'Alerta textual de prueba Etapa 4',
            { tipo: 'CODIGO_DUPLICADO', mensaje: 'HER-252 duplicado', codigo_original: 'HER-252', ubicacion_nombre: 'NORTE KM 44' },
            circularAlert
          ],
          candidatos: [
            {
              id: 701,
              codigo_original: 'INF-701',
              articulo_nombre: 'Router Elegible Directo',
              area: 'INFORMATICA',
              ubicacion_nombre: 'NORTE KM 44',
              cantidad_num: 2,
              unidad_medida: 'Unidad',
              requiere_confirmacion_individual: false
            },
            {
              id: 702,
              codigo_original: 'HER-252',
              articulo_nombre: 'Amoladora Bloqueada QA',
              area: 'ALMACEN',
              ubicacion_nombre: 'ALMACEN KM 44 AUDITADO',
              cantidad_num: 1,
              unidad_medida: 'Unidad',
              requiere_confirmacion_individual: true,
              motivos_bloqueo: [
                'Código de referencia duplicado en inventario activo (HER-252).',
                'Ubicación histórica "ALMACEN KM 44 AUDITADO" no homologada como alias confirmado de CAMP-DIN-44.'
              ]
            }
          ]
        };

        const ubicSsrHtml = withMockAppContext(baseCtx, () =>
          withUseStateSequence(
            {
              3: '44', // targetCampamentoId
              4: '401', // targetAlmacenId
              5: ['NORTE KM 44'], // selectedAliases
              11: previewState, // previewData
              12: [701, 702], // selectedCandidateIds
              13: [], // confirmedIndividualIds
              15: true, // showConfirmBar
              17: {
                code: 'REVISION_INDIVIDUAL_REQUERIDA',
                message: 'Bloqueo de prueba Etapa 4',
                bloqueados: [
                  {
                    id: 702,
                    codigo_original: 'HER-252',
                    articulo_nombre: 'Amoladora Bloqueada QA',
                    motivos_bloqueo: [
                      'Código de referencia duplicado en inventario activo (HER-252).',
                      'Ubicación histórica "ALMACEN KM 44 AUDITADO" no homologada.'
                    ]
                  },
                  {
                    id: 703,
                    codigo_original: 'HER-258',
                    articulo_nombre: 'Taladro Bloqueado Texto QA',
                    motivos_bloqueo: 'Motivo bloqueo en cadena directa QA'
                  }
                ]
              }
            },
            () => renderToStaticMarkup(React.createElement(UbicacionesPageMod.default))
          )
        );
        assert.match(ubicSsrHtml, /12 art\./);
        assert.match(ubicSsrHtml, /30 u\./);
        assert.match(ubicSsrHtml, /16 art\./);
        assert.match(ubicSsrHtml, /34 u\./);
        assert.doesNotMatch(ubicSsrHtml, /12 art\.<\/strong>\s*·\s*<strong>—/);
        assert.doesNotMatch(ubicSsrHtml, /16 art\.<\/strong>\s*·\s*<strong>—/);
        assert.match(ubicSsrHtml, /Sin sede verificada:.*5 art\..*\(6 u\.\)/);
        assert.match(ubicSsrHtml, /Sin sede restante:.*1 art\..*\(2 u\.\)/);
        assert.match(ubicSsrHtml, /Total global:.*25 art\..*55 u\./);
        assert.match(ubicSsrHtml, /Total global intacto:.*25 art\..*55 u\./);
        assert.match(ubicSsrHtml, /Fusiones de registros:.*>0<\/strong>/);
        assert.match(ubicSsrHtml, /Cambios de cantidad:.*>0<\/strong>/);
        assert.match(ubicSsrHtml, /Alerta textual de prueba Etapa 4/);
        assert.match(ubicSsrHtml, /HER-252 duplicado/);
        assert.match(ubicSsrHtml, /\[Circular\]/);
        assert.match(ubicSsrHtml, /Amoladora Bloqueada QA/);
        assert.match(ubicSsrHtml, /Código de referencia duplicado en inventario activo \(HER-252\)\./);
        assert.match(ubicSsrHtml, /Ubicación histórica &quot;ALMACEN KM 44 AUDITADO&quot; no homologada como alias confirmado de CAMP-DIN-44\./);
        assert.match(ubicSsrHtml, /Motivo bloqueo en cadena directa QA/);
        assert.match(ubicSsrHtml, /REVISION_INDIVIDUAL_REQUERIDA/);
        assert.doesNotMatch(ubicSsrHtml, /Requiere confirmación explícita de revisión individual/);
      });

      // 4) AppContext.jsx: compilación real y flujo de helpers Etapa 4 sin Error #31 en toasts
      await withDomAndGlobals(
        {
          storageEntries: {
            ingmelec_token: 'jwt-qa-e4',
            ingmelec_user: JSON.stringify({ id: 1, nombre: 'Dev QA', rol: 'developer', es_developer: 1, permisos: ['*'] })
          },
          fetchMock: async (url) => {
            if (String(url).includes('/campamentos/reasignaciones/aplicar')) {
              return {
                status: 200,
                ok: true,
                json: async () => ({
                  success: true,
                  reasignados: 2,
                  message: { titulo: 'Aplicado OK', detalle: 'Sin fusiones' }
                })
              };
            }
            return {
              status: 200,
              ok: true,
              json: async () => ({ success: true, kpis: dynamicKpis, campamentos: dynamicCampamentos, esPruebas: true })
            };
          }
        },
        async ({ doc }) => {
          let capturedCtx = null;
          const Probe = () => {
            capturedCtx = AppContextMod.useApp();
            return React.createElement('span', null, 'probe-e4');
          };
          const container = doc.createElement('div');
          const root = createRoot(container);
          try {
            await act(async () => {
              root.render(React.createElement(AppContextMod.AppProvider, null, React.createElement(Probe)));
            });
            assert.equal(typeof capturedCtx.fetchCampamentoAliases, 'function');
            assert.equal(typeof capturedCtx.resolverAliasCampamento, 'function');
            assert.equal(typeof capturedCtx.previewReasignacionAlias, 'function');
            assert.equal(typeof capturedCtx.aplicarReasignacionAlias, 'function');
            assert.equal(typeof capturedCtx.updateCampamento, 'function');

            await act(async () => {
              const res = await capturedCtx.aplicarReasignacionAlias({
                campamento_destino_id: 44,
                articulo_ids: [701, 702]
              });
              assert.equal(res.success, true);
            });
            assert.match(container.textContent, /Aplicado OK/);
          } finally {
            await act(async () => {
              root.unmount();
            });
          }
        }
      );
    });
  });
});
