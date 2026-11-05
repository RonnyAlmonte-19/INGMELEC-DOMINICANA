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
-- NIVEL 1: REVERSIÓN DML CONDICIONADA Y ESTRICTAMENTE NO DESTRUCTIVA
-- ---------------------------------------------------------------------------------
-- GARANTÍAS DE SEGURIDAD ESTRICTA:
--   1. NO ELIMINA campamentos, artículos, almacenes ni movimientos existentes.
--   2. FILTRA ESTRICTAMENTE los registros afectados:
--      - Solo desvincula los 434 artículos iniciales (id <= 434) cuya ubicación histórica
--        corresponde a las 3 sedes homologadas.
--      - PRESERVA INTACTOS todos los artículos creados posteriormente (id > 434)
--        y cualquier vinculación legítima creada tras la migración.
--      - PRESERVA INTACTOS todos los campamentos nuevos creados posteriormente (id > 5).
--      - Restaura exclusivamente los nombres/códigos preexistentes de las 3 sedes (id 1, 3, 4).
--   3. PROTEGE el 100% de los movimientos operativos en inv_movimientos.
-- ---------------------------------------------------------------------------------
START TRANSACTION;

-- 1.1 Desvincular ÚNICAMENTE los artículos históricos (id <= 434) vinculados por la migración
UPDATE inv_articulos a
JOIN inv_campamentos c ON a.campamento_id = c.id
SET a.campamento_id = NULL,
    a.almacen_id = NULL,
    a.estado_vinculacion_sede = 'SEDE_AMBIGUA'
WHERE a.id <= 434
  AND c.codigo IN ('ALM-27FEB', 'CAMP-OPL', 'CAMP-M633', 'KM19-OPL', 'MANT-633', 'DN-27FEB')
  AND UPPER(TRIM(a.ubicacion_nombre)) IN (
      'DISTRITO NACIONAL 27 DE FEBRERO', 'ALMACEN 27 DE FEBRERO', 'ALMACÉN 27 DE FEBRERO',
      'KM 19 AUTOPISTA DUARTE OPL', 'OPL',
      'MANTENIMIENTO 633'
  );

-- 1.2 Restaurar nombres, códigos y clasificación original de las 3 sedes preexistentes (id 1, 3, 4)
-- SIN TOCAR campamentos creados con posterioridad (id > 5 ni otros id)
UPDATE inv_campamentos
SET codigo = CASE
        WHEN id = 1 THEN 'DN-27FEB'
        WHEN id = 3 THEN 'KM19-OPL'
        WHEN id = 4 THEN 'MANT-633'
        ELSE codigo
    END,
    nombre = CASE
        WHEN id = 1 THEN 'DISTRITO NACIONAL 27 DE FEBRERO'
        WHEN id = 3 THEN 'KM 19 AUTOPISTA DUARTE OPL'
        WHEN id = 4 THEN 'MANTENIMIENTO 633'
        ELSE nombre
    END,
    clasificacion_sede = 'PROPUESTO',
    origen_registro = 'SISTEMA_INICIAL'
WHERE id IN (1, 3, 4);

-- 1.3 Limpiar permisos_json y es_developer en cuentas operativas preexistentes
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
