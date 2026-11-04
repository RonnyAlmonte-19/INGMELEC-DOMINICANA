-- ==============================================================================
-- INGMELEC | ALMACÉN GENERAL — SCRIPT DE REVERSIÓN (ROLLBACK NO DESTRUCTIVO)
-- Revierte los vínculos y columnas de migración sin afectar los 434 artículos
-- ==============================================================================

-- 1. Desvincular referencias de campamentos y almacenes en inv_articulos (conservando los 434 registros intactos)
UPDATE inv_articulos
SET campamento_id = NULL,
    almacen_id = NULL,
    es_sintetico = 0,
    estado_vinculacion_sede = 'PENDIENTE_ASIGNACION';

-- 2. Reactivar campamentos previos si fueron marcados como DUPLICADO_EQUIVALENTE
UPDATE inv_campamentos
SET activo = 1,
    clasificacion_sede = 'PENDIENTE_VALIDACION'
WHERE codigo = 'CAMP-KM19';

-- 3. (Opcional) Eliminar únicamente las columnas aditivas nuevas si se desea volver al esquema previo:
-- ALTER TABLE inv_articulos DROP COLUMN estado_vinculacion_sede, DROP COLUMN origen_datos, DROP COLUMN es_sintetico;
-- ALTER TABLE inv_campamentos DROP COLUMN ubicacion_historica_equivalente, DROP COLUMN origen_registro, DROP COLUMN es_sintetico, DROP COLUMN clasificacion_sede;
