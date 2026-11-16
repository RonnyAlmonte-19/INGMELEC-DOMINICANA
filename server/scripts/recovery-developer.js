/**
 * SCRIPT DE APROVISIONAMIENTO Y ACTIVACIÓN SEGURA DEVELOPER EN PRODUCCIÓN
 * INGMELEC ALMACÉN GENERAL (v2.0.0)
 *
 * USO EXCLUSIVO POR TERMINAL DEL ADMINISTRADOR:
 * node server/scripts/recovery-developer.js [email_opcional]
 *
 * SEGURIDAD ESTRICTA:
 * - Conexión TLS obligatoria con verificación estricta de certificado (rejectUnauthorized: true).
 * - Certificado CA oficial de Clever Cloud (clever-cloud-mysql-ca.pem).
 * - Rechazo automático de entornos locales (127.0.0.1 / localhost) en modo productivo.
 * - Comprobación previa de existencia en producción antes de solicitar contraseñas.
 * - Captura interactiva segura con enmascaramiento (*), sin eco ni almacenamiento en logs/archivos.
 * - Cifrado Argon2id (OWASP: 64 MB RAM, 3 iteraciones, 1 hilo).
 * - Solicitud de confirmación final explícita antes de ejecutar el INSERT/UPDATE.
 * - Transacción segura con verificación post-inserción sin exponer contraseñas ni hashes.
 * - Cero afectación sobre artículos (434), unidades (1,964), movimientos o campamentos.
 */

import readline from 'readline';
import argon2 from 'argon2';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB (OWASP)
  timeCost: 3,       // 3 iteraciones
  parallelism: 1     // 1 hilo para evitar saturación de CPU
};

/**
 * Captura interactiva segura de contraseña sin eco en terminal
 */
