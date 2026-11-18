-- CONSULTA 1 de 3 — Estado de las migraciones 03-07 (SOLO LECTURA). presente=1: el objeto existe; 0: no existe.
SELECT e.mig, e.tipo, e.tabla, e.objeto, (x.objeto IS NOT NULL) AS presente, x.detalle
FROM (
  SELECT '03' AS mig, 'COL' AS tipo, 'inv_almacenes' AS tabla, 'estado_verificacion' AS objeto
  UNION ALL SELECT '03', 'COL', 'inv_almacenes', 'origen_registro'
  UNION ALL SELECT '03', 'COL', 'inv_campamentos', 'clasificacion_sede'
  UNION ALL SELECT '03', 'COL', 'inv_custodios', 'departamento'
  UNION ALL SELECT '03', 'COL', 'inv_custodios', 'telefono'
  UNION ALL SELECT '03', 'COL', 'inv_articulos', 'area'
  UNION ALL SELECT '03', 'COL', 'inv_articulos', 'cantidad_num'
  UNION ALL SELECT '03', 'COL', 'inv_articulos', 'estado_vinculacion_sede'
  UNION ALL SELECT '03', 'COL', 'inv_levantamientos', 'estado'
  UNION ALL SELECT '03', 'COL', 'inv_usuarios', 'token_version'
  UNION ALL SELECT '04', 'TBL', 'inv_campamento_alias', 'inv_campamento_alias'
  UNION ALL SELECT '04', 'IDX', 'inv_campamento_alias', 'idx_alias_camp'
  UNION ALL SELECT '04', 'IDX', 'inv_campamento_alias', 'idx_alias_codigo'
  UNION ALL SELECT '04', 'IDX', 'inv_campamento_alias', 'uk_alias_normalizado'
  UNION ALL SELECT '04', 'FK', 'inv_campamento_alias', 'fk_alias_campamento'
  UNION ALL SELECT '06', 'IDX', 'inv_articulos', 'idx_art_campamento'
  UNION ALL SELECT '06', 'IDX', 'inv_articulos', 'idx_art_almacen'
  UNION ALL SELECT '06', 'IDX', 'inv_articulos', 'idx_art_filtro_compuesto'
  UNION ALL SELECT '06', 'IDX', 'inv_movimientos', 'idx_mov_sint_fecha'
  UNION ALL SELECT '06', 'FK', 'inv_movimientos', 'fk_mov_articulo'
  UNION ALL SELECT '06', 'FK', 'inv_movimientos', 'fk_mov_usuario'
  UNION ALL SELECT '06', 'FK', 'inv_articulos', 'fk_art_lote'
  UNION ALL SELECT '06', 'FK', 'inv_articulos', 'fk_art_creado_por'
  UNION ALL SELECT '06', 'FK', 'inv_lotes_importacion', 'fk_lote_usuario'
  UNION ALL SELECT '06', 'FK', 'inv_auditoria', 'fk_aud_usuario'
  UNION ALL SELECT '06', 'FK', 'inv_levantamientos', 'fk_lev_campamento'
  UNION ALL SELECT '06', 'FK', 'inv_levantamientos', 'fk_lev_almacen'
  UNION ALL SELECT '06', 'FK', 'inv_levantamientos', 'fk_lev_consolidado_por'
  UNION ALL SELECT '06', 'FK', 'inv_levantamientos', 'fk_lev_creado_por'
  UNION ALL SELECT '06', 'FK', 'inv_levantamiento_items', 'fk_item_levantamiento'
  UNION ALL SELECT '06', 'FK', 'inv_levantamiento_items', 'fk_item_maestro'
  UNION ALL SELECT '06', 'FK', 'inv_levantamiento_items', 'fk_item_creado_por'
  UNION ALL SELECT '06', 'FK', 'inv_usuarios', 'fk_usr_campamento'
  UNION ALL SELECT '06', 'FK', 'inv_usuarios', 'fk_usr_almacen'
  UNION ALL SELECT '06', 'FK', 'inv_usuario_campamentos', 'fk_uc_usuario'
  UNION ALL SELECT '06', 'FK', 'inv_usuario_campamentos', 'fk_uc_campamento'
  UNION ALL SELECT '06', 'FK', 'inv_usuario_almacenes', 'fk_ua_usuario'
  UNION ALL SELECT '06', 'FK', 'inv_usuario_almacenes', 'fk_ua_almacen'
  UNION ALL SELECT '07', 'TBL', 'inv_actas_entrega', 'inv_actas_entrega'
  UNION ALL SELECT '07', 'TBL', 'inv_acta_items', 'inv_acta_items'
  UNION ALL SELECT '07', 'TBL', 'inv_acta_secuencia', 'inv_acta_secuencia'
  UNION ALL SELECT '07', 'COL', 'inv_movimientos', 'acta_id'
  UNION ALL SELECT '07', 'IDX', 'inv_movimientos', 'idx_inv_mov_acta'
  UNION ALL SELECT '07', 'FK', 'inv_movimientos', 'fk_inv_mov_acta'
  UNION ALL SELECT '07-compat', 'COL', 'inv_campamentos', 'id'
  UNION ALL SELECT '07-compat', 'COL', 'inv_custodios', 'id'
  UNION ALL SELECT '07-compat', 'COL', 'inv_usuarios', 'id'
  UNION ALL SELECT '07-compat', 'COL', 'inv_articulos', 'id'
  UNION ALL SELECT '07-compat', 'COL', 'inv_movimientos', 'id'
) e
LEFT JOIN (
  SELECT 'COL' AS tipo, CONVERT(TABLE_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tabla, CONVERT(COLUMN_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci AS objeto, CONVERT(COLUMN_TYPE USING utf8mb4) COLLATE utf8mb4_unicode_ci AS detalle
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
  UNION ALL SELECT 'IDX', CONVERT(TABLE_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci, CONVERT(INDEX_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci, NULL
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() GROUP BY TABLE_NAME, INDEX_NAME
  UNION ALL SELECT 'FK', CONVERT(TABLE_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci, CONVERT(CONSTRAINT_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci, NULL
    FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  UNION ALL SELECT 'TBL', CONVERT(TABLE_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci, CONVERT(TABLE_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci, NULL
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
) x ON x.tipo = e.tipo AND x.tabla = e.tabla AND x.objeto = e.objeto
ORDER BY e.mig, e.tipo, e.tabla, e.objeto;

-- CONSULTA 2 de 3 — Tablas inv_* (identifica las 15 y sus collations/motor) (SOLO LECTURA)
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_ROWS
FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LEFT(TABLE_NAME, 4) = 'inv_' ORDER BY TABLE_NAME;

-- CONSULTA 3 de 3 — Filas huérfanas que impedirían crear las 19 claves foráneas de la migración 06 (SOLO LECTURA). Esperado: 0 en todas.
SELECT 'fk_mov_articulo' AS fk, COUNT(*) AS huerfanos FROM `inv_movimientos` h LEFT JOIN `inv_articulos` p ON p.id = h.`articulo_id` WHERE h.`articulo_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_mov_usuario' AS fk, COUNT(*) AS huerfanos FROM `inv_movimientos` h LEFT JOIN `inv_usuarios` p ON p.id = h.`usuario_id` WHERE h.`usuario_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_art_lote' AS fk, COUNT(*) AS huerfanos FROM `inv_articulos` h LEFT JOIN `inv_lotes_importacion` p ON p.id = h.`lote_id` WHERE h.`lote_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_art_creado_por' AS fk, COUNT(*) AS huerfanos FROM `inv_articulos` h LEFT JOIN `inv_usuarios` p ON p.id = h.`creado_por` WHERE h.`creado_por` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_lote_usuario' AS fk, COUNT(*) AS huerfanos FROM `inv_lotes_importacion` h LEFT JOIN `inv_usuarios` p ON p.id = h.`usuario_id` WHERE h.`usuario_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_aud_usuario' AS fk, COUNT(*) AS huerfanos FROM `inv_auditoria` h LEFT JOIN `inv_usuarios` p ON p.id = h.`usuario_id` WHERE h.`usuario_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_lev_campamento' AS fk, COUNT(*) AS huerfanos FROM `inv_levantamientos` h LEFT JOIN `inv_campamentos` p ON p.id = h.`campamento_id` WHERE h.`campamento_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_lev_almacen' AS fk, COUNT(*) AS huerfanos FROM `inv_levantamientos` h LEFT JOIN `inv_almacenes` p ON p.id = h.`almacen_id` WHERE h.`almacen_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_lev_consolidado_por' AS fk, COUNT(*) AS huerfanos FROM `inv_levantamientos` h LEFT JOIN `inv_usuarios` p ON p.id = h.`consolidado_por` WHERE h.`consolidado_por` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_lev_creado_por' AS fk, COUNT(*) AS huerfanos FROM `inv_levantamientos` h LEFT JOIN `inv_usuarios` p ON p.id = h.`creado_por` WHERE h.`creado_por` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_item_levantamiento' AS fk, COUNT(*) AS huerfanos FROM `inv_levantamiento_items` h LEFT JOIN `inv_levantamientos` p ON p.id = h.`levantamiento_id` WHERE h.`levantamiento_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_item_maestro' AS fk, COUNT(*) AS huerfanos FROM `inv_levantamiento_items` h LEFT JOIN `inv_articulos` p ON p.id = h.`articulo_maestro_id` WHERE h.`articulo_maestro_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_item_creado_por' AS fk, COUNT(*) AS huerfanos FROM `inv_levantamiento_items` h LEFT JOIN `inv_usuarios` p ON p.id = h.`creado_por` WHERE h.`creado_por` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_usr_campamento' AS fk, COUNT(*) AS huerfanos FROM `inv_usuarios` h LEFT JOIN `inv_campamentos` p ON p.id = h.`campamento_id` WHERE h.`campamento_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_usr_almacen' AS fk, COUNT(*) AS huerfanos FROM `inv_usuarios` h LEFT JOIN `inv_almacenes` p ON p.id = h.`almacen_id` WHERE h.`almacen_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_uc_usuario' AS fk, COUNT(*) AS huerfanos FROM `inv_usuario_campamentos` h LEFT JOIN `inv_usuarios` p ON p.id = h.`usuario_id` WHERE h.`usuario_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_uc_campamento' AS fk, COUNT(*) AS huerfanos FROM `inv_usuario_campamentos` h LEFT JOIN `inv_campamentos` p ON p.id = h.`campamento_id` WHERE h.`campamento_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_ua_usuario' AS fk, COUNT(*) AS huerfanos FROM `inv_usuario_almacenes` h LEFT JOIN `inv_usuarios` p ON p.id = h.`usuario_id` WHERE h.`usuario_id` IS NOT NULL AND p.id IS NULL
 UNION ALL SELECT 'fk_ua_almacen' AS fk, COUNT(*) AS huerfanos FROM `inv_usuario_almacenes` h LEFT JOIN `inv_almacenes` p ON p.id = h.`almacen_id` WHERE h.`almacen_id` IS NOT NULL AND p.id IS NULL;
