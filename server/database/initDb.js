import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env files
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function initializeDatabase() {
  const dbName = process.env.DB_NAME || 'gridops_enterprise';
  
  console.log('⚡ Conectando al servidor MySQL local para verificar/crear base de datos...');
  
  // Establish connection without database to create it
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  console.log(`⚡ Creando base de datos "${dbName}" si no existe...`);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await connection.end();

  console.log(`⚡ Conectando directamente a la base de datos "${dbName}"...`);
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    multipleStatements: true
  });

  console.log('⚡ Generando tablas relacionales en MySQL...');

  // Disable FK checks to clear cleanly
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  
  const tables = [
    'auditoria', 'devoluciones', 'swaps', 'reposiciones', 'acta_items', 'actas', 
    'brigade_tools', 'inventory', 'technicians', 'brigadas', 'supervisores', 
    'coordinadores', 'users', 'department_equipment_kits'
  ];
  
  for (const table of tables) {
    await db.query(`DROP TABLE IF EXISTS \`${table}\``);
  }

  // 1. Tabla de Usuarios
  await db.query(`
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      zone VARCHAR(100),
      status VARCHAR(50) DEFAULT 'Activo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. Tabla de Coordinadores
  await db.query(`
    CREATE TABLE coordinadores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      zone VARCHAR(100) NOT NULL,
      campamento VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. Tabla de Supervisores
  await db.query(`
    CREATE TABLE supervisores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      cargo VARCHAR(100) NOT NULL,
      coordinator_id INT,
      FOREIGN KEY (coordinator_id) REFERENCES coordinadores(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. Tabla de Brigadas
  await db.query(`
    CREATE TABLE brigadas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      type VARCHAR(50) NOT NULL,
      vehicle VARCHAR(50) NOT NULL,
      supervisor_id INT,
      zone VARCHAR(100) NOT NULL,
      campamento VARCHAR(100) NOT NULL,
      estado VARCHAR(50) DEFAULT 'Activo',
      FOREIGN KEY (supervisor_id) REFERENCES supervisores(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 5. Tabla de Técnicos (Dominicanos)
  await db.query(`
    CREATE TABLE technicians (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      cedula VARCHAR(50) UNIQUE NOT NULL,
      codigo_empleado VARCHAR(50) UNIQUE NOT NULL,
      telefono VARCHAR(50),
      tipo_sangre VARCHAR(10),
      licencia VARCHAR(50),
      vigencia_licencia VARCHAR(50),
      sie VARCHAR(50),
      licencia_sie VARCHAR(50),
      talla_camisa VARCHAR(10),
      talla_pantalon VARCHAR(10),
      talla_bota VARCHAR(10),
      brigada_id VARCHAR(50),
      supervisor_id INT,
      coordinator_id INT,
      estado VARCHAR(50) DEFAULT 'Activo',
      fecha_ingreso VARCHAR(50),
      FOREIGN KEY (brigada_id) REFERENCES brigadas(code) ON DELETE SET NULL,
      FOREIGN KEY (supervisor_id) REFERENCES supervisores(id) ON DELETE SET NULL,
      FOREIGN KEY (coordinator_id) REFERENCES coordinadores(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 6. Tabla de Inventario Maestro
  await db.query(`
    CREATE TABLE inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      type VARCHAR(50) NOT NULL,
      stock INT NOT NULL,
      min INT NOT NULL,
      location VARCHAR(100) NOT NULL,
      status VARCHAR(50) DEFAULT 'Disponible',
      value DECIMAL(10,2) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 7. Herramientas Asignadas a Brigada
  await db.query(`
    CREATE TABLE brigade_tools (
      id INT AUTO_INCREMENT PRIMARY KEY,
      brigada_code VARCHAR(50) NOT NULL,
      item_code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      req_qty INT NOT NULL,
      del_qty INT NOT NULL,
      category VARCHAR(50) NOT NULL,
      estado VARCHAR(50) DEFAULT 'Entregado',
      obs TEXT,
      FOREIGN KEY (brigada_code) REFERENCES brigadas(code) ON DELETE CASCADE,
      FOREIGN KEY (item_code) REFERENCES inventory(code) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 8. Tabla de Actas
  await db.query(`
    CREATE TABLE actas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      tipo VARCHAR(100) NOT NULL,
      destino VARCHAR(100) NOT NULL,
      responsable VARCHAR(100) NOT NULL,
      fecha VARCHAR(50) NOT NULL,
      estado VARCHAR(50) DEFAULT 'Pendiente',
      firmado TINYINT DEFAULT 0,
      signature_data LONGTEXT,
      observaciones TEXT,
      anexos TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 9. Ítems Incluidos en Actas
  await db.query(`
    CREATE TABLE acta_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      acta_code VARCHAR(50) NOT NULL,
      item_code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      qty INT NOT NULL,
      category VARCHAR(50) NOT NULL,
      FOREIGN KEY (acta_code) REFERENCES actas(code) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 10. Tabla de Reposiciones e Incidencias
  await db.query(`
    CREATE TABLE reposiciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      colaborador VARCHAR(100) NOT NULL,
      item VARCHAR(100) NOT NULL,
      motivo VARCHAR(255) NOT NULL,
      valor DECIMAL(10,2) NOT NULL,
      estado VARCHAR(50) DEFAULT 'Pendiente',
      fecha VARCHAR(50) NOT NULL,
      supervisor_id INT,
      coordinator_id INT,
      FOREIGN KEY (supervisor_id) REFERENCES supervisores(id) ON DELETE SET NULL,
      FOREIGN KEY (coordinator_id) REFERENCES coordinadores(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 11. Tabla de Swaps
  await db.query(`
    CREATE TABLE swaps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      herramienta_anterior VARCHAR(100) NOT NULL,
      herramienta_nueva VARCHAR(100) NOT NULL,
      brigada_code VARCHAR(50) NOT NULL,
      tecnico VARCHAR(100) NOT NULL,
      motivo VARCHAR(255) NOT NULL,
      fecha VARCHAR(50) NOT NULL,
      estado VARCHAR(50) DEFAULT 'Completado',
      FOREIGN KEY (brigada_code) REFERENCES brigadas(code) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 12. Tabla de Devoluciones de Turno
  await db.query(`
    CREATE TABLE devoluciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      colaborador VARCHAR(100) NOT NULL,
      brigada_code VARCHAR(50) NOT NULL,
      item VARCHAR(100) NOT NULL,
      cant_esperada INT NOT NULL,
      cant_devuelta INT NOT NULL,
      estado VARCHAR(50) DEFAULT 'Pendiente',
      observacion TEXT,
      FOREIGN KEY (brigada_code) REFERENCES brigadas(code) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 13. Tabla de Auditoría
  await db.query(`
    CREATE TABLE auditoria (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      fecha VARCHAR(50) NOT NULL,
      usuario VARCHAR(50) NOT NULL,
      rol VARCHAR(50) NOT NULL,
      accion VARCHAR(100) NOT NULL,
      entidad VARCHAR(100) NOT NULL,
      antes TEXT NOT NULL,
      despues TEXT NOT NULL,
      zona VARCHAR(100) NOT NULL,
      ip VARCHAR(50) NOT NULL,
      user_agent TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 14. Tabla de Kits de Departamento
  await db.query(`
    CREATE TABLE department_equipment_kits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      departamento VARCHAR(100) NOT NULL,
      nombre_kit VARCHAR(100) NOT NULL,
      item_code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      suggested_qty INT NOT NULL,
      obligatorio TINYINT DEFAULT 0,
      activo TINYINT DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Re-enable FK checks
  await db.query('SET FOREIGN_KEY_CHECKS = 1');

  console.log('⚡ Tablas relacionales creadas con éxito en MySQL.');
  console.log('⚡ Sembrando datos iniciales en MySQL...');

  // Seeding
  // 1. Sembrado de Usuarios
  await db.query(
    'INSERT INTO users (username, email, password, role, zone) VALUES (?, ?, ?, ?, ?)',
    ['dev', 'developer@gridops.com', hashPassword('1234'), 'Developer', 'Sistema Central']
  );
  await db.query(
    'INSERT INTO users (username, email, password, role, zone) VALUES (?, ?, ?, ?, ?)',
    ['gerente', 'gerente@gridops.com', hashPassword('1234'), 'Gerente', 'Lote Central']
  );
  await db.query(
    'INSERT INTO users (username, email, password, role, zone) VALUES (?, ?, ?, ?, ?)',
    ['william', 'coordinador@gridops.com', hashPassword('1234'), 'Coordinador', 'Noroeste Lote 4']
  );
  await db.query(
    'INSERT INTO users (username, email, password, role, zone) VALUES (?, ?, ?, ?, ?)',
    ['isaac', 'supervisor@gridops.com', hashPassword('1234'), 'Supervisor', 'Noroeste Lote 4']
  );
  await db.query(
    'INSERT INTO users (username, email, password, role, zone) VALUES (?, ?, ?, ?, ?)',
    ['cristian', 'supervisor2@gridops.com', hashPassword('1234'), 'Supervisor', 'Noroeste Lote 4']
  );
  await db.query(
    'INSERT INTO users (username, email, password, role, zone) VALUES (?, ?, ?, ?, ?)',
    ['ronny', 'ronny@gridops.com', hashPassword('1234'), 'Supervisor TCT', 'Noroeste Lote 4']
  );

  // 2. Coordinadores
  await db.query(
    'INSERT INTO coordinadores (code, name, zone, campamento) VALUES (?, ?, ?, ?)',
    ['COORD-001', 'William', 'Noroeste Lote 4', 'Mantenimiento Noroeste']
  );

  // 3. Supervisores
  await db.query(
    'INSERT INTO supervisores (code, name, cargo, coordinator_id) VALUES (?, ?, ?, ?)',
    ['SUP-001', 'Isaac Gedeoni Ulloa Javier', 'Supervisor TCT', 1]
  );
  await db.query(
    'INSERT INTO supervisores (code, name, cargo, coordinator_id) VALUES (?, ?, ?, ?)',
    ['SUP-002', 'Cristian Perdomo Durán', 'Supervisor Mantenimiento', 1]
  );
  await db.query(
    'INSERT INTO supervisores (code, name, cargo, coordinator_id) VALUES (?, ?, ?, ?)',
    ['SUP-003', 'RONNY ALMONTE A', 'Supervisor TCT', 1]
  );

  // 4. Brigadas
  await db.query(
    'INSERT INTO brigadas (code, type, vehicle, supervisor_id, zone, campamento, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['MRC04-097', 'Canasto', 'L535228', 1, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo']
  );
  await db.query(
    'INSERT INTO brigadas (code, type, vehicle, supervisor_id, zone, campamento, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['MRC04-098', 'Canasto', 'L534178', 2, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo']
  );
  await db.query(
    'INSERT INTO brigadas (code, type, vehicle, supervisor_id, zone, campamento, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['MRC04-099', 'Canasto', 'L466963', 1, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo']
  );
  await db.query(
    'INSERT INTO brigadas (code, type, vehicle, supervisor_id, zone, campamento, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['MRC04-100', 'Luminaria', 'L535499', 2, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo']
  );
  await db.query(
    'INSERT INTO brigadas (code, type, vehicle, supervisor_id, zone, campamento, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['MRG04-101', 'Grúa Poste', 'L411977', 3, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo']
  );
  await db.query(
    'INSERT INTO brigadas (code, type, vehicle, supervisor_id, zone, campamento, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['MRG04-102', 'Transformadores', 'L399969', 2, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Mantenimiento']
  );
  await db.query(
    'INSERT INTO brigadas (code, type, vehicle, supervisor_id, zone, campamento, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['MCR04-103', 'TCT', 'L535498', 1, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo']
  );

  // 5. Técnicos
  const dominicanTechs = [
    { name: 'Juan Antonio Jiménez', cedula: '001-1823945-8', code: 'EMP-2384', phone: '809-555-0192', blood: 'O+', license: 'Categoría 3', licenseExp: '2028-04-12', sie: 'CERT-SIE-9831', sieState: 'Válido', shirt: 'L', pant: '34', boot: '42', brigade: 'MRC04-097', sup: 1, coord: 1, state: 'Activo', dateIn: '2022-03-15' },
    { name: 'Miguel Ángel Bautista Mateo', cedula: '002-9842831-2', code: 'EMP-9821', phone: '829-555-0143', blood: 'A+', license: 'Categoría 2', licenseExp: '2027-11-20', sie: 'CERT-SIE-1249', sieState: 'Válido', shirt: 'M', pant: '32', boot: '41', brigade: 'MRC04-097', sup: 1, coord: 1, state: 'Activo', dateIn: '2023-01-10' },
    { name: 'Marino Salomón Rodríguez Santana', cedula: '054-0012938-1', code: 'EMP-4389', phone: '809-555-0104', blood: 'B+', license: 'Categoría 3', licenseExp: '2026-08-30', sie: 'CERT-SIE-4392', sieState: 'Válido', shirt: 'XL', pant: '36', boot: '43', brigade: 'MRC04-098', sup: 2, coord: 1, state: 'Activo', dateIn: '2021-06-22' },
    { name: 'Domingo Joehrlin Arias Guzmán', cedula: '001-1923847-5', code: 'EMP-8941', phone: '849-555-0182', blood: 'O-', license: 'Categoría 2', licenseExp: '2026-02-14', sie: 'CERT-SIE-9321', sieState: 'Por Vencer', shirt: 'M', pant: '32', boot: '40', brigade: 'MRC04-098', sup: 2, coord: 1, state: 'Activo', dateIn: '2023-05-18' },
    { name: 'Juan Carlos Ramírez Vásquez', cedula: '102-3928139-4', code: 'EMP-1123', phone: '809-555-0111', blood: 'AB+', license: 'Categoría 3', licenseExp: '2028-10-05', sie: 'CERT-SIE-8423', sieState: 'Válido', shirt: 'L', pant: '34', boot: '42', brigade: 'MRC04-099', sup: 1, coord: 1, state: 'Activo', dateIn: '2020-11-12' },
    { name: 'Bienvenido Guerra Acevedo', cedula: '001-0987341-2', code: 'EMP-6731', phone: '829-555-0122', blood: 'O+', license: 'Categoría 2', licenseExp: '2029-01-20', sie: 'CERT-SIE-5381', sieState: 'Válido', shirt: 'XXL', pant: '38', boot: '44', brigade: 'MRC04-099', sup: 1, coord: 1, state: 'Activo', dateIn: '2019-04-02' },
    { name: 'Juan Carlos Reyes Colón', cedula: '402-9832104-5', code: 'EMP-5524', phone: '849-555-0177', blood: 'A-', license: 'Categoría 2', licenseExp: '2026-07-15', sie: 'CERT-SIE-0941', sieState: 'Expirado', shirt: 'L', pant: '34', boot: '42', brigade: 'MRC04-100', sup: 2, coord: 1, state: 'Suspendido', dateIn: '2022-09-01' },
    { name: 'Pablo Jua Pozo Encarnación', cedula: '001-2293847-1', code: 'EMP-7394', phone: '809-555-0188', blood: 'O+', license: 'Categoría 3', licenseExp: '2028-09-12', sie: 'CERT-SIE-2834', sieState: 'Válido', shirt: 'XL', pant: '36', boot: '43', brigade: 'MRC04-100', sup: 2, coord: 1, state: 'Activo', dateIn: '2021-02-28' },
    { name: 'Víctor Manuel María Núñez', cedula: '056-0928374-2', code: 'EMP-0294', phone: '809-555-0133', blood: 'O+', license: 'Categoría 3', licenseExp: '2027-03-30', sie: 'CERT-SIE-7321', sieState: 'Válido', shirt: 'M', pant: '32', boot: '41', brigade: 'MRG04-101', sup: 3, coord: 1, state: 'Activo', dateIn: '2023-08-14' },
    { name: 'Bagner Manuel Feliz', cedula: '001-0982345-3', code: 'EMP-1902', phone: '829-555-0155', blood: 'B-', license: 'Categoría 2', licenseExp: '2026-12-10', sie: 'CERT-SIE-2940', sieState: 'Válido', shirt: 'L', pant: '34', boot: '42', brigade: 'MRG04-101', sup: 3, coord: 1, state: 'Activo', dateIn: '2022-10-18' },
    { name: 'Carlos Yunior Romero Contreras', cedula: '003-9283412-9', code: 'EMP-4381', phone: '809-555-0166', blood: 'O+', license: 'Categoría 4', licenseExp: '2028-12-25', sie: 'CERT-SIE-0293', sieState: 'Válido', shirt: 'XXL', pant: '38', boot: '45', brigade: 'MRG04-102', sup: 2, coord: 1, state: 'Inactivo', dateIn: '2018-07-30' },
    { name: 'Dionicio Jiménez Santana', cedula: '001-0293847-6', code: 'EMP-7711', phone: '849-555-0100', blood: 'A+', license: 'Categoría 2', licenseExp: '2027-05-14', sie: 'CERT-SIE-8911', sieState: 'Válido', shirt: 'L', pant: '34', boot: '42', brigade: 'MCR04-103', sup: 1, coord: 1, state: 'Activo', dateIn: '2021-04-15' },
    { name: 'Jordys Brioso Martínez', cedula: '002-0938421-4', code: 'EMP-0032', phone: '809-555-0109', blood: 'O-', license: 'Categoría 3', licenseExp: '2026-10-18', sie: 'CERT-SIE-0348', sieState: 'Por Vencer', shirt: 'M', pant: '30', boot: '40', brigade: 'MCR04-103', sup: 1, coord: 1, state: 'Activo', dateIn: '2023-09-22' }
  ];

  for (const t of dominicanTechs) {
    await db.query(
      `INSERT INTO technicians (name, cedula, codigo_empleado, telefono, tipo_sangre, licencia, vigencia_licencia, sie, licencia_sie, talla_camisa, talla_pantalon, talla_bota, brigada_id, supervisor_id, coordinator_id, estado, fecha_ingreso) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [t.name, t.cedula, t.code, t.phone, t.blood, t.license, t.licenseExp, t.sie, t.sieState, t.shirt, t.pant, t.boot, t.brigade, t.sup, t.coord, t.state, t.dateIn]
    );
  }

  // 6. Inventario Maestro
  const seedInventory = [
    { code: 'HER-CIZ24', name: 'Cizalla de 24 pulgadas', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 5, location: 'Bodega Central A1', status: 'Disponible', value: 85.00 },
    { code: 'HER-CIZ36', name: 'Cizalla de 36 pulgadas', category: 'Herramientas', type: 'Herramientas', stock: 8, min: 3, location: 'Bodega Central A2', status: 'Disponible', value: 120.00 },
    { code: 'HER-CHY35', name: 'Compresor hidráulico Y-35', category: 'Herramientas', type: 'Herramientas', stock: 4, min: 2, location: 'Bodega Especial B1', status: 'Asignado', value: 950.00 },
    { code: 'HER-CCTRQ', name: 'Corta cable de trinquete', category: 'Herramientas', type: 'Herramientas', stock: 12, min: 4, location: 'Bodega Central A3', status: 'Disponible', value: 150.00 },
    { code: 'HER-LLAVA', name: 'Llave ajustable aislada', category: 'Herramientas', type: 'Herramientas', stock: 25, min: 8, location: 'Bodega Central B3', status: 'Disponible', value: 45.00 },
    { code: 'HER-PTAIS', name: 'Pértiga aislada extensible', category: 'Herramientas', type: 'Herramientas', stock: 3, min: 5, location: 'Bodega Central A4', status: 'Bajo mínimo', value: 310.00 },
    { code: 'HER-STIER', name: 'Set de puesta a tierra', category: 'Herramientas', type: 'Herramientas', stock: 9, min: 4, location: 'Bodega Especial B2', status: 'Disponible', value: 420.00 },
    { code: 'HER-CPORT', name: 'Caja porta herramientas', category: 'Herramientas', type: 'Herramientas', stock: 30, min: 10, location: 'Bodega Central C1', status: 'Disponible', value: 65.00 },
    { code: 'EPP-CASDI', name: 'Casco dieléctrico', category: 'EPP', type: 'EPP', stock: 40, min: 15, location: 'Bodega EPP D1', status: 'Disponible', value: 25.00 },
    { code: 'EPP-GUAIS', name: 'Guantes aislados', category: 'EPP', type: 'EPP', stock: 28, min: 10, location: 'Bodega EPP D2', status: 'Disponible', value: 75.00 },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas', category: 'EPP', type: 'EPP', stock: 35, min: 12, location: 'Bodega EPP D3', status: 'Disponible', value: 95.00 },
    { code: 'EPP-LENSE', name: 'Lentes de seguridad', category: 'EPP', type: 'EPP', stock: 50, min: 20, location: 'Bodega EPP D4', status: 'Disponible', value: 8.50 },
    { code: 'EPP-CHARE', name: 'Chaleco reflectivo', category: 'EPP', type: 'EPP', stock: 6, min: 15, location: 'Bodega EPP D5', status: 'Bajo mínimo', value: 12.00 },
    { code: 'EPP-ARNES', name: 'Arnés de seguridad', category: 'EPP', type: 'EPP', stock: 18, min: 6, location: 'Bodega Especial B3', status: 'Disponible', value: 180.00 },
    { code: 'EPP-CAMLA', name: 'Camisa manga larga industrial', category: 'EPP', type: 'EPP', stock: 60, min: 20, location: 'Bodega EPP E1', status: 'Disponible', value: 18.00 },
    { code: 'EPP-PANIN', name: 'Pantalón industrial', category: 'EPP', type: 'EPP', stock: 55, min: 20, location: 'Bodega EPP E2', status: 'Disponible', value: 22.00 },
    { code: 'EPC-CAP15', name: 'Captador de carga 15 kV', category: 'EPC', type: 'EPC', stock: 5, min: 2, location: 'Bodega Especial C1', status: 'Disponible', value: 1250.00 },
    { code: 'EPC-COBCL', name: 'Cobertor cubre líneas cilíndrica', category: 'EPC', type: 'EPC', stock: 15, min: 5, location: 'Bodega Central A5', status: 'Disponible', value: 190.00 },
    { code: 'EPC-ARNMA', name: 'Arnés para mangas aislada', category: 'EPC', type: 'EPC', stock: 10, min: 4, location: 'Bodega Central A6', status: 'Disponible', value: 45.00 },
    { code: 'EPC-BOLMA', name: 'Bolsa para mangas aisladas', category: 'EPC', type: 'EPC', stock: 12, min: 4, location: 'Bodega Central A7', status: 'Disponible', value: 35.00 },
    { code: 'EPC-BROMN', name: 'Broches para mantas aisladas', category: 'EPC', type: 'EPC', stock: 120, min: 30, location: 'Bodega Central C3', status: 'Disponible', value: 3.50 },
    
    // NUEVOS ÍTEMS PARA KITS
    { code: 'HER-ESCDI', name: 'Escalera dieléctrica extensible', category: 'Herramientas', type: 'Herramientas', stock: 12, min: 2, location: 'Bodega Central B1', status: 'Disponible', value: 240.00 },
    { code: 'HER-DETTE', name: 'Detector de tensión personal', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 3, location: 'Bodega Central B2', status: 'Disponible', value: 80.00 },
    { code: 'EPC-MANAI', name: 'Manga aislante flexible', category: 'EPC', type: 'EPC', stock: 18, min: 4, location: 'Bodega Especial A1', status: 'Disponible', value: 95.00 },
    { code: 'EPP-PROFA', name: 'Protector facial dieléctrico', category: 'EPP', type: 'EPP', stock: 30, min: 5, location: 'Bodega EPP D6', status: 'Disponible', value: 15.00 },
    { code: 'EPC-CONOS', name: 'Conos de seguridad vial', category: 'EPC', type: 'EPC', stock: 60, min: 10, location: 'Bodega Central C4', status: 'Disponible', value: 18.00 },
    { code: 'EPC-SENAL', name: 'Señalización vial reflectiva', category: 'EPC', type: 'EPC', stock: 45, min: 8, location: 'Bodega Central C5', status: 'Disponible', value: 35.00 },
    { code: 'HER-RADIO', name: 'Radio de comunicación UHF', category: 'Herramientas', type: 'Herramientas', stock: 24, min: 4, location: 'Bodega Especial B4', status: 'Disponible', value: 110.00 },
    { code: 'HER-CRIMP', name: 'Crimpadora de red profesional', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 3, location: 'Bodega Central A8', status: 'Disponible', value: 45.00 },
    { code: 'HER-PONCH', name: 'Ponchadora de impacto Cat6', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 3, location: 'Bodega Central A9', status: 'Disponible', value: 30.00 },
    { code: 'HER-TESTE', name: 'Tester de red digital LCD', category: 'Herramientas', type: 'Herramientas', stock: 10, min: 2, location: 'Bodega Central A10', status: 'Disponible', value: 75.00 },
    { code: 'HER-CABLE', name: 'Cable UTP Cat6 bobina 305m', category: 'Herramientas', type: 'Herramientas', stock: 25, min: 5, location: 'Bodega Central E3', status: 'Disponible', value: 90.00 },
    { code: 'HER-RJ45', name: 'Conectores RJ45 bolsa 100u', category: 'Herramientas', type: 'Herramientas', stock: 80, min: 10, location: 'Bodega Central E4', status: 'Disponible', value: 15.00 },
    { code: 'HER-ESCAL', name: 'Escalera de aluminio 24 pies', category: 'Herramientas', type: 'Herramientas', stock: 10, min: 2, location: 'Bodega Central B5', status: 'Disponible', value: 180.00 },
    { code: 'HER-TALAD', name: 'Taladro percutor brushless 20V', category: 'Herramientas', type: 'Herramientas', stock: 10, min: 2, location: 'Bodega Central A11', status: 'Disponible', value: 125.00 },
    { code: 'HER-CINTA', name: 'Cinta aislante 3M Super 33+', category: 'Herramientas', type: 'Herramientas', stock: 150, min: 30, location: 'Bodega Central C6', status: 'Disponible', value: 2.50 },
    { code: 'HER-MULTI', name: 'Multímetro digital autorango', category: 'Herramientas', type: 'Herramientas', stock: 20, min: 4, location: 'Bodega Central A12', status: 'Disponible', value: 55.00 },
    { code: 'HER-LAPTO', name: 'Tablet industrial diagnóstico', category: 'Herramientas', type: 'Herramientas', stock: 8, min: 2, location: 'Bodega Central A13', status: 'Disponible', value: 450.00 },
    { code: 'HER-CAJAH', name: 'Caja de herramientas metálica', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 3, location: 'Bodega Central C7', status: 'Disponible', value: 60.00 },
    { code: 'HER-LLAVE', name: 'Juego de llaves mixtas 8-24mm', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 3, location: 'Bodega Central A14', status: 'Disponible', value: 40.00 },
    { code: 'HER-DESTO', name: 'Juego destornilladores aislados', category: 'Herramientas', type: 'Herramientas', stock: 20, min: 5, location: 'Bodega Central A15', status: 'Disponible', value: 35.00 },
    { code: 'HER-CINTM', name: 'Cinta métrica 8m profesional', category: 'Herramientas', type: 'Herramientas', stock: 35, min: 8, location: 'Bodega Central C8', status: 'Disponible', value: 12.00 },
    { code: 'HER-LINTE', name: 'Linterna LED táctica recargable', category: 'Herramientas', type: 'Herramientas', stock: 40, min: 10, location: 'Bodega Central C9', status: 'Disponible', value: 25.00 },
    { code: 'HER-PINZA', name: 'Pinza amperimétrica True RMS', category: 'Herramientas', type: 'Herramientas', stock: 12, min: 2, location: 'Bodega Central A16', status: 'Disponible', value: 115.00 },
    { code: 'HER-KREPA', name: 'Kit de reparación rápida redes', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 4, location: 'Bodega Especial B5', status: 'Disponible', value: 150.00 },
    { code: 'HER-ALICA', name: 'Alicate universal aislado 1000V', category: 'Herramientas', type: 'Herramientas', stock: 25, min: 6, location: 'Bodega Central A17', status: 'Disponible', value: 22.00 },
    { code: 'HER-PRECI', name: 'Precintos plásticos bolsa 500u', category: 'Herramientas', type: 'Herramientas', stock: 50, min: 5, location: 'Bodega Central E5', status: 'Disponible', value: 10.00 },
    { code: 'HER-SELLO', name: 'Sellos de seguridad candado', category: 'Herramientas', type: 'Herramientas', stock: 50, min: 5, location: 'Bodega Central E6', status: 'Disponible', value: 25.00 },
    { code: 'HER-TABLE', name: 'Móvil Android de registro TCT', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 3, location: 'Bodega Central A18', status: 'Disponible', value: 290.00 }
  ];

  for (const item of seedInventory) {
    await db.query(
      'INSERT INTO inventory (code, name, category, type, stock, min, location, status, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [item.code, item.name, item.category, item.type, item.stock, item.min, item.location, item.status, item.value]
    );
  }

  // Seeding de department_equipment_kits
  const seedKits = [
    // TCT KIT
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'HER-PTAIS', nameItem: 'Pértiga aislada extensible', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'EPP-GUAIS', nameItem: 'Guantes aislados', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'EPP-CASDI', nameItem: 'Casco dieléctrico', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'EPP-ARNES', nameItem: 'Arnés de seguridad', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'HER-ESCDI', nameItem: 'Escalera dieléctrica extensible', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'HER-DETTE', nameItem: 'Detector de tensión personal', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'EPC-MANAI', nameItem: 'Manga aislante flexible', cat: 'EPC', qty: 2, req: 0 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'EPP-PROFA', nameItem: 'Protector facial dieléctrico', cat: 'EPP', qty: 2, req: 0 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'EPP-BOTDI', nameItem: 'Botas dieléctricas', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'EPC-CONOS', nameItem: 'Conos de seguridad vial', cat: 'EPC', qty: 4, req: 0 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'EPC-SENAL', nameItem: 'Señalización vial reflectiva', cat: 'EPC', qty: 2, req: 0 },
    { dept: 'TCT', name: 'Kit Básico TCT', code: 'HER-RADIO', nameItem: 'Radio de comunicación UHF', cat: 'Herramientas', qty: 2, req: 0 },

    // REDES KIT
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-CRIMP', nameItem: 'Crimpadora de red profesional', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-PONCH', nameItem: 'Ponchadora de impacto Cat6', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-TESTE', nameItem: 'Tester de red digital LCD', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-CABLE', nameItem: 'Cable UTP Cat6 bobina 305m', cat: 'Herramientas', qty: 2, req: 0 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-RJ45', nameItem: 'Conectores RJ45 bolsa 100u', cat: 'Herramientas', qty: 1, req: 0 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-ESCAL', nameItem: 'Escalera de aluminio 24 pies', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-TALAD', nameItem: 'Taladro percutor brushless 20V', cat: 'Herramientas', qty: 1, req: 0 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-CINTA', nameItem: 'Cinta aislante 3M Super 33+', cat: 'Herramientas', qty: 3, req: 0 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-MULTI', nameItem: 'Multímetro digital autorango', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Redes', name: 'Kit Redes de Cobre y Fibra', code: 'HER-LAPTO', nameItem: 'Tablet industrial diagnóstico', cat: 'Herramientas', qty: 1, req: 0 },

    // MANTENIMIENTO KIT
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'HER-CAJAH', nameItem: 'Caja de herramientas metálica', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'HER-LLAVE', nameItem: 'Juego de llaves mixtas 8-24mm', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'HER-DESTO', nameItem: 'Juego destornilladores aislados', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'HER-TALAD', nameItem: 'Taladro percutor brushless 20V', cat: 'Herramientas', qty: 1, req: 0 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'HER-MULTI', nameItem: 'Multímetro digital autorango', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'HER-CINTM', nameItem: 'Cinta métrica 8m profesional', cat: 'Herramientas', qty: 1, req: 0 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'HER-LINTE', nameItem: 'Linterna LED táctica recargable', cat: 'Herramientas', qty: 1, req: 0 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'EPP-GUAIS', nameItem: 'Guantes aislados', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'EPP-CASDI', nameItem: 'Casco dieléctrico', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'Mantenimiento', name: 'Kit Mantenimiento General', code: 'EPP-BOTDI', nameItem: 'Botas dieléctricas', cat: 'EPP', qty: 2, req: 1 },

    // AVERIAS KIT
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-MULTI', nameItem: 'Multímetro digital autorango', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-PINZA', nameItem: 'Pinza amperimétrica True RMS', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-DETTE', nameItem: 'Detector de tensión personal', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-CAJAH', nameItem: 'Caja de herramientas metálica', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-CINTA', nameItem: 'Cinta aislante 3M Super 33+', cat: 'Herramientas', qty: 2, req: 0 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-ESCAL', nameItem: 'Escalera de aluminio 24 pies', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-LINTE', nameItem: 'Linterna LED táctica recargable', cat: 'Herramientas', qty: 2, req: 0 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'EPC-CONOS', nameItem: 'Conos de seguridad vial', cat: 'EPC', qty: 4, req: 0 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-RADIO', nameItem: 'Radio de comunicación UHF', cat: 'Herramientas', qty: 2, req: 0 },
    { dept: 'Averías', name: 'Kit Atención de Averías 24/7', code: 'HER-KREPA', nameItem: 'Kit de reparación rápida redes', cat: 'Herramientas', qty: 1, req: 1 },

    // CORTE Y RECONEXION KIT
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'HER-ALICA', nameItem: 'Alicate universal aislado 1000V', cat: 'Herramientas', qty: 2, req: 1 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'HER-DESTO', nameItem: 'Juego destornilladores aislados', cat: 'Herramientas', qty: 2, req: 1 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'HER-PINZA', nameItem: 'Pinza amperimétrica True RMS', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'HER-PRECI', nameItem: 'Precintos plásticos bolsa 500u', cat: 'Herramientas', qty: 1, req: 0 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'HER-SELLO', nameItem: 'Sellos de seguridad candado', cat: 'Herramientas', qty: 1, req: 0 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'HER-ESCAL', nameItem: 'Escalera de aluminio 24 pies', cat: 'Herramientas', qty: 1, req: 1 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'EPP-GUAIS', nameItem: 'Guantes aislados', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'EPP-CASDI', nameItem: 'Casco dieléctrico', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'EPP-BOTDI', nameItem: 'Botas dieléctricas', cat: 'EPP', qty: 2, req: 1 },
    { dept: 'Corte/Reconexion', name: 'Kit Corte y Reconexión Rápido', code: 'HER-TABLE', nameItem: 'Móvil Android de registro TCT', cat: 'Herramientas', qty: 1, req: 1 }
  ];

  for (const kit of seedKits) {
    await db.query(
      'INSERT INTO department_equipment_kits (departamento, nombre_kit, item_code, name, category, suggested_qty, obligatorio) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [kit.dept, kit.name, kit.code, kit.nameItem, kit.cat, kit.qty, kit.req]
    );
  }

  // 7. Herramientas Asignadas a Brigada
  const seedBrigadeTools = [
    { bCode: 'MRC04-097', iCode: 'HER-CIZ24', name: 'Cizalla de 24 pulgadas', req: 2, del: 2, cat: 'Herramientas', est: 'Entregado', obs: 'Sin novedades' },
    { bCode: 'MRC04-097', iCode: 'HER-PTAIS', name: 'Pértiga aislada extensible', req: 1, del: 1, cat: 'Herramientas', est: 'Entregado', obs: 'Recalibrada recientemente' },
    { bCode: 'MRC04-097', iCode: 'EPP-GUAIS', name: 'Guantes aislados', req: 4, del: 3, cat: 'EPP', est: 'Pendiente', obs: 'Pendiente par talla M' },
    { bCode: 'MRC04-097', iCode: 'HER-CHY35', name: 'Compresor hidráulico Y-35', req: 1, del: 1, cat: 'Herramientas', est: 'Entregado', obs: 'Vehículo L535228' },
    { bCode: 'MRC04-098', iCode: 'HER-CIZ36', name: 'Cizalla de 36 pulgadas', req: 1, del: 1, cat: 'Herramientas', est: 'Entregado', obs: 'Excelente estado' },
    { bCode: 'MRC04-098', iCode: 'HER-CCTRQ', name: 'Corta cable de trinquete', req: 1, del: 0, cat: 'Herramientas', est: 'No entregado', obs: 'Falta de stock' },
    { bCode: 'MRC04-098', iCode: 'EPP-ARNES', name: 'Arnés de seguridad', req: 2, del: 2, cat: 'EPP', est: 'Entregado', obs: 'Certificación 2026' }
  ];

  for (const bt of seedBrigadeTools) {
    await db.query(
      'INSERT INTO brigade_tools (brigada_code, item_code, name, req_qty, del_qty, category, estado, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [bt.bCode, bt.iCode, bt.name, bt.req, bt.del, bt.cat, bt.est, bt.obs]
    );
  }

  // 8. Actas
  await db.query(
    'INSERT INTO actas (code, tipo, destino, responsable, fecha, estado, firmado, signature_data, observaciones, anexos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['ACT-2026-001', 'Entrega EPP', 'Brigada: MRC04-097', 'Isaac Gedeoni Ulloa Javier', '2026-05-10', 'Firmada', 1, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'Acta inicial de entrega en orden.', '["Anexo 1: Formulario SST firmado digitalmente por coordinador William"]']
  );
  await db.query(
    'INSERT INTO actas (code, tipo, destino, responsable, fecha, estado, firmado, signature_data, observaciones, anexos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['ACT-2026-002', 'Asignación Herramientas', 'Brigada: MRC04-098', 'Cristian Perdomo Durán', '2026-05-15', 'Validada', 0, null, 'Pendiente de firma del técnico operador.', null]
  );

  // 9. Ítems del Acta
  await db.query(
    'INSERT INTO acta_items (acta_code, item_code, name, qty, category) VALUES (?, ?, ?, ?, ?)',
    ['ACT-2026-001', 'EPP-GUAIS', 'Guantes aislados', 2, 'EPP']
  );

  // 10. Reposiciones
  await db.query(
    'INSERT INTO reposiciones (code, colaborador, item, motivo, valor, estado, fecha, supervisor_id, coordinator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['REP-001', 'Juan Antonio Jiménez', 'Pértiga aislada extensible', 'Rotura de acople en campo', 310.00, 'Pendiente', '2026-05-21', 1, 1]
  );
  await db.query(
    'INSERT INTO reposiciones (code, colaborador, item, motivo, valor, estado, fecha, supervisor_id, coordinator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['REP-002', 'Domingo Joehrlin Arias Guzmán', 'Lentes de seguridad', 'Pérdida en faena', 8.50, 'Descontar', '2026-05-23', 2, 1]
  );

  // 11. Swaps
  await db.query(
    'INSERT INTO swaps (code, herramienta_anterior, herramienta_nueva, brigada_code, tecnico, motivo, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['SWP-001', 'Cizalla de 24" Dañada', 'Cizalla de 24" Nueva (SN-0982)', 'MRC04-097', 'Juan Antonio Jiménez', 'Filo inservible', '2026-05-18']
  );

  // 12. Devoluciones
  await db.query(
    'INSERT INTO devoluciones (code, colaborador, brigada_code, item, cant_esperada, cant_devuelta, estado, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['DEV-001', 'Bienvenido Guerra Acevedo', 'MRC04-099', 'Corta cable de trinquete', 1, 1, 'Devuelto', 'Excelente estado']
  );

  // 13. Auditoría
  await db.query(
    'INSERT INTO auditoria (code, fecha, usuario, rol, accion, entidad, antes, despues, zona, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['AUD-001', '2026-05-25 08:30:12', 'william', 'Coordinador', 'ASIGNACION_TECNICO', 'Brigada MRC04-097', 'Técnicos: Ninguno', 'Juan Antonio Jiménez, Miguel Ángel Bautista', 'Noroeste Lote 4', '192.168.4.112', 'Mozilla/5.0']
  );

  console.log('⚡ Datos de base de datos sembrados con éxito.');
  await db.end();
}

initializeDatabase().catch(err => {
  console.error('❌ Error inicializando base de datos MySQL:', err);
  process.exit(1);
});
