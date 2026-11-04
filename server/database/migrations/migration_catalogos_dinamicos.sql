-- ========================================================================
-- MIGRACIÓN ADITIVA: CATÁLOGOS DINÁMICOS Y CUSTODIOS PARA INGMELEC ENTERPRISE
-- Fecha: 2026-11-03
-- Base de Datos: MySQL 8 / MariaDB 10.11
-- ========================================================================

-- 1. TABLA DE CATEGORÍAS DINÁMICAS POR ÁREA
CREATE TABLE IF NOT EXISTS inv_categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  area VARCHAR(50) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  activo TINYINT DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_area_nombre (area, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABLA DE CUSTODIOS Y RESPONSABLES
CREATE TABLE IF NOT EXISTS inv_custodios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  cargo VARCHAR(100) NULL,
  departamento VARCHAR(100) NULL,
  telefono VARCHAR(50) NULL,
  activo TINYINT DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_custodio_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. POBLACIÓN INICIAL DE CATEGORÍAS (SEMILLAS BASADAS EN HISTÓRICO)
INSERT IGNORE INTO inv_categorias (area, nombre, activo) VALUES
('ALMACEN', 'Herramientas Eléctricas', 1),
('ALMACEN', 'Herramientas Manuales', 1),
('ALMACEN', 'Equipos de Medición', 1),
('ALMACEN', 'Equipos de Protección Personal (EPP)', 1),
('ALMACEN', 'Equipos de Protección Colectiva (EPC)', 1),
('ALMACEN', 'Materiales Eléctricos', 1),
('ALMACEN', 'Cables y Conductores', 1),
('ALMACEN', 'Generadores y Motores', 1),
('ALMACEN', 'Ferretería y Accesorios', 1),
('ALMACEN', 'General', 1),
('INFORMATICA', 'Laptops y Portátiles', 1),
('INFORMATICA', 'Computadoras de Escritorio', 1),
('INFORMATICA', 'Monitores y Pantallas', 1),
('INFORMATICA', 'Redes y Telecomunicaciones', 1),
('INFORMATICA', 'Impresoras y Escáneres', 1),
('INFORMATICA', 'Servidores y Almacenamiento', 1),
('INFORMATICA', 'Cámaras y Seguridad', 1),
('INFORMATICA', 'Periféricos y Accesorios', 1),
('INFORMATICA', 'Tabletas y Dispositivos Móviles', 1),
('INFORMATICA', 'General', 1),
('OFICINAS', 'Escritorios y Mesas', 1),
('OFICINAS', 'Sillas Ergonómicas y Ejecutivas', 1),
('OFICINAS', 'Archivadores y Gaveteros', 1),
('OFICINAS', 'Climatización y Aires Acondicionados', 1),
('OFICINAS', 'Electrodomésticos de Oficina', 1),
('OFICINAS', 'Armarios y Estantes', 1),
('OFICINAS', 'General', 1),
('COCINA', 'Electrodomésticos de Cocina', 1),
('COCINA', 'Refrigeración y Congeladores', 1),
('COCINA', 'Mobiliario de Comedor', 1),
('COCINA', 'Utensilios y Menaje', 1),
('COCINA', 'Almacenamiento de Alimentos', 1),
('COCINA', 'General', 1);

-- 4. POBLACIÓN INICIAL DE CUSTODIOS PRINCIPALES
INSERT IGNORE INTO inv_custodios (nombre, cargo, departamento, activo) VALUES
('WILLIAM ALMANZAR', 'Supervisor Operativo', 'Operaciones', 1),
('RONALD FLORENTINO', 'Encargado de Almacén', 'Logística', 1),
('LISBETH PEÑA', 'Coordinadora Administrativa', 'Administración', 1),
('DANIEL DURAN', 'Técnico Especialista', 'Mantenimiento', 1),
('RONNY ALMONTE', 'Líder de Cuadrilla', 'Operaciones', 1),
('ESTEBAN MATA', 'Técnico de Campo', 'Operaciones', 1),
('YASSIMAR DIAZ', 'Auditora de Calidad', 'Auditoría', 1),
('ROSENDO FAMILIA', 'Operador de Maquinaria', 'Operaciones', 1),
('TEOFILO VANDERHOST', 'Supervisor de Zona', 'Operaciones', 1),
('INGMELEC (ALMACÉN CENTRAL)', 'Custodia Central', 'Logística', 1);
