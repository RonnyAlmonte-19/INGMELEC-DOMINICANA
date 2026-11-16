/**
 * INGMELEC | ALMACÉN GENERAL (v2.1)
 * Shim ESM de Simulación Fiel de MySQL 8.0 (MYSQL_TYPE_JSON) para Entornos de Prueba
 *
 * Propósito:
 *   En MySQL 8.0 productivo (Clever Cloud), `mysql2` detecta `MYSQL_TYPE_JSON` (columnType = 245)
 *   y parsea automáticamente las columnas JSON a objetos o arreglos JavaScript al leer filas.
 *   En MariaDB 10.11 local, el tipo `JSON` es un alias de `LONGTEXT` (wire type BLOB/STRING),
 *   por lo que `mysql2` devuelve cadenas JSON crudas y oculta errores reales de producción como:
 *     - CRIT-01: React Error #31 al renderizar `inv_auditoria.detalles_previos` / `detalles_nuevos`
 *                cuando son objetos JS (`{ activo: 0 }`) en lugar de strings.
 *     - CRIT-07: Error SQL en `PUT /usuarios/:id` cuando `permisos` viene omitido y el backend
 *                re-envía `targetUser.permisos_json` como Array JS (`['inv:ver', ...]`) a `mysql2`,
 *                que expande arreglos en listas SQL inválidas.
 *
 * Uso:
 *   1. Envolver un `pool` real de `mysql2/promise` o mock en memoria:
 *        const wrapped = wrapMysql8JsonPool(pool);
 *        setPoolOverride(wrapped);
 *   2. O instalarlo sobre un módulo `db.js` ya importado / resuelto de forma segura en Windows:
 *        await installMysql8JsonShim(dbModuleOrRelativePath);
 *
 * Nota de seguridad y portabilidad:
 *   No modifica `server/database/db.js` ni usa rutas absolutas fijas; cualquier carga
 *   dinámica opcional utiliza rutas relativas y `pathToFileURL` compatible con Windows.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MYSQL_TYPE_JSON = 245;

export const DEFAULT_MYSQL8_JSON_COLUMNS = Object.freeze([
  'detalles_previos',
  'detalles_nuevos',
  'permisos_json',
  'detalles_json'
]);

const WRAPPED_POOL_SYMBOL = Symbol.for('ingmelec.mysql8JsonShim.pool');
const WRAPPED_CONN_SYMBOL = Symbol.for('ingmelec.mysql8JsonShim.connection');

/**
 * Construye o reutiliza el conjunto normalizado (minúsculas) de columnas JSON a parsear.
 * @param {Iterable<string>} [extraColumns]
 * @returns {Set<string>}
 */
function resolveJsonColumnSet(extraColumns) {
  if (extraColumns instanceof Set) {
    return extraColumns;
  }
  const set = new Set(DEFAULT_MYSQL8_JSON_COLUMNS);
  if (extraColumns) {
    for (const col of extraColumns) {
      if (typeof col === 'string' && col.trim() !== '') {
        set.add(col.trim().toLowerCase());
      }
    }
  }
  return set;
}

/**
 * Parsea un valor crudo proveniente de columna JSON (string o Buffer de MariaDB/MySQL)
 * devolviendo su valor JS equivalente (objeto, arreglo, primitivo) de forma idempotente.
 *
 * @param {unknown} value
 * @param {{ strictJson?: boolean, columnName?: string }} [options]
 * @returns {unknown}
 */
export function parseMysql8JsonValue(value, options = {}) {
  if (value === null || value === undefined) {
    return value;
  }

  let raw = value;
  if (Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }

  if (typeof raw !== 'string') {
    // Ya viene parseado (p. ej. si el motor real es MySQL 8.0)
    return value;
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return raw;
  }

  try {
    return JSON.parse(trimmed);
  } catch (err) {
    if (options.strictJson) {
      const colLabel = options.columnName ? ` en columna "${options.columnName}"` : '';
      throw new SyntaxError(`JSON inválido${colLabel}: ${err.message}`);
    }
    return value;
  }
}

/**
 * Extrae metadatos de columnas con wire type MYSQL_TYPE_JSON (245) si están presentes.
 * @param {unknown} fields
 * @returns {Set<string>}
 */
function extractNativeJsonFieldNames(fields) {
  const nativeSet = new Set();
  if (!Array.isArray(fields)) {
    return nativeSet;
  }
  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    const typeCode = field.columnType ?? field.type;
    if (typeCode === MYSQL_TYPE_JSON) {
      const name = field.name || field.orgName;
      if (typeof name === 'string' && name.trim() !== '') {
        nativeSet.add(name.trim().toLowerCase());
      }
    }
  }
  return nativeSet;
}

