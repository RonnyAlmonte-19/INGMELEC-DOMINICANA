-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.1 — ETAPA 6 SEGURA / NO DESTRUCTIVA)
-- ARCHIVO: server/database/migrations/migration_06_v21_safe.sql
-- OBJETIVO: Claves foráneas, índices de kárdex e integridad referencial segura
--           SIN eliminar relaciones, SIN poner en NULL referencias y conservando
--           los 15 artículos históricos de OPL y MANTENIMIENTO 633 intactos.
-- =================================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------------
-- 1. Endurecimiento de inv_movimientos.articulo_id: cambiar ON DELETE CASCADE a RESTRICT
-- ---------------------------------------------------------------------------------
SET @v21_mov_fk_cascade_name := (
  SELECT kcu.CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE kcu
  JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
    ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
   AND rc.TABLE_NAME = kcu.TABLE_NAME
   AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
  WHERE kcu.TABLE_SCHEMA = DATABASE()
    AND kcu.TABLE_NAME = 'inv_movimientos'
    AND kcu.COLUMN_NAME = 'articulo_id'
    AND kcu.REFERENCED_TABLE_NAME = 'inv_articulos'
    AND rc.DELETE_RULE <> 'RESTRICT'
  LIMIT 1
);

SET @v21_drop_mov_fk_sql := IF(
  @v21_mov_fk_cascade_name IS NOT NULL,
  CONCAT('ALTER TABLE `inv_movimientos` DROP FOREIGN KEY `', @v21_mov_fk_cascade_name, '`'),
  'SELECT ''[migration_06_safe] inv_movimientos.articulo_id no tiene FK no-RESTRICT.'' AS estado_fk'
);
PREPARE stmt_v21_drop_mov_fk FROM @v21_drop_mov_fk_sql;
EXECUTE stmt_v21_drop_mov_fk;
DEALLOCATE PREPARE stmt_v21_drop_mov_fk;

-- ---------------------------------------------------------------------------------
-- 2. Incorporación idempotente de Claves Foráneas 100% compatibles (0 huérfanos)
-- ---------------------------------------------------------------------------------

-- 2.1 inv_movimientos(articulo_id) -> inv_articulos(id) ON DELETE RESTRICT
SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos'
    AND COLUMN_NAME = 'articulo_id' AND REFERENCED_TABLE_NAME = 'inv_articulos'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_movimientos` ADD CONSTRAINT `fk_mov_articulo` FOREIGN KEY (`articulo_id`) REFERENCES `inv_articulos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''fk_mov_articulo ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

-- 2.2 inv_movimientos(usuario_id) -> inv_usuarios(id) ON DELETE SET NULL
SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos'
    AND COLUMN_NAME = 'usuario_id' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_movimientos` ADD CONSTRAINT `fk_mov_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_mov_usuario ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

