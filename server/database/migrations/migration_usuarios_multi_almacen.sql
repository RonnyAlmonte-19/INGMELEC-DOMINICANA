-- ==============================================================================
-- MIGRACIÓN: ADMINISTRACIÓN EXCLUSIVA DEVELOPER Y SISTEMA MULTI-ALMACÉN
-- INGMELEC ALMACÉN GENERAL
-- ==============================================================================

-- 1. Ampliar ENUM/VARCHAR de rol en inv_usuarios para soportar 'developer'
ALTER TABLE inv_usuarios
  MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'almacen';

-- 2. Agregar columnas de campamento principal, almacén principal, permisos JSON y flag developer
ALTER TABLE inv_usuarios
  ADD COLUMN IF NOT EXISTS campamento_id INT NULL,
  ADD COLUMN IF NOT EXISTS almacen_id INT NULL,
  ADD COLUMN IF NOT EXISTS permisos_json JSON NULL,
  ADD COLUMN IF NOT EXISTS es_developer TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta DATETIME NULL;

-- 3. Crear tabla intermedia de asignación de múltiples campamentos a usuarios
CREATE TABLE IF NOT EXISTS inv_usuario_campamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  campamento_id INT NOT NULL,
  es_principal TINYINT(1) DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_campamento (usuario_id, campamento_id),
  INDEX idx_uc_usuario (usuario_id),
  INDEX idx_uc_campamento (campamento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Crear tabla intermedia de asignación de almacenes específicos a usuarios
CREATE TABLE IF NOT EXISTS inv_usuario_almacenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  almacen_id INT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_almacen (usuario_id, almacen_id),
  INDEX idx_ua_usuario (usuario_id),
  INDEX idx_ua_almacen (almacen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Agregar campamento_id opcional a inv_articulos para indexación relacional directa
ALTER TABLE inv_articulos
  ADD COLUMN IF NOT EXISTS campamento_id INT NULL,
  ADD COLUMN IF NOT EXISTS almacen_id INT NULL;

CREATE INDEX IF NOT EXISTS idx_articulos_campamento ON inv_articulos (campamento_id);
CREATE INDEX IF NOT EXISTS idx_articulos_ubicacion_txt ON inv_articulos (ubicacion_nombre);
