-- INGMELEC v2.2 — Verificación de producción SOLO LECTURA (únicamente SELECT/SHOW). No modifica nada.
-- Se ejecuta con verificar_produccion.mjs o pegando cada bloque en un cliente SQL. Sin datos personales: solo esquema y recuentos.

-- [1] version
SELECT VERSION() AS version, @@version_comment AS comentario, @@version_compile_os AS so;

-- [2] zona_horaria
SELECT @@global.time_zone AS global_tz, @@session.time_zone AS sesion_tz, @@system_time_zone AS sistema_tz,
       NOW() AS ahora, UTC_TIMESTAMP() AS utc, TIMEDIFF(NOW(), UTC_TIMESTAMP()) AS desfase;

-- [3] sql_mode_y_variables
SELECT @@session.sql_mode AS sql_mode_sesion, @@global.sql_mode AS sql_mode_global, @@lower_case_table_names AS lctn,
       @@innodb_strict_mode AS innodb_strict, @@character_set_server AS charset_srv, @@collation_server AS collation_srv,
       @@max_connections AS max_conexiones;

-- [4] tablas
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME;

-- [5] columnas_inv
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLLATION_NAME
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'inv\_%' ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- [6] indices_inv
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'inv\_%' GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE ORDER BY TABLE_NAME, INDEX_NAME;

-- [7] claves_foraneas_inv
SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE k
JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL AND k.TABLE_NAME LIKE 'inv\_%' ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME;

-- [8] migration_07_existe
SELECT 'tabla' AS tipo, TABLE_NAME AS nombre FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('inv_actas_entrega', 'inv_acta_items', 'inv_acta_secuencia')
UNION ALL SELECT 'columna', CONCAT(TABLE_NAME, '.', COLUMN_NAME) FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movimientos' AND COLUMN_NAME = 'acta_id'
UNION ALL SELECT 'fk', CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
 WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME IN ('fk_inv_mov_acta');

-- [9] recuentos
SELECT 'inv_articulos' AS tabla, COUNT(*) AS filas FROM inv_articulos
UNION ALL SELECT 'inv_movimientos', COUNT(*) FROM inv_movimientos
UNION ALL SELECT 'inv_usuarios', COUNT(*) FROM inv_usuarios
UNION ALL SELECT 'inv_campamentos', COUNT(*) FROM inv_campamentos
UNION ALL SELECT 'inv_almacenes', COUNT(*) FROM inv_almacenes
UNION ALL SELECT 'inv_auditoria', COUNT(*) FROM inv_auditoria;
