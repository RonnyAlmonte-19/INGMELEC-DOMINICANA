-- ========================================================================
-- INGMELEC | ALMACÉN ENTERPRISE - MÓDULO DE LEVANTAMIENTOS Y AUDITORÍAS
-- DDL no destructivo para Campamentos, Almacenes y Levantamientos en Campo
-- ========================================================================

-- 1. Tabla de Campamentos / Sedes
CREATE TABLE IF NOT EXISTS inv_campamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  codigo VARCHAR(50) DEFAULT NULL,
  provincia VARCHAR(100) DEFAULT NULL,
  direccion VARCHAR(255) DEFAULT NULL,
  responsable VARCHAR(150) DEFAULT NULL,
  telefono VARCHAR(50) DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_camp_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Almacenes / Bodegas dentro de Campamentos
CREATE TABLE IF NOT EXISTS inv_almacenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campamento_id INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  tipo VARCHAR(80) DEFAULT 'General',
  encargado VARCHAR(150) DEFAULT NULL,
  descripcion TEXT DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campamento_id) REFERENCES inv_campamentos(id) ON DELETE CASCADE,
  INDEX idx_alm_camp (campamento_id),
  INDEX idx_alm_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Sesiones de Levantamiento Físico
CREATE TABLE IF NOT EXISTS inv_levantamientos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_levantamiento VARCHAR(60) UNIQUE NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  campamento_id INT NOT NULL,
  almacen_id INT DEFAULT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE DEFAULT NULL,
  responsable_levantamiento VARCHAR(150) NOT NULL,
  equipo_auditor VARCHAR(255) DEFAULT NULL,
  estado ENUM('En preparación', 'En proceso', 'Pendiente de revisión', 'Finalizado') DEFAULT 'En proceso',
  notas TEXT DEFAULT NULL,
  total_articulos_capturados INT DEFAULT 0,
  consolidado_por INT DEFAULT NULL,
  fecha_consolidacion DATETIME DEFAULT NULL,
  creado_por INT NOT NULL,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (campamento_id) REFERENCES inv_campamentos(id) ON DELETE RESTRICT,
  INDEX idx_lev_codigo (codigo_levantamiento),
  INDEX idx_lev_estado (estado),
  INDEX idx_lev_camp (campamento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de Artículos Capturados en Sesión de Levantamiento
CREATE TABLE IF NOT EXISTS inv_levantamiento_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  levantamiento_id INT NOT NULL,
  codigo_original VARCHAR(100) DEFAULT NULL,
  area ENUM('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN', 'OTRA') NOT NULL DEFAULT 'ALMACEN',
  categoria VARCHAR(100) NOT NULL,
  articulo_nombre VARCHAR(255) NOT NULL,
  marca VARCHAR(150) DEFAULT NULL,
  modelo_caracteristicas VARCHAR(255) DEFAULT NULL,
  serie_imei VARCHAR(150) DEFAULT NULL,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  unidad_medida VARCHAR(50) DEFAULT 'Unidad',
  estado_fisico ENUM('Bueno', 'Regular', 'Dañado', 'Fuera de servicio', 'Pendiente de verificación') NOT NULL DEFAULT 'Bueno',
  propietario VARCHAR(100) DEFAULT 'INGMELEC',
  responsable_custodio VARCHAR(150) DEFAULT NULL,
  ubicacion_exacta VARCHAR(150) DEFAULT NULL,
  fecha_revision DATE DEFAULT NULL,
  observaciones TEXT DEFAULT NULL,
  evidencia_foto MEDIUMTEXT DEFAULT NULL,
  consolidado TINYINT(1) DEFAULT 0,
  articulo_maestro_id INT DEFAULT NULL,
  creado_por INT DEFAULT NULL,
  fecha_captura DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (levantamiento_id) REFERENCES inv_levantamientos(id) ON DELETE CASCADE,
  INDEX idx_item_lev (levantamiento_id),
  INDEX idx_item_area (area),
  INDEX idx_item_serie (serie_imei),
  INDEX idx_item_codigo (codigo_original)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
