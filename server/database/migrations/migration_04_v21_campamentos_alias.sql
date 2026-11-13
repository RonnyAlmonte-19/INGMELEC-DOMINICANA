-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.1 — ETAPA 4)
-- PROPUESTA FUTURA IDEMPOTENTE: MODELO DE ALIAS CANÓNICOS Y CÓDIGOS ESTABLES
-- ARCHIVO: server/database/migrations/migration_04_v21_campamentos_alias.sql
-- HALLAZGOS / REQUISITOS RELACIONADOS: C03 (Sec. 6.1) — Sedes y Alias Históricos
-- =================================================================================
-- ADVERTENCIA DE USO Y SEGURIDAD:
--   1. PROPUESTA LOCAL — CERO EJECUCIONES AUTOMÁTICAS EN PRODUCCIÓN (Clever Cloud).
--   2. NO EJECUTAR EN PRODUCCIÓN SIN RESPALDO PREVIO VERIFICADO Y AUTORIZACIÓN EXPLÍCITA.
--   3. Script 100% aditivo e idempotente (compatible con MySQL 8.0+ y MariaDB 10.11+)
--      usando `CREATE TABLE IF NOT EXISTS`, `information_schema` + SQL dinámico
--      (`PREPARE / EXECUTE / DEALLOCATE PREPARE`) y resolución dinámica sin IDs fijos.
--   4. Precondición esperada: haber aplicado `migration_01`, `migration_02` (o fixture
--      sintético equivalente) y `migration_03_v21_seguridad_y_esquema.sql`.
--   5. GARANTÍA DE INTEGRIDAD HISTÓRICA:
--      - CERO modificaciones automáticas a filas existentes de `inv_articulos`.
--      - Nunca fusiona artículos, nunca modifica cantidades ni reasigna historial.
--      - Las equivalencias ambiguas (`KM 19 AUT DUARTE`, `KM19`, `KM 19`,
--        `KM 19 AUTOPISTA DUARTE`, `MANTENIMIENTO`, `MANTENIMIENTO M633`) se marcan
--        con `requiere_revision_historica = 1` para vista previa y aprobación humana.
-- =================================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------------
-- 1. Creación idempotente de tabla `inv_campamento_alias`
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inv_campamento_alias` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `campamento_id` INT NOT NULL,
  `codigo_campamento` VARCHAR(50) NOT NULL,
  `alias_original` VARCHAR(150) NOT NULL,
  `alias_normalizado` VARCHAR(150) NOT NULL,
  `estado_validacion` ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'RECHAZADO') NOT NULL DEFAULT 'CONFIRMADO',
  `requiere_revision_historica` TINYINT(1) NOT NULL DEFAULT 0,
  `es_historico` TINYINT(1) NOT NULL DEFAULT 1,
  `notas` VARCHAR(255) DEFAULT NULL,
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alias_normalizado` (`alias_normalizado`),
  INDEX `idx_alias_camp` (`campamento_id`),
  INDEX `idx_alias_codigo` (`codigo_campamento`),
  CONSTRAINT `fk_alias_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------------
-- 2. Garantía idempotente de índice único, índices secundarios y Foreign Key vía
--    `information_schema` (en caso de tabla preexistente creada parcialmente)
-- ---------------------------------------------------------------------------------
SET @v21_alias_uk_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'inv_campamento_alias'
    AND LOWER(COLUMN_NAME) = 'alias_normalizado'
    AND NON_UNIQUE = 0
);

SET @v21_alias_uk_sql := IF(
  @v21_alias_uk_exists = 0,
  'ALTER TABLE `inv_campamento_alias` ADD UNIQUE KEY `uk_alias_normalizado` (`alias_normalizado`)',
  'SELECT ''[migration_04] uk_alias_normalizado ya existe; sin cambios.'' AS estado_migracion'
);

PREPARE stmt_v21_alias_uk FROM @v21_alias_uk_sql;
EXECUTE stmt_v21_alias_uk;
DEALLOCATE PREPARE stmt_v21_alias_uk;

SET @v21_alias_idx_camp_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'inv_campamento_alias'
    AND LOWER(INDEX_NAME) = 'idx_alias_camp'
);

SET @v21_alias_idx_camp_sql := IF(
  @v21_alias_idx_camp_exists = 0,
  'ALTER TABLE `inv_campamento_alias` ADD INDEX `idx_alias_camp` (`campamento_id`)',
  'SELECT ''[migration_04] idx_alias_camp ya existe; sin cambios.'' AS estado_migracion'
);

PREPARE stmt_v21_alias_idx_camp FROM @v21_alias_idx_camp_sql;
EXECUTE stmt_v21_alias_idx_camp;
DEALLOCATE PREPARE stmt_v21_alias_idx_camp;

SET @v21_alias_idx_cod_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'inv_campamento_alias'
    AND LOWER(INDEX_NAME) = 'idx_alias_codigo'
);

SET @v21_alias_idx_cod_sql := IF(
  @v21_alias_idx_cod_exists = 0,
  'ALTER TABLE `inv_campamento_alias` ADD INDEX `idx_alias_codigo` (`codigo_campamento`)',
  'SELECT ''[migration_04] idx_alias_codigo ya existe; sin cambios.'' AS estado_migracion'
);

PREPARE stmt_v21_alias_idx_cod FROM @v21_alias_idx_cod_sql;
EXECUTE stmt_v21_alias_idx_cod;
DEALLOCATE PREPARE stmt_v21_alias_idx_cod;

SET @v21_alias_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'inv_campamento_alias'
    AND LOWER(COLUMN_NAME) = 'campamento_id'
    AND LOWER(REFERENCED_TABLE_NAME) = 'inv_campamentos'
);

SET @v21_alias_fk_sql := IF(
  @v21_alias_fk_exists = 0,
  'ALTER TABLE `inv_campamento_alias` ADD CONSTRAINT `fk_alias_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE RESTRICT',
  'SELECT ''[migration_04] fk_alias_campamento ya existe; sin cambios.'' AS estado_migracion'
);