-- 2.3 inv_articulos: lote_id y creado_por
SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'lote_id' AND REFERENCED_TABLE_NAME = 'inv_lotes_importacion'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_articulos` ADD CONSTRAINT `fk_art_lote` FOREIGN KEY (`lote_id`) REFERENCES `inv_lotes_importacion` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_art_lote ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_articulos'
    AND COLUMN_NAME = 'creado_por' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_articulos` ADD CONSTRAINT `fk_art_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_art_creado_por ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

-- 2.4 Índices seguros para campamento_id y almacen_id en inv_articulos
-- (Preserva intactos los 15 artículos de OPL y MANTENIMIENTO 633 sin violaciones FK ni NULL)
SET @v21_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_articulos' AND INDEX_NAME = 'idx_art_campamento'
);
SET @v21_idx_sql := IF(
  @v21_idx_exists = 0,
  'CREATE INDEX `idx_art_campamento` ON `inv_articulos` (`campamento_id`)',
  'SELECT ''idx_art_campamento ok'' AS estado_idx'
);
PREPARE stmt_idx FROM @v21_idx_sql; EXECUTE stmt_idx; DEALLOCATE PREPARE stmt_idx;

SET @v21_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_articulos' AND INDEX_NAME = 'idx_art_almacen'
);
SET @v21_idx_sql := IF(
  @v21_idx_exists = 0,
  'CREATE INDEX `idx_art_almacen` ON `inv_articulos` (`almacen_id`)',
  'SELECT ''idx_art_almacen ok'' AS estado_idx'
);
PREPARE stmt_idx FROM @v21_idx_sql; EXECUTE stmt_idx; DEALLOCATE PREPARE stmt_idx;

-- 2.5 inv_lotes_importacion(usuario_id) -> inv_usuarios(id)
SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_lotes_importacion'
    AND COLUMN_NAME = 'usuario_id' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_lotes_importacion` ADD CONSTRAINT `fk_lote_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_lote_usuario ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

-- 2.6 inv_auditoria(usuario_id) -> inv_usuarios(id)
SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_auditoria'
    AND COLUMN_NAME = 'usuario_id' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_auditoria` ADD CONSTRAINT `fk_aud_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_aud_usuario ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

-- 2.7 inv_levantamientos(campamento_id, almacen_id, consolidado_por, creado_por)
SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_levantamientos'
    AND COLUMN_NAME = 'campamento_id' AND REFERENCED_TABLE_NAME = 'inv_campamentos'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_levantamientos` ADD CONSTRAINT `fk_lev_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''fk_lev_campamento ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_levantamientos'
    AND COLUMN_NAME = 'almacen_id' AND REFERENCED_TABLE_NAME = 'inv_almacenes'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_levantamientos` ADD CONSTRAINT `fk_lev_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `inv_almacenes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_lev_almacen ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_levantamientos'
    AND COLUMN_NAME = 'consolidado_por' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_levantamientos` ADD CONSTRAINT `fk_lev_consolidado_por` FOREIGN KEY (`consolidado_por`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_lev_consolidado_por ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_levantamientos'
    AND COLUMN_NAME = 'creado_por' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_levantamientos` ADD CONSTRAINT `fk_lev_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `inv_usuarios` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''fk_lev_creado_por ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

-- 2.8 inv_levantamiento_items(levantamiento_id, articulo_maestro_id, creado_por)
SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_levantamiento_items'
    AND COLUMN_NAME = 'levantamiento_id' AND REFERENCED_TABLE_NAME = 'inv_levantamientos'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_levantamiento_items` ADD CONSTRAINT `fk_item_levantamiento` FOREIGN KEY (`levantamiento_id`) REFERENCES `inv_levantamientos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_item_levantamiento ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_levantamiento_items'
    AND COLUMN_NAME = 'articulo_maestro_id' AND REFERENCED_TABLE_NAME = 'inv_articulos'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_levantamiento_items` ADD CONSTRAINT `fk_item_maestro` FOREIGN KEY (`articulo_maestro_id`) REFERENCES `inv_articulos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_item_maestro ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_levantamiento_items'
    AND COLUMN_NAME = 'creado_por' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_levantamiento_items` ADD CONSTRAINT `fk_item_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_item_creado_por ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

-- 2.9 inv_usuarios(campamento_id, almacen_id) y tablas puente
SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_usuarios'
    AND COLUMN_NAME = 'campamento_id' AND REFERENCED_TABLE_NAME = 'inv_campamentos'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_usuarios` ADD CONSTRAINT `fk_usr_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_usr_campamento ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_usuarios'
    AND COLUMN_NAME = 'almacen_id' AND REFERENCED_TABLE_NAME = 'inv_almacenes'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_usuarios` ADD CONSTRAINT `fk_usr_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `inv_almacenes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_usr_almacen ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_usuario_campamentos'
    AND COLUMN_NAME = 'usuario_id' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_usuario_campamentos` ADD CONSTRAINT `fk_uc_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_uc_usuario ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_usuario_campamentos'
    AND COLUMN_NAME = 'campamento_id' AND REFERENCED_TABLE_NAME = 'inv_campamentos'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_usuario_campamentos` ADD CONSTRAINT `fk_uc_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_uc_campamento ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_usuario_almacenes'
    AND COLUMN_NAME = 'usuario_id' AND REFERENCED_TABLE_NAME = 'inv_usuarios'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_usuario_almacenes` ADD CONSTRAINT `fk_ua_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_ua_usuario ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

SET @v21_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_usuario_almacenes'
    AND COLUMN_NAME = 'almacen_id' AND REFERENCED_TABLE_NAME = 'inv_almacenes'
);
SET @v21_fk_sql := IF(
  @v21_fk_exists = 0,
  'ALTER TABLE `inv_usuario_almacenes` ADD CONSTRAINT `fk_ua_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `inv_almacenes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT ''fk_ua_almacen ok'' AS estado_fk'
);
PREPARE stmt_fk FROM @v21_fk_sql; EXECUTE stmt_fk; DEALLOCATE PREPARE stmt_fk;

-- ---------------------------------------------------------------------------------
-- 3. Índices compuestos de alto rendimiento (kárdex y consultas de inventario)
-- ---------------------------------------------------------------------------------
SET @v21_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_articulos' AND INDEX_NAME = 'idx_art_filtro_compuesto'
);
SET @v21_idx_sql := IF(
  @v21_idx_exists = 0,
  'CREATE INDEX `idx_art_filtro_compuesto` ON `inv_articulos` (`activo`, `es_sintetico`, `campamento_id`, `area`)',
  'SELECT ''idx_art_filtro_compuesto ok'' AS estado_idx'
);
PREPARE stmt_idx FROM @v21_idx_sql; EXECUTE stmt_idx; DEALLOCATE PREPARE stmt_idx;

SET @v21_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND INDEX_NAME = 'idx_mov_sint_fecha'
);
SET @v21_idx_sql := IF(
  @v21_idx_exists = 0,
  'CREATE INDEX `idx_mov_sint_fecha` ON `inv_movimientos` (`es_sintetico`, `fecha_movimiento`)',
  'SELECT ''idx_mov_sint_fecha ok'' AS estado_idx'
);
PREPARE stmt_idx FROM @v21_idx_sql; EXECUTE stmt_idx; DEALLOCATE PREPARE stmt_idx;
