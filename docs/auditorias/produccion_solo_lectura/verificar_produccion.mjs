// Ejecuta SOLO las sentencias SELECT/SHOW de verificacion_produccion.sql contra la base indicada por variables de entorno.
// NO guarda ni imprime credenciales. Lo ejecuta el propietario en su propia terminal.
//   Uso (PowerShell):  $env:DB_HOST='...'; $env:DB_PORT='...'; $env:DB_USER='...'; $env:DB_PASSWORD='...'; $env:DB_NAME='...'
//                      node docs/auditorias/produccion_solo_lectura/verificar_produccion.mjs
//   Luego limpiar:     Remove-Item Env:DB_PASSWORD, Env:DB_USER, Env:DB_HOST, Env:DB_PORT, Env:DB_NAME
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', '..', '..', 'server', 'package.json'));
const mysql = require('mysql2/promise');

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) { console.error('Faltan DB_HOST, DB_USER, DB_PASSWORD o DB_NAME en el entorno.'); process.exit(2); }

// Sentencias: se separan por bloques "-- [n] nombre"; solo se admiten SELECT y SHOW.
const sql = fs.readFileSync(path.join(here, 'verificacion_produccion.sql'), 'utf8');
const bloques = [...sql.matchAll(/--\s*\[(\d+)\]\s*(\w+)\s*\n([\s\S]*?)(?=\n--\s*\[\d+\]|$)/g)].map((m) => ({ n: m[1], nombre: m[2], texto: m[3].replace(/^\s*--.*$/gm, '').trim().replace(/;\s*$/, '') }));
for (const b of bloques) if (!/^(SELECT|SHOW)\b/i.test(b.texto) || /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|GRANT|REPLACE)\b/i.test(b.texto.replace(/'[^']*'/g, ''))) { console.error(`Bloque ${b.n} rechazado: solo SELECT/SHOW.`); process.exit(3); }

const caPath = path.join(here, '..', '..', '..', 'server', 'certs', 'clever-cloud-mysql-ca.pem');
const conn = await mysql.createConnection({
  host: DB_HOST, port: Number(DB_PORT || 3306), user: DB_USER, password: DB_PASSWORD, database: DB_NAME, charset: 'utf8mb4',
  ssl: fs.existsSync(caPath) ? { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true } : undefined, connectTimeout: 15000,
});
const salida = {};
try {
  for (const b of bloques) { const [rows] = await conn.query(b.texto); salida[`${b.n}_${b.nombre}`] = rows; }
} finally { await conn.end(); }
console.log(JSON.stringify(salida, (k, v) => (typeof v === 'bigint' ? Number(v) : v), 1));