PREPARE stmt_v21_alias_fk FROM @v21_alias_fk_sql;
EXECUTE stmt_v21_alias_fk;
DEALLOCATE PREPARE stmt_v21_alias_fk;

-- ---------------------------------------------------------------------------------
-- 3. Resolución dinámica de IDs canónicos en `inv_campamentos` (CERO IDs fijos)
-- ---------------------------------------------------------------------------------
SET @v21_camp_27feb_id := (
  SELECT id
  FROM `inv_campamentos`
  WHERE UPPER(TRIM(COALESCE(`codigo`, ''))) IN ('ALM-27FEB', 'DN-27FEB')
     OR UPPER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`nombre`, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'), 'Ü', 'U'))) IN (
       'ALMACEN 27 DE FEBRERO',
       'DISTRITO NACIONAL 27 DE FEBRERO'
     )
  ORDER BY
    CASE
      WHEN UPPER(TRIM(COALESCE(`codigo`, ''))) = 'ALM-27FEB' THEN 0
      WHEN UPPER(TRIM(COALESCE(`codigo`, ''))) = 'DN-27FEB' THEN 1
      ELSE 2
    END ASC,
    CASE WHEN `clasificacion_sede` = 'CONFIRMADO' THEN 0 ELSE 1 END ASC,
    `es_sintetico` ASC,
    `activo` DESC,
    `id` ASC
  LIMIT 1
);

