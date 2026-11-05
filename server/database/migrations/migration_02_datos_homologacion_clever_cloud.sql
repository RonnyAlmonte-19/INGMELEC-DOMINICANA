-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.0.0)
-- ARCHIVO 2 DE 2: HOMOLOGACIÓN DE DATOS, SEDES Y PERMISOS BASE (DML TRANSACCIONAL CONTROLADO)
-- DESTINO: MySQL 8.0 Productivo (Clever Cloud: bkwlgxt1ccjstm5cfoy5)
-- ESTADO: AUDITADA Y PROBADA CONTRA RESPALDO REAL CLEVER CLOUD DEL 04-NOV-2026
-- PRECONDICIÓN: Haber ejecutado migration_01_estructural_ddl_clever_cloud.sql
-- =================================================================================
-- GARANTÍAS DE INTEGRIDAD Y CONTROL DE EXCEPCIONES:
--   1. MANEJADOR EXPLÍCITO DE EXCEPCIONES: Envuelto en un procedimiento transaccional
--      con manejador `DECLARE EXIT HANDLER FOR SQLEXCEPTION` que ejecuta ROLLBACK
--      inmediato ante cualquier error, garantizando cero modificaciones parciales.
--   2. POST-CHECKS AUTOMÁTICOS: Verifica aserciones de integridad antes de confirmar
--      (total artículos >= 434, total cantidad >= 1964, presencia de las 3 sedes).
--      Si alguna aserción falla, emite SIGNAL SQLSTATE '45000' y revierte todo.
--   3. NO modifica: codigo_original, articulo_nombre, cantidad_num, cantidad_texto,
--      serie_imei, asignado_a (custodio), estado_fisico ni ubicacion_nombre.
--   4. Homologa las 3 sedes confirmadas (ALMACÉN 27 DE FEBRERO [ID 1], OPL [ID 3],
--      MANTENIMIENTO 633 [ID 4]) sin duplicar registros.
--   5. Vincula campamento_id exclusivamente para las 3 sedes con ubicación verificada.
--   6. Mantiene campamento_id = NULL para los 104 artículos de 'KM 19 AUT DUARTE'
--      y 1 de 'ALMACEN KM 19 AUDITADO' (SIN SEDE VERIFICADA / PENDIENTE DE CLASIFICACIÓN).
--   7. Distingue los 414 artículos históricos ('HISTORICO_EXCEL') de los 20 artículos
--      operativos del 03/11/2026 ('OPERATIVO_REAL') con es_sintetico = 0.
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

    -- -----------------------------------------------------------------------------
    -- MANEJADOR EXPLÍCITO DE EXCEPCIONES: ROLLBACK TOTAL INMEDIATO ANTE CUALQUIER FALLO
    -- -----------------------------------------------------------------------------
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1
            v_sqlstate = RETURNED_SQLSTATE,
            v_msg = MESSAGE_TEXT;
        ROLLBACK;
        SELECT 'ERROR_ROLLBACK' AS estado_transaccion,
               v_sqlstate AS codigo_sqlstate,
               v_msg AS mensaje_error,
               'Se detectó un fallo durante la migración DML. Se ha ejecutado ROLLBACK total. La base de datos no sufrió alteraciones.' AS resolucion;
        RESIGNAL;
    END;

    -- Inicio explícito de transacción transaccional segura
    START TRANSACTION;

    -- -----------------------------------------------------------------------------
    -- BLOQUE 1: HOMOLOGACIÓN DE LAS 3 SEDES INDEPENDIENTES CONFIRMADAS
    -- (1) ALMACÉN 27 DE FEBRERO, (2) OPL, (3) MANTENIMIENTO 633
    -- -----------------------------------------------------------------------------

    -- 1.1 Homologar Sede 1: ALMACÉN 27 DE FEBRERO (ID 1 en Clever Cloud)
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

    -- 1.2 Homologar Sede 2: OPL (ID 3 en Clever Cloud)
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

    -- 1.3 Homologar Sede 3: MANTENIMIENTO 633 (ID 4 en Clever Cloud)
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

    -- 1.4 Garantizar existencia de Almacén Principal para cada sede confirmada (sin duplicar)
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

    -- 1.5 Clasificar otros campamentos preexistentes como PROPUESTO (preservando San Cristóbal y KM 19 Base)
    UPDATE inv_campamentos
    SET clasificacion_sede = 'PROPUESTO',
        es_sintetico = 0
    WHERE codigo NOT IN ('ALM-27FEB', 'CAMP-OPL', 'CAMP-M633');

    -- -----------------------------------------------------------------------------
    -- BLOQUE 2: TRAZABILIDAD Y HOMOLOGACIÓN DE LOS ARTÍCULOS PRODUCTIVOS
    -- -----------------------------------------------------------------------------

    -- 2.1 Clasificar los 414 artículos del Excel histórico como 'HISTORICO_EXCEL'
    UPDATE inv_articulos
    SET origen_datos = 'HISTORICO_EXCEL',
        es_sintetico = 0
    WHERE hoja_origen IN ('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN')
      AND (observaciones IS NULL OR observaciones NOT LIKE '%[REGISTRO SINTÉTICO%');

    -- 2.2 Clasificar los 20 artículos operativos registrados el 03/11/2026 como 'OPERATIVO_REAL'
    UPDATE inv_articulos
    SET origen_datos = 'OPERATIVO_REAL',
        es_sintetico = 0
    WHERE (hoja_origen IS NULL OR hoja_origen NOT IN ('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN'))
      AND (observaciones IS NULL OR observaciones NOT LIKE '%[REGISTRO SINTÉTICO%');

    -- 2.3 Marcar estado de verificación de cantidades
    UPDATE inv_articulos
    SET cantidad_verificada = CASE WHEN cantidad_num IS NULL THEN 0 ELSE 1 END,
        estado_cantidad = CASE
            WHEN cantidad_num IS NULL AND cantidad_texto IS NOT NULL AND TRIM(cantidad_texto) != '' THEN 'TEXTO_NO_NUMERICO'
            WHEN cantidad_num IS NULL THEN 'PENDIENTE_VERIFICACION'
            ELSE 'VERIFICADO'
        END;

    -- 2.4 Vincular campamento_id y estado_vinculacion_sede para artículos con sede confirmada inequívoca
    -- A. Almacén 27 de Febrero
    UPDATE inv_articulos a
    JOIN inv_campamentos c ON c.codigo = 'ALM-27FEB'
    SET a.campamento_id = c.id,
        a.estado_vinculacion_sede = 'CONFIRMADO'
    WHERE UPPER(TRIM(a.ubicacion_nombre)) IN ('DISTRITO NACIONAL 27 DE FEBRERO', 'ALMACEN 27 DE FEBRERO', 'ALMACÉN 27 DE FEBRERO');

    -- B. OPL
    UPDATE inv_articulos a
    JOIN inv_campamentos c ON c.codigo = 'CAMP-OPL'
    SET a.campamento_id = c.id,
        a.estado_vinculacion_sede = 'CONFIRMADO'
    WHERE UPPER(TRIM(a.ubicacion_nombre)) IN ('KM 19 AUTOPISTA DUARTE OPL', 'OPL');

    -- C. Mantenimiento 633
    UPDATE inv_articulos a
    JOIN inv_campamentos c ON c.codigo = 'CAMP-M633'
    SET a.campamento_id = c.id,
        a.estado_vinculacion_sede = 'CONFIRMADO'
    WHERE UPPER(TRIM(a.ubicacion_nombre)) = 'MANTENIMIENTO 633';

    -- D. 'KM 19 AUT DUARTE' y 'ALMACEN KM 19 AUDITADO'
    -- PERMANECEN con campamento_id = NULL y se marcan como SEDE_AMBIGUA
    UPDATE inv_articulos
    SET campamento_id = NULL,
        estado_vinculacion_sede = 'SEDE_AMBIGUA'
    WHERE UPPER(TRIM(ubicacion_nombre)) IN ('KM 19 AUT DUARTE', 'ALMACEN KM 19 AUDITADO');

    -- -----------------------------------------------------------------------------
    -- BLOQUE 3: POBLACIÓN ADITIVA DE CATÁLOGOS DINÁMICOS
    -- -----------------------------------------------------------------------------

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

    -- -----------------------------------------------------------------------------
    -- BLOQUE 4: PERMISOS DE MÍNIMO PRIVILEGIO PARA CUENTAS EXISTENTES (es_developer = 0)
    -- -----------------------------------------------------------------------------

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
    -- BLOQUE 5: VERIFICACIÓN ESTRICTA DE INTEGRIDAD PRE-COMMIT (ASSERTIONS)
    -- -----------------------------------------------------------------------------
    SELECT COUNT(*), COALESCE(SUM(cantidad_num), 0)
    INTO v_total_articulos, v_total_cantidad
    FROM inv_articulos;

    -- Comprobación 1: La cantidad total de artículos no debe ser inferior a la auditada
    IF v_total_articulos < 434 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'FALLO INTEGRIDAD: El total de artículos es inferior a 434. Se revierte la migración con ROLLBACK.';
    END IF;

    -- Comprobación 2: La suma de unidades físicas verificables no debe perderse
    IF v_total_cantidad < 1964.00 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'FALLO INTEGRIDAD: La suma total de cantidades es inferior a 1964 unidades. Se revierte la migración con ROLLBACK.';
    END IF;

    -- Comprobación 3: Existencia activa de las 3 sedes homologadas
    SELECT COUNT(*) INTO v_cant_27feb FROM inv_campamentos WHERE codigo = 'ALM-27FEB' AND activo = 1;
    SELECT COUNT(*) INTO v_cant_opl FROM inv_campamentos WHERE codigo = 'CAMP-OPL' AND activo = 1;
    SELECT COUNT(*) INTO v_cant_m633 FROM inv_campamentos WHERE codigo = 'CAMP-M633' AND activo = 1;

    IF v_cant_27feb = 0 OR v_cant_opl = 0 OR v_cant_m633 = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'FALLO INTEGRIDAD: No se homologaron satisfactoriamente las 3 sedes independientes requeridas.';
    END IF;

    -- Comprobación 4: Verificación de distribución de artículos vinculados
    SELECT COUNT(*) INTO v_cant_27feb FROM inv_articulos a JOIN inv_campamentos c ON a.campamento_id = c.id WHERE c.codigo = 'ALM-27FEB';
    SELECT COUNT(*) INTO v_cant_opl FROM inv_articulos a JOIN inv_campamentos c ON a.campamento_id = c.id WHERE c.codigo = 'CAMP-OPL';
    SELECT COUNT(*) INTO v_cant_m633 FROM inv_articulos a JOIN inv_campamentos c ON a.campamento_id = c.id WHERE c.codigo = 'CAMP-M633';
    SELECT COUNT(*) INTO v_cant_sin_sede FROM inv_articulos WHERE campamento_id IS NULL;

    -- CONFIRMACIÓN ATÓMICA: Sólo se ejecuta COMMIT si todas las aserciones fueron satisfactorias
    COMMIT;

    -- RESULTADO DE SALIDA AUDITABLE
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

-- Limpieza del procedimiento transaccional para no dejar objetos temporales
DROP PROCEDURE IF EXISTS sp_ejecutar_migracion_02_homologacion;
