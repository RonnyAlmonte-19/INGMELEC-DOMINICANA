import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function checkAllData() {
  console.log('⚡ Conectando a tu base de datos MySQL local...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gridops_enterprise'
  });

  const [supervisores] = await connection.query('SELECT * FROM supervisores');
  console.log('\n--- TABLA: SUPERVISORES ---');
  console.log(JSON.stringify(supervisores, null, 2));

  const [brigadas] = await connection.query('SELECT * FROM brigadas');
  console.log('\n--- TABLA: BRIGADAS ---');
  console.log(JSON.stringify(brigadas, null, 2));

  const [technicians] = await connection.query('SELECT id, name, cedula, codigo_empleado, brigada_id FROM technicians LIMIT 3');
  console.log('\n--- TABLA: TECHNICIANS (LIMIT 3) ---');
  console.log(JSON.stringify(technicians, null, 2));
  
  await connection.end();
}

checkAllData().catch(err => {
  console.error('❌ Error leyendo base de datos MySQL:', err);
});