SET @v21_camp_opl_id := (
  SELECT id
  FROM `inv_campamentos`
  WHERE UPPER(TRIM(COALESCE(`codigo`, ''))) IN ('CAMP-OPL', 'KM19-OPL')
     OR UPPER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`nombre`, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'), 'Ü', 'U'))) IN (
       'OPL',
       'KM 19 AUTOPISTA DUARTE OPL'
     )
  ORDER BY
    CASE
      WHEN UPPER(TRIM(COALESCE(`codigo`, ''))) = 'CAMP-OPL' THEN 0
      WHEN UPPER(TRIM(COALESCE(`codigo`, ''))) = 'KM19-OPL' THEN 1
      ELSE 2
    END ASC,
    CASE WHEN `clasificacion_sede` = 'CONFIRMADO' THEN 0 ELSE 1 END ASC,
    `es_sintetico` ASC,
    `activo` DESC,
    `id` ASC
  LIMIT 1
);

SET @v21_camp_m633_id := (
  SELECT id
  FROM `inv_campamentos`
  WHERE UPPER(TRIM(COALESCE(`codigo`, ''))) IN ('CAMP-M633', 'MANT-633')
     OR UPPER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`nombre`, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'), 'Ü', 'U'))) IN (
       'MANTENIMIENTO 633',
       'MANTENIMIENTO M633'
     )
  ORDER BY
    CASE
      WHEN UPPER(TRIM(COALESCE(`codigo`, ''))) = 'CAMP-M633' THEN 0
      WHEN UPPER(TRIM(COALESCE(`codigo`, ''))) = 'MANT-633' THEN 1
      ELSE 2
    END ASC,
    CASE WHEN `clasificacion_sede` = 'CONFIRMADO' THEN 0 ELSE 1 END ASC,
    `es_sintetico` ASC,
    `activo` DESC,
    `id` ASC
  LIMIT 1
);

SELECT
  @v21_camp_27feb_id AS resolved_id_27feb,
  @v21_camp_opl_id AS resolved_id_opl,
  @v21_camp_m633_id AS resolved_id_m633;

-- ---------------------------------------------------------------------------------
-- 4. Sembrado idempotente de alias canónicos (sin sobrescribir alias asignados a otra sede)
--    Cada inserción verifica existencia en `inv_campamentos` y `NOT EXISTS` sobre
--    `alias_normalizado` + `INSERT IGNORE` para tolerar concurrencia sin pisar otra sede.
-- ---------------------------------------------------------------------------------

-- 4.1 Sede OPL (codigo = 'CAMP-OPL') — Directos (requiere_revision_historica = 0)
INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-OPL', 'OPL', 'OPL', 'CONFIRMADO', 0, 0, 'Nombre canónico oficial de sede OPL'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_opl_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'OPL');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-OPL', 'KM 19 AUTOPISTA DUARTE OPL', 'KM 19 AUTOPISTA DUARTE OPL', 'CONFIRMADO', 0, 1, 'Denominación histórica inequívoca de OPL en Excel'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_opl_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'KM 19 AUTOPISTA DUARTE OPL');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-OPL', 'CAMP-OPL', 'CAMP-OPL', 'CONFIRMADO', 0, 0, 'Código canónico estable de sede OPL'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_opl_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'CAMP-OPL');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-OPL', 'KM19-OPL', 'KM19-OPL', 'CONFIRMADO', 0, 1, 'Código histórico previo de sede OPL'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_opl_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'KM19-OPL');

-- 4.2 Sede OPL (codigo = 'CAMP-OPL') — Equivalencias indicadas por propietario (requiere_revision_historica = 1)
INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-OPL', 'KM 19 AUT DUARTE', 'KM 19 AUT DUARTE', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_opl_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'KM 19 AUT DUARTE');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-OPL', 'KM19', 'KM19', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_opl_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'KM19');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-OPL', 'KM 19', 'KM 19', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_opl_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'KM 19');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-OPL', 'KM 19 AUTOPISTA DUARTE', 'KM 19 AUTOPISTA DUARTE', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_opl_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'KM 19 AUTOPISTA DUARTE');

