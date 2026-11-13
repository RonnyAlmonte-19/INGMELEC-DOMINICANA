-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.1 — ETAPAS 2 Y 3)
-- PROPUESTA FUTURA IDEMPOTENTE: SEGURIDAD Y COMPATIBILIDAD DE ESQUEMA MySQL 8.0+
-- ARCHIVO: server/database/migrations/migration_03_v21_seguridad_y_esquema.sql
-- HALLAZGOS RELACIONADOS: CRIT-06 (token_version), CRIT-02 (DDL vs almacenApi.js), MED-06
-- =================================================================================
-- ADVERTENCIA DE USO Y SEGURIDAD:
--   1. PROPUESTA LOCAL — CERO EJECUCIONES AUTOMÁTICAS EN PRODUCCIÓN (Clever Cloud).
--   2. NO EJECUTAR EN PRODUCCIÓN SIN RESPALDO PREVIO VERIFICADO Y AUTORIZACIÓN EXPLÍCITA.
--   3. Script 100% aditivo/expansivo e idempotente (compatible con MySQL 8.0+ y
--      MariaDB 10.11+) usando `information_schema.COLUMNS` + SQL dinámico
--      (`PREPARE / EXECUTE / DEALLOCATE PREPARE`).
--   4. Precondición esperada: haber aplicado `migration_01_estructural_ddl_clever_cloud.sql`
--      y `migration_02_datos_homologacion_clever_cloud.sql`.
--   5. Garantía no destructiva: nunca elimina columnas ni trunca filas existentes.
-- =================================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------------
-- 1. inv_usuarios.token_version (Etapa 2 — CRIT-06: revocación inmediata de JWT)
-- ---------------------------------------------------------------------------------
SET @v21_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_usuarios'
    AND COLUMN_NAME = 'token_version'
);

SET @v21_add_token_version_sql := IF(
  @v21_col_exists = 0,
  'ALTER TABLE `inv_usuarios` ADD COLUMN `token_version` INT NOT NULL DEFAULT 1 AFTER `es_developer`',
  'SELECT ''[migration_03] inv_usuarios.token_version ya existe; sin cambios.'' AS estado_migracion'
);

PREPARE stmt_v21_add_token_version FROM @v21_add_token_version_sql;
EXECUTE stmt_v21_add_token_version;
DEALLOCATE PREPARE stmt_v21_add_token_version;

-- ---------------------------------------------------------------------------------
-- 2. inv_almacenes.estado_verificacion e inv_almacenes.origen_registro (Etapa 3 — CRIT-02)
-- ---------------------------------------------------------------------------------
SET @v21_alm_est_verif_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_almacenes'
    AND COLUMN_NAME = 'estado_verificacion'
);

SET @v21_alm_est_verif_ok := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_almacenes'
    AND COLUMN_NAME = 'estado_verificacion'
    AND LOCATE('''CONFIRMADO''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''PENDIENTE_VALIDACION''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''SINTETICO_PRUEBA''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND IS_NULLABLE = 'NO'
    AND TRIM(BOTH '''' FROM COALESCE(CONVERT(COLUMN_DEFAULT USING utf8mb4), '')) COLLATE utf8mb4_bin = 'CONFIRMADO'
);

SET @v21_alm_est_verif_nullable := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_almacenes'
    AND COLUMN_NAME = 'estado_verificacion'
    AND IS_NULLABLE = 'YES'
);

SET @v21_alm_est_verif_fill_sql := IF(
  @v21_alm_est_verif_exists > 0 AND @v21_alm_est_verif_ok = 0 AND @v21_alm_est_verif_nullable > 0,
  'UPDATE `inv_almacenes` SET `estado_verificacion` = ''CONFIRMADO'' WHERE `estado_verificacion` IS NULL',
  'SELECT ''[migration_03] inv_almacenes.estado_verificacion sin relleno NULL necesario.'' AS estado_migracion'
);

PREPARE stmt_v21_alm_est_verif_fill FROM @v21_alm_est_verif_fill_sql;
EXECUTE stmt_v21_alm_est_verif_fill;
DEALLOCATE PREPARE stmt_v21_alm_est_verif_fill;

