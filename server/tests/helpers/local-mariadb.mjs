import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
import { assertLocalIsolatedTarget } from '../../database/guard.js';

export const DEFAULT_LOCAL_MARIADB_CONFIG = Object.freeze({
  binDir: 'C:/Users/gener/.gemini/antigravity/scratch/local-mysql/mariadb-10.11.10-winx64/bin',
  datadir: 'C:/Users/gener/.gemini/antigravity/scratch/local-mysql-v21/data',
  host: '127.0.0.1',
  port: 3310,
  user: 'root',
  password: '',
  database: 'ingmelec_v21_test_isolated',
  startupTimeoutMs: 20000,
  shutdownTimeoutMs: 10000
});

function normalizeDirPath(dirPath) {
  return path.resolve(dirPath).replace(/[\\/]+$/, '').toLowerCase();
}

function validateDatabaseIdentifier(dbName) {
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(
      `[local-mariadb] Nombre de base de datos inválido "${dbName}". Solo se permiten caracteres alfanuméricos y guión bajo.`
    );
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeMariaDb({ host, port, user, password, timeoutMs = 1500 }) {
  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: timeoutMs
    });
    const [rows] = await conn.query(
      'SELECT @@datadir AS datadir, @@port AS port, VERSION() AS version;'
    );
    return rows?.[0] || null;
  } catch {
    return null;
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}

async function ensureIsolatedDatabase({ host, port, user, password, database }) {
  if (!database) return;
  validateDatabaseIdentifier(database);
  assertLocalIsolatedTarget({ host, database }, 'local-mariadb.ensureIsolatedDatabase');

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    connectTimeout: 5000
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
  } finally {
    await conn.end().catch(() => {});
  }
}

