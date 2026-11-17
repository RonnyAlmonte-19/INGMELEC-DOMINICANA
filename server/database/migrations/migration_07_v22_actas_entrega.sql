-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.2 — FASE A: ACTAS DE ENTREGA DE HERRAMIENTAS)
-- ARCHIVO: server/database/migrations/migration_07_v22_actas_entrega.sql
-- OBJETIVO: Estructura ADITIVA para el módulo Acta de Entrega y Asignación.
--
-- GARANTÍAS (verificadas por server/tests/v22_actas_migration.test.mjs):
--   * Solo CREATE TABLE IF NOT EXISTS y ALTER TABLE ... ADD sobre inv_movimientos.
--   * Sin DELETE, UPDATE, DROP, TRUNCATE, RENAME, MODIFY, CHANGE ni triggers.
--   * No modifica filas históricas: la nueva columna inv_movimientos.acta_id es
--     NULL para todos los movimientos existentes.
--   * El ENUM de inv_movimientos.tipo_movimiento (incl. ASIGNACION) no se toca.
--   * Idempotente: puede ejecutarse varias veces sin error ni efecto adicional.
--   * Compatible con MySQL 8 y MariaDB 10.11 (sin ADD COLUMN IF NOT EXISTS).
--
-- EJECUCIÓN: SOLO en base local aislada, tras respaldo comprobado.
--            NO aplicar sobre Clever Cloud sin autorización expresa del propietario.
-- =================================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------------
-- 1. Cabecera del acta (instantáneas inmutables de los datos de la entrega)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inv_actas_entrega` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `numero_acta` VARCHAR(20) NULL DEFAULT NULL COMMENT 'ACT-AAAA-NNNNNN; NULL mientras sea borrador',
  `anio` SMALLINT NULL DEFAULT NULL,
  `request_uuid` CHAR(36) NOT NULL COMMENT 'Clave de idempotencia generada por el cliente',
  `estado` ENUM('BORRADOR','CONFIRMADA','ANULADA','DESCARTADA') NOT NULL DEFAULT 'BORRADOR',
  `campamento_id` INT NOT NULL,
  `campamento_nombre` VARCHAR(150) NOT NULL,
  `colaborador_id` INT NULL DEFAULT NULL,
  `colaborador_nombre` VARCHAR(150) NOT NULL,
  `departamento` VARCHAR(100) NULL DEFAULT NULL,
  `supervisor_id` INT NULL DEFAULT NULL,
  `supervisor_nombre` VARCHAR(150) NOT NULL,
  `entregado_por_id` INT NULL DEFAULT NULL,
  `entregado_por_nombre` VARCHAR(150) NOT NULL,
  `motivo` VARCHAR(255) NOT NULL,
  `observaciones` TEXT NULL DEFAULT NULL,
  `fecha_entrega` DATETIME NULL DEFAULT NULL,
  `confirmado_en` DATETIME NULL DEFAULT NULL,
  `anulado_en` DATETIME NULL DEFAULT NULL,
  `anulado_por_id` INT NULL DEFAULT NULL,
  `anulado_por_nombre` VARCHAR(150) NULL DEFAULT NULL,
  `motivo_anulacion` VARCHAR(500) NULL DEFAULT NULL,
  `impresiones` INT NOT NULL DEFAULT 0,
  `creado_por_id` INT NULL DEFAULT NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_acta_numero` (`numero_acta`),
  UNIQUE KEY `uq_acta_request_uuid` (`request_uuid`),
  KEY `idx_acta_camp_fecha` (`campamento_id`, `fecha_entrega`),
  KEY `idx_acta_estado` (`estado`),
  KEY `idx_acta_colaborador_nombre` (`colaborador_nombre`),
  KEY `idx_acta_supervisor_nombre` (`supervisor_nombre`),
  KEY `idx_acta_colaborador_id` (`colaborador_id`),
  KEY `idx_acta_supervisor_id` (`supervisor_id`),
  KEY `idx_acta_entregado_por_id` (`entregado_por_id`),
  KEY `idx_acta_anulado_por_id` (`anulado_por_id`),
  KEY `idx_acta_creado_por_id` (`creado_por_id`),
  CONSTRAINT `fk_acta_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_acta_colaborador` FOREIGN KEY (`colaborador_id`) REFERENCES `inv_custodios` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_acta_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `inv_custodios` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_acta_entregado_por` FOREIGN KEY (`entregado_por_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_acta_anulado_por` FOREIGN KEY (`anulado_por_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_acta_creado_por` FOREIGN KEY (`creado_por_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------------