SET @v21_alm_est_verif_sql := IF(
  @v21_alm_est_verif_exists = 0,
  'ALTER TABLE `inv_almacenes` ADD COLUMN `estado_verificacion` ENUM(''CONFIRMADO'',''PENDIENTE_VALIDACION'',''SINTETICO_PRUEBA'') NOT NULL DEFAULT ''CONFIRMADO''',
  IF(
    @v21_alm_est_verif_ok = 0,
    'ALTER TABLE `inv_almacenes` MODIFY COLUMN `estado_verificacion` ENUM(''CONFIRMADO'',''PENDIENTE_VALIDACION'',''SINTETICO_PRUEBA'') NOT NULL DEFAULT ''CONFIRMADO''',
    'SELECT ''[migration_03] inv_almacenes.estado_verificacion ya cumple definición objetivo; sin cambios.'' AS estado_migracion'
  )
);

PREPARE stmt_v21_alm_est_verif FROM @v21_alm_est_verif_sql;
EXECUTE stmt_v21_alm_est_verif;
DEALLOCATE PREPARE stmt_v21_alm_est_verif;

SET @v21_alm_origen_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_almacenes'
    AND COLUMN_NAME = 'origen_registro'
);

SET @v21_alm_origen_ok := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_almacenes'
    AND COLUMN_NAME = 'origen_registro'
    AND LOWER(DATA_TYPE) = 'varchar'
    AND CHARACTER_MAXIMUM_LENGTH >= 100
    AND IS_NULLABLE = 'NO'
    AND TRIM(BOTH '''' FROM COALESCE(CONVERT(COLUMN_DEFAULT USING utf8mb4), '')) COLLATE utf8mb4_bin = 'SISTEMA_INICIAL'
);

SET @v21_alm_origen_nullable := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_almacenes'
    AND COLUMN_NAME = 'origen_registro'
    AND IS_NULLABLE = 'YES'
);

SET @v21_alm_origen_fill_sql := IF(
  @v21_alm_origen_exists > 0 AND @v21_alm_origen_ok = 0 AND @v21_alm_origen_nullable > 0,
  'UPDATE `inv_almacenes` SET `origen_registro` = ''SISTEMA_INICIAL'' WHERE `origen_registro` IS NULL',
  'SELECT ''[migration_03] inv_almacenes.origen_registro sin relleno NULL necesario.'' AS estado_migracion'
);

PREPARE stmt_v21_alm_origen_fill FROM @v21_alm_origen_fill_sql;
EXECUTE stmt_v21_alm_origen_fill;
DEALLOCATE PREPARE stmt_v21_alm_origen_fill;

SET @v21_alm_origen_sql := IF(
  @v21_alm_origen_exists = 0,
  'ALTER TABLE `inv_almacenes` ADD COLUMN `origen_registro` VARCHAR(100) NOT NULL DEFAULT ''SISTEMA_INICIAL''',
  IF(
    @v21_alm_origen_ok = 0,
    'ALTER TABLE `inv_almacenes` MODIFY COLUMN `origen_registro` VARCHAR(100) NOT NULL DEFAULT ''SISTEMA_INICIAL''',
    'SELECT ''[migration_03] inv_almacenes.origen_registro ya cumple definición objetivo; sin cambios.'' AS estado_migracion'
  )
);

PREPARE stmt_v21_alm_origen FROM @v21_alm_origen_sql;
EXECUTE stmt_v21_alm_origen;
DEALLOCATE PREPARE stmt_v21_alm_origen;

-- ---------------------------------------------------------------------------------
-- 3. inv_campamentos.clasificacion_sede: ampliar con 'PENDIENTE_VALIDACION' (CRIT-02)
-- ---------------------------------------------------------------------------------
SET @v21_camp_clasif_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_campamentos'
    AND COLUMN_NAME = 'clasificacion_sede'
);