function runMariaDbAdminShutdown({ adminExe, host, port, user, password, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-defaults',
      '--protocol=tcp',
      '-h',
      host,
      '-P',
      String(port),
      '-u',
      user
    ];
    if (password) {
      args.push(`-p${password}`);
    }
    args.push('shutdown');

    const adminProc = spawn(adminExe, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderrText = '';
    adminProc.stderr.on('data', (chunk) => {
      stderrText += chunk.toString();
    });

    const timer = setTimeout(() => {
      adminProc.kill();
      reject(new Error(`Timeout (${timeoutMs}ms) ejecutando mariadb-admin shutdown.`));
    }, timeoutMs);

    adminProc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    adminProc.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mariadb-admin shutdown finalizó con código ${code}: ${stderrText.trim()}`));
      }
    });
  });
}

async function stopSpawnedChild({ child, adminExe, host, port, user, password, shutdownTimeoutMs }) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exitPromise = new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
  });

  try {
    await runMariaDbAdminShutdown({
      adminExe,
      host,
      port,
      user,
      password,
      timeoutMs: shutdownTimeoutMs
    });
  } catch (err) {
    // Fallback defensivo para garantizar 0 procesos huérfanos si shutdown ordenado falla
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
    await Promise.race([exitPromise, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    throw err;
  }

  const exitedCleanly = await Promise.race([
    exitPromise.then(() => true),
    delay(shutdownTimeoutMs).then(() => false)
  ]);

  if (!exitedCleanly && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exitPromise, delay(2000)]);
    throw new Error(`mariadbd.exe (PID ${child.pid}) no salió tras mariadb-admin shutdown y fue terminado.`);
  }
}

/**
 * Inicia una instancia aislada de MariaDB local (o la reutiliza si ya responde
 * con el mismo datadir) y entrega un manejador con `stop()` basado en mariadb-admin shutdown.
 */
export async function startLocalMariaDb(options = {}) {
  const binDir = path.resolve(
    options.binDir ?? process.env.LOCAL_MARIADB_BIN_DIR ?? DEFAULT_LOCAL_MARIADB_CONFIG.binDir
  );
  const datadir = path.resolve(
    options.datadir ?? process.env.LOCAL_MARIADB_DATADIR ?? DEFAULT_LOCAL_MARIADB_CONFIG.datadir
  );
  const host = String(
    options.host ?? process.env.LOCAL_MARIADB_HOST ?? DEFAULT_LOCAL_MARIADB_CONFIG.host
  ).trim();
  const port = Number.parseInt(
    String(options.port ?? process.env.LOCAL_MARIADB_PORT ?? DEFAULT_LOCAL_MARIADB_CONFIG.port),
    10
  );
  const user = options.user ?? DEFAULT_LOCAL_MARIADB_CONFIG.user;
  const password = options.password ?? DEFAULT_LOCAL_MARIADB_CONFIG.password;
  const database =
    options.database !== undefined ? options.database : DEFAULT_LOCAL_MARIADB_CONFIG.database;
  const ensureDatabase = options.ensureDatabase !== false;
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_LOCAL_MARIADB_CONFIG.startupTimeoutMs;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_LOCAL_MARIADB_CONFIG.shutdownTimeoutMs;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[local-mariadb] Puerto inválido: ${port}`);
  }

  assertLocalIsolatedTarget(
    {
      host,
      database: database || '',
      allowEmptyDatabase: !database
    },
    'local-mariadb.startLocalMariaDb'
  );

  const normalizedExpectedDatadir = normalizeDirPath(datadir);

  const createHandle = ({ version, reused, pid, stop }) => ({
    host,
    port,
    user,
    datadir,
    database: database || null,
    version,
    reused,
    pid,
    stop,
    applyEnv(targetEnv = process.env) {
      targetEnv.DB_HOST = host;
      targetEnv.DB_PORT = String(port);
      targetEnv.DB_USER = user;
      targetEnv.DB_PASSWORD = password;
      if (database) targetEnv.DB_NAME = database;
      targetEnv.DB_SSL = 'false';
      targetEnv.ISOLATED_LOCAL_ONLY = 'true';
      targetEnv.BLOCK_REMOTE_DB = 'true';
      return targetEnv;
    }
  });

  const existing = await probeMariaDb({ host, port, user, password });
  if (existing) {
    const runningDatadir = normalizeDirPath(existing.datadir || '');
    if (runningDatadir !== normalizedExpectedDatadir) {
      throw new Error(
        `[local-mariadb] Conflicto: ${host}:${port} ya está siendo usado por otra instancia MariaDB (datadir="${existing.datadir}") distinta de "${datadir}".`
      );
    }

    if (ensureDatabase && database) {
      await ensureIsolatedDatabase({ host, port, user, password, database });
    }

    return createHandle({
      version: existing.version,
      reused: true,
      pid: null,
      async stop() {}
    });
  }

  const mariadbdExe = path.join(binDir, 'mariadbd.exe');
  const adminExe = path.join(binDir, 'mariadb-admin.exe');

  if (!fs.existsSync(mariadbdExe)) {
    throw new Error(`[local-mariadb] No existe el binario mariadbd.exe en: ${mariadbdExe}`);
  }
  if (!fs.existsSync(adminExe)) {
    throw new Error(`[local-mariadb] No existe el binario mariadb-admin.exe en: ${adminExe}`);
  }
  if (!fs.existsSync(datadir)) {
    throw new Error(`[local-mariadb] No existe el datadir inicializado en: ${datadir}`);
  }

  const child = spawn(
    mariadbdExe,
    [
      '--no-defaults',
      `--datadir=${datadir}`,
      `--port=${port}`,
      `--bind-address=${host}`,
      '--max-allowed-packet=64M',
      '--console'
    ],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const logChunks = [];
  const captureChunk = (chunk) => {
    logChunks.push(chunk.toString());
    if (logChunks.length > 40) {
      logChunks.shift();
    }
  };
  child.stdout.on('data', captureChunk);
  child.stderr.on('data', captureChunk);

  let earlyExitError = null;
  const onEarlyExit = (code, signal) => {
    earlyExitError = new Error(
      `[local-mariadb] mariadbd.exe finalizó prematuramente (code=${code}, signal=${signal}). Logs:\n${logChunks.join('')}`
    );
  };
  const onSpawnError = (err) => {
    earlyExitError = new Error(`[local-mariadb] Error iniciando mariadbd.exe: ${err.message}`);
  };
  child.once('exit', onEarlyExit);
  child.once('error', onSpawnError);

  let probeInfo = null;
  try {
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      if (earlyExitError) {
        throw earlyExitError;
      }
      probeInfo = await probeMariaDb({ host, port, user, password, timeoutMs: 800 });
      if (probeInfo) {
        break;
      }
      await delay(150);
    }

    if (earlyExitError) {
      throw earlyExitError;
    }
    if (!probeInfo) {
      throw new Error(
        `[local-mariadb] Timeout (${startupTimeoutMs}ms) esperando conexión en ${host}:${port}. Logs:\n${logChunks.join('')}`
      );
    }

    const activeDatadir = normalizeDirPath(probeInfo.datadir || '');
    if (activeDatadir !== normalizedExpectedDatadir) {
      throw new Error(
        `[local-mariadb] El servidor en ${host}:${port} reportó datadir "${probeInfo.datadir}" distinto de "${datadir}".`
      );
    }

    child.removeListener('exit', onEarlyExit);
    child.removeListener('error', onSpawnError);

    if (ensureDatabase && database) {
      await ensureIsolatedDatabase({ host, port, user, password, database });
    }
  } catch (err) {
    child.removeListener('exit', onEarlyExit);
    child.removeListener('error', onSpawnError);
    await stopSpawnedChild({
      child,
      adminExe,
      host,
      port,
      user,
      password,
      shutdownTimeoutMs
    }).catch(() => {});
    throw err;
  }

  let stopped = false;
  return createHandle({
    version: probeInfo.version,
    reused: false,
    pid: child.pid ?? null,
    async stop() {
      if (stopped) return;
      stopped = true;
      await stopSpawnedChild({
        child,
        adminExe,
        host,
        port,
        user,
        password,
        shutdownTimeoutMs
      });
    }
  });
}

/**
 * Ejecuta una función de prueba con MariaDB aislado levantado y garantiza su apagado en finally.
 */
export async function withLocalMariaDb(fn, options = {}) {
  const instance = await startLocalMariaDb(options);
  try {
    return await fn(instance);
  } finally {
    await instance.stop();
  }
}