-- 4.3 Sede MANTENIMIENTO 633 (codigo = 'CAMP-M633') — Directos (requiere_revision_historica = 0)
INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-M633', 'MANTENIMIENTO 633', 'MANTENIMIENTO 633', 'CONFIRMADO', 0, 0, 'Nombre canónico oficial de sede Mantenimiento 633'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_m633_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'MANTENIMIENTO 633');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-M633', 'CAMP-M633', 'CAMP-M633', 'CONFIRMADO', 0, 0, 'Código canónico estable de sede Mantenimiento 633'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_m633_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'CAMP-M633');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-M633', 'MANT-633', 'MANT-633', 'CONFIRMADO', 0, 1, 'Código histórico previo de sede Mantenimiento 633'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_m633_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'MANT-633');

-- 4.4 Sede MANTENIMIENTO 633 (codigo = 'CAMP-M633') — Equivalencias indicadas por propietario (requiere_revision_historica = 1)
INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-M633', 'MANTENIMIENTO', 'MANTENIMIENTO', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_m633_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'MANTENIMIENTO');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'CAMP-M633', 'MANTENIMIENTO M633', 'MANTENIMIENTO M633', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_m633_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'MANTENIMIENTO M633');

-- 4.5 Sede ALMACÉN 27 DE FEBRERO (codigo = 'ALM-27FEB') — Directos (requiere_revision_historica = 0)
INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'ALM-27FEB', 'ALMACÉN 27 DE FEBRERO', 'ALMACEN 27 DE FEBRERO', 'CONFIRMADO', 0, 0, 'Nombre canónico oficial de sede Almacén 27 de Febrero'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_27feb_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'ALMACEN 27 DE FEBRERO');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'ALM-27FEB', 'DISTRITO NACIONAL 27 DE FEBRERO', 'DISTRITO NACIONAL 27 DE FEBRERO', 'CONFIRMADO', 0, 1, 'Denominación histórica inequívoca de 27 de Febrero en Excel'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_27feb_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'DISTRITO NACIONAL 27 DE FEBRERO');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'ALM-27FEB', 'ALM-27FEB', 'ALM-27FEB', 'CONFIRMADO', 0, 0, 'Código canónico estable de sede Almacén 27 de Febrero'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_27feb_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'ALM-27FEB');

INSERT IGNORE INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
)
SELECT c.`id`, 'ALM-27FEB', 'DN-27FEB', 'DN-27FEB', 'CONFIRMADO', 0, 1, 'Código histórico previo de sede Almacén 27 de Febrero'
FROM `inv_campamentos` c
WHERE c.`id` = @v21_camp_27feb_id
  AND NOT EXISTS (SELECT 1 FROM `inv_campamento_alias` ex WHERE ex.`alias_normalizado` = 'DN-27FEB');

-- =================================================================================
-- VERIFICACIÓN POST-MIGRACIÓN (SOLO LECTURA — DESCOMENTAR PARA VALIDAR)
-- =================================================================================
-- -- 1. Estructura, índices y Foreign Key de inv_campamento_alias:
-- SELECT
--   COLUMN_NAME,
--   COLUMN_TYPE,
--   IS_NULLABLE,
--   COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'inv_campamento_alias'
-- ORDER BY ORDINAL_POSITION;
--
-- SELECT
--   INDEX_NAME,
--   NON_UNIQUE,
--   COLUMN_NAME
-- FROM information_schema.STATISTICS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'inv_campamento_alias'
-- ORDER BY INDEX_NAME, SEQ_IN_INDEX;
--
-- SELECT
--   CONSTRAINT_NAME,
--   COLUMN_NAME,
--   REFERENCED_TABLE_NAME,
--   REFERENCED_COLUMN_NAME
-- FROM information_schema.KEY_COLUMN_USAGE
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'inv_campamento_alias'
--   AND REFERENCED_TABLE_NAME IS NOT NULL;
--
-- -- 2. Resumen de alias sembrados por sede canónica y bandera de revisión histórica:
-- SELECT
--   ca.codigo_campamento,
--   c.nombre AS campamento_nombre,
--   ca.campamento_id,
--   ca.estado_validacion,
--   ca.requiere_revision_historica,
--   COUNT(*) AS total_alias
-- FROM inv_campamento_alias ca
-- JOIN inv_campamentos c ON c.id = ca.campamento_id
-- GROUP BY ca.codigo_campamento, c.nombre, ca.campamento_id, ca.estado_validacion, ca.requiere_revision_historica
-- ORDER BY ca.codigo_campamento, ca.requiere_revision_historica;
--
-- -- 3. Verificación de integridad de inv_articulos (CERO modificaciones automáticas):
-- SELECT
--   COUNT(*) AS total_articulos,
--   SUM(COALESCE(cantidad_num, 0)) AS suma_cantidades,
--   SUM(CASE WHEN campamento_id IS NULL THEN 1 ELSE 0 END) AS articulos_sin_sede,
--   SUM(CASE WHEN estado_vinculacion_sede = 'SEDE_AMBIGUA' THEN 1 ELSE 0 END) AS articulos_sede_ambigua
-- FROM inv_articulos;