SET @v21_camp_clasif_ok := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_campamentos'
    AND COLUMN_NAME = 'clasificacion_sede'
    AND LOCATE('''CONFIRMADO''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''PROPUESTO''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''PENDIENTE_VALIDACION''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''SINTETICO_PRUEBA''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''HISTORICO_NO_HOMOLOGADO''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''DUPLICADO_EQUIVALENTE''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND IS_NULLABLE = 'NO'
);

SET @v21_camp_clasif_nullable := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_campamentos'
    AND COLUMN_NAME = 'clasificacion_sede'
    AND IS_NULLABLE = 'YES'
);

SET @v21_camp_clasif_fill_sql := IF(
  @v21_camp_clasif_exists > 0 AND @v21_camp_clasif_ok = 0 AND @v21_camp_clasif_nullable > 0,
  'UPDATE `inv_campamentos` SET `clasificacion_sede` = ''PROPUESTO'' WHERE `clasificacion_sede` IS NULL',
  'SELECT ''[migration_03] inv_campamentos.clasificacion_sede sin relleno NULL necesario.'' AS estado_migracion'
);

PREPARE stmt_v21_camp_clasif_fill FROM @v21_camp_clasif_fill_sql;
EXECUTE stmt_v21_camp_clasif_fill;
DEALLOCATE PREPARE stmt_v21_camp_clasif_fill;

SET @v21_camp_clasif_sql := IF(
  @v21_camp_clasif_exists = 0,
  'ALTER TABLE `inv_campamentos` ADD COLUMN `clasificacion_sede` ENUM(''CONFIRMADO'',''PROPUESTO'',''PENDIENTE_VALIDACION'',''SINTETICO_PRUEBA'',''HISTORICO_NO_HOMOLOGADO'',''DUPLICADO_EQUIVALENTE'') NOT NULL DEFAULT ''PROPUESTO''',
  IF(
    @v21_camp_clasif_ok = 0,
    'ALTER TABLE `inv_campamentos` MODIFY COLUMN `clasificacion_sede` ENUM(''CONFIRMADO'',''PROPUESTO'',''PENDIENTE_VALIDACION'',''SINTETICO_PRUEBA'',''HISTORICO_NO_HOMOLOGADO'',''DUPLICADO_EQUIVALENTE'') NOT NULL DEFAULT ''PROPUESTO''',
    'SELECT ''[migration_03] inv_campamentos.clasificacion_sede ya soporta PENDIENTE_VALIDACION; sin cambios.'' AS estado_migracion'
  )
);

PREPARE stmt_v21_camp_clasif FROM @v21_camp_clasif_sql;
EXECUTE stmt_v21_camp_clasif;
DEALLOCATE PREPARE stmt_v21_camp_clasif;

-- ---------------------------------------------------------------------------------
-- 4. inv_custodios.departamento e inv_custodios.telefono (Etapa 3 — CRIT-02)
-- ---------------------------------------------------------------------------------
SET @v21_cust_depto_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_custodios'
    AND COLUMN_NAME = 'departamento'
);

SET @v21_cust_depto_sql := IF(
  @v21_cust_depto_exists = 0,
  'ALTER TABLE `inv_custodios` ADD COLUMN `departamento` VARCHAR(100) NULL DEFAULT NULL',
  'SELECT ''[migration_03] inv_custodios.departamento ya existe; sin cambios.'' AS estado_migracion'
);

PREPARE stmt_v21_cust_depto FROM @v21_cust_depto_sql;
EXECUTE stmt_v21_cust_depto;
DEALLOCATE PREPARE stmt_v21_cust_depto;

SET @v21_cust_tel_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_custodios'
    AND COLUMN_NAME = 'telefono'
);

SET @v21_cust_tel_sql := IF(
  @v21_cust_tel_exists = 0,
  'ALTER TABLE `inv_custodios` ADD COLUMN `telefono` VARCHAR(50) NULL DEFAULT NULL',
  'SELECT ''[migration_03] inv_custodios.telefono ya existe; sin cambios.'' AS estado_migracion'
);

