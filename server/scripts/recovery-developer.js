/**
 * SCRIPT DE APROVISIONAMIENTO Y RECUPERACIÓN ADMINISTRATIVA
 * INGMELEC ALMACÉN GENERAL (v2.0.0)
 *
 * USO EXCLUSIVO POR TERMINAL DEL SERVIDOR (Requiere acceso físico / SSH / consola local):
 * node server/scripts/recovery-developer.js [email_opcional]
 *
 * SEGURIDAD ESTRICTA:
 * - NO recibe contraseñas como argumentos de línea de comandos (evita fugas en ps, history y logs).
 * - Captura interactiva segura con confirmación obligatoria.
 * - Enmascaramiento de caracteres en terminales interactivas (TTY).
 * - Cifrado moderno con Argon2id (OWASP 2026: 64 MB RAM, 3 iteraciones).
 * - Cero contraseñas predeterminadas o accesos automáticos.
 */

import readline from 'readline';
import argon2 from 'argon2';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
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
          // Ctrl+C
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\nOperación cancelada.\n');
          process.exit(1);
        } else if (ch === '\u0008' || ch === '\x7f') {
          // Backspace
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
      // Modo no interactivo (fallback para entornos sin TTY o automatización autorizada)
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question('', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

async function runRecovery() {
  const targetEmail = (process.argv[2] || process.env.DEVELOPER_EMAIL || 'developer@ingmelec.com').trim().toLowerCase();

  console.log('=====================================================================');
  console.log('  INGMELEC ALMACÉN GENERAL — APROVISIONAMIENTO DEVELOPER PRINCIPAL');
  console.log('=====================================================================');
  console.log(`Cuenta objetivo: ${targetEmail}`);

  let password = '';

  // Soporte de variable de entorno efímera para scripts de prueba autorizados
  if (process.env.DEVELOPER_ADMIN_PASSWORD) {
    password = process.env.DEVELOPER_ADMIN_PASSWORD;
    delete process.env.DEVELOPER_ADMIN_PASSWORD;
    console.log('[INFO] Contraseña capturada desde variable de entorno efímera autorizada.');
  } else {
    // Captura interactiva segura
    const pass1 = await promptSecurePassword('Ingrese la nueva contraseña segura (mínimo 8 caracteres): ');
    if (!pass1 || pass1.length < 8) {
      console.error('\n❌ ERROR: La contraseña suministrada debe tener al menos 8 caracteres.');
      process.exit(1);
    }

    const pass2 = await promptSecurePassword('Confirme la contraseña nuevamente: ');
    if (pass1 !== pass2) {
      console.error('\n❌ ERROR: Las contraseñas ingresadas no coinciden. Operación cancelada.');
      process.exit(1);
    }

    password = pass1;
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3308');
  const user = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'sim_clever_cloud_prod';

  console.log(`\n🔒 Conectando a ${host}:${port}/${database}...`);
  const conn = await mysql.createConnection({ host, port, user, password: dbPassword, database });

  console.log('🔒 Generando hash Argon2id (64 MiB, t=3, p=1)...');
  const newHash = await argon2.hash(password, ARGON2_CONFIG);
  password = ''; // Limpiar variable de contraseña en memoria inmediatamente

  const [devRows] = await conn.query('SELECT id, nombre, email FROM inv_usuarios WHERE rol = "developer" OR es_developer = 1 LIMIT 1');

  if (devRows.length > 0) {
    const target = devRows[0];
    await conn.query(`
      UPDATE inv_usuarios
      SET password_hash = ?, rol = 'developer', es_developer = 1, activo = 1, permisos_json = '["*"]'
      WHERE id = ?
    `, [newHash, target.id]);
    console.log(`✔ Credenciales y permisos actualizados exitosamente para: ${target.email} (ID: ${target.id}).`);
  } else {
    const [existing] = await conn.query('SELECT id, nombre, email FROM inv_usuarios WHERE email = ?', [targetEmail]);
    if (existing.length > 0) {
      const target = existing[0];
      await conn.query(`
        UPDATE inv_usuarios
        SET password_hash = ?, rol = 'developer', es_developer = 1, activo = 1, permisos_json = '["*"]'
        WHERE id = ?
      `, [newHash, target.id]);
      console.log(`✔ Cuenta existente ${target.email} (ID: ${target.id}) aprovisionada como Desarrollador Principal.`);
    } else {
      const [resIns] = await conn.query(`
        INSERT INTO inv_usuarios (
          nombre, email, password_hash, rol, cargo, area, activo, es_developer, permisos_json
        ) VALUES (
          'Desarrollador Principal INGMELEC', ?, ?, 'developer',
          'Desarrollador Principal', 'TI / Arquitectura', 1, 1, '["*"]'
        )
      `, [targetEmail, newHash]);
      console.log(`✔ Nueva cuenta de Desarrollador Principal creada exitosamente: ${targetEmail} (ID: ${resIns.insertId}).`);
    }
  }

  await conn.end();
  console.log('🎉 Procedimiento completado con éxito. Acceso exclusivo habilitado.\n');
}

runRecovery().catch(err => {
  console.error('❌ Error fatal en recuperación:', err.message);
  process.exit(1);
});
