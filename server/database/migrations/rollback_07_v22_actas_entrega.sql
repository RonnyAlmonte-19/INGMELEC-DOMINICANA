-- =================================================================================
-- INGMELEC | v2.2 — REVERSIÓN LOCAL DE migration_07_v22_actas_entrega.sql
-- *** SOLO BASE LOCAL AISLADA. NUNCA EJECUTAR EN PRODUCCIÓN. ***
-- ELIMINA las tablas de actas y la columna inv_movimientos.acta_id (y los datos de
-- actas que contengan). No toca ningún otro dato histórico. Requiere respaldo previo.
-- Idempotente.
-- =================================================================================
SET NAMES utf8mb4;

SET @v22_rb_fk := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND CONSTRAINT_NAME = 'fk_inv_mov_acta'
);
SET @v22_rb_fk_sql := IF(@v22_rb_fk > 0,
  'ALTER TABLE `inv_movimientos` DROP FOREIGN KEY `fk_inv_mov_acta`',
  'SELECT ''[rollback_07] fk_inv_mov_acta no existe.'' AS estado');
PREPARE s1 FROM @v22_rb_fk_sql; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @v22_rb_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND INDEX_NAME = 'idx_inv_mov_acta'
);
SET @v22_rb_idx_sql := IF(@v22_rb_idx > 0,
  'ALTER TABLE `inv_movimientos` DROP INDEX `idx_inv_mov_acta`',
  'SELECT ''[rollback_07] idx_inv_mov_acta no existe.'' AS estado');
PREPARE s2 FROM @v22_rb_idx_sql; EXECUTE s2; DEALLOCATE PREPARE s2;

SET @v22_rb_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND COLUMN_NAME = 'acta_id'
);
SET @v22_rb_col_sql := IF(@v22_rb_col > 0,
  'ALTER TABLE `inv_movimientos` DROP COLUMN `acta_id`',
  'SELECT ''[rollback_07] acta_id no existe.'' AS estado');
PREPARE s3 FROM @v22_rb_col_sql; EXECUTE s3; DEALLOCATE PREPARE s3;

DROP TABLE IF EXISTS `inv_acta_items`;
DROP TABLE IF EXISTS `inv_actas_entrega`;
DROP TABLE IF EXISTS `inv_acta_secuencia`;