PREPARE stmt_v21_cust_tel FROM @v21_cust_tel_sql;
EXECUTE stmt_v21_cust_tel;
DEALLOCATE PREPARE stmt_v21_cust_tel;

-- ---------------------------------------------------------------------------------
-- 5. inv_articulos: area ('OTRA'), estado_vinculacion_sede ('SIN_VINCULAR'),
--    y cantidad_num DECIMAL(12,2) NULL DEFAULT NULL (Etapa 3 — CRIT-02)
-- ---------------------------------------------------------------------------------
SET @v21_art_area_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'area'
);

SET @v21_art_area_ok := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'area'
    AND LOCATE('''INFORMATICA''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''OFICINAS''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''COCINA''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''ALMACEN''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''OTRA''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND IS_NULLABLE = 'NO'
    AND TRIM(BOTH '''' FROM COALESCE(CONVERT(COLUMN_DEFAULT USING utf8mb4), '')) COLLATE utf8mb4_bin = 'ALMACEN'
);

SET @v21_art_area_nullable := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'area'
    AND IS_NULLABLE = 'YES'
);

SET @v21_art_area_fill_sql := IF(
  @v21_art_area_exists > 0 AND @v21_art_area_ok = 0 AND @v21_art_area_nullable > 0,
  'UPDATE `inv_articulos` SET `area` = ''ALMACEN'' WHERE `area` IS NULL',
  'SELECT ''[migration_03] inv_articulos.area sin relleno NULL necesario.'' AS estado_migracion'
);

PREPARE stmt_v21_art_area_fill FROM @v21_art_area_fill_sql;
EXECUTE stmt_v21_art_area_fill;
DEALLOCATE PREPARE stmt_v21_art_area_fill;

SET @v21_art_area_sql := IF(
  @v21_art_area_exists = 0,
  'ALTER TABLE `inv_articulos` ADD COLUMN `area` ENUM(''INFORMATICA'',''OFICINAS'',''COCINA'',''ALMACEN'',''OTRA'') NOT NULL DEFAULT ''ALMACEN''',
  IF(
    @v21_art_area_ok = 0,
    'ALTER TABLE `inv_articulos` MODIFY COLUMN `area` ENUM(''INFORMATICA'',''OFICINAS'',''COCINA'',''ALMACEN'',''OTRA'') NOT NULL DEFAULT ''ALMACEN''',
    'SELECT ''[migration_03] inv_articulos.area ya cumple definición objetivo; sin cambios.'' AS estado_migracion'
  )
);

PREPARE stmt_v21_art_area FROM @v21_art_area_sql;
EXECUTE stmt_v21_art_area;
DEALLOCATE PREPARE stmt_v21_art_area;

SET @v21_art_vinc_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'estado_vinculacion_sede'
);

SET @v21_art_vinc_ok := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'estado_vinculacion_sede'
    AND LOCATE('''CONFIRMADO''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''PROPUESTO''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''SEDE_AMBIGUA''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''SIN_SEDE''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''SIN_VINCULAR''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND IS_NULLABLE = 'NO'
    AND TRIM(BOTH '''' FROM COALESCE(CONVERT(COLUMN_DEFAULT USING utf8mb4), '')) COLLATE utf8mb4_bin = 'CONFIRMADO'
);

SET @v21_art_vinc_nullable := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'estado_vinculacion_sede'
    AND IS_NULLABLE = 'YES'
);

SET @v21_art_vinc_fill_sql := IF(
  @v21_art_vinc_exists > 0 AND @v21_art_vinc_ok = 0 AND @v21_art_vinc_nullable > 0,
  'UPDATE `inv_articulos` SET `estado_vinculacion_sede` = ''CONFIRMADO'' WHERE `estado_vinculacion_sede` IS NULL',
  'SELECT ''[migration_03] inv_articulos.estado_vinculacion_sede sin relleno NULL necesario.'' AS estado_migracion'
);

PREPARE stmt_v21_art_vinc_fill FROM @v21_art_vinc_fill_sql;
EXECUTE stmt_v21_art_vinc_fill;
DEALLOCATE PREPARE stmt_v21_art_vinc_fill;