/**
 * Transforma una fila individual convirtiendo las columnas JSON conocidas a valores JS.
 * No muta la fila original (devuelve copia superficial cuando hay cambios).
 *
 * @param {Record<string, unknown>} row
 * @param {Set<string>} jsonColumns
 * @param {Set<string>} [nativeJsonFields]
 * @param {{ strictJson?: boolean }} [options]
 * @returns {Record<string, unknown>}
 */
export function transformMysql8JsonRow(row, jsonColumns, nativeJsonFields = new Set(), options = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || Buffer.isBuffer(row)) {
    return row;
  }

  let cloned = null;
  for (const key of Object.keys(row)) {
    const lowerKey = key.toLowerCase();
    if (!jsonColumns.has(lowerKey) && !nativeJsonFields.has(lowerKey)) {
      continue;
    }
    const current = row[key];
    if (typeof current === 'string' || Buffer.isBuffer(current)) {
      const parsed = parseMysql8JsonValue(current, {
        strictJson: Boolean(options.strictJson),
        columnName: key
      });
      if (parsed !== current) {
        if (!cloned) {
          cloned = { ...row };
        }
        cloned[key] = parsed;
      }
    }
  }

  return cloned || row;
}

/**
 * Transforma un conjunto de filas (soporta ResultSet simple y multi-statement mixto).
 * @param {unknown[]} rows
 * @param {unknown} fields
 * @param {Set<string>} jsonColumns
 * @param {{ strictJson?: boolean }} [options]
 * @returns {unknown[]}
 */
function transformRowsPayload(rows, fields, jsonColumns, options) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  // Soporte para multipleStatements: true (p. ej. [ [Row...], ResultSetHeader, [Row...] ])
  if (rows.some((entry) => Array.isArray(entry))) {
    return rows.map((subRows, idx) => {
      if (!Array.isArray(subRows)) {
        return subRows;
      }
      const subFields = Array.isArray(fields) ? fields[idx] : undefined;
      const nativeSet = extractNativeJsonFieldNames(subFields);
      return subRows.map((r) => transformMysql8JsonRow(r, jsonColumns, nativeSet, options));
    });
  }

  const nativeSet = extractNativeJsonFieldNames(fields);
  return rows.map((r) => transformMysql8JsonRow(r, jsonColumns, nativeSet, options));
}

/**
 * Transforma la tupla `[rows, fields]` retornada por `mysql2/promise` (`query` / `execute`).
 * Mantiene intactos parámetros salientes para que fallos reales (como CRIT-07 con Arrays)
 * se reproduzcan fielmente.
 *
 * @template T
 * @param {T} queryResult
 * @param {{ jsonColumns?: Iterable<string>, strictJson?: boolean }} [options]
 * @returns {T}
 */
export function transformMysql8JsonResult(queryResult, options = {}) {
  if (!Array.isArray(queryResult) || queryResult.length === 0) {
    return queryResult;
  }

  const [rows, fields, ...rest] = queryResult;
  if (!Array.isArray(rows)) {
    // OkPacket / ResultSetHeader de INSERT/UPDATE/DELETE
    return queryResult;
  }

  const jsonColumns = resolveJsonColumnSet(options.jsonColumns);
  const transformedRows = transformRowsPayload(rows, fields, jsonColumns, options);
  return /** @type {T} */ ([transformedRows, fields, ...rest]);
}

/**
 * Envuelve una conexión `mysql2/promise` (o mock compatible) para simular lectura MySQL 8.0 JSON.
 *
 * @template {object} TConn
 * @param {TConn} connection
 * @param {{ jsonColumns?: Iterable<string>, strictJson?: boolean }} [options]
 * @returns {TConn}
 */
