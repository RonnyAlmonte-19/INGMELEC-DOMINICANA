-- ========================================================================
-- INGMELEC | ALMACÉN ENTERPRISE - DDL DE BASE DE DATOS
-- Esquema relacional independiente y no destructivo para gestión de inventarios
-- ========================================================================

-- 1. Tabla de Usuarios y Roles
CREATE TABLE IF NOT EXISTS inv_usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'almacen', 'supervisor', 'gerencia', 'auditor') NOT NULL DEFAULT 'almacen',
  cargo VARCHAR(100) DEFAULT NULL,
  area VARCHAR(100) DEFAULT 'General',
  activo TINYINT(1) DEFAULT 1,
  ultimo_acceso DATETIME DEFAULT NULL,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inv_usuarios_email (email),
  INDEX idx_inv_usuarios_rol (rol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Lotes de Importación
CREATE TABLE IF NOT EXISTS inv_lotes_importacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre_archivo VARCHAR(255) NOT NULL,
  fecha_corte DATE DEFAULT NULL,
  total_registros INT NOT NULL DEFAULT 0,
  registros_informatica INT NOT NULL DEFAULT 0,
  registros_oficinas INT NOT NULL DEFAULT 0,
  registros_cocina INT NOT NULL DEFAULT 0,
  registros_almacen INT NOT NULL DEFAULT 0,
  advertencias_count INT NOT NULL DEFAULT 0,
  usuario_id INT DEFAULT NULL,
  fecha_importacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  detalles_json JSON DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla Maestra de Artículos / Bienes
CREATE TABLE IF NOT EXISTS inv_articulos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_original VARCHAR(100) DEFAULT NULL,
  area ENUM('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN') NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  articulo_nombre VARCHAR(255) NOT NULL,
  marca_modelo VARCHAR(255) DEFAULT NULL,
  tipo_caracteristicas VARCHAR(255) DEFAULT NULL,
  serie_imei VARCHAR(150) DEFAULT NULL,
  propietario VARCHAR(100) NOT NULL DEFAULT 'INGMELEC',
  asignado_a VARCHAR(150) DEFAULT NULL,
  cantidad_num DECIMAL(10,2) DEFAULT NULL,
  cantidad_texto VARCHAR(50) DEFAULT '1',
  cantidad_verificada TINYINT(1) DEFAULT 1,
  unidad_medida VARCHAR(50) DEFAULT 'Unidad',
  estado_fisico ENUM('Bueno', 'Regular', 'Dañado', 'Fuera de servicio', 'Pendiente de verificación') NOT NULL DEFAULT 'Bueno',
  ubicacion_nombre VARCHAR(150) NOT NULL,
  zona_estante VARCHAR(150) DEFAULT NULL,
  fecha_revision DATE DEFAULT NULL,
  observaciones TEXT DEFAULT NULL,
  evidencia_foto VARCHAR(255) DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  hoja_origen VARCHAR(50) NOT NULL,
  fila_origen INT NOT NULL,
  lote_id INT DEFAULT NULL,
  creado_por INT DEFAULT NULL,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inv_art_area (area),
  INDEX idx_inv_art_estado (estado_fisico),
  INDEX idx_inv_art_ubicacion (ubicacion_nombre),
  INDEX idx_inv_art_categoria (categoria),
  INDEX idx_inv_art_codigo (codigo_original),
  INDEX idx_inv_art_asignado (asignado_a),
  INDEX idx_inv_art_serie (serie_imei)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de Movimientos Transaccionales
CREATE TABLE IF NOT EXISTS inv_movimientos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  articulo_id INT NOT NULL,
  tipo_movimiento ENUM('ENTRADA', 'SALIDA', 'TRASLADO', 'ASIGNACION', 'DEVOLUCION', 'AJUSTE') NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  unidad_medida VARCHAR(50) DEFAULT 'Unidad',
  ubicacion_origen VARCHAR(150) DEFAULT NULL,
  ubicacion_destino VARCHAR(150) DEFAULT NULL,
  custodio_origen VARCHAR(150) DEFAULT NULL,
  custodio_destino VARCHAR(150) DEFAULT NULL,
  estado_previo VARCHAR(50) DEFAULT NULL,
  estado_nuevo VARCHAR(50) DEFAULT NULL,
  motivo VARCHAR(255) NOT NULL,
  observaciones TEXT DEFAULT NULL,
  usuario_id INT DEFAULT NULL,
  fecha_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (articulo_id) REFERENCES inv_articulos(id) ON DELETE CASCADE,
  INDEX idx_inv_mov_art (articulo_id),
  INDEX idx_inv_mov_tipo (tipo_movimiento),
  INDEX idx_inv_mov_fecha (fecha_movimiento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla de Auditoría Inmutable
CREATE TABLE IF NOT EXISTS inv_auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT DEFAULT NULL,
  usuario_nombre VARCHAR(120) DEFAULT 'Sistema',
  accion VARCHAR(80) NOT NULL,
  entidad VARCHAR(50) NOT NULL DEFAULT 'inv_articulos',
  entidad_id INT DEFAULT NULL,
  detalles_previos JSON DEFAULT NULL,
  detalles_nuevos JSON DEFAULT NULL,
  ip_origen VARCHAR(45) DEFAULT NULL,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inv_aud_entidad (entidad, entidad_id),
  INDEX idx_inv_aud_fecha (fecha),
  INDEX idx_inv_aud_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