SET @v21_art_vinc_sql := IF(
  @v21_art_vinc_exists = 0,
  'ALTER TABLE `inv_articulos` ADD COLUMN `estado_vinculacion_sede` ENUM(''CONFIRMADO'',''PROPUESTO'',''SEDE_AMBIGUA'',''SIN_SEDE'',''SIN_VINCULAR'') NOT NULL DEFAULT ''CONFIRMADO''',
  IF(
    @v21_art_vinc_ok = 0,
    'ALTER TABLE `inv_articulos` MODIFY COLUMN `estado_vinculacion_sede` ENUM(''CONFIRMADO'',''PROPUESTO'',''SEDE_AMBIGUA'',''SIN_SEDE'',''SIN_VINCULAR'') NOT NULL DEFAULT ''CONFIRMADO''',
    'SELECT ''[migration_03] inv_articulos.estado_vinculacion_sede ya cumple definición objetivo; sin cambios.'' AS estado_migracion'
  )
);

PREPARE stmt_v21_art_vinc FROM @v21_art_vinc_sql;
EXECUTE stmt_v21_art_vinc;
DEALLOCATE PREPARE stmt_v21_art_vinc;

SET @v21_art_cant_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'cantidad_num'
);

SET @v21_art_cant_ok := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'cantidad_num'
    AND LOWER(DATA_TYPE) = 'decimal'
    AND NUMERIC_PRECISION >= 12
    AND NUMERIC_SCALE = 2
    AND IS_NULLABLE = 'YES'
    AND (COLUMN_DEFAULT IS NULL OR UPPER(TRIM(CONVERT(COLUMN_DEFAULT USING utf8mb4))) = 'NULL')
);

SET @v21_art_cant_sql := IF(
  @v21_art_cant_exists = 0,
  'ALTER TABLE `inv_articulos` ADD COLUMN `cantidad_num` DECIMAL(12,2) NULL DEFAULT NULL',
  IF(
    @v21_art_cant_ok = 0,
    'ALTER TABLE `inv_articulos` MODIFY COLUMN `cantidad_num` DECIMAL(12,2) NULL DEFAULT NULL',
    'SELECT ''[migration_03] inv_articulos.cantidad_num ya es DECIMAL(12,2) NULL DEFAULT NULL; sin cambios.'' AS estado_migracion'
  )
);

PREPARE stmt_v21_art_cant FROM @v21_art_cant_sql;
EXECUTE stmt_v21_art_cant;
DEALLOCATE PREPARE stmt_v21_art_cant;

-- ---------------------------------------------------------------------------------
-- 6. inv_levantamientos.estado: asegurar ENUM con 'Cancelado' y NOT NULL DEFAULT 'En preparación'
-- ---------------------------------------------------------------------------------
SET @v21_lev_estado_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_levantamientos'
    AND COLUMN_NAME = 'estado'
);

SET @v21_lev_estado_ok := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_levantamientos'
    AND COLUMN_NAME = 'estado'
    AND LOCATE('''En preparación''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''En proceso''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''Pendiente de revisión''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''Finalizado''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND LOCATE('''Cancelado''', CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_bin) > 0
    AND IS_NULLABLE = 'NO'
    AND TRIM(BOTH '''' FROM COALESCE(CONVERT(COLUMN_DEFAULT USING utf8mb4), '')) COLLATE utf8mb4_bin = 'En preparación'
);

SET @v21_lev_estado_nullable := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inv_levantamientos'
    AND COLUMN_NAME = 'estado'
    AND IS_NULLABLE = 'YES'
);

SET @v21_lev_estado_fill_sql := IF(
  @v21_lev_estado_exists > 0 AND @v21_lev_estado_ok = 0 AND @v21_lev_estado_nullable > 0,
  'UPDATE `inv_levantamientos` SET `estado` = ''En preparación'' WHERE `estado` IS NULL',
  'SELECT ''[migration_03] inv_levantamientos.estado sin relleno NULL necesario.'' AS estado_migracion'
);