export function wrapMysql8JsonConnection(connection, options = {}) {
  if (!connection || typeof connection !== 'object') {
    throw new TypeError('wrapMysql8JsonConnection requiere una instancia válida de conexión.');
  }
  if (connection[WRAPPED_CONN_SYMBOL]) {
    return connection;
  }

  const normalizedOptions = {
    jsonColumns: resolveJsonColumnSet(options.jsonColumns),
    strictJson: Boolean(options.strictJson)
  };

  return new Proxy(connection, {
    get(target, prop) {
      if (prop === WRAPPED_CONN_SYMBOL) {
        return true;
      }
      if (prop === 'query' && typeof target.query === 'function') {
        return async (...args) => {
          const result = await target.query(...args);
          return transformMysql8JsonResult(result, normalizedOptions);
        };
      }
      if (prop === 'execute' && typeof target.execute === 'function') {
        return async (...args) => {
          const result = await target.execute(...args);
          return transformMysql8JsonResult(result, normalizedOptions);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

/**
 * Envuelve un `pool` de `mysql2/promise` (real o mock en memoria) garantizando que todas las
 * lecturas vía `pool.query`, `pool.execute` y `pool.getConnection()` devuelvan las columnas JSON
 * parseadas como objetos/arreglos JavaScript, simulando `MYSQL_TYPE_JSON` de MySQL 8.0.
 *
 * @template {object} TPool
 * @param {TPool} pool
 * @param {{ jsonColumns?: Iterable<string>, strictJson?: boolean }} [options]
 * @returns {TPool}
 */
export function wrapMysql8JsonPool(pool, options = {}) {
  if (!pool || typeof pool !== 'object') {
    throw new TypeError('wrapMysql8JsonPool requiere una instancia válida de pool mysql2/promise.');
  }
  if (pool[WRAPPED_POOL_SYMBOL]) {
    return pool;
  }

  const normalizedOptions = {
    jsonColumns: resolveJsonColumnSet(options.jsonColumns),
    strictJson: Boolean(options.strictJson)
  };

  return new Proxy(pool, {
    get(target, prop) {
      if (prop === WRAPPED_POOL_SYMBOL) {
        return true;
      }
      if (prop === 'query' && typeof target.query === 'function') {
        return async (...args) => {
          const result = await target.query(...args);
          return transformMysql8JsonResult(result, normalizedOptions);
        };
      }
      if (prop === 'execute' && typeof target.execute === 'function') {
        return async (...args) => {
          const result = await target.execute(...args);
          return transformMysql8JsonResult(result, normalizedOptions);
        };
      }
      if (prop === 'getConnection' && typeof target.getConnection === 'function') {
        return async (...args) => {
          const conn = await target.getConnection(...args);
          return wrapMysql8JsonConnection(conn, normalizedOptions);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

/**
 * Helper de conveniencia para crear y envolver un pool de pruebas sin acoplar rutas fijas.
 *
 * @param {{ createPool: (config: object) => object }} mysqlPromiseModule
 * @param {object} dbConfig
 * @param {{ jsonColumns?: Iterable<string>, strictJson?: boolean }} [options]
 * @returns {object}
 */
export function createMysql8JsonTestPool(mysqlPromiseModule, dbConfig, options = {}) {
  if (!mysqlPromiseModule || typeof mysqlPromiseModule.createPool !== 'function') {
    throw new TypeError('Se requiere el módulo mysql2/promise con método createPool.');
  }
  const rawPool = mysqlPromiseModule.createPool(dbConfig);
  return wrapMysql8JsonPool(rawPool, options);
}

/**
 * Aplica el shim MySQL 8.0 JSON sobre un módulo `db.js` importado (con `getPool` y
 * `setPoolOverride`) o cargado dinámicamente desde una ruta relativa válida en Windows
 * mediante `pathToFileURL`.
 *
 * @param {{ getPool: () => object, setPoolOverride: (pool: object) => void } | string} dbModuleOrPath
 * @param {{ jsonColumns?: Iterable<string>, strictJson?: boolean, baseDir?: string }} [options]
 * @returns {Promise<object>} Pool envuelto instalado en el módulo de BD
 */
export async function installMysql8JsonShim(dbModuleOrPath, options = {}) {
  let dbMod = dbModuleOrPath;
  if (typeof dbModuleOrPath === 'string') {
    const baseDir = options.baseDir || process.cwd();
    const resolvedPath = path.resolve(baseDir, dbModuleOrPath);
    dbMod = await import(pathToFileURL(resolvedPath).href);
  }
  if (!dbMod || typeof dbMod.getPool !== 'function' || typeof dbMod.setPoolOverride !== 'function') {
    throw new TypeError('installMysql8JsonShim requiere un módulo db.js con getPool() y setPoolOverride().');
  }
  const wrappedPool = wrapMysql8JsonPool(dbMod.getPool(), options);
  dbMod.setPoolOverride(wrappedPool);
  return wrappedPool;
}

export default {
  MYSQL_TYPE_JSON,
  DEFAULT_MYSQL8_JSON_COLUMNS,
  parseMysql8JsonValue,
  transformMysql8JsonRow,
  transformMysql8JsonResult,
  wrapMysql8JsonConnection,
  wrapMysql8JsonPool,
  createMysql8JsonTestPool,
  installMysql8JsonShim
};