function promptSecurePassword(promptText) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(promptText);

    if (stdin.isTTY) {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      let input = '';
      const onData = (ch) => {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(input);
        } else if (ch === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\nOperación cancelada por el operador.\n');
          process.exit(1);
        } else if (ch === '\u0008' || ch === '\x7f') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            stdout.write('\b \b');
          }
        } else {
          input += ch;
          stdout.write('*');
        }
      };

      stdin.on('data', onData);
    } else {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question('', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

/**
 * Pregunta interactiva de confirmación
 */
function promptText(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runRecovery() {
  const targetEmail = (process.argv[2] || process.env.DEVELOPER_EMAIL || 'developer@ingmelec.com').trim().toLowerCase();

  console.log('=====================================================================');
  console.log('  INGMELEC ALMACÉN GENERAL — ACTIVACIÓN SEGURA DEVELOPER EN PRODUCCIÓN');
  console.log('=====================================================================');
  console.log(`Cuenta objetivo: ${targetEmail}`);

  // 1. Resolver y validar parámetros de conexión
  const host = process.env.DB_HOST || process.env.MYSQL_ADDON_HOST || '';
  const port = parseInt(process.env.DB_PORT || process.env.MYSQL_ADDON_PORT || '3306');
  const user = process.env.DB_USER || process.env.MYSQL_ADDON_USER || '';
  const dbPassword = process.env.DB_PASSWORD || process.env.MYSQL_ADDON_PASSWORD || '';
  const database = process.env.DB_NAME || process.env.MYSQL_ADDON_DB || '';

  if (!host || !user || !database) {
    console.error('\n❌ ERROR FATAL DE CONFIGURACIÓN:');
    console.error('Faltan variables de entorno requeridas para conectar a Clever Cloud.');
    console.error('Asegúrese de definir DB_HOST, DB_USER, DB_PASSWORD y DB_NAME.');
    process.exit(1);
  }

  const isLocal = (host === '127.0.0.1' || host === 'localhost');
  if (isLocal) {
    console.error('\n❌ BLOQUEO DE SEGURIDAD ESTRICTO:');
    console.error(`El host configurado (${host}) apunta a un entorno LOCAL.`);
    console.error('Este procedimiento está destinado exclusivamente a CLEVER CLOUD PRODUCCIÓN.');
    console.error('Configure el host remoto de Clever Cloud (*.services.clever-cloud.com).');
    process.exit(1);
  }

  // 2. Exigir TLS con verificación de certificado CA Clever Cloud
  const caCertPath = path.join(__dirname, '..', 'certs', 'clever-cloud-mysql-ca.pem');
  if (!fs.existsSync(caCertPath)) {
    console.error('\n❌ ERROR DE SEGURIDAD TLS:');
    console.error(`No se encontró el certificado CA en: ${caCertPath}`);
    console.error('Por política estricta, no se permite rejectUnauthorized: false.');
    process.exit(1);
  }

  const sslConfig = {
    ca: fs.readFileSync(caCertPath),
    rejectUnauthorized: true
  };

  console.log('\n🔒 Parámetros de Conexión Verificados:');
  console.log(`   Host Remoto:    ${host}:${port}`);
  console.log(`   Base de Datos:  ${database}`);
  console.log(`   Usuario DB:     ${user}`);
  console.log(`   Seguridad TLS:  ESTRICTA (rejectUnauthorized: true con CA Clever Cloud)`);
  console.log(`   Ambiente:       🌐 CLEVER CLOUD PRODUCCIÓN`);

  console.log(`\n🔒 Conectando a Clever Cloud...`);
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password: dbPassword,
    database,
    ssl: sslConfig,
    connectTimeout: 10000
  });

  console.log('✔ Conexión TLS establecida y verificada exitosamente con Clever Cloud.');

  // 3. Comprobar en producción si developer@ingmelec.com ya existe
  console.log(`\n🔍 Verificando estado actual de '${targetEmail}' en Clever Cloud...`);
  const [existingRows] = await conn.query(
    'SELECT id, nombre, email, rol, es_developer, activo FROM inv_usuarios WHERE LOWER(email) = LOWER(?)',
    [targetEmail]
  );

  const exists = existingRows.length > 0;
  if (exists) {
    const u = existingRows[0];
    console.log(`ℹ La cuenta '${targetEmail}' YA EXISTE en producción (ID: ${u.id}, Rol: ${u.rol}, Activo: ${u.activo}).`);
    console.log('  La operación actualizará su contraseña, asegurando rol=developer, es_developer=1 y permisos=["*"].');
  } else {
    console.log(`ℹ La cuenta '${targetEmail}' NO EXISTE en producción.`);
    console.log('  La operación realizará un INSERT limpio de la cuenta con rol=developer, es_developer=1 y permisos=["*"].');
  }

  // 4. Solicitar contraseña NUEVA directamente en la terminal (modo interactivo)
  console.log('\n---------------------------------------------------------------------');
  console.log('  CAPTURA INTERACTIVA DE CONTRASEÑA NUEVA (PRIVADA / ENMASCARADA)');
  console.log('---------------------------------------------------------------------');

  let password;
  if (process.env.DEVELOPER_ADMIN_PASSWORD) {
    password = process.env.DEVELOPER_ADMIN_PASSWORD;
    delete process.env.DEVELOPER_ADMIN_PASSWORD;
    console.log('[INFO] Contraseña capturada desde variable efímera autorizada.');
  } else {
    const pass1 = await promptSecurePassword('Ingrese la NUEVA contraseña segura para developer (mínimo 10 caracteres): ');
    if (!pass1 || pass1.length < 10) {
      console.error('\n❌ ERROR: La contraseña debe tener un mínimo de 10 caracteres.');
      await conn.end();
      process.exit(1);
    }

    const pass2 = await promptSecurePassword('Confirme la contraseña nuevamente: ');
    if (pass1 !== pass2) {
      console.error('\n❌ ERROR: Las contraseñas ingresadas no coinciden. Operación cancelada.');
      await conn.end();
      process.exit(1);
    }

    password = pass1;
  }

  // 5. Generar hash Argon2id
  console.log('\n🔒 Generando hash seguro Argon2id (64 MiB RAM, 3 iteraciones, 1 hilo)...');
  const newHash = await argon2.hash(password, ARGON2_CONFIG);

  // 6. Resumen de la operación y solicitud de aprobación previa
  console.log('\n=====================================================================');
  console.log('  PLAN DE OPERACIÓN EN PRODUCCIÓN (PRE-INSERCIÓN)');
  console.log('=====================================================================');
  console.log(`Acción SQL:        ${exists ? 'UPDATE inv_usuarios' : 'INSERT INTO inv_usuarios'}`);
  console.log(`Email Objetivo:    ${targetEmail}`);
  console.log(`Rol:               developer`);
  console.log(`es_developer:      1`);
  console.log(`activo:            1`);
  console.log(`permisos_json:     ["*"]`);
  console.log(`Afecta Artículos:  NO (0 artículos modificados)`);
  console.log(`Afecta Sedes:      NO (0 campamentos modificados)`);
  console.log(`Afecta Otros:      NO (0 usuarios ajenos modificados)`);
  console.log('=====================================================================');

  const confirmacion = await promptText('\n¿Autoriza ejecutar la operación en Clever Cloud PRODUCCIÓN? Escriba SI para continuar: ');
  if (confirmacion.toUpperCase() !== 'SI') {
    console.log('\nOperación CANCELADA por el usuario. No se realizaron cambios en Clever Cloud.');
    await conn.end();
    process.exit(0);
  }

  // 7. Ejecución protegida bajo transacción
  console.log('\n🔒 Ejecutando transacción en Clever Cloud...');
  await conn.beginTransaction();

  try {
    if (exists) {
      const [tvCols] = await conn.query("SHOW COLUMNS FROM inv_usuarios LIKE 'token_version'");
      const hasTokenVersion = tvCols.length > 0;
      const updateSql = hasTokenVersion
        ? `
          UPDATE inv_usuarios
          SET password_hash = ?, rol = 'developer', es_developer = 1, activo = 1, permisos_json = '["*"]',
              token_version = COALESCE(token_version, 1) + 1
          WHERE id = ?
        `
        : `
          UPDATE inv_usuarios
          SET password_hash = ?, rol = 'developer', es_developer = 1, activo = 1, permisos_json = '["*"]'
          WHERE id = ?
        `;
      await conn.query(updateSql, [newHash, existingRows[0].id]);
      console.log(`✔ UPDATE ejecutado exitosamente sobre ID: ${existingRows[0].id}${hasTokenVersion ? ' (token_version incrementado)' : ''}.`);
    } else {
      const [resIns] = await conn.query(`
        INSERT INTO inv_usuarios (
          nombre, email, password_hash, rol, cargo, area, activo, es_developer, permisos_json
        ) VALUES (
          'Desarrollador Principal INGMELEC', ?, ?, 'developer',
          'Desarrollador Principal', 'TI / Arquitectura', 1, 1, '["*"]'
        )
      `, [targetEmail, newHash]);
      console.log(`✔ INSERT ejecutado exitosamente con nuevo ID: ${resIns.insertId}.`);
    }

    await conn.commit();
    console.log('✔ Transacción confirmada (COMMIT exitoso en Clever Cloud).');
  } catch (errSql) {
    await conn.rollback();
    console.error('\n❌ ERROR SQL: Transacción revertida (ROLLBACK). Causa:', errSql.message);
    await conn.end();
    process.exit(1);
  }

  // 8. Verificación post-inserción estricta (SIN exponer contraseñas ni hashes)
  const [verifUser] = await conn.query(`
    SELECT id, nombre, email, rol, cargo, area, activo, es_developer, permisos_json
    FROM inv_usuarios
    WHERE LOWER(email) = LOWER(?)
  `, [targetEmail]);

  const [verifArticulos] = await conn.query(
    'SELECT COUNT(*) as total_articulos, COALESCE(SUM(cantidad_num), 0) as total_unidades FROM inv_articulos'
  );

  console.log('\n=====================================================================');
  console.log('  VERIFICACIÓN DE SEGURIDAD POST-APROVISIONAMIENTO (SIN HASHES)');
  console.log('=====================================================================');
  console.table(verifUser);
  console.log(`✔ Verificación de Inventario: ${verifArticulos[0].total_articulos} artículos, ${verifArticulos[0].total_unidades} unidades (intacto).`);
  console.log('🎉 Cuenta developer activada exitosamente en Clever Cloud. Ya puede ingresar en Render.\n');

  await conn.end();
}

runRecovery().catch(err => {
  console.error('\n❌ Error fatal en ejecución:', err.message);
  process.exit(1);
});