PREPARE stmt_v21_lev_estado_fill FROM @v21_lev_estado_fill_sql;
EXECUTE stmt_v21_lev_estado_fill;
DEALLOCATE PREPARE stmt_v21_lev_estado_fill;

SET @v21_lev_estado_sql := IF(
  @v21_lev_estado_exists = 0,
  'ALTER TABLE `inv_levantamientos` ADD COLUMN `estado` ENUM(''En preparación'',''En proceso'',''Pendiente de revisión'',''Finalizado'',''Cancelado'') NOT NULL DEFAULT ''En preparación''',
  IF(
    @v21_lev_estado_ok = 0,
    'ALTER TABLE `inv_levantamientos` MODIFY COLUMN `estado` ENUM(''En preparación'',''En proceso'',''Pendiente de revisión'',''Finalizado'',''Cancelado'') NOT NULL DEFAULT ''En preparación''',
    'SELECT ''[migration_03] inv_levantamientos.estado ya cumple definición objetivo; sin cambios.'' AS estado_migracion'
  )
);

PREPARE stmt_v21_lev_estado FROM @v21_lev_estado_sql;
EXECUTE stmt_v21_lev_estado;
DEALLOCATE PREPARE stmt_v21_lev_estado;

-- =================================================================================
-- VERIFICACIÓN POST-MIGRACIÓN (SOLO LECTURA — DESCOMENTAR PARA VALIDAR)
-- =================================================================================
-- SELECT
--   TABLE_SCHEMA,
--   TABLE_NAME,
--   COLUMN_NAME,
--   COLUMN_TYPE,
--   IS_NULLABLE,
--   COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND (
--     (TABLE_NAME = 'inv_usuarios' AND COLUMN_NAME = 'token_version')
--     OR (TABLE_NAME = 'inv_almacenes' AND COLUMN_NAME IN ('estado_verificacion', 'origen_registro'))
--     OR (TABLE_NAME = 'inv_campamentos' AND COLUMN_NAME = 'clasificacion_sede')
--     OR (TABLE_NAME = 'inv_custodios' AND COLUMN_NAME IN ('departamento', 'telefono'))
--     OR (TABLE_NAME = 'inv_articulos' AND COLUMN_NAME IN ('area', 'estado_vinculacion_sede', 'cantidad_num'))
--     OR (TABLE_NAME = 'inv_levantamientos' AND COLUMN_NAME = 'estado')
--   )
-- ORDER BY TABLE_NAME, ORDINAL_POSITION;
--
-- -- Verificación de integridad de datos (sin pérdida ni valores inválidos):
-- SELECT COUNT(*) AS total_usuarios, SUM(CASE WHEN token_version >= 1 THEN 1 ELSE 0 END) AS con_token_version FROM inv_usuarios;
-- SELECT clasificacion_sede, COUNT(*) AS total FROM inv_campamentos GROUP BY clasificacion_sede;
-- SELECT estado_verificacion, COUNT(*) AS total FROM inv_almacenes GROUP BY estado_verificacion;
-- SELECT area, estado_vinculacion_sede, COUNT(*) AS total FROM inv_articulos GROUP BY area, estado_vinculacion_sede;
-- SELECT estado, COUNT(*) AS total FROM inv_levantamientos GROUP BY estado;

