import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, 'server', '.env') });

async function checkUsers() {
  console.log('⚡ Conectando a tu base de datos MySQL local para verificar la tabla "users"...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gridops_enterprise'
  });

  const [rows] = await connection.query('SELECT id, username, email, password, role, status FROM users');
  console.log('\n--- REGISTROS DE USUARIOS ENCONTRADOS ---');
  console.log(JSON.stringify(rows, null, 2));
  
  await connection.end();
}

checkUsers().catch(err => {
  console.error('❌ Error leyendo base de datos MySQL:', err);
});
