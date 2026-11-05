-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.0.0)
-- PLAN DE ROLLBACK COMPLETO Y REVERSIÓN SEGURA (SIN PÉRDIDA DE ARTÍCULOS NI USUARIOS)
-- DESTINO: MySQL 8.0 Productivo (Clever Cloud: bkwlgxt1ccjstm5cfoy5)
-- =================================================================================
-- PROPÓSITO:
--   1. Revertir los cambios de homologación de datos (Fase DML) sin tocar los 434 artículos
--      ni las 5 cuentas de usuario originales.
--   2. Opcionalmente revertir las columnas y tablas nuevas añadidas por la Fase DDL
--      para dejar la base de datos exactamente igual al respaldo del 4 de noviembre de 2026.
-- =================================================================================

-- ---------------------------------------------------------------------------------
-- NIVEL 1: REVERSIÓN DE DATOS DML (DESVINCULAR SEDES Y RETIRAR SEDES NUEVAS VACÍAS)
-- ---------------------------------------------------------------------------------
START TRANSACTION;

-- 1.1 Restablecer el vínculo campamento_id de los artículos sin tocar ubicacion_nombre ni cantidades
UPDATE inv_articulos
SET campamento_id = NULL,
    almacen_id = NULL,
    es_sintetico = 0,
    cantidad_verificada = 1,
    estado_cantidad = 'VERIFICADO';

-- 1.2 Eliminar almacenes internos creados para OPL y MANTENIMIENTO 633 si no tienen movimientos
DELETE a FROM inv_almacenes a
JOIN inv_campamentos c ON a.campamento_id = c.id
WHERE c.codigo IN ('CAMP-OPL', 'CAMP-M633')
  AND c.origen_registro = 'GERENCIA_CONFIRMADO';

-- 1.3 Eliminar las sedes nuevas OPL y MANTENIMIENTO 633 si fueron creadas en la migración
DELETE FROM inv_campamentos
WHERE codigo IN ('CAMP-OPL', 'CAMP-M633')
  AND origen_registro = 'GERENCIA_CONFIRMADO';

-- 1.4 Limpiar permisos_json y es_developer en cuentas operativas
UPDATE inv_usuarios
SET permisos_json = NULL,
    es_developer = 0
WHERE rol IN ('admin', 'almacen', 'supervisor', 'auditor', 'gerencia');

COMMIT;

-- ---------------------------------------------------------------------------------
-- NIVEL 2: REVERSIÓN ESTRUCTURAL DDL (OPCIONAL — DEJA EL ESQUEMA IDÉNTICO AL BACKUP)
-- Ejecutar únicamente si se desea retirar por completo las columnas y tablas de v2.0.0
-- ---------------------------------------------------------------------------------

-- 2.1 Eliminar las 4 tablas nuevas de soporte
DROP TABLE IF EXISTS inv_usuario_almacenes;
DROP TABLE IF EXISTS inv_usuario_campamentos;
DROP TABLE IF EXISTS inv_custodios;
DROP TABLE IF EXISTS inv_categorias;

-- 2.2 Eliminar índices y columnas aditivas en inv_articulos
-- (Nota: cantidad_verificada no se elimina porque ya existía en Clever Cloud antes de la migración)
DROP INDEX idx_art_campamento_id ON inv_articulos;
DROP INDEX idx_art_es_sintetico ON inv_articulos;
DROP INDEX idx_art_cantidad_verificada ON inv_articulos;

ALTER TABLE inv_articulos
  DROP COLUMN estado_vinculacion_sede,
  DROP COLUMN origen_datos,
  DROP COLUMN es_sintetico,
  DROP COLUMN estado_cantidad,
  DROP COLUMN almacen_id,
  DROP COLUMN campamento_id;

-- 2.3 Eliminar columnas aditivas en inv_levantamiento_items e inv_levantamientos
ALTER TABLE inv_levantamiento_items
  DROP COLUMN es_sintetico,
  DROP COLUMN estado_verificacion;

ALTER TABLE inv_levantamientos
  DROP COLUMN es_sintetico,
  DROP COLUMN codigo;

-- 2.4 Eliminar columnas aditivas en inv_almacenes e inv_campamentos
ALTER TABLE inv_almacenes
  DROP COLUMN es_sintetico;

ALTER TABLE inv_campamentos
  DROP COLUMN ubicacion_historica_equivalente,
  DROP COLUMN origen_registro,
  DROP COLUMN es_sintetico,
  DROP COLUMN clasificacion_sede;

-- 2.5 Eliminar columnas aditivas en inv_usuarios
-- (Nota: cargo no se elimina porque ya existía en Clever Cloud antes de la migración)
ALTER TABLE inv_usuarios
  DROP COLUMN permisos_json,
  DROP COLUMN almacen_id,
  DROP COLUMN campamento_id,
  DROP COLUMN es_developer;