-- =================================================================================
-- PLAN DE REVERSIÓN SEGURO NO DESTRUCTIVO (ROLLBACK MANUAL — SOLO CON RESPALDO PREVIO)
-- =================================================================================
-- REGLAS DE SEGURIDAD ANTES DE REVERTIR:
--   1. Tomar snapshot/respaldo completo antes de ejecutar cualquier DROP/MODIFY inverso.
--   2. No ejecutar en producción sin haber revertido primero el código backend v2.1
--      (de lo contrario `almacenApi.js` fallará en `token_version`, `estado_verificacion`,
--      `departamento`, `telefono`, `PENDIENTE_VALIDACION`, `SIN_VINCULAR`, `OTRA`, `Cancelado`).
--   3. NUNCA contraer un ENUM ni reducir DECIMAL(12,2) -> DECIMAL(10,2) sin verificar
--      antes que `COUNT(*) = 0` para los nuevos valores/rangos (evita error `Data truncated`).
--   4. El rollback NO elimina filas de usuarios, almacenes, campamentos, custodios,
--      artículos ni levantamientos.
--
-- -- Paso R1: Verificación previa de valores introducidos en v2.1 (debe retornar 0 en todos antes de contraer ENUMs):
-- SELECT
--   (SELECT COUNT(*) FROM inv_campamentos WHERE clasificacion_sede = 'PENDIENTE_VALIDACION') AS camp_pend_val,
--   (SELECT COUNT(*) FROM inv_articulos WHERE area = 'OTRA') AS art_area_otra,
--   (SELECT COUNT(*) FROM inv_articulos WHERE estado_vinculacion_sede = 'SIN_VINCULAR') AS art_sin_vincular,
--   (SELECT COUNT(*) FROM inv_articulos WHERE cantidad_num >= 100000000.00 OR cantidad_num <= -100000000.00) AS art_cant_fuera_dec10_2,
--   (SELECT COUNT(*) FROM inv_levantamientos WHERE estado = 'Cancelado') AS lev_cancelados;
--
-- -- Paso R2: Reversión condicional e idempotente de columnas nuevas aditivas (solo si las columnas existen):
-- SET @rb_tok := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_usuarios' AND COLUMN_NAME = 'token_version');
-- SET @rb_tok_sql := IF(@rb_tok > 0, 'ALTER TABLE `inv_usuarios` DROP COLUMN `token_version`', 'SELECT ''[rollback] inv_usuarios.token_version no existe'' AS estado');
-- PREPARE st_rb_tok FROM @rb_tok_sql; EXECUTE st_rb_tok; DEALLOCATE PREPARE st_rb_tok;
--
-- SET @rb_alm_ev := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_almacenes' AND COLUMN_NAME = 'estado_verificacion');
-- SET @rb_alm_ev_sql := IF(@rb_alm_ev > 0, 'ALTER TABLE `inv_almacenes` DROP COLUMN `estado_verificacion`', 'SELECT ''[rollback] inv_almacenes.estado_verificacion no existe'' AS estado');
-- PREPARE st_rb_alm_ev FROM @rb_alm_ev_sql; EXECUTE st_rb_alm_ev; DEALLOCATE PREPARE st_rb_alm_ev;
--
-- SET @rb_alm_or := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_almacenes' AND COLUMN_NAME = 'origen_registro');
-- SET @rb_alm_or_sql := IF(@rb_alm_or > 0, 'ALTER TABLE `inv_almacenes` DROP COLUMN `origen_registro`', 'SELECT ''[rollback] inv_almacenes.origen_registro no existe'' AS estado');
-- PREPARE st_rb_alm_or FROM @rb_alm_or_sql; EXECUTE st_rb_alm_or; DEALLOCATE PREPARE st_rb_alm_or;
--
-- SET @rb_cust_dep := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_custodios' AND COLUMN_NAME = 'departamento');
-- SET @rb_cust_dep_sql := IF(@rb_cust_dep > 0, 'ALTER TABLE `inv_custodios` DROP COLUMN `departamento`', 'SELECT ''[rollback] inv_custodios.departamento no existe'' AS estado');
-- PREPARE st_rb_cust_dep FROM @rb_cust_dep_sql; EXECUTE st_rb_cust_dep; DEALLOCATE PREPARE st_rb_cust_dep;
--
-- SET @rb_cust_tel := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_custodios' AND COLUMN_NAME = 'telefono');
-- SET @rb_cust_tel_sql := IF(@rb_cust_tel > 0, 'ALTER TABLE `inv_custodios` DROP COLUMN `telefono`', 'SELECT ''[rollback] inv_custodios.telefono no existe'' AS estado');
-- PREPARE st_rb_cust_tel FROM @rb_cust_tel_sql; EXECUTE st_rb_cust_tel; DEALLOCATE PREPARE st_rb_cust_tel;
--
-- -- Paso R3: Reversión condicional de ENUMs/tipos SOLO cuando el conteo de nuevos valores en Paso R1 sea 0:
-- SET @rb_camp_cnt := (SELECT COUNT(*) FROM inv_campamentos WHERE clasificacion_sede = 'PENDIENTE_VALIDACION');
-- SET @rb_camp_sql := IF(@rb_camp_cnt = 0, 'ALTER TABLE `inv_campamentos` MODIFY COLUMN `clasificacion_sede` ENUM(''CONFIRMADO'',''PROPUESTO'',''SINTETICO_PRUEBA'',''HISTORICO_NO_HOMOLOGADO'',''DUPLICADO_EQUIVALENTE'') NOT NULL DEFAULT ''PROPUESTO''', 'SELECT ''[rollback BLOQUEADO] Existen campamentos en PENDIENTE_VALIDACION'' AS estado');
-- PREPARE st_rb_camp FROM @rb_camp_sql; EXECUTE st_rb_camp; DEALLOCATE PREPARE st_rb_camp;
--
-- SET @rb_art_otra := (SELECT COUNT(*) FROM inv_articulos WHERE area = 'OTRA');
-- SET @rb_art_area_sql := IF(@rb_art_otra = 0, 'ALTER TABLE `inv_articulos` MODIFY COLUMN `area` ENUM(''INFORMATICA'',''OFICINAS'',''COCINA'',''ALMACEN'') NOT NULL', 'SELECT ''[rollback BLOQUEADO] Existen artículos con area=OTRA'' AS estado');
-- PREPARE st_rb_art_area FROM @rb_art_area_sql; EXECUTE st_rb_art_area; DEALLOCATE PREPARE st_rb_art_area;
--
-- SET @rb_art_sv := (SELECT COUNT(*) FROM inv_articulos WHERE estado_vinculacion_sede = 'SIN_VINCULAR');
-- SET @rb_art_vinc_sql := IF(@rb_art_sv = 0, 'ALTER TABLE `inv_articulos` MODIFY COLUMN `estado_vinculacion_sede` ENUM(''CONFIRMADO'',''PROPUESTO'',''SEDE_AMBIGUA'',''SIN_SEDE'') NOT NULL DEFAULT ''CONFIRMADO''', 'SELECT ''[rollback BLOQUEADO] Existen artículos con estado_vinculacion_sede=SIN_VINCULAR'' AS estado');
-- PREPARE st_rb_art_vinc FROM @rb_art_vinc_sql; EXECUTE st_rb_art_vinc; DEALLOCATE PREPARE st_rb_art_vinc;
--
-- SET @rb_art_dec := (SELECT COUNT(*) FROM inv_articulos WHERE cantidad_num >= 100000000.00 OR cantidad_num <= -100000000.00);
-- SET @rb_art_dec_sql := IF(@rb_art_dec = 0, 'ALTER TABLE `inv_articulos` MODIFY COLUMN `cantidad_num` DECIMAL(10,2) DEFAULT NULL', 'SELECT ''[rollback BLOQUEADO] Existen cantidades fuera de DECIMAL(10,2)'' AS estado');
-- PREPARE st_rb_art_dec FROM @rb_art_dec_sql; EXECUTE st_rb_art_dec; DEALLOCATE PREPARE st_rb_art_dec;
--
-- SET @rb_lev_canc := (SELECT COUNT(*) FROM inv_levantamientos WHERE estado = 'Cancelado');
-- SET @rb_lev_sql := IF(@rb_lev_canc = 0, 'ALTER TABLE `inv_levantamientos` MODIFY COLUMN `estado` ENUM(''En preparación'',''En proceso'',''Pendiente de revisión'',''Finalizado'') DEFAULT ''En proceso''', 'SELECT ''[rollback BLOQUEADO] Existen levantamientos en estado Cancelado'' AS estado');
-- PREPARE st_rb_lev FROM @rb_lev_sql; EXECUTE st_rb_lev; DEALLOCATE PREPARE st_rb_lev;
