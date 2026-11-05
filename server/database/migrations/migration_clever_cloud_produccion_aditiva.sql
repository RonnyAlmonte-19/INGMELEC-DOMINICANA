-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.0.0)
-- MIGRACIÓN ADITIVA CONSOLIDADA PARA PRODUCCIÓN (MySQL 8.0 / Clever Cloud)
-- VERSIÓN AUDITADA Y PROBADA CONTRA RESPALDO REAL CLEVER CLOUD DEL 04-NOV-2026
-- =================================================================================
-- NOTA ARQUITECTÓNICA:
-- Para mayor control operativo en producción, esta migración también se ha separado
-- en dos archivos independientes dentro de esta misma carpeta:
--   1) migration_01_estructural_ddl_clever_cloud.sql  (100% DDL estructural, cero DML)
--   2) migration_02_datos_homologacion_clever_cloud.sql (DML controlado sobre sedes y metadatos)
-- =================================================================================

-- =================================================================================
-- PARTE I: MIGRACIÓN PURAMENTE ESTRUCTURAL (DDL — CERO MODIFICACIÓN DE DATOS)
-- =================================================================================

-- 1.1 Nuevas tablas de soporte (no existen aún en el respaldo de Clever Cloud)
CREATE TABLE IF NOT EXISTS inv_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    area VARCHAR(50) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_area_categoria (area, nombre),
    INDEX idx_cat_area (area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inv_custodios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    cargo VARCHAR(100) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cust_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inv_usuario_campamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    campamento_id INT NOT NULL,
    es_principal TINYINT(1) NOT NULL DEFAULT 0,
    asignado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_usuario_campamento (usuario_id, campamento_id),
    INDEX idx_uc_usuario (usuario_id),
    INDEX idx_uc_campamento (campamento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inv_usuario_almacenes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    almacen_id INT NOT NULL,
    asignado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_usuario_almacen (usuario_id, almacen_id),
    INDEX idx_ua_usuario (usuario_id),
    INDEX idx_ua_almacen (almacen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.2 Columnas aditivas en tablas existentes de Clever Cloud
-- A. inv_usuarios (cargo ya existe en Clever Cloud; es_developer = 0 por defecto)
ALTER TABLE inv_usuarios MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'almacen';
ALTER TABLE inv_usuarios MODIFY COLUMN cargo VARCHAR(100) NULL;
ALTER TABLE inv_usuarios ADD COLUMN es_developer TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_usuarios ADD COLUMN campamento_id INT NULL;
ALTER TABLE inv_usuarios ADD COLUMN almacen_id INT NULL;
ALTER TABLE inv_usuarios ADD COLUMN permisos_json JSON NULL;

-- B. inv_campamentos e inv_almacenes
ALTER TABLE inv_campamentos ADD COLUMN clasificacion_sede ENUM('CONFIRMADO', 'PROPUESTO', 'SINTETICO_PRUEBA', 'HISTORICO_NO_HOMOLOGADO', 'DUPLICADO_EQUIVALENTE') NOT NULL DEFAULT 'PROPUESTO';
ALTER TABLE inv_campamentos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_campamentos ADD COLUMN origen_registro VARCHAR(100) NOT NULL DEFAULT 'SISTEMA_INICIAL';
ALTER TABLE inv_campamentos ADD COLUMN ubicacion_historica_equivalente VARCHAR(150) NULL;

ALTER TABLE inv_almacenes ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

-- C. inv_articulos (preserva intactos los 434 artículos productivos)
ALTER TABLE inv_articulos ADD COLUMN campamento_id INT NULL;
ALTER TABLE inv_articulos ADD COLUMN almacen_id INT NULL;
ALTER TABLE inv_articulos MODIFY COLUMN cantidad_verificada TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE inv_articulos ADD COLUMN estado_cantidad ENUM('VERIFICADO', 'PENDIENTE_VERIFICACION', 'TEXTO_NO_NUMERICO') NOT NULL DEFAULT 'VERIFICADO';
ALTER TABLE inv_articulos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_articulos ADD COLUMN origen_datos ENUM('HISTORICO_EXCEL', 'OPERATIVO_REAL', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'OPERATIVO_REAL';
ALTER TABLE inv_articulos ADD COLUMN estado_vinculacion_sede ENUM('CONFIRMADO', 'PROPUESTO', 'SEDE_AMBIGUA', 'SIN_SEDE') NOT NULL DEFAULT 'CONFIRMADO';

CREATE INDEX idx_art_campamento_id ON inv_articulos (campamento_id);
CREATE INDEX idx_art_es_sintetico ON inv_articulos (es_sintetico);
CREATE INDEX idx_art_cantidad_verificada ON inv_articulos (cantidad_verificada);

-- D. inv_levantamientos, inv_levantamiento_items e inv_movimientos
ALTER TABLE inv_levantamientos ADD COLUMN codigo VARCHAR(50) NULL;
ALTER TABLE inv_levantamientos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_levantamiento_items ADD COLUMN estado_verificacion VARCHAR(40) NOT NULL DEFAULT 'VERIFICADO';
ALTER TABLE inv_levantamiento_items ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE inv_movimientos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;


-- =================================================================================
-- PARTE II: OPERACIONES CONTROLADAS SOBRE DATOS (DML CON MANEJO EXPLÍCITO DE EXCEPCIONES)
-- =================================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_ejecutar_migracion_02_homologacion$$

CREATE PROCEDURE sp_ejecutar_migracion_02_homologacion()
proc_main: BEGIN
    DECLARE v_total_articulos INT DEFAULT 0;
    DECLARE v_total_cantidad DECIMAL(14,2) DEFAULT 0.00;
    DECLARE v_cant_27feb INT DEFAULT 0;
    DECLARE v_cant_opl INT DEFAULT 0;
    DECLARE v_cant_m633 INT DEFAULT 0;
    DECLARE v_cant_sin_sede INT DEFAULT 0;
    DECLARE v_sqlstate VARCHAR(5) DEFAULT '00000';
    DECLARE v_msg TEXT DEFAULT '';

    -- Manejador de excepciones: Cualquier error aborta y ejecuta ROLLBACK total
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1
            v_sqlstate = RETURNED_SQLSTATE,
            v_msg = MESSAGE_TEXT;
        ROLLBACK;
        SELECT 'ERROR_ROLLBACK' AS estado_transaccion,
               v_sqlstate AS codigo_sqlstate,
               v_msg AS mensaje_error,
               'Se detectó un fallo durante la migración DML. Se ha ejecutado ROLLBACK total. Cero datos alterados.' AS resolucion;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- 2.1 Homologar las 3 sedes confirmadas por Gerencia
UPDATE inv_campamentos
SET nombre = 'ALMACÉN 27 DE FEBRERO',
    codigo = 'ALM-27FEB',
    provincia = COALESCE(provincia, 'Distrito Nacional'),
    direccion = COALESCE(direccion, 'Av. 27 de Febrero, Santo Domingo'),
    clasificacion_sede = 'CONFIRMADO',
    es_sintetico = 0,
    origen_registro = 'EXCEL_HISTORICO',
    ubicacion_historica_equivalente = 'DISTRITO NACIONAL 27 DE FEBRERO',
    activo = 1
WHERE codigo IN ('ALM-27FEB', 'DN-27FEB')
   OR UPPER(TRIM(nombre)) IN ('ALMACÉN 27 DE FEBRERO', 'ALMACEN 27 DE FEBRERO', 'DISTRITO NACIONAL 27 DE FEBRERO');

INSERT INTO inv_campamentos (
    nombre, codigo, provincia, direccion, responsable,
    clasificacion_sede, es_sintetico, origen_registro, ubicacion_historica_equivalente, activo
)
SELECT
    'ALMACÉN 27 DE FEBRERO', 'ALM-27FEB', 'Distrito Nacional',
    'Av. 27 de Febrero, Santo Domingo', 'Encargado de Almacén 27 de Febrero',
    'CONFIRMADO', 0, 'EXCEL_HISTORICO', 'DISTRITO NACIONAL 27 DE FEBRERO', 1
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM inv_campamentos
    WHERE codigo IN ('ALM-27FEB', 'DN-27FEB')
       OR UPPER(TRIM(nombre)) IN ('ALMACÉN 27 DE FEBRERO', 'ALMACEN 27 DE FEBRERO', 'DISTRITO NACIONAL 27 DE FEBRERO')
);

UPDATE inv_campamentos
SET nombre = 'OPL',
    codigo = 'CAMP-OPL',
    provincia = COALESCE(provincia, 'Santo Domingo Oeste'),
    direccion = COALESCE(direccion, 'Km 19 Autopista Duarte (Sede Independiente OPL)'),
    clasificacion_sede = 'CONFIRMADO',
    es_sintetico = 0,
    origen_registro = 'GERENCIA_CONFIRMADO',
    ubicacion_historica_equivalente = 'KM 19 AUTOPISTA DUARTE OPL',
    activo = 1
WHERE codigo IN ('CAMP-OPL', 'KM19-OPL')
   OR UPPER(TRIM(nombre)) IN ('OPL', 'KM 19 AUTOPISTA DUARTE OPL');

INSERT INTO inv_campamentos (
    nombre, codigo, provincia, direccion, responsable,
    clasificacion_sede, es_sintetico, origen_registro, ubicacion_historica_equivalente, activo
)
SELECT
    'OPL', 'CAMP-OPL', 'Santo Domingo Oeste',
    'Km 19 Autopista Duarte (Sede Independiente OPL)', 'Encargado de Operaciones OPL',
    'CONFIRMADO', 0, 'GERENCIA_CONFIRMADO', 'KM 19 AUTOPISTA DUARTE OPL', 1
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM inv_campamentos
    WHERE codigo IN ('CAMP-OPL', 'KM19-OPL')
       OR UPPER(TRIM(nombre)) IN ('OPL', 'KM 19 AUTOPISTA DUARTE OPL')
);

UPDATE inv_campamentos
SET nombre = 'MANTENIMIENTO 633',
    codigo = 'CAMP-M633',
    provincia = COALESCE(provincia, 'Santo Domingo'),
    direccion = COALESCE(direccion, 'Km 19 Autopista Duarte (Sede Independiente Mantenimiento 633)'),
    clasificacion_sede = 'CONFIRMADO',
    es_sintetico = 0,
    origen_registro = 'GERENCIA_CONFIRMADO',
    ubicacion_historica_equivalente = 'MANTENIMIENTO 633',
    activo = 1
WHERE codigo IN ('CAMP-M633', 'MANT-633')
   OR UPPER(TRIM(nombre)) = 'MANTENIMIENTO 633';

INSERT INTO inv_campamentos (
    nombre, codigo, provincia, direccion, responsable,
    clasificacion_sede, es_sintetico, origen_registro, ubicacion_historica_equivalente, activo
)
SELECT
    'MANTENIMIENTO 633', 'CAMP-M633', 'Santo Domingo',
    'Km 19 Autopista Duarte (Sede Independiente Mantenimiento 633)', 'Encargado de Mantenimiento 633',
    'CONFIRMADO', 0, 'GERENCIA_CONFIRMADO', 'MANTENIMIENTO 633', 1
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM inv_campamentos
    WHERE codigo IN ('CAMP-M633', 'MANT-633')
       OR UPPER(TRIM(nombre)) = 'MANTENIMIENTO 633'
);

-- Almacenes principales por defecto (sin duplicar)
INSERT INTO inv_almacenes (campamento_id, nombre, tipo, encargado, descripcion, activo, es_sintetico)
SELECT c.id, 'Almacén Principal 27 de Febrero', 'General', c.responsable, 'Bodega principal de Almacén 27 de Febrero', 1, 0
FROM inv_campamentos c
WHERE c.codigo = 'ALM-27FEB'
  AND NOT EXISTS (SELECT 1 FROM inv_almacenes a WHERE a.campamento_id = c.id AND a.activo = 1);

INSERT INTO inv_almacenes (campamento_id, nombre, tipo, encargado, descripcion, activo, es_sintetico)
SELECT c.id, 'Almacén Principal OPL', 'General', c.responsable, 'Bodega principal de sede OPL', 1, 0
FROM inv_campamentos c
WHERE c.codigo = 'CAMP-OPL'
  AND NOT EXISTS (SELECT 1 FROM inv_almacenes a WHERE a.campamento_id = c.id AND a.activo = 1);

INSERT INTO inv_almacenes (campamento_id, nombre, tipo, encargado, descripcion, activo, es_sintetico)
SELECT c.id, 'Almacén Principal Mantenimiento 633', 'Taller', c.responsable, 'Bodega principal de sede Mantenimiento 633', 1, 0
FROM inv_campamentos c
WHERE c.codigo = 'CAMP-M633'
  AND NOT EXISTS (SELECT 1 FROM inv_almacenes a WHERE a.campamento_id = c.id AND a.activo = 1);

UPDATE inv_campamentos
SET clasificacion_sede = 'PROPUESTO',
    es_sintetico = 0
WHERE codigo NOT IN ('ALM-27FEB', 'CAMP-OPL', 'CAMP-M633');

-- 2.2 Trazabilidad de origen y verificación de cantidades
UPDATE inv_articulos
SET origen_datos = 'HISTORICO_EXCEL',
    es_sintetico = 0
WHERE hoja_origen IN ('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN')
  AND (observaciones IS NULL OR observaciones NOT LIKE '%[REGISTRO SINTÉTICO%');

UPDATE inv_articulos
SET origen_datos = 'OPERATIVO_REAL',
    es_sintetico = 0
WHERE (hoja_origen IS NULL OR hoja_origen NOT IN ('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN'))
  AND (observaciones IS NULL OR observaciones NOT LIKE '%[REGISTRO SINTÉTICO%');

UPDATE inv_articulos
SET cantidad_verificada = CASE WHEN cantidad_num IS NULL THEN 0 ELSE 1 END,
    estado_cantidad = CASE
        WHEN cantidad_num IS NULL AND cantidad_texto IS NOT NULL AND TRIM(cantidad_texto) != '' THEN 'TEXTO_NO_NUMERICO'
        WHEN cantidad_num IS NULL THEN 'PENDIENTE_VERIFICACION'
        ELSE 'VERIFICADO'
    END;

-- 2.3 Vincular campamento_id y estado_vinculacion_sede
UPDATE inv_articulos a
JOIN inv_campamentos c ON c.codigo = 'ALM-27FEB'
SET a.campamento_id = c.id,
    a.estado_vinculacion_sede = 'CONFIRMADO'
WHERE UPPER(TRIM(a.ubicacion_nombre)) IN ('DISTRITO NACIONAL 27 DE FEBRERO', 'ALMACEN 27 DE FEBRERO', 'ALMACÉN 27 DE FEBRERO');

UPDATE inv_articulos a
JOIN inv_campamentos c ON c.codigo = 'CAMP-OPL'
SET a.campamento_id = c.id,
    a.estado_vinculacion_sede = 'CONFIRMADO'
WHERE UPPER(TRIM(a.ubicacion_nombre)) IN ('KM 19 AUTOPISTA DUARTE OPL', 'OPL');

UPDATE inv_articulos a
JOIN inv_campamentos c ON c.codigo = 'CAMP-M633'
SET a.campamento_id = c.id,
    a.estado_vinculacion_sede = 'CONFIRMADO'
WHERE UPPER(TRIM(a.ubicacion_nombre)) = 'MANTENIMIENTO 633';

UPDATE inv_articulos
SET campamento_id = NULL,
    estado_vinculacion_sede = 'SEDE_AMBIGUA'
WHERE UPPER(TRIM(ubicacion_nombre)) IN ('KM 19 AUT DUARTE', 'ALMACEN KM 19 AUDITADO');

-- 2.4 Poblar catálogos dinámicos
INSERT IGNORE INTO inv_categorias (area, nombre, activo, es_sintetico)
SELECT DISTINCT UPPER(TRIM(area)), TRIM(categoria), 1, 0
FROM inv_articulos
WHERE activo = 1 AND es_sintetico = 0
  AND area IS NOT NULL AND TRIM(area) != ''
  AND categoria IS NOT NULL AND TRIM(categoria) != '';

INSERT IGNORE INTO inv_custodios (nombre, cargo, activo, es_sintetico)
SELECT DISTINCT TRIM(asignado_a), 'Personal Operativo / Custodio', 1, 0
FROM inv_articulos
WHERE activo = 1 AND es_sintetico = 0
  AND asignado_a IS NOT NULL AND TRIM(asignado_a) != ''
  AND UPPER(TRIM(asignado_a)) NOT IN ('N/A', 'SIN ASIGNAR', 'NONE', '-');

-- 2.5 Permisos base para roles operativos (es_developer = 0)
UPDATE inv_usuarios
SET es_developer = 0,
    permisos_json = JSON_ARRAY(
      'inv:ver', 'inv:crear', 'inv:editar', 'inv:movimientos_registrar', 'inv:movimientos_ver',
      'lev:ver', 'lev:crear', 'lev:capturar', 'lev:editar', 'lev:importar', 'lev:consolidar',
      'rep:ver', 'rep:exportar', 'rep:imprimir',
      'camp:ver', 'camp:stock', 'camp:operar'
    )
WHERE rol = 'admin' AND es_developer = 0 AND permisos_json IS NULL;

UPDATE inv_usuarios
SET es_developer = 0,
    permisos_json = JSON_ARRAY(
      'inv:ver', 'inv:crear', 'inv:movimientos_registrar', 'inv:movimientos_ver',
      'lev:ver', 'lev:crear', 'lev:capturar',
      'camp:ver', 'camp:stock'
    )
WHERE rol = 'almacen' AND es_developer = 0 AND permisos_json IS NULL;

UPDATE inv_usuarios
SET es_developer = 0,
    permisos_json = JSON_ARRAY(
      'inv:ver', 'inv:crear', 'inv:editar', 'inv:movimientos_ver',
      'lev:ver', 'lev:crear', 'lev:capturar', 'lev:editar', 'lev:importar', 'lev:consolidar',
      'rep:ver', 'rep:exportar',
      'camp:ver', 'camp:stock'
    )
WHERE rol = 'supervisor' AND es_developer = 0 AND permisos_json IS NULL;

UPDATE inv_usuarios
SET es_developer = 0,
    permisos_json = JSON_ARRAY(
      'inv:ver', 'inv:movimientos_ver',
      'lev:ver',
      'rep:ver', 'rep:exportar', 'rep:imprimir',
      'camp:ver', 'camp:stock'
    )
WHERE rol IN ('auditor', 'gerencia') AND es_developer = 0 AND permisos_json IS NULL;

    -- -----------------------------------------------------------------------------
    -- BLOQUE DE VERIFICACIÓN ESTRICTA DE INTEGRIDAD PRE-COMMIT (ASSERTIONS)
    -- -----------------------------------------------------------------------------
    SELECT COUNT(*), COALESCE(SUM(cantidad_num), 0)
    INTO v_total_articulos, v_total_cantidad
    FROM inv_articulos;

    IF v_total_articulos < 434 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'FALLO INTEGRIDAD: El total de artículos es inferior a 434. Se revierte la migración con ROLLBACK.';
    END IF;

    IF v_total_cantidad < 1964.00 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'FALLO INTEGRIDAD: La suma total de cantidades es inferior a 1964 unidades. Se revierte la migración con ROLLBACK.';
    END IF;

    SELECT COUNT(*) INTO v_cant_27feb FROM inv_campamentos WHERE codigo = 'ALM-27FEB' AND activo = 1;
    SELECT COUNT(*) INTO v_cant_opl FROM inv_campamentos WHERE codigo = 'CAMP-OPL' AND activo = 1;
    SELECT COUNT(*) INTO v_cant_m633 FROM inv_campamentos WHERE codigo = 'CAMP-M633' AND activo = 1;

    IF v_cant_27feb = 0 OR v_cant_opl = 0 OR v_cant_m633 = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'FALLO INTEGRIDAD: No se homologaron satisfactoriamente las 3 sedes independientes requeridas.';
    END IF;

    SELECT COUNT(*) INTO v_cant_27feb FROM inv_articulos a JOIN inv_campamentos c ON a.campamento_id = c.id WHERE c.codigo = 'ALM-27FEB';
    SELECT COUNT(*) INTO v_cant_opl FROM inv_articulos a JOIN inv_campamentos c ON a.campamento_id = c.id WHERE c.codigo = 'CAMP-OPL';
    SELECT COUNT(*) INTO v_cant_m633 FROM inv_articulos a JOIN inv_campamentos c ON a.campamento_id = c.id WHERE c.codigo = 'CAMP-M633';
    SELECT COUNT(*) INTO v_cant_sin_sede FROM inv_articulos WHERE campamento_id IS NULL;

    -- CONFIRMACIÓN ATÓMICA
    COMMIT;

    -- RESULTADO AUDITABLE
    SELECT 'MIGRACION_DML_EXITOSA' AS resultado,
           'Todos los datos fueron homologados e inspeccionados con éxito. Cero pérdidas.' AS detalle,
           v_total_articulos AS total_articulos,
           v_total_cantidad AS total_unidades,
           v_cant_27feb AS articulos_27_febrero,
           v_cant_opl AS articulos_opl,
           v_cant_m633 AS articulos_mantenimiento_633,
           v_cant_sin_sede AS articulos_sin_sede_ambiguos;

END proc_main$$

DELIMITER ;

-- Ejecución controlada
CALL sp_ejecutar_migracion_02_homologacion();

-- Limpieza del procedimiento transaccional
DROP PROCEDURE IF EXISTS sp_ejecutar_migracion_02_homologacion;
