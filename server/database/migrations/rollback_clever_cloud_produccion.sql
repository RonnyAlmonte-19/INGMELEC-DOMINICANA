-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.1 — REVISIÓN DE SEGURIDAD M06)
-- PLAN DE ROLLBACK EMPRESARIAL Y REVERSIÓN SEGURA (SIN DESTRUCCIÓN NI IDs FIJOS)
-- DESTINO FUTURO (NO EJECUTADO AUTOMÁTICAMENTE): MySQL 8.0 / MariaDB
-- =================================================================================
-- ADVERTENCIAS CRÍTICAS (M06):
--   1. NO ejecutar sin respaldo lógico completo previo (`mysqldump --single-transaction`).
--   2. PROHIBIDO usar supuestos frágiles de IDs (`WHERE id IN (1,3,4)` o `id <= 434`)
--      o borrar `permisos_json` a `NULL` en cuentas operativas (degradaría RBAC).
--   3. Las reversión estructural (Nivel 2) consulta `information_schema` antes de
--      retirar claves foráneas, índices o columnas introducidas por `v2.1`, evitando
--      fallos a mitad de ejecución.
--   4. Nunca truncar ni eliminar filas de `inv_articulos`, `inv_movimientos`,
--      `inv_campamentos` creados en operación real ni `inv_usuarios`.
-- =================================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------------
-- NIVEL 1: REVERSIÓN SEGURA DE DATOS MEDIANTE TABLAS DE RESPALDO PREVIO (SI EXISTEN)
-- ---------------------------------------------------------------------------------
-- Recomendación oficial: Antes de aplicar `migration_04..06`, crear snapshots:
--   CREATE TABLE inv_articulos_backup_pre_m04 AS SELECT * FROM inv_articulos;
--   CREATE TABLE inv_usuarios_backup_pre_m05 AS SELECT id, rol, activo, es_developer, permisos_json FROM inv_usuarios;

-- Reversión DML condicionada sin suposiciones de IDs fijos ni destrucción de altas reales:
-- START TRANSACTION;
-- UPDATE inv_articulos a
-- JOIN inv_campamentos c ON a.campamento_id = c.id
-- SET a.campamento_id = NULL,
--     a.almacen_id = NULL,
--     a.estado_vinculacion_sede = 'SEDE_AMBIGUA'
-- WHERE a.origen_datos = 'HISTORICO_EXCEL'
--   AND c.codigo IN ('ALM-27FEB', 'CAMP-OPL', 'CAMP-M633')
--   AND UPPER(TRIM(a.ubicacion_nombre)) IN (
--     'KM 19 AUT DUARTE', 'KM19', 'KM 19', 'KM 19 AUTOPISTA DUARTE',
--     'MANTENIMIENTO', 'MANTENIMIENTO M633'
--   );
--
-- UPDATE inv_usuarios
-- SET permisos_json = '[]'
-- WHERE id >= 0
--   AND es_developer = 0
--   AND JSON_VALID(COALESCE(permisos_json, '')) = 1
--   AND JSON_CONTAINS(permisos_json, '"*"') = 1;
-- COMMIT;

-- ---------------------------------------------------------------------------------
-- NIVEL 2: REVERSIÓN ESTRUCTURAL GUARDADA POR information_schema (v2.1 -> Base Segura)
-- Descomentar únicamente tras validar respaldo completo e incompatibilidad confirmada.
-- ---------------------------------------------------------------------------------

-- 2.1 Retiro idempotente de índices añadidos en Etapa 6 (conservando integridad FK)
SET @rb_idx_art := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_articulos' AND INDEX_NAME = 'idx_art_filtro_compuesto'
);
SET @rb_sql := IF(@rb_idx_art > 0, 'DROP INDEX `idx_art_filtro_compuesto` ON `inv_articulos`', 'SELECT ''idx_art_filtro_compuesto ausente'' AS rollback_info');
PREPARE rb_stmt FROM @rb_sql; EXECUTE rb_stmt; DEALLOCATE PREPARE rb_stmt;

SET @rb_idx_mov := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND INDEX_NAME = 'idx_mov_sint_fecha'
);
SET @rb_sql := IF(@rb_idx_mov > 0, 'DROP INDEX `idx_mov_sint_fecha` ON `inv_movimientos`', 'SELECT ''idx_mov_sint_fecha ausente'' AS rollback_info');
PREPARE rb_stmt FROM @rb_sql; EXECUTE rb_stmt; DEALLOCATE PREPARE rb_stmt;

-- 2.2 Retiro seguro de tabla de alias Etapa 4 únicamente si no existen dependencias activas
SET @rb_alias_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_campamento_alias'
);
-- DROP TABLE IF EXISTS `inv_campamento_alias`; -- Solo ejecutar explícitamente tras aprobar retiro de Etapa 4

-- 2.3 Retiro guardado de token_version en inv_usuarios (Etapa 2/3)
SET @rb_col_tv := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_usuarios' AND COLUMN_NAME = 'token_version'
);
SET @rb_sql := IF(@rb_col_tv > 0, 'SELECT ''[ROLLBACK PLAN] inv_usuarios.token_version presente; ejecutar ALTER TABLE DROP COLUMN solo tras revertir backend auth'' AS rollback_info', 'SELECT ''token_version ausente'' AS rollback_info');
PREPARE rb_stmt FROM @rb_sql; EXECUTE rb_stmt; DEALLOCATE PREPARE rb_stmt;
