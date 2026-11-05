-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.0.0)
-- ARCHIVO 1 DE 2: MIGRACIÓN ESTRUCTURAL PURA (SOLO DDL — CERO MODIFICACIÓN DE DATOS)
-- DESTINO: MySQL 8.0 Productivo (Clever Cloud: bkwlgxt1ccjstm5cfoy5)
-- ESTADO: AUDITADA Y PROBADA CONTRA RESPALDO REAL CLEVER CLOUD DEL 04-NOV-2026
-- =================================================================================
-- GARANTÍA DE INTEGRIDAD:
--   - 100% DDL idempotente y compatible con MySQL 8.0.22 / MariaDB 10.11.
--   - NO ejecuta ningún INSERT, UPDATE, DELETE, TRUNCATE ni DROP.
--   - No re-agrega columnas preexistentes (cargo en inv_usuarios y cantidad_verificada en inv_articulos ya existían).
-- =================================================================================

-- ---------------------------------------------------------------------------------
-- SECCIÓN 1: CREACIÓN DE LAS 4 TABLAS NUEVAS (INEXISTENTES EN CLEVER CLOUD)
-- ---------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inv_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    area VARCHAR(50) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_area_categoria (area, nombre),
    INDEX idx_cat_area (area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inv_custodios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    cargo VARCHAR(100) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cust_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inv_usuario_campamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    campamento_id INT NOT NULL,
    es_principal TINYINT(1) NOT NULL DEFAULT 0,
    asignado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_usuario_campamento (usuario_id, campamento_id),
    INDEX idx_uc_usuario (usuario_id),
    INDEX idx_uc_campamento (campamento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inv_usuario_almacenes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    almacen_id INT NOT NULL,
    asignado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_usuario_almacen (usuario_id, almacen_id),
    INDEX idx_ua_usuario (usuario_id),
    INDEX idx_ua_almacen (almacen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------------
-- SECCIÓN 2: COLUMNAS ADITIVAS SOBRE TABLAS PREEXISTENTES EN CLEVER CLOUD
-- ---------------------------------------------------------------------------------

-- 2.1 Columnas de control de acceso y ámbito en inv_usuarios
-- (cargo ya existe en Clever Cloud; rol pasa de ENUM a VARCHAR(50); es_developer = 0 por defecto)
ALTER TABLE inv_usuarios MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'almacen';
ALTER TABLE inv_usuarios MODIFY COLUMN cargo VARCHAR(100) NULL;
ALTER TABLE inv_usuarios ADD COLUMN es_developer TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_usuarios ADD COLUMN campamento_id INT NULL;
ALTER TABLE inv_usuarios ADD COLUMN almacen_id INT NULL;
ALTER TABLE inv_usuarios ADD COLUMN permisos_json JSON NULL;

-- 2.2 Columnas de clasificación operativa y trazabilidad en inv_campamentos e inv_almacenes
ALTER TABLE inv_campamentos ADD COLUMN clasificacion_sede ENUM('CONFIRMADO', 'PROPUESTO', 'SINTETICO_PRUEBA', 'HISTORICO_NO_HOMOLOGADO', 'DUPLICADO_EQUIVALENTE') NOT NULL DEFAULT 'PROPUESTO';
ALTER TABLE inv_campamentos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_campamentos ADD COLUMN origen_registro VARCHAR(100) NOT NULL DEFAULT 'SISTEMA_INICIAL';
ALTER TABLE inv_campamentos ADD COLUMN ubicacion_historica_equivalente VARCHAR(150) NULL;

ALTER TABLE inv_almacenes ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

-- 2.3 Columnas de vínculo multi-sede, verificación de cantidad y origen en inv_articulos
-- (cantidad_verificada ya existe en Clever Cloud; se garantiza NOT NULL DEFAULT 1)
ALTER TABLE inv_articulos ADD COLUMN campamento_id INT NULL;
ALTER TABLE inv_articulos ADD COLUMN almacen_id INT NULL;
ALTER TABLE inv_articulos MODIFY COLUMN cantidad_verificada TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE inv_articulos ADD COLUMN estado_cantidad ENUM('VERIFICADO', 'PENDIENTE_VERIFICACION', 'TEXTO_NO_NUMERICO') NOT NULL DEFAULT 'VERIFICADO';
ALTER TABLE inv_articulos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_articulos ADD COLUMN origen_datos ENUM('HISTORICO_EXCEL', 'OPERATIVO_REAL', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'OPERATIVO_REAL';
ALTER TABLE inv_articulos ADD COLUMN estado_vinculacion_sede ENUM('CONFIRMADO', 'PROPUESTO', 'SEDE_AMBIGUA', 'SIN_SEDE') NOT NULL DEFAULT 'CONFIRMADO';

CREATE INDEX idx_art_campamento_id ON inv_articulos (campamento_id);
CREATE INDEX idx_art_es_sintetico ON inv_articulos (es_sintetico);
CREATE INDEX idx_art_cantidad_verificada ON inv_articulos (cantidad_verificada);

-- 2.4 Columnas de código de sesión y estado de verificación en levantamientos y movimientos
ALTER TABLE inv_levantamientos ADD COLUMN codigo VARCHAR(50) NULL;
ALTER TABLE inv_levantamientos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_levantamiento_items ADD COLUMN estado_verificacion VARCHAR(40) NOT NULL DEFAULT 'VERIFICADO';
ALTER TABLE inv_levantamiento_items ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE inv_movimientos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