-- 2. Secuencia anual de numeración (fila bloqueada con FOR UPDATE al confirmar)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inv_acta_secuencia` (
  `anio` SMALLINT NOT NULL,
  `ultimo` INT NOT NULL DEFAULT 0,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`anio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------------
-- 3. Ítems del acta (una herramienta por fila, con instantánea de sus datos)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inv_acta_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `acta_id` INT NOT NULL,
  `articulo_id` INT NOT NULL,
  `movimiento_id` INT NULL DEFAULT NULL COMMENT 'SALIDA generada al confirmar',
  `codigo` VARCHAR(100) NULL DEFAULT NULL,
  `descripcion` VARCHAR(500) NOT NULL,
  `serie` VARCHAR(150) NULL DEFAULT NULL,
  `unidad` VARCHAR(50) NULL DEFAULT NULL,
  `ubicacion` VARCHAR(150) NULL DEFAULT NULL,
  `cantidad` DECIMAL(10,2) NOT NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_acta_item_articulo` (`acta_id`, `articulo_id`),
  UNIQUE KEY `uq_acta_item_movimiento` (`movimiento_id`),
  KEY `idx_acta_item_articulo` (`articulo_id`),
  CONSTRAINT `fk_acta_item_acta` FOREIGN KEY (`acta_id`) REFERENCES `inv_actas_entrega` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_acta_item_articulo` FOREIGN KEY (`articulo_id`) REFERENCES `inv_articulos` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_acta_item_movimiento` FOREIGN KEY (`movimiento_id`) REFERENCES `inv_movimientos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------------
-- 4. inv_movimientos.acta_id (NULLABLE; NULL para todo el historial existente)
-- ---------------------------------------------------------------------------------
SET @v22_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND COLUMN_NAME = 'acta_id'
);
SET @v22_col_sql := IF(
  @v22_col_exists = 0,
  'ALTER TABLE `inv_movimientos` ADD COLUMN `acta_id` INT NULL DEFAULT NULL',
  'SELECT ''[migration_07] inv_movimientos.acta_id ya existe.'' AS estado_columna'
);
PREPARE stmt_v22_col FROM @v22_col_sql; EXECUTE stmt_v22_col; DEALLOCATE PREPARE stmt_v22_col;

SET @v22_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND INDEX_NAME = 'idx_inv_mov_acta'
);
SET @v22_idx_sql := IF(
  @v22_idx_exists = 0,
  'ALTER TABLE `inv_movimientos` ADD INDEX `idx_inv_mov_acta` (`acta_id`)',
  'SELECT ''[migration_07] idx_inv_mov_acta ya existe.'' AS estado_indice'
);
PREPARE stmt_v22_idx FROM @v22_idx_sql; EXECUTE stmt_v22_idx; DEALLOCATE PREPARE stmt_v22_idx;

SET @v22_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos'
    AND COLUMN_NAME = 'acta_id' AND REFERENCED_TABLE_NAME = 'inv_actas_entrega'
);
SET @v22_fk_sql := IF(
  @v22_fk_exists = 0,
  'ALTER TABLE `inv_movimientos` ADD CONSTRAINT `fk_inv_mov_acta` FOREIGN KEY (`acta_id`) REFERENCES `inv_actas_entrega` (`id`) ON DELETE RESTRICT',
  'SELECT ''[migration_07] fk_inv_mov_acta ya existe.'' AS estado_fk'
);
PREPARE stmt_v22_fk FROM @v22_fk_sql; EXECUTE stmt_v22_fk; DEALLOCATE PREPARE stmt_v22_fk;