-- =================================================================================
-- PLAN DE REVERSIÓN SEGURO NO DESTRUCTIVO (ROLLBACK MANUAL — SOLO CON RESPALDO PREVIO)
-- =================================================================================
-- REGLAS DE SEGURIDAD ANTES DE REVERTIR:
--   1. Tomar snapshot/respaldo completo antes de ejecutar cualquier DELETE/DROP.
--   2. No ejecutar en producción sin revertir antes el código backend que consulte
--      `inv_campamento_alias` (para evitar errores ER_NO_SUCH_TABLE).
--   3. Este rollback NO altera ni elimina registros en `inv_campamentos` ni `inv_articulos`.
--
-- -- Opción R1 (Reversión selectiva de registros semilla si se desea conservar la tabla):
-- DELETE FROM `inv_campamento_alias`
-- WHERE `alias_normalizado` IN (
--   'OPL', 'KM 19 AUTOPISTA DUARTE OPL', 'CAMP-OPL', 'KM19-OPL',
--   'KM 19 AUT DUARTE', 'KM19', 'KM 19', 'KM 19 AUTOPISTA DUARTE',
--   'MANTENIMIENTO 633', 'CAMP-M633', 'MANT-633', 'MANTENIMIENTO', 'MANTENIMIENTO M633',
--   'ALMACEN 27 DE FEBRERO', 'DISTRITO NACIONAL 27 DE FEBRERO', 'ALM-27FEB', 'DN-27FEB'
-- );
--
-- -- Opción R2 (Reversión estructural completa SOLO si no existen alias personalizados):
-- SET @rb_alias_custom := (
--   SELECT COUNT(*)
--   FROM `inv_campamento_alias`
--   WHERE `alias_normalizado` NOT IN (
--     'OPL', 'KM 19 AUTOPISTA DUARTE OPL', 'CAMP-OPL', 'KM19-OPL',
--     'KM 19 AUT DUARTE', 'KM19', 'KM 19', 'KM 19 AUTOPISTA DUARTE',
--     'MANTENIMIENTO 633', 'CAMP-M633', 'MANT-633', 'MANTENIMIENTO', 'MANTENIMIENTO M633',
--     'ALMACEN 27 DE FEBRERO', 'DISTRITO NACIONAL 27 DE FEBRERO', 'ALM-27FEB', 'DN-27FEB'
--   )
-- );
-- SET @rb_drop_alias_sql := IF(
--   @rb_alias_custom = 0,
--   'DROP TABLE IF EXISTS `inv_campamento_alias`',
--   'SELECT ''[rollback BLOQUEADO] Existen alias personalizados en inv_campamento_alias'' AS estado'
-- );
-- PREPARE st_rb_alias FROM @rb_drop_alias_sql;
-- EXECUTE st_rb_alias;
-- DEALLOCATE PREPARE st_rb_alias;
