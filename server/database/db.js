import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertLocalIsolatedTarget } from './guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CA_CERT_PATH = path.join(__dirname, '..', 'certs', 'clever-cloud-mysql-ca.pem');

// Load environment variables from server/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });
// Fall back to workspace root .env if it exists
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function isEnvTrue(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function isIsolatedGuardRequired() {
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  const environment = (process.env.ENVIRONMENT || '').trim().toLowerCase();
  const isolatedLocalOnly = (process.env.ISOLATED_LOCAL_ONLY || '').trim().toLowerCase();
  const blockRemoteDb = (process.env.BLOCK_REMOTE_DB || '').trim().toLowerCase();

  return (
    nodeEnv === 'test' ||
    environment === 'isolated_test' ||
    environment === 'local_test' ||
    isolatedLocalOnly === 'true' ||
    blockRemoteDb === 'true'
  );
}

function buildSslConfig() {
  if (!isEnvTrue(process.env.DB_SSL)) {
    return undefined;
  }

  if (!fs.existsSync(CA_CERT_PATH)) {
    throw new Error(
      `[TLS BD] No se encontró el certificado CA oficial requerido en: ${CA_CERT_PATH}`
    );
  }

  const rejectUnauthorized = process.env.DB_SSL_ALLOW_INSECURE === 'true' ? false : true;

  return {
    ca: fs.readFileSync(CA_CERT_PATH),
    rejectUnauthorized
  };
}

export function getTlsConfigPreview() {
  const sslEnabled = isEnvTrue(process.env.DB_SSL);
  const allowInsecure = process.env.DB_SSL_ALLOW_INSECURE === 'true';
  const caExists = fs.existsSync(CA_CERT_PATH);

  if (!sslEnabled) {
    return {
      enabled: false,
      ssl: undefined,
      rejectUnauthorized: null,
      allowInsecure,
      caPath: CA_CERT_PATH,
      caExists,
      caLoaded: false,
      caBytes: 0,
      multipleStatementsDefault: false
    };
  }

  const sslConfig = buildSslConfig();
  return {
    enabled: true,
    ssl: {
      hasCa: Boolean(sslConfig.ca),
      caBytes: sslConfig.ca.length,
      rejectUnauthorized: sslConfig.rejectUnauthorized
    },
    rejectUnauthorized: sslConfig.rejectUnauthorized,
    allowInsecure,
    caPath: CA_CERT_PATH,
    caExists,
    caLoaded: Buffer.isBuffer(sslConfig.ca) && sslConfig.ca.length > 0,
    caBytes: sslConfig.ca.length,
    multipleStatementsDefault: false
  };
}

function buildDbConfig(dbNameOptional = null, options = {}) {
  const parsedPort = Number.parseInt(process.env.DB_PORT || '3306', 10);
  const parsedConnectionLimit = Number.parseInt(process.env.DB_CONNECTION_LIMIT || '2', 10);
  const allowMultipleStatements = options?.allowMultipleStatements === true;

  const config = {
    host: process.env.DB_HOST !== undefined ? process.env.DB_HOST : 'localhost',
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gridops_enterprise',
    ssl: buildSslConfig(),
    waitForConnections: true,
    connectionLimit: Number.isFinite(parsedConnectionLimit) && parsedConnectionLimit > 0 ? parsedConnectionLimit : 2, // Set to 2 to avoid exceeding Clever Cloud's 5 max connections limit
    queueLimit: 0,
    multipleStatements: allowMultipleStatements
  };

  if (dbNameOptional !== null) {
    if (dbNameOptional === '') {
      delete config.database;
    } else {
      config.database = dbNameOptional;
    }
  }

  return config;
}

let pool;
let poolOverrideActive = false;
let lastPoolTarget = null;
let multiStatementPool = null;
let lastMultiStatementTarget = null;

function buildTargetDescriptor(config, dbNameOptional) {
  return {
    host: config.host,
    database: Object.prototype.hasOwnProperty.call(config, 'database') ? config.database : '',
    allowEmptyDatabase: dbNameOptional === ''
  };
}

function isSameTarget(a, b) {
  return (
    Boolean(a) &&
    Boolean(b) &&
    a.host === b.host &&
    a.database === b.database &&
    a.allowEmptyDatabase === b.allowEmptyDatabase
  );
}

export function getPool(dbNameOptional = null, options = {}) {
  if (pool && poolOverrideActive) {
    return pool;
  }

  const allowMultipleStatements = options?.allowMultipleStatements === true;

  if (allowMultipleStatements) {
    const config = buildDbConfig(dbNameOptional, { allowMultipleStatements: true });
    const target = buildTargetDescriptor(config, dbNameOptional);

    if (isIsolatedGuardRequired()) {
      assertLocalIsolatedTarget(target, 'db.getPool');
    }

    if (!multiStatementPool || !isSameTarget(lastMultiStatementTarget, target)) {
      if (multiStatementPool) {
        multiStatementPool.end().catch(() => {});
      }
      lastMultiStatementTarget = target;
      multiStatementPool = mysql.createPool(config);
    }

    return multiStatementPool;
  }

  if (!pool) {
    const config = buildDbConfig(dbNameOptional, { allowMultipleStatements: false });
    const target = buildTargetDescriptor(config, dbNameOptional);

    if (isIsolatedGuardRequired()) {
      assertLocalIsolatedTarget(target, 'db.getPool');
    }

    lastPoolTarget = target;
    pool = mysql.createPool(config);
  } else if (isIsolatedGuardRequired() && lastPoolTarget) {
    assertLocalIsolatedTarget(lastPoolTarget, 'db.getPool');
  }

  return pool;
}

// Reset pool (useful when initDb creates the database and we need to reconnect with it)
export function resetPool() {
  poolOverrideActive = false;
  lastPoolTarget = null;
  lastMultiStatementTarget = null;
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
  if (multiStatementPool) {
    multiStatementPool.end().catch(() => {});
    multiStatementPool = null;
  }
}

// Gracefully close pool and await socket teardown (useful for test cleanup)
export async function closePool() {
  const currentPool = pool;
  const currentMultiPool = multiStatementPool;
  poolOverrideActive = false;
  lastPoolTarget = null;
  lastMultiStatementTarget = null;
  pool = null;
  multiStatementPool = null;
  const closers = [];
  if (currentPool && typeof currentPool.end === 'function') {
    closers.push(currentPool.end());
  }
  if (currentMultiPool && typeof currentMultiPool.end === 'function') {
    closers.push(currentMultiPool.end());
  }
  if (closers.length > 0) {
    await Promise.all(closers);
  }
}

// Override pool for isolated testing harness (prevents any connection to production)
export function setPoolOverride(override) {
  pool = override;
  poolOverrideActive = Boolean(override);
  if (!override) {
    lastPoolTarget = null;
  }
}

class MySQLWrapper {
  constructor(connection) {
    this.connection = connection;
  }

  // Intercept legacy transaction statements and translate them to MySQL standard SQL
  _prepareSql(sql) {
    if (typeof sql !== 'string') return sql;
    const clean = sql.trim().replace(/;$/, '').toUpperCase();
    if (clean === 'BEGIN TRANSACTION' || clean === 'BEGIN') {
      return 'START TRANSACTION';
    }
    if (clean === 'COMMIT TRANSACTION') {
      return 'COMMIT';
    }
    if (clean === 'ROLLBACK TRANSACTION') {
      return 'ROLLBACK';
    }
    return sql;
  }

  // query(): standard mysql2 promise query
  async query(sql, params = []) {
    const preparedSql = this._prepareSql(sql);
    return this.connection.query(preparedSql, params);
  }

  // db.get(): returns first row or null
  async get(sql, params = []) {
    const preparedSql = this._prepareSql(sql);
    const [rows] = await this.connection.query(preparedSql, params);
    if (Array.isArray(rows)) {
      return rows[0] || null;
    }
    return rows;
  }

  // db.all(): returns all matching rows
  async all(sql, params = []) {
    const preparedSql = this._prepareSql(sql);
    const [rows] = await this.connection.query(preparedSql, params);
    return Array.isArray(rows) ? rows : [];
  }

  // db.run(): returns { lastID, changes }
  async run(sql, params = []) {
    const preparedSql = this._prepareSql(sql);
    const [result] = await this.connection.query(preparedSql, params);
    return {
      lastID: result ? (result.insertId || null) : null,
      changes: result ? (result.affectedRows || 0) : 0
    };
  }

  // db.exec(): runs multiple query statements
  async exec(sql) {
    const preparedSql = this._prepareSql(sql);
    await this.connection.query(preparedSql);
  }

  // Releases connection back to the pool
  async close() {
    if (this.connection && typeof this.connection.release === 'function') {
      this.connection.release();
    }
  }
}

// Helper function to acquire a connection from the pool and wrap it
export async function getDb() {
  const activePool = getPool();
  const conn = await activePool.getConnection();
  return new MySQLWrapper(conn);
}
