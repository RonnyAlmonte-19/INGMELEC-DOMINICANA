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
import { getSheetData } from 'write-excel-file/node';

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
const ROLLBACK_SQL_PATH = path.join(REPO_ROOT, 'server', 'database', 'migrations', 'rollback_clever_cloud_produccion.sql');
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
const READ_EXCEL_FILE_URL = pathToFileURL(require.resolve('read-excel-file/browser')).href;
const WRITE_EXCEL_FILE_URL = pathToFileURL(require.resolve('write-excel-file/browser')).href;

async function compileJsxModuleInMemory(entryRelativePath, options = {}) {
  const { mockAppContext = true } = options;
  const entryAbsPath = path.resolve(REPO_ROOT, entryRelativePath);
  const bundle = await rolldown({
    input: entryAbsPath,
    plugins: [
      {
        name: 'qa-etapa06-in-memory-jsx',
        resolveId(source) {
          if (source === 'react') return { id: REACT_FILE_URL, external: true };
          if (source === 'react/jsx-runtime') return { id: REACT_JSX_RUNTIME_URL, external: true };
          if (source === 'react/jsx-dev-runtime') return { id: REACT_JSX_DEV_RUNTIME_URL, external: true };
          if (source === 'lucide-react') return { id: LUCIDE_FILE_URL, external: true };
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

function createMiniDom() {
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

  const win = {
    location: { pathname: '/', search: '', href: 'http://127.0.0.1/' },
    history: { state: null, replaceState() {}, pushState() {} },
    addEventListener() {},
    removeEventListener() {},
    Event: class { constructor(type) { this.type = type; } preventDefault() {} stopPropagation() {} },
    HTMLIFrameElement: class {},
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

  return { doc, win };
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

async function withDomEnv(fn) {
  const { doc, win } = createMiniDom();
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
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

  try {
    return await fn({ doc, win });
  } finally {
    await new Promise((r) => prevSetTimeout(r, 30));
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
  // Segunda ejecución para verificar idempotencia total de migration_06
  await setupPool.query(m6);
  await closePool();
}

describe('Etapa 6 QA Independiente — Integridad FK/Índices, Movimientos, Importación, Consolidación y UI', () => {
  test('1. BD (A10, B06, M06): migration_06 idempotente, ON DELETE RESTRICT, FKs, índices y rollback seguro', async () => {
    try {
      await withLocalMariaDb({ port: MARIADB_PORT, datadir: MARIADB_DATADIR }, async () => {
        await seedDatabaseUpToMigration06();
        const setupPool = getPool(null, { allowMultipleStatements: true });

        // 1.1 Verificar DELETE_RULE RESTRICT en inv_movimientos.articulo_id -> inv_articulos.id
        const [movFkRows] = await setupPool.query(
          `SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE, rc.UPDATE_RULE
           FROM information_schema.KEY_COLUMN_USAGE kcu
           JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
             ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
            AND rc.TABLE_NAME = kcu.TABLE_NAME
            AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
           WHERE kcu.TABLE_SCHEMA = DATABASE()
             AND kcu.TABLE_NAME = 'inv_movimientos'
             AND kcu.COLUMN_NAME = 'articulo_id'
             AND kcu.REFERENCED_TABLE_NAME = 'inv_articulos'`
        );
        assert.equal(movFkRows.length, 1);
        assert.equal(movFkRows[0].DELETE_RULE, 'RESTRICT', 'fk_mov_articulo debe exigir ON DELETE RESTRICT');

        // Confirmar que MariaDB rechaza el DELETE físico de un artículo referenciado en inv_movimientos
        await assert.rejects(
          async () => {
            await setupPool.query('DELETE FROM inv_articulos WHERE id = 1');
          },
          (err) => err && (err.errno === 1451 || err.code === 'ER_ROW_IS_REFERENCED_2')
        );

        // 1.2 Verificar todas las relaciones FK críticas de A10
        const [allFks] = await setupPool.query(
          `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
           FROM information_schema.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`
        );
        const fkSet = new Set(allFks.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}->${r.REFERENCED_TABLE_NAME}`));
        const requiredFks = [
          'inv_movimientos.articulo_id->inv_articulos',
          'inv_movimientos.usuario_id->inv_usuarios',
          'inv_articulos.lote_id->inv_lotes_importacion',
          'inv_articulos.creado_por->inv_usuarios',
          'inv_articulos.campamento_id->inv_campamentos',
          'inv_articulos.almacen_id->inv_almacenes',
          'inv_lotes_importacion.usuario_id->inv_usuarios',
          'inv_auditoria.usuario_id->inv_usuarios',
          'inv_levantamientos.campamento_id->inv_campamentos',
          'inv_levantamientos.almacen_id->inv_almacenes',
          'inv_levantamientos.consolidado_por->inv_usuarios',
          'inv_levantamientos.creado_por->inv_usuarios',
          'inv_levantamiento_items.levantamiento_id->inv_levantamientos',
          'inv_levantamiento_items.articulo_maestro_id->inv_articulos',
          'inv_levantamiento_items.creado_por->inv_usuarios',
          'inv_usuarios.campamento_id->inv_campamentos',
          'inv_usuarios.almacen_id->inv_almacenes',
          'inv_usuario_campamentos.usuario_id->inv_usuarios',
          'inv_usuario_campamentos.campamento_id->inv_campamentos',
          'inv_usuario_almacenes.usuario_id->inv_usuarios',
          'inv_usuario_almacenes.almacen_id->inv_almacenes'
        ];
        for (const reqFk of requiredFks) {
          assert.equal(fkSet.has(reqFk), true, `Falta FK obligatoria: ${reqFk}`);
        }

        // 1.3 Índices compuestos y retiro de índices redundantes (B06)
        const [artIdx] = await setupPool.query(
          `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS cols
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_articulos' AND INDEX_NAME = 'idx_art_filtro_compuesto'
           GROUP BY INDEX_NAME`
        );
        assert.equal(artIdx.length, 1);
        assert.equal(artIdx[0].cols, 'activo,es_sintetico,campamento_id,area');

        const [movIdx] = await setupPool.query(
          `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS cols
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND INDEX_NAME = 'idx_mov_sint_fecha'
           GROUP BY INDEX_NAME`
        );
        assert.equal(movIdx.length, 1);
        assert.equal(movIdx[0].cols, 'es_sintetico,fecha_movimiento');

        const preservedIndexes = [
          ['inv_usuarios', 'idx_inv_usuarios_email'],
          ['inv_categorias', 'idx_cat_area'],
          ['inv_custodios', 'idx_cust_nombre'],
          ['inv_campamentos', 'idx_camp_nombre'],
          ['inv_levantamientos', 'idx_lev_codigo'],
          ['inv_usuario_campamentos', 'idx_uc_usuario'],
          ['inv_usuario_almacenes', 'idx_ua_usuario']
        ];
        for (const [tbl, idxName] of preservedIndexes) {
          const [rows] = await setupPool.query(
            `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
            [tbl, idxName]
          );
          assert.ok(Number(rows[0].cnt) >= 1, `migration_06_v21_safe debe preservar índice existente ${tbl}.${idxName}`);
        }

        // 1.4 Rollback seguro M06: verificar ausencia de patrones destructivos ejecutables y probar reversión idempotente
        const rollbackSql = fs.readFileSync(ROLLBACK_SQL_PATH, 'utf8');
        const uncommentedRollback = rollbackSql
          .split(/\r?\n/)
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n');
        assert.doesNotMatch(uncommentedRollback, /WHERE\s+id\s+IN\s*\(\s*1/i);
        assert.doesNotMatch(uncommentedRollback, /id\s*<=\s*434/i);
        assert.doesNotMatch(uncommentedRollback, /permisos_json\s*=\s*NULL/i);

        const [beforeArtRows] = await setupPool.query('SELECT COUNT(*) AS cnt FROM inv_articulos');
        await setupPool.query(rollbackSql);
        const [afterArtRows] = await setupPool.query('SELECT COUNT(*) AS cnt FROM inv_articulos');
        assert.equal(afterArtRows[0].cnt, beforeArtRows[0].cnt, 'Rollback no debe borrar artículos');
        const [permCount] = await setupPool.query('SELECT COUNT(*) AS cnt FROM inv_usuarios WHERE permisos_json IS NULL');
        assert.equal(Number(permCount[0].cnt), 0, 'Rollback no debe anular permisos_json');

        // Reaplicar migration_06 para restaurar estado óptimo final
        const m6Sql = fs.readFileSync(MIGRATION_06_PATH, 'utf8');
        await setupPool.query(m6Sql);
        await closePool();
      });
    } finally {
      await closePool();
      await assertPortClosed('127.0.0.1', MARIADB_PORT);
    }
  });

  test('2. API Transaccional (A06, M07): stock NULL/0, bloqueo SALIDA/TRASLADO, concurrencia FOR UPDATE y seriales', async () => {
    try {
      await withLocalMariaDb({ port: MARIADB_PORT, datadir: MARIADB_DATADIR }, async () => {
        await seedDatabaseUpToMigration06();
        const pool = installJsonShimPool();
        const server = await startInProcessApiApp();
        try {
          const [devRows] = await pool.query('SELECT id, nombre, email, rol, es_developer, token_version FROM inv_usuarios WHERE es_developer = 1 LIMIT 1');
          const devToken = signTestJwt({ ...devRows[0], tv: devRows[0].token_version });

          // 2.1 POST /articulos con cantidad_num = 0 y NULL -> movimiento en inv_movimientos registra cantidad = 0 (M07)
          const resZero = await apiRequest(server.baseUrl, '/api/v2/articulos', {
            method: 'POST',
            token: devToken,
            body: {
              area: 'ALMACEN',
              articulo_nombre: 'Fusible Stock Cero QA',
              cantidad_num: 0,
              unidad_medida: 'Unidad',
              estado_fisico: 'Bueno',
              ubicacion_nombre: 'ALMACÉN 27 DE FEBRERO',
              campamento_id: 1,
              serie_imei: 'S/N'
            }
          });
          assert.equal(resZero.status, 201);
          const [movZero] = await pool.query(
            'SELECT cantidad, tipo_movimiento FROM inv_movimientos WHERE articulo_id = ? ORDER BY id DESC LIMIT 1',
            [resZero.json.id]
          );
          assert.equal(Number(movZero[0].cantidad), 0);

          const resNull = await apiRequest(server.baseUrl, '/api/v2/articulos', {
            method: 'POST',
            token: devToken,
            body: {
              area: 'INFORMATICA',
              articulo_nombre: 'Cableado Pendiente Conteo QA',
              cantidad_num: null,
              estado_fisico: 'Pendiente de verificación',
              ubicacion_nombre: 'ALMACÉN 27 DE FEBRERO',
              campamento_id: 1,
              serie_imei: 'N/A'
            }
          });
          assert.equal(resNull.status, 201);
          const [artNullRows] = await pool.query(
            'SELECT cantidad_num, cantidad_verificada, estado_cantidad FROM inv_articulos WHERE id = ?',
            [resNull.json.id]
          );
          assert.equal(artNullRows[0].cantidad_num, null);
          assert.equal(Number(artNullRows[0].cantidad_verificada), 0);

          // 2.2 Placeholders repetidos permitidos; serial real duplicado rechazado 409
          const resDupSerial = await apiRequest(server.baseUrl, '/api/v2/articulos', {
            method: 'POST',
            token: devToken,
            body: {
              area: 'INFORMATICA',
              articulo_nombre: 'Laptop Serial Duplicado',
              cantidad_num: 1,
              ubicacion_nombre: 'ALMACÉN 27 DE FEBRERO',
              campamento_id: 1,
              serie_imei: 'sn-synth-inf-9001'
            }
          });
          assert.equal(resDupSerial.status, 409);

          // 2.3 Concurrencia FOR UPDATE en códigos automáticos de artículos y levantamientos
          const concurrentArts = await Promise.all([1, 2, 3].map((idx) =>
            apiRequest(server.baseUrl, '/api/v2/articulos', {
              method: 'POST',
              token: devToken,
              body: {
                area: 'OFICINAS',
                articulo_nombre: `Mobiliario Concurrente QA ${idx}`,
                cantidad_num: 1,
                ubicacion_nombre: 'ALMACÉN 27 DE FEBRERO',
                campamento_id: 1,
                serie_imei: '-'
              }
            })
          ));
          assert.equal(concurrentArts.every((r) => r.status === 201), true);
          const createdCodes = concurrentArts.map((r) => r.json.codigo_original);
          assert.equal(new Set(createdCodes).size, 3, `Códigos concurrentes deben ser únicos: ${createdCodes.join(',')}`);

          const concurrentLevs = await Promise.all([1, 2, 3].map((idx) =>
            apiRequest(server.baseUrl, '/api/v2/levantamientos', {
              method: 'POST',
              token: devToken,
              body: {
                titulo: `Auditoría Concurrente QA ${idx}`,
                campamento_id: 1,
                responsable_levantamiento: 'Tester Concurrente'
              }
            })
          ));
          assert.equal(concurrentLevs.every((r) => r.status === 201), true);
          const levCodes = concurrentLevs.map((r) => r.json.codigo_levantamiento);
          assert.equal(new Set(levCodes).size, 3, `Códigos de levantamiento deben ser únicos: ${levCodes.join(',')}`);

          // 2.4 Movimientos (A06): bloquear SALIDA/TRASLADO/ASIGNACION sobre cantidad no verificada (#6), aprobar tras ENTRADA
          for (const tipo of ['SALIDA', 'TRASLADO', 'ASIGNACION']) {
            const blocked = await apiRequest(server.baseUrl, '/api/v2/movimientos', {
              method: 'POST',
              token: devToken,
              body: {
                articulo_id: 6,
                tipo_movimiento: tipo,
                cantidad: 1,
                ubicacion_destino: 'OPL',
                campamento_destino_id: 3,
                motivo: `Prueba bloqueo ${tipo}`
              }
            });
            assert.equal(blocked.status, 409, `${tipo} debe bloquearse (409) en artículo no verificado`);
          }

          // Exceso de stock en artículo #2 (stock 4)
          const overStock = await apiRequest(server.baseUrl, '/api/v2/movimientos', {
            method: 'POST',
            token: devToken,
            body: {
              articulo_id: 2,
              tipo_movimiento: 'SALIDA',
              cantidad: 5,
              motivo: 'Intento sobregiro'
            }
          });
          assert.equal(overStock.status, 400);

          // ENTRADA sobre #6 verifica stock (= 3) y habilita SALIDA (= 1 -> stock queda 2)
          const entradaFix = await apiRequest(server.baseUrl, '/api/v2/movimientos', {
            method: 'POST',
            token: devToken,
            body: {
              articulo_id: 6,
              tipo_movimiento: 'ENTRADA',
              cantidad: 3,
              motivo: 'Verificación física inicial'
            }
          });
          assert.equal(entradaFix.status, 200);
          assert.equal(Number(entradaFix.json.nuevaCantidad), 3);

          const salidaOk = await apiRequest(server.baseUrl, '/api/v2/movimientos', {
            method: 'POST',
            token: devToken,
            body: {
              articulo_id: 6,
              tipo_movimiento: 'SALIDA',
              cantidad: 1,
              motivo: 'Despacho autorizado post-verificación'
            }
          });
          assert.equal(salidaOk.status, 200);
          assert.equal(Number(salidaOk.json.nuevaCantidad), 2);

          // 2.5 TRASLADO requiere destino y actualiza campamento_id / ubicacion_nombre / estado_vinculacion_sede
          const badTraslado = await apiRequest(server.baseUrl, '/api/v2/movimientos', {
            method: 'POST',
            token: devToken,
            body: {
              articulo_id: 1,
              tipo_movimiento: 'TRASLADO',
              cantidad: 1,
              ubicacion_destino: '   ',
              motivo: 'Traslado sin destino'
            }
          });
          assert.equal(badTraslado.status, 400);

          const okTraslado = await apiRequest(server.baseUrl, '/api/v2/movimientos', {
            method: 'POST',
            token: devToken,
            body: {
              articulo_id: 1,
              tipo_movimiento: 'TRASLADO',
              cantidad: 2,
              campamento_destino_id: 3,
              ubicacion_destino: 'OPL',
              motivo: 'Traslado completo hacia OPL'
            }
          });
          assert.equal(okTraslado.status, 200);
          const [art1After] = await pool.query(
            'SELECT campamento_id, ubicacion_nombre, estado_vinculacion_sede FROM inv_articulos WHERE id = 1'
          );
          assert.equal(Number(art1After[0].campamento_id), 3);
          assert.equal(art1After[0].estado_vinculacion_sede, 'CONFIRMADO');

          // 2.6 Propagación de es_sintetico = 1 a inv_movimientos en artículo sintético #26
          const synthMov = await apiRequest(server.baseUrl, '/api/v2/movimientos', {
            method: 'POST',
            token: devToken,
            body: {
              articulo_id: 26,
              tipo_movimiento: 'AJUSTE',
              cantidad: 4,
              motivo: 'Ajuste sintético aislado'
            }
          });
          assert.equal(synthMov.status, 200);
          const [mov26Rows] = await pool.query(
            'SELECT es_sintetico FROM inv_movimientos WHERE id = ?',
            [synthMov.json.movimiento_id]
          );
          assert.equal(Number(mov26Rows[0].es_sintetico), 1);
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

  test('3. Levantamientos (C04, M02): importación estricta, consolidación ACID con duplicados y conciliación físico vs teórico', async () => {
    try {
      await withLocalMariaDb({ port: MARIADB_PORT, datadir: MARIADB_DATADIR }, async () => {
        await seedDatabaseUpToMigration06();
        const pool = installJsonShimPool();
        const server = await startInProcessApiApp();
        try {
          const [devRows] = await pool.query('SELECT id, nombre, email, rol, es_developer, token_version FROM inv_usuarios WHERE es_developer = 1 LIMIT 1');
          const devToken = signTestJwt({ ...devRows[0], tv: devRows[0].token_version });

          // 3.1 Bloqueo de consolidación en sesiones terminales (#3 Cancelado, #2 Finalizado)
          const resCancel = await apiRequest(server.baseUrl, '/api/v2/levantamientos/3/consolidar', {
            method: 'POST',
            token: devToken,
            body: {}
          });
          assert.equal(resCancel.status, 409);

          const resFinal = await apiRequest(server.baseUrl, '/api/v2/levantamientos/2/consolidar', {
            method: 'POST',
            token: devToken,
            body: {}
          });
          assert.equal(resFinal.status, 409);

          // 3.2 Consolidar Levantamiento #1: primero detecta colisión Maestro (#23) Y duplicado intra-lote (SN-SYNTH-LEV-DUP01)
          const [beforeMasterCount] = await pool.query('SELECT COUNT(*) AS cnt FROM inv_articulos');
          const resConflict = await apiRequest(server.baseUrl, '/api/v2/levantamientos/1/consolidar', {
            method: 'POST',
            token: devToken,
            body: {}
          });
          assert.equal(resConflict.status, 409);
          assert.equal(resConflict.json.bloqueado_por_duplicados, true);
          const serialsFlagged = (resConflict.json.duplicados || []).map((d) => d.serie_imei);
          assert.equal(serialsFlagged.includes('SN-SYNTH-INF-9023'), true);
          assert.equal(serialsFlagged.includes('SN-SYNTH-LEV-DUP01'), true);
          const [afterConflictCount] = await pool.query('SELECT COUNT(*) AS cnt FROM inv_articulos');
          assert.equal(afterConflictCount[0].cnt, beforeMasterCount[0].cnt, '409 no debe dejar escrituras parciales');

          // Reintentar con VINCULAR_EXISTENTE sin autorizar cambios de sede/custodio/estado
          const resConsolidateOk = await apiRequest(server.baseUrl, '/api/v2/levantamientos/1/consolidar', {
            method: 'POST',
            token: devToken,
            body: {
              resolucion_duplicados: 'VINCULAR_EXISTENTE',
              autorizar_reubicacion: false,
              autorizar_cambio_custodio: false,
              autorizar_cambio_estado: false
            }
          });
          assert.equal(resConsolidateOk.status, 200, `Consolidación falló: ${resConsolidateOk.text}`);
          assert.equal(resConsolidateOk.json.articulos_incorporados, 2, 'Solo SN-SYNTH-LEV-DUP01 (1ra vez) + MOB-9103 deben crear maestros');
          assert.equal(resConsolidateOk.json.articulos_vinculados, 2, '#23 maestro + 2da aparición de SN-SYNTH-LEV-DUP01 deben vincularse');

          // Maestro #23 conservó estado original 'Fuera de servicio' y Custodio original
          const [art23Rows] = await pool.query('SELECT estado_fisico, asignado_a FROM inv_articulos WHERE id = 23');
          assert.equal(art23Rows[0].estado_fisico, 'Fuera de servicio');
          assert.equal(art23Rows[0].asignado_a, 'Custodio Sintético Beta');

          // Duplicado intra-lote SN-SYNTH-LEV-DUP01 generó EXACTAMENTE 1 registro maestro y ambos ítems apuntan a él
          const [dupMasterRows] = await pool.query(
            "SELECT id FROM inv_articulos WHERE serie_imei = 'SN-SYNTH-LEV-DUP01' AND activo = 1"
          );
          assert.equal(dupMasterRows.length, 1);
          const [dupSessionItems] = await pool.query(
            "SELECT consolidado, articulo_maestro_id FROM inv_levantamiento_items WHERE levantamiento_id = 1 AND serie_imei = 'SN-SYNTH-LEV-DUP01'"
          );
          assert.equal(dupSessionItems.length, 2);
          assert.equal(dupSessionItems.every((r) => Number(r.consolidado) === 1 && Number(r.articulo_maestro_id) === Number(dupMasterRows[0].id)), true);

          // Reintento inmediato de consolidación bloqueado por inmutabilidad 'Finalizado'
          const resIdempBlock = await apiRequest(server.baseUrl, '/api/v2/levantamientos/1/consolidar', {
            method: 'POST',
            token: devToken,
            body: { resolucion_duplicados: 'VINCULAR_EXISTENTE' }
          });
          assert.equal(resIdempBlock.status, 409);

          // 3.3 Sesión sintética #4 (es_sintetico = 1): propagar es_sintetico a nuevos artículos y movimientos
          const addSyntItem = await apiRequest(server.baseUrl, '/api/v2/levantamientos/4/items', {
            method: 'POST',
            token: devToken,
            body: {
              area: 'ALMACEN',
              articulo_nombre: 'Equipo Nuevo Consolidado Sintético QA',
              serie_imei: 'SN-SYNTH-UNIQUE-LEV4',
              cantidad: 2.5,
              estado_fisico: 'Bueno'
            }
          });
          assert.equal(addSyntItem.status, 201);

          const resConsLev4 = await apiRequest(server.baseUrl, '/api/v2/levantamientos/4/consolidar', {
            method: 'POST',
            token: devToken,
            body: { resolucion_duplicados: 'VINCULAR_EXISTENTE' }
          });
          assert.equal(resConsLev4.status, 200);
          const [synNewArt] = await pool.query(
            "SELECT id, es_sintetico, cantidad_num FROM inv_articulos WHERE serie_imei = 'SN-SYNTH-UNIQUE-LEV4'"
          );
          assert.equal(synNewArt.length, 1);
          assert.equal(Number(synNewArt[0].es_sintetico), 1);
          assert.equal(Number(synNewArt[0].cantidad_num), 2.5);
          const [synMov] = await pool.query(
            'SELECT es_sintetico FROM inv_movimientos WHERE articulo_id = ?',
            [synNewArt[0].id]
          );
          assert.equal(Number(synMov[0].es_sintetico), 1);

          // 3.4 Importación Excel (POST /import-items) + Conciliación Físico vs Teórico (solo lectura) en sede OPL (id=3)
          const resNewLev = await apiRequest(server.baseUrl, '/api/v2/levantamientos', {
            method: 'POST',
            token: devToken,
            body: {
              titulo: 'Auditoría Conciliación OPL QA',
              campamento_id: 3,
              almacen_id: 2,
              responsable_levantamiento: 'Auditor Conciliación QA'
            }
          });
          assert.equal(resNewLev.status, 201);
          const oplLevId = resNewLev.json.id;

          // Rechazar cantidades negativas y texto no numérico con 400
          const badImport = await apiRequest(server.baseUrl, `/api/v2/levantamientos/${oplLevId}/import-items`, {
            method: 'POST',
            token: devToken,
            body: {
              items: [
                { area: 'INFORMATICA', articulo_nombre: 'Router Malo', cantidad: -3 },
                { area: 'INFORMATICA', articulo_nombre: 'Router Texto', cantidad: 'ABC' }
              ]
            }
          });
          assert.equal(badImport.status, 400);
          assert.equal(Array.isArray(badImport.json.errores) && badImport.json.errores.length === 2, true);

          // Importar lote mixto válido con decimales (coincidencia + diferencia + sobrante)
          const okImport = await apiRequest(server.baseUrl, `/api/v2/levantamientos/${oplLevId}/import-items`, {
            method: 'POST',
            token: devToken,
            body: {
              items: [
                { area: 'INFORMATICA', articulo_nombre: 'Switch Rack 24 Puertos Sintético', serie_imei: 'SN-SYNTH-INF-9007', cantidad: 2, estado_fisico: 'Bueno' },
                { area: 'INFORMATICA', articulo_nombre: 'UPS Rack 3000VA Sintético', serie_imei: 'SN-SYNTH-INF-9025', cantidad: 1, estado_fisico: 'Bueno' },
                { area: 'ALMACEN', articulo_nombre: 'Cable Coaxial Excedente OPL', serie_imei: 'SN-SYNTH-SURPLUS-777', cantidad: 12.5, estado_fisico: 'Bueno' }
              ]
            }
          });
          assert.equal(okImport.status, 200);
          assert.equal(okImport.json.insertados, 3);
          assert.equal(okImport.json.warnings.length >= 2, true, 'Debe alertar seriales ya presentes en maestro');

          // Conciliación físico vs teórico solo lectura
          const [beforeOplMaster] = await pool.query('SELECT id, cantidad_num, campamento_id FROM inv_articulos WHERE campamento_id = 3 ORDER BY id ASC');
          const resConcil = await apiRequest(server.baseUrl, `/api/v2/levantamientos/${oplLevId}/conciliacion`, {
            token: devToken
          });
          assert.equal(resConcil.status, 200);
          assert.equal(resConcil.json.solo_lectura, true);
          assert.equal(resConcil.json.resumen.coincidencias_exactas >= 1, true);
          assert.equal(resConcil.json.resumen.diferencias_cantidad_count >= 1, true);
          assert.equal(resConcil.json.resumen.sobrantes_count >= 1, true);
          assert.equal(resConcil.json.resumen.faltantes_count >= 1, true);
          const diffUps = resConcil.json.diferencias_cantidad.find((d) => d.serie_imei === 'SN-SYNTH-INF-9025');
          assert.equal(Number(diffUps.diferencia), -1);

          const [afterOplMaster] = await pool.query('SELECT id, cantidad_num, campamento_id FROM inv_articulos WHERE campamento_id = 3 ORDER BY id ASC');
          assert.deepEqual(afterOplMaster, beforeOplMaster, 'Conciliación nunca debe modificar inv_articulos');
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

  test('4. Frontend React ETAPA 6: LevantamientoWorkspace (case-insensitive, Excel, Conciliación) e ItemDetailModal (inv:eliminar)', async () => {
    const { default: LevantamientoWorkspace } = await compileJsxModuleInMemory('src/components/levantamientos/LevantamientoWorkspace.jsx');
    const { default: ItemDetailModal } = await compileJsxModuleInMemory('src/components/common/ItemDetailModal.jsx');

    // 4.1 ItemDetailModal con permiso inv:eliminar -> botón "Retirar Bien" + modal React de confirmación (cero window.confirm)
    let deletedItemId = null;
    let updatedCount = 0;
    let closedCount = 0;

    await withDomEnv(async ({ doc }) => {
      const rootEl = doc.createElement('div');
      const root = createRoot(rootEl);

      const mockItem = {
        id: 77,
        codigo_original: 'INF-7777',
        area: 'INFORMATICA',
        articulo_nombre: 'Switch de Prueba QA Modal',
        categoria: 'Redes y Telecomunicaciones',
        marca_modelo: 'NetSim',
        tipo_caracteristicas: '24P',
        serie_imei: 'SN-MODAL-77',
        propietario: 'INGMELEC',
        asignado_a: 'Custodio QA',
        cantidad_num: 1,
        unidad_medida: 'Unidad',
        estado_fisico: 'Bueno',
        ubicacion_nombre: 'OPL',
        zona_estante: 'R1'
      };

      await withMockAppContextAsync(
        {
          currentUser: { id: 2, rol: 'admin', es_developer: 0, permisos: ['inv:ver', 'inv:editar', 'inv:eliminar'] },
          getArticuloById: async () => ({ success: true, articulo: mockItem, historial_movimientos: [] }),
          updateArticulo: async () => ({ success: true }),
          deleteArticulo: async (id) => {
            deletedItemId = id;
            return { success: true };
          }
        },
        async () => {
          await act(async () => {
            root.render(React.createElement(ItemDetailModal, {
              itemId: 77,
              onClose: () => { closedCount += 1; },
              onUpdated: () => { updatedCount += 1; }
            }));
          });
          await new Promise((r) => setTimeout(r, 20));
          await act(async () => {});

          const buttons = findNodes(rootEl, (n) => n.tagName === 'BUTTON');
          const retirarBtn = buttons.find((b) => b.textContent.includes('Retirar Bien'));
          assert.ok(retirarBtn, 'Usuario con inv:eliminar debe ver botón Retirar Bien');

          await act(async () => {
            retirarBtn.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
          });

          assert.equal(rootEl.outerHTML.includes('Confirmar retiro lógico del bien'), true);
          const confirmBtn = findNodes(rootEl, (n) => n.tagName === 'BUTTON' && n.textContent.includes('Confirmar Retiro'))[0];
          assert.ok(confirmBtn, 'Debe mostrarse botón Confirmar Retiro en modal React');

          await act(async () => {
            confirmBtn.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
          });
          assert.equal(deletedItemId, 77);
          assert.equal(updatedCount, 1);
          assert.equal(closedCount, 1);

          await act(async () => {
            root.unmount();
          });
        }
      );

      // Sin permiso inv:eliminar no debe mostrarse "Retirar Bien"
      const rootEl2 = doc.createElement('div');
      const root2 = createRoot(rootEl2);
      await withMockAppContextAsync(
        {
          currentUser: { id: 3, rol: 'almacenista', es_developer: 0, permisos: ['inv:ver', 'inv:editar'] },
          getArticuloById: async () => ({ success: true, articulo: mockItem, historial_movimientos: [] }),
          updateArticulo: async () => ({ success: true }),
          deleteArticulo: async () => ({ success: true })
        },
        async () => {
          await act(async () => {
            root2.render(React.createElement(ItemDetailModal, { itemId: 77, onClose: () => {}, onUpdated: () => {} }));
          });
          await new Promise((r) => setTimeout(r, 20));
          await act(async () => {});
          assert.equal(rootEl2.outerHTML.includes('Retirar Bien'), false);
          await act(async () => {
            root2.unmount();
          });
        }
      );
    });

    // 4.2 LevantamientoWorkspace: stats case-insensitive ('Bueno'), botón Conciliación y lectura Excel ArrayBuffer
    let conciliacionCalled = 0;
    await withDomEnv(async ({ doc }) => {
      const rootEl = doc.createElement('div');
      const root = createRoot(rootEl);

      await withMockAppContextAsync(
        {
          currentUser: { id: 2, rol: 'admin', es_developer: 0, permisos: ['lev:ver', 'lev:capturar', 'lev:editar', 'lev:importar', 'lev:consolidar'] },
          getLevantamientoById: async () => ({
            success: true,
            levantamiento: {
              id: 1,
              codigo_levantamiento: 'LEV-2026-001',
              titulo: 'Auditoría QA Frontend',
              campamento_nombre: 'ALMACÉN 27 DE FEBRERO',
              almacen_nombre: 'Central',
              responsable_levantamiento: 'Auditor QA',
              estado: 'En proceso'
            },
            resumen: { areas: [], estados: [] }
          }),
          fetchLevantamientoItems: async () => ({
            success: true,
            items: [
              { id: 1, area: 'ALMACEN', articulo_nombre: 'Item Bueno Mixed Case', cantidad: 2, estado_fisico: 'Bueno' },
              { id: 2, area: 'INFORMATICA', articulo_nombre: 'Item Bueno Upper', cantidad: 3, estado_fisico: 'BUENO' }
            ]
          }),
          fetchArticulos: async () => ({ success: true, articulos: [] }),
          fetchCategorias: async () => ({ success: true, categorias: [] }),
          fetchCustodios: async () => ({ success: true, custodios: [] }),
          fetchLevantamientoConciliacion: async () => {
            conciliacionCalled += 1;
            return {
              success: true,
              solo_lectura: true,
              resumen: {
                total_teorico_registros: 4,
                total_fisico_registros: 2,
                coincidencias_exactas: 1,
                diferencias_cantidad_count: 1,
                faltantes_count: 1,
                sobrantes_count: 0
              },
              diferencias_cantidad: [
                { codigo_original: 'INF-9001', articulo_nombre: 'Item Diferencia', cantidad_teorica: 5, cantidad_fisica: 3, diferencia: -2 }
              ],
              faltantes_no_localizados: [],
              sobrantes_en_campo: [],
              coincidencias: []
            };
          },
          showToast: () => {}
        },
        async () => {
          await act(async () => {
            root.render(React.createElement(LevantamientoWorkspace, {
              levantamientoId: 1,
              onBack: () => {},
              onConsolidated: () => {}
            }));
          });
          await new Promise((r) => setTimeout(r, 30));
          await act(async () => {});

          const html = rootEl.outerHTML;
          assert.equal(html.includes('Condición Óptima'), true);
          assert.equal(html.includes('>5<'), true, 'La suma Bueno + BUENO debe totalizar 5 sin sensibilidad a mayúsculas');
          assert.equal(html.includes('bg-emerald-100 text-emerald-800'), true, 'La insignia de estado Bueno debe aplicar estilo verde');

          const concilBtn = findNodes(rootEl, (n) => n.tagName === 'BUTTON' && n.textContent.includes('Conciliación Físico vs Teórico'))[0];
          assert.ok(concilBtn, 'Debe renderizarse botón Conciliación Físico vs Teórico');

          await act(async () => {
            concilBtn.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
          });
          await new Promise((r) => setTimeout(r, 20));
          await act(async () => {});

          assert.equal(conciliacionCalled, 1);
          assert.equal(rootEl.outerHTML.includes('Item Diferencia'), true);
          await act(async () => {
            root.unmount();
          });
        }
      );
    });

    // 4.3 Verificar envío correcto de payload en LevantamientosPage (almacenesIniciales)
    const levPageCode = fs.readFileSync(path.join(REPO_ROOT, 'src', 'pages', 'LevantamientosPage.jsx'), 'utf8');
    assert.equal(levPageCode.includes('almacenesIniciales:'), true);
    assert.equal(/\balmacenes:\s*nuevoCampForm/.test(levPageCode), false);
    // Confirmar uso de readSpreadsheetFileToSheets sin SheetJS/readAsBinaryString en LevantamientoWorkspace
    const wsCode = fs.readFileSync(path.join(REPO_ROOT, 'src', 'components', 'levantamientos', 'LevantamientoWorkspace.jsx'), 'utf8');
    assert.equal(wsCode.includes('readSpreadsheetFileToSheets'), true);
    assert.equal(wsCode.includes('readAsBinaryString'), false);
    assert.equal(wsCode.includes("from 'xlsx'"), false);
    assert.ok(getSheetData);
  });
});
