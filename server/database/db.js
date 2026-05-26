import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });
// Fall back to workspace root .env if it exists
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gridops_enterprise',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 2, // Set to 2 to avoid exceeding Clever Cloud's 5 max connections limit
  queueLimit: 0,
  multipleStatements: true
};

let pool;

export function getPool(dbNameOptional = null) {
  if (!pool) {
    const config = { ...dbConfig };
    if (dbNameOptional !== null) {
      if (dbNameOptional === '') {
        delete config.database;
      } else {
        config.database = dbNameOptional;
      }
    }
    pool = mysql.createPool(config);
  }
  return pool;
}

// Reset pool (useful when initDb creates the database and we need to reconnect with it)
export function resetPool() {
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
}

class MySQLWrapper {
  constructor(connection) {
    this.connection = connection;
  }

  // Intercept and translate SQLite-specific statements to MySQL standard SQL
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

  // SQLite-compatible db.get(): returns first row or null
  async get(sql, params = []) {
    const preparedSql = this._prepareSql(sql);
    const [rows] = await this.connection.query(preparedSql, params);
    if (Array.isArray(rows)) {
      return rows[0] || null;
    }
    return rows;
  }

  // SQLite-compatible db.all(): returns all matching rows
  async all(sql, params = []) {
    const preparedSql = this._prepareSql(sql);
    const [rows] = await this.connection.query(preparedSql, params);
    return Array.isArray(rows) ? rows : [];
  }

  // SQLite-compatible db.run(): returns { lastID, changes }
  async run(sql, params = []) {
    const preparedSql = this._prepareSql(sql);
    const [result] = await this.connection.query(preparedSql, params);
    return {
      lastID: result ? (result.insertId || null) : null,
      changes: result ? (result.affectedRows || 0) : 0
    };
  }

  // SQLite-compatible db.exec(): runs multiple query statements
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
