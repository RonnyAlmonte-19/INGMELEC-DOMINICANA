-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.1) — FIXTURE SINTÉTICO AISLADO DE PRUEBAS
-- ARCHIVO: server/tests/fixtures/v21_synthetic_fixture.sql
-- BASE DE DATOS OBJETIVO: ingmelec_v21_test_isolated (EXCLUSIVA DE PRUEBAS LOCALES)
-- =================================================================================
-- ADVERTENCIA DE SEGURIDAD Y AISLAMIENTO:
--   1. PROHIBIDO ejecutar este script contra Clever Cloud o bases productivas.
--   2. PROHIBIDO ejecutar contra local-mysql existente (p. ej. gridops_enterprise).
--   3. Únicamente crea, limpia y siembra la base `ingmelec_v21_test_isolated`.
--   4. Todos los nombres, códigos, seriales, ubicaciones detalladas, correos,
--      custodios y hashes son 100% FICTICIOS / SINTÉTICOS (cero datos reales).
-- =================================================================================
-- FIDELIDAD Y BRECHAS DOCUMENTADAS (ESQUEMA ALINEADO CON migration_01 + migration_03 + migration_04):
--   Este fixture parte de `migration_01_estructural_ddl_clever_cloud.sql` y aplica
--   las homologaciones estructurales de Etapa 3 (`migration_03_v21_seguridad_y_esquema.sql`)
--   y Etapa 4 (`migration_04_v21_campamentos_alias.sql`) para validar consultas reales
--   de `almacenApi.js` en entorno aislado:
--
--   [BRECHA-01 -> ALINEADA EN E3] inv_campamentos.clasificacion_sede:
--     - Incluye 'PENDIENTE_VALIDACION' junto a los 5 valores de `migration_01`.
--     - SAN CRISTÓBAL (id=5) se siembra con 'PENDIENTE_VALIDACION' para validar
--       `campamentosPendientesValidacion` en pruebas reales.
--
--   [BRECHA-02 -> ALINEADA EN E3] inv_almacenes.estado_verificacion y origen_registro:
--     - Incluidos en DDL y seed para validar `totalAlmacenes` y `porAlmacen`.
--
--   [BRECHA-03 -> ALINEADA EN E3] inv_custodios.departamento y inv_custodios.telefono:
--     - Incluidos en DDL y seed sintético (enmascarados para usuarios con scope por sede).
--
--   [BRECHA-04 -> ALINEADA EN DDL E3 / PENDIENTE EN BACKEND E4-E6]:
--     - DDL alineado: `area` incluye 'OTRA' (DEFAULT 'ALMACEN'), `estado_vinculacion_sede`
--       incluye 'SIN_VINCULAR' y `cantidad_num` es `DECIMAL(12,2) NULL DEFAULT NULL`.
--     - Pendiente backend Etapa 4/6: resolveCampamentoVinculacion() (IDs 3/12/13 vs 1/3/4),
--       safeSortFields (`creado_en` vs `fecha_creacion`), `evidencia_foto` y `sinSerial`.
--
--   [BRECHA-05 -> ALINEADA EN E3] inv_levantamientos.estado:
--     - DDL alineado con ENUM completa incluyendo 'Cancelado' y
--       `NOT NULL DEFAULT 'En preparación'`.
--
--   [BRECHA-06] MariaDB 10.11 vs MySQL 8.0 JSON (MYSQL_TYPE_JSON):
--     - En MariaDB 10.11, JSON es alias de LONGTEXT (mysql2 devuelve strings).
--     - En MySQL 8.0, mysql2 parsea columnas JSON a Objetos/Arrays JS (CRIT-01 y CRIT-07).
--     - Usar `server/tests/fixtures/mysql8_json_shim.mjs` para reproducirlo en local.
-- =================================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS `ingmelec_v21_test_isolated`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ingmelec_v21_test_isolated`;

-- ---------------------------------------------------------------------------------
-- LIMPIEZA ORDENADA POR DEPENDENCIAS DE CLAVES FORÁNEAS (SOLO EN BD AISLADA)
-- ---------------------------------------------------------------------------------
DROP TABLE IF EXISTS `inv_auditoria`;
DROP TABLE IF EXISTS `inv_levantamiento_items`;
DROP TABLE IF EXISTS `inv_levantamientos`;
DROP TABLE IF EXISTS `inv_movimientos`;
DROP TABLE IF EXISTS `inv_articulos`;
DROP TABLE IF EXISTS `inv_usuario_almacenes`;
DROP TABLE IF EXISTS `inv_usuario_campamentos`;
DROP TABLE IF EXISTS `inv_almacenes`;
DROP TABLE IF EXISTS `inv_lotes_importacion`;
DROP TABLE IF EXISTS `inv_custodios`;
DROP TABLE IF EXISTS `inv_categorias`;
DROP TABLE IF EXISTS `inv_campamento_alias`;
DROP TABLE IF EXISTS `inv_campamentos`;
DROP TABLE IF EXISTS `inv_usuarios`;

-- =================================================================================
-- SECCIÓN 1: DDL COMPLETO ALINEADO (migration_01 + migration_03 + migration_04)
-- =================================================================================

-- 1. Usuarios y Control de Acceso
CREATE TABLE `inv_usuarios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `rol` VARCHAR(50) NOT NULL DEFAULT 'almacen',
  `cargo` VARCHAR(100) NULL DEFAULT NULL,
  `area` VARCHAR(100) DEFAULT 'General',
  `activo` TINYINT(1) DEFAULT 1,
  `es_developer` TINYINT(1) NOT NULL DEFAULT 0,
  `token_version` INT NOT NULL DEFAULT 1,
  `campamento_id` INT NULL DEFAULT NULL,
  `almacen_id` INT NULL DEFAULT NULL,
  `permisos_json` JSON NULL DEFAULT NULL,
  `ultimo_acceso` DATETIME DEFAULT NULL,
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inv_usuarios_email` (`email`),
  INDEX `idx_inv_usuarios_email` (`email`),
  INDEX `idx_inv_usuarios_rol` (`rol`),
  INDEX `idx_inv_usuarios_campamento` (`campamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Campamentos / Sedes
CREATE TABLE `inv_campamentos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `codigo` VARCHAR(50) DEFAULT NULL,
  `provincia` VARCHAR(100) DEFAULT NULL,
  `direccion` VARCHAR(255) DEFAULT NULL,
  `responsable` VARCHAR(150) DEFAULT NULL,
  `telefono` VARCHAR(50) DEFAULT NULL,
  `activo` TINYINT(1) DEFAULT 1,
  `clasificacion_sede` ENUM(
    'CONFIRMADO',
    'PROPUESTO',
    'PENDIENTE_VALIDACION',
    'SINTETICO_PRUEBA',
    'HISTORICO_NO_HOMOLOGADO',
    'DUPLICADO_EQUIVALENTE'
  ) NOT NULL DEFAULT 'PROPUESTO',
  `es_sintetico` TINYINT(1) NOT NULL DEFAULT 0,
  `origen_registro` VARCHAR(100) NOT NULL DEFAULT 'SISTEMA_INICIAL',
  `ubicacion_historica_equivalente` VARCHAR(150) NULL DEFAULT NULL,
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inv_camp_nombre` (`nombre`),
  INDEX `idx_camp_nombre` (`nombre`),
  INDEX `idx_camp_codigo` (`codigo`),
  INDEX `idx_camp_clasificacion` (`clasificacion_sede`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Categorías Dinámicas por Área
CREATE TABLE `inv_categorias` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `area` VARCHAR(50) NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `es_sintetico` TINYINT(1) NOT NULL DEFAULT 0,
  `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_area_categoria` (`area`, `nombre`),
  INDEX `idx_cat_area` (`area`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Custodios / Responsables (alineado con migration_03: departamento y telefono)
CREATE TABLE `inv_custodios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `cargo` VARCHAR(100) NULL DEFAULT NULL,
  `departamento` VARCHAR(100) NULL DEFAULT NULL,
  `telefono` VARCHAR(50) NULL DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `es_sintetico` TINYINT(1) NOT NULL DEFAULT 0,
  `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cust_nombre` (`nombre`),
  INDEX `idx_cust_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Lotes de Importación
CREATE TABLE `inv_lotes_importacion` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre_archivo` VARCHAR(255) NOT NULL,
  `fecha_corte` DATE DEFAULT NULL,
  `total_registros` INT NOT NULL DEFAULT 0,
  `registros_informatica` INT NOT NULL DEFAULT 0,
  `registros_oficinas` INT NOT NULL DEFAULT 0,
  `registros_cocina` INT NOT NULL DEFAULT 0,
  `registros_almacen` INT NOT NULL DEFAULT 0,
  `advertencias_count` INT NOT NULL DEFAULT 0,
  `usuario_id` INT DEFAULT NULL,
  `fecha_importacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `detalles_json` JSON DEFAULT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_lote_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Almacenes / Bodegas (alineado con migration_03: estado_verificacion y origen_registro)
CREATE TABLE `inv_almacenes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `campamento_id` INT NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `tipo` VARCHAR(80) DEFAULT 'General',
  `encargado` VARCHAR(150) DEFAULT NULL,
  `descripcion` TEXT DEFAULT NULL,
  `activo` TINYINT(1) DEFAULT 1,
  `es_sintetico` TINYINT(1) NOT NULL DEFAULT 0,
  `estado_verificacion` ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'CONFIRMADO',
  `origen_registro` VARCHAR(100) NOT NULL DEFAULT 'SISTEMA_INICIAL',
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_alm_camp` (`campamento_id`),
  INDEX `idx_alm_nombre` (`nombre`),
  CONSTRAINT `fk_alm_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Asignación Usuario <-> Campamentos
CREATE TABLE `inv_usuario_campamentos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `campamento_id` INT NOT NULL,
  `es_principal` TINYINT(1) NOT NULL DEFAULT 0,
  `asignado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_usuario_campamento` (`usuario_id`, `campamento_id`),
  INDEX `idx_uc_usuario` (`usuario_id`),
  INDEX `idx_uc_campamento` (`campamento_id`),
  CONSTRAINT `fk_uc_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uc_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Asignación Usuario <-> Almacenes
CREATE TABLE `inv_usuario_almacenes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `almacen_id` INT NOT NULL,
  `asignado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_usuario_almacen` (`usuario_id`, `almacen_id`),
  INDEX `idx_ua_usuario` (`usuario_id`),
  INDEX `idx_ua_almacen` (`almacen_id`),
  CONSTRAINT `fk_ua_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ua_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `inv_almacenes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Tabla Maestra de Artículos / Bienes
CREATE TABLE `inv_articulos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo_original` VARCHAR(100) DEFAULT NULL,
  `area` ENUM('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN', 'OTRA') NOT NULL DEFAULT 'ALMACEN',
  `categoria` VARCHAR(100) NOT NULL,
  `articulo_nombre` VARCHAR(255) NOT NULL,
  `marca_modelo` VARCHAR(255) DEFAULT NULL,
  `tipo_caracteristicas` VARCHAR(255) DEFAULT NULL,
  `serie_imei` VARCHAR(150) DEFAULT NULL,
  `propietario` VARCHAR(100) NOT NULL DEFAULT 'INGMELEC',
  `asignado_a` VARCHAR(150) DEFAULT NULL,
  `cantidad_num` DECIMAL(12,2) NULL DEFAULT NULL,
  `cantidad_texto` VARCHAR(50) DEFAULT '1',
  `cantidad_verificada` TINYINT(1) NOT NULL DEFAULT 1,
  `unidad_medida` VARCHAR(50) DEFAULT 'Unidad',
  `estado_fisico` ENUM('Bueno', 'Regular', 'Dañado', 'Fuera de servicio', 'Pendiente de verificación') NOT NULL DEFAULT 'Bueno',
  `ubicacion_nombre` VARCHAR(150) NOT NULL,
  `zona_estante` VARCHAR(150) DEFAULT NULL,
  `fecha_revision` DATE DEFAULT NULL,
  `observaciones` TEXT DEFAULT NULL,
  `evidencia_foto` VARCHAR(255) DEFAULT NULL,
  `activo` TINYINT(1) DEFAULT 1,
  `hoja_origen` VARCHAR(50) NOT NULL,
  `fila_origen` INT NOT NULL,
  `lote_id` INT DEFAULT NULL,
  `creado_por` INT DEFAULT NULL,
  `campamento_id` INT NULL DEFAULT NULL,
  `almacen_id` INT NULL DEFAULT NULL,
  `estado_cantidad` ENUM('VERIFICADO', 'PENDIENTE_VERIFICACION', 'TEXTO_NO_NUMERICO') NOT NULL DEFAULT 'VERIFICADO',
  `es_sintetico` TINYINT(1) NOT NULL DEFAULT 0,
  `origen_datos` ENUM('HISTORICO_EXCEL', 'OPERATIVO_REAL', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'OPERATIVO_REAL',
  `estado_vinculacion_sede` ENUM('CONFIRMADO', 'PROPUESTO', 'SEDE_AMBIGUA', 'SIN_SEDE', 'SIN_VINCULAR') NOT NULL DEFAULT 'CONFIRMADO',
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_inv_art_area` (`area`),
  INDEX `idx_inv_art_estado` (`estado_fisico`),
  INDEX `idx_inv_art_ubicacion` (`ubicacion_nombre`),
  INDEX `idx_inv_art_categoria` (`categoria`),
  INDEX `idx_inv_art_codigo` (`codigo_original`),
  INDEX `idx_inv_art_asignado` (`asignado_a`),
  INDEX `idx_inv_art_serie` (`serie_imei`),
  INDEX `idx_art_campamento_id` (`campamento_id`),
  INDEX `idx_art_es_sintetico` (`es_sintetico`),
  INDEX `idx_art_cantidad_verificada` (`cantidad_verificada`),
  CONSTRAINT `fk_art_lote` FOREIGN KEY (`lote_id`) REFERENCES `inv_lotes_importacion` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_art_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_art_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_art_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `inv_almacenes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Movimientos Transaccionales (Kárdex)
CREATE TABLE `inv_movimientos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `articulo_id` INT NOT NULL,
  `tipo_movimiento` ENUM('ENTRADA', 'SALIDA', 'TRASLADO', 'ASIGNACION', 'DEVOLUCION', 'AJUSTE') NOT NULL,
  `cantidad` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  `unidad_medida` VARCHAR(50) DEFAULT 'Unidad',
  `ubicacion_origen` VARCHAR(150) DEFAULT NULL,
  `ubicacion_destino` VARCHAR(150) DEFAULT NULL,
  `custodio_origen` VARCHAR(150) DEFAULT NULL,
  `custodio_destino` VARCHAR(150) DEFAULT NULL,
  `estado_previo` VARCHAR(50) DEFAULT NULL,
  `estado_nuevo` VARCHAR(50) DEFAULT NULL,
  `motivo` VARCHAR(255) NOT NULL,
  `observaciones` TEXT DEFAULT NULL,
  `usuario_id` INT DEFAULT NULL,
  `es_sintetico` TINYINT(1) NOT NULL DEFAULT 0,
  `fecha_movimiento` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_inv_mov_art` (`articulo_id`),
  INDEX `idx_inv_mov_tipo` (`tipo_movimiento`),
  INDEX `idx_inv_mov_fecha` (`fecha_movimiento`),
  CONSTRAINT `fk_mov_articulo` FOREIGN KEY (`articulo_id`) REFERENCES `inv_articulos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mov_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Sesiones de Levantamiento Físico
-- Nota: ENUM alineado con migration_03 incluyendo 'Cancelado' y NOT NULL DEFAULT 'En preparación'.
CREATE TABLE `inv_levantamientos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `codigo_levantamiento` VARCHAR(60) NOT NULL,
  `codigo` VARCHAR(50) NULL DEFAULT NULL,
  `titulo` VARCHAR(200) NOT NULL,
  `campamento_id` INT NOT NULL,
  `almacen_id` INT DEFAULT NULL,
  `fecha_inicio` DATE NOT NULL,
  `fecha_fin` DATE DEFAULT NULL,
  `responsable_levantamiento` VARCHAR(150) NOT NULL,
  `equipo_auditor` VARCHAR(255) DEFAULT NULL,
  `estado` ENUM('En preparación', 'En proceso', 'Pendiente de revisión', 'Finalizado', 'Cancelado') NOT NULL DEFAULT 'En preparación',
  `notas` TEXT DEFAULT NULL,
  `total_articulos_capturados` INT DEFAULT 0,
  `consolidado_por` INT DEFAULT NULL,
  `fecha_consolidacion` DATETIME DEFAULT NULL,
  `creado_por` INT NOT NULL,
  `es_sintetico` TINYINT(1) NOT NULL DEFAULT 0,
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lev_codigo` (`codigo_levantamiento`),
  INDEX `idx_lev_codigo` (`codigo_levantamiento`),
  INDEX `idx_lev_estado` (`estado`),
  INDEX `idx_lev_camp` (`campamento_id`),
  CONSTRAINT `fk_lev_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_lev_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `inv_almacenes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lev_consolidado_por` FOREIGN KEY (`consolidado_por`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lev_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `inv_usuarios` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Artículos Capturados en Sesión de Levantamiento
CREATE TABLE `inv_levantamiento_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `levantamiento_id` INT NOT NULL,
  `codigo_original` VARCHAR(100) DEFAULT NULL,
  `area` ENUM('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN', 'OTRA') NOT NULL DEFAULT 'ALMACEN',
  `categoria` VARCHAR(100) NOT NULL,
  `articulo_nombre` VARCHAR(255) NOT NULL,
  `marca` VARCHAR(150) DEFAULT NULL,
  `modelo_caracteristicas` VARCHAR(255) DEFAULT NULL,
  `serie_imei` VARCHAR(150) DEFAULT NULL,
  `cantidad` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  `unidad_medida` VARCHAR(50) DEFAULT 'Unidad',
  `estado_fisico` ENUM('Bueno', 'Regular', 'Dañado', 'Fuera de servicio', 'Pendiente de verificación') NOT NULL DEFAULT 'Bueno',
  `propietario` VARCHAR(100) DEFAULT 'INGMELEC',
  `responsable_custodio` VARCHAR(150) DEFAULT NULL,
  `ubicacion_exacta` VARCHAR(150) DEFAULT NULL,
  `fecha_revision` DATE DEFAULT NULL,
  `observaciones` TEXT DEFAULT NULL,
  `evidencia_foto` MEDIUMTEXT DEFAULT NULL,
  `consolidado` TINYINT(1) DEFAULT 0,
  `articulo_maestro_id` INT DEFAULT NULL,
  `estado_verificacion` VARCHAR(40) NOT NULL DEFAULT 'VERIFICADO',
  `es_sintetico` TINYINT(1) NOT NULL DEFAULT 0,
  `creado_por` INT DEFAULT NULL,
  `fecha_captura` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_item_lev` (`levantamiento_id`),
  INDEX `idx_item_area` (`area`),
  INDEX `idx_item_serie` (`serie_imei`),
  INDEX `idx_item_codigo` (`codigo_original`),
  CONSTRAINT `fk_item_levantamiento` FOREIGN KEY (`levantamiento_id`) REFERENCES `inv_levantamientos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_item_maestro` FOREIGN KEY (`articulo_maestro_id`) REFERENCES `inv_articulos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_item_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Bitácora de Auditoría
CREATE TABLE `inv_auditoria` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT DEFAULT NULL,
  `usuario_nombre` VARCHAR(120) DEFAULT 'Sistema',
  `accion` VARCHAR(80) NOT NULL,
  `entidad` VARCHAR(50) NOT NULL DEFAULT 'inv_articulos',
  `entidad_id` INT DEFAULT NULL,
  `detalles_previos` JSON DEFAULT NULL,
  `detalles_nuevos` JSON DEFAULT NULL,
  `ip_origen` VARCHAR(45) DEFAULT NULL,
  `fecha` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_inv_aud_entidad` (`entidad`, `entidad_id`),
  INDEX `idx_inv_aud_fecha` (`fecha`),
  INDEX `idx_inv_aud_usuario` (`usuario_id`),
  CONSTRAINT `fk_aud_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `inv_usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Alias Canónicos de Campamentos / Sedes (Etapa 4 — C03 Sec. 6.1)
CREATE TABLE `inv_campamento_alias` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `campamento_id` INT NOT NULL,
  `codigo_campamento` VARCHAR(50) NOT NULL,
  `alias_original` VARCHAR(150) NOT NULL,
  `alias_normalizado` VARCHAR(150) NOT NULL,
  `estado_validacion` ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'RECHAZADO') NOT NULL DEFAULT 'CONFIRMADO',
  `requiere_revision_historica` TINYINT(1) NOT NULL DEFAULT 0,
  `es_historico` TINYINT(1) NOT NULL DEFAULT 1,
  `notas` VARCHAR(255) DEFAULT NULL,
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alias_normalizado` (`alias_normalizado`),
  INDEX `idx_alias_camp` (`campamento_id`),
  INDEX `idx_alias_codigo` (`codigo_campamento`),
  CONSTRAINT `fk_alias_campamento` FOREIGN KEY (`campamento_id`) REFERENCES `inv_campamentos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =================================================================================
-- SECCIÓN 2: SEMBRADO 100% SINTÉTICO (SEED)
-- =================================================================================

-- 2.1 Campamentos (IDs estilo Clever Cloud: 1, 2, 3, 4, 5 + id 6 sintético aislado)
INSERT INTO `inv_campamentos` (
  `id`, `nombre`, `codigo`, `provincia`, `direccion`, `responsable`, `telefono`,
  `activo`, `clasificacion_sede`, `es_sintetico`, `origen_registro`, `ubicacion_historica_equivalente`
) VALUES
  (1, 'ALMACÉN 27 DE FEBRERO', 'ALM-27FEB', 'Distrito Nacional', 'Av. 27 de Febrero Sector Sintético 100', 'Encargado Sintético 27F', '809-555-0101', 1, 'CONFIRMADO', 0, 'EXCEL_HISTORICO', 'DISTRITO NACIONAL 27 DE FEBRERO'),
  (2, 'KM 19 AUT DUARTE', 'KM19-DUARTE', 'Santo Domingo Oeste', 'Autopista Duarte Km 19 (Registro Histórico Ambiguo Sintético)', 'Sin Responsable Único', '809-555-0102', 1, 'HISTORICO_NO_HOMOLOGADO', 0, 'EXCEL_HISTORICO', 'KM 19 AUT DUARTE'),
  (3, 'OPL', 'CAMP-OPL', 'Santo Domingo Oeste', 'Km 19 Autopista Duarte - Sede OPL Sintética', 'Encargado Sintético OPL', '809-555-0103', 1, 'CONFIRMADO', 0, 'GERENCIA_CONFIRMADO', 'KM 19 AUTOPISTA DUARTE OPL'),
  (4, 'MANTENIMIENTO 633', 'CAMP-M633', 'Santo Domingo', 'Km 19 Autopista Duarte - Taller 633 Sintético', 'Encargado Sintético M633', '809-555-0104', 1, 'CONFIRMADO', 0, 'GERENCIA_CONFIRMADO', 'MANTENIMIENTO 633'),
  (5, 'SAN CRISTÓBAL', 'SC', 'San Cristóbal', 'Carretera Sánchez Km 5 (Sede Pendiente Validación Sintética)', 'Coordinador Pendiente SC', '809-555-0105', 1, 'PENDIENTE_VALIDACION', 0, 'SISTEMA_INICIAL', NULL),
  (6, 'CAMPAMENTO SANDBOX SINTETICO', 'SYNTH-006', 'Santo Domingo', 'Zona de Pruebas Aisladas v2.1', 'QA Tester Sintético', '809-555-0199', 1, 'SINTETICO_PRUEBA', 1, 'QA_FIXTURE', NULL);

-- 2.2 Almacenes asociados a campamentos 1, 3, 4 (+ almacén sintético para id 6)
INSERT INTO `inv_almacenes` (
  `id`, `campamento_id`, `nombre`, `tipo`, `encargado`, `descripcion`, `activo`, `es_sintetico`, `estado_verificacion`, `origen_registro`
) VALUES
  (1, 1, 'Almacén Principal 27 de Febrero', 'General', 'Encargado Sintético 27F', 'Bodega central sintética de 27 de Febrero', 1, 0, 'CONFIRMADO', 'EXCEL_HISTORICO'),
  (2, 3, 'Almacén Principal OPL', 'General', 'Encargado Sintético OPL', 'Bodega operativa sintética de sede OPL', 1, 0, 'CONFIRMADO', 'GERENCIA_CONFIRMADO'),
  (3, 4, 'Almacén Principal Mantenimiento 633', 'Taller', 'Encargado Sintético M633', 'Bodega taller sintética de Mantenimiento 633', 1, 0, 'CONFIRMADO', 'GERENCIA_CONFIRMADO'),
  (4, 6, 'Almacén Sandbox Sintético', 'Pruebas', 'QA Tester Sintético', 'Bodega aislada es_sintetico = 1 para validar filtro por defecto', 1, 1, 'SINTETICO_PRUEBA', 'QA_FIXTURE');

-- 2.3 Usuarios sintéticos (6 roles + 1 usuario inactivo; hashes placeholder NO productivos)
-- Nota: Si una prueba requiere login real vía POST /auth/login, el script setup
--       de pruebas debe actualizar `password_hash` con un hash Argon2id temporal.
INSERT INTO `inv_usuarios` (
  `id`, `nombre`, `email`, `password_hash`, `rol`, `cargo`, `area`, `activo`,
  `es_developer`, `campamento_id`, `almacen_id`, `permisos_json`, `ultimo_acceso`
) VALUES
  (1, 'Dev Sintético Principal', 'dev.sintetico@ingmelec-test.local', '$argon2id$v=19$m=65536,t=3,p=1$U0lOVEVUSUNPX1NBTFRfMDE$UExBQ0VIT0xERVJfSEFTSF9ERVZfU0lOVEVUSUNPXzAx', 'developer', 'Desarrollador Principal QA', 'General', 1, 1, NULL, NULL, '["*"]', '2026-11-10 08:00:00'),
  (2, 'Admin Sintético Operaciones', 'admin.sintetico@ingmelec-test.local', '$argon2id$v=19$m=65536,t=3,p=1$U0lOVEVUSUNPX1NBTFRfMDI$UExBQ0VIT0xERVJfSEFTSF9BRE1JTl9TSU5URVRJQ09fMDI', 'admin', 'Administrador de Operaciones QA', 'ALMACEN', 1, 0, 1, 1, '["inv:ver","inv:crear","inv:editar","inv:eliminar","inv:movimientos_registrar","inv:movimientos_ver","lev:ver","lev:crear","lev:capturar","lev:editar","lev:importar","lev:consolidar","rep:ver","rep:exportar","rep:imprimir","camp:ver","camp:stock","camp:operar","dash:ver","aud:ver"]', '2026-11-10 09:15:00'),
  (3, 'Operador Sintético Almacén OPL', 'almacen.opl.sintetico@ingmelec-test.local', '$argon2id$v=19$m=65536,t=3,p=1$U0lOVEVUSUNPX1NBTFRfMDM$UExBQ0VIT0xERVJfSEFTSF9BTE1BQ0VOX1NJTlRFVElDT18wMw', 'almacen', 'Encargado de Almacén QA', 'ALMACEN', 1, 0, 3, 2, '["inv:ver","inv:crear","inv:movimientos_registrar","inv:movimientos_ver","lev:ver","lev:crear","lev:capturar","camp:ver","camp:stock","dash:ver"]', '2026-11-10 09:30:00'),
  (4, 'Supervisor Sintético M633', 'supervisor.m633.sintetico@ingmelec-test.local', '$argon2id$v=19$m=65536,t=3,p=1$U0lOVEVUSUNPX1NBTFRfMDQ$UExBQ0VIT0xERVJfSEFTSF9TVVBFUlZJU09SX1NJTlRFVElDT18wNA', 'supervisor', 'Supervisor Técnico Mantenimiento QA', 'ALMACEN', 1, 0, 4, 3, '["inv:ver","inv:crear","inv:editar","inv:movimientos_ver","lev:ver","lev:crear","lev:capturar","lev:editar","lev:importar","lev:consolidar","rep:ver","rep:exportar","camp:ver","camp:stock","dash:ver"]', '2026-11-10 10:00:00'),
  (5, 'Auditor Sintético Control', 'auditor.sintetico@ingmelec-test.local', '$argon2id$v=19$m=65536,t=3,p=1$U0lOVEVUSUNPX1NBTFRfMDU$UExBQ0VIT0xERVJfSEFTSF9BVURJVE9SX1NJTlRFVElDT18wNQ', 'auditor', 'Auditor de Inventario QA', 'General', 1, 0, 1, 1, '["inv:ver","inv:movimientos_ver","lev:ver","rep:ver","rep:exportar","rep:imprimir","camp:ver","camp:stock","dash:ver","aud:ver"]', '2026-11-10 10:30:00'),
  (6, 'Gerente Sintético Global', 'gerencia.sintetico@ingmelec-test.local', '$argon2id$v=19$m=65536,t=3,p=1$U0lOVEVUSUNPX1NBTFRfMDY$UExBQ0VIT0xERVJfSEFTSF9HRVJFTkNJQV9TSU5URVRJQ09fMDY', 'gerencia', 'Gerencia General QA', 'General', 1, 0, NULL, NULL, '["inv:ver","inv:movimientos_ver","lev:ver","rep:ver","rep:exportar","rep:imprimir","camp:ver","camp:stock","dash:ver","aud:ver"]', '2026-11-10 11:00:00'),
  (7, 'Operador Sintético Inactivo', 'inactivo.sintetico@ingmelec-test.local', '$argon2id$v=19$m=65536,t=3,p=1$U0lOVEVUSUNPX1NBTFRfMDc$UExBQ0VIT0xERVJfSEFTSF9JTkFDVElWT19TSU5URVRJQ09fMDc', 'almacen', 'Operador Desactivado QA', 'ALMACEN', 0, 0, 1, 1, '["inv:ver","camp:ver"]', NULL);

-- 2.4 Permisos territoriales: inv_usuario_campamentos e inv_usuario_almacenes
INSERT INTO `inv_usuario_campamentos` (`usuario_id`, `campamento_id`, `es_principal`) VALUES
  (2, 1, 1),
  (2, 3, 0),
  (3, 3, 1),
  (4, 4, 1),
  (5, 1, 1),
  (5, 4, 0),
  (7, 1, 1);

INSERT INTO `inv_usuario_almacenes` (`usuario_id`, `almacen_id`) VALUES
  (2, 1),
  (2, 2),
  (3, 2),
  (4, 3),
  (5, 1),
  (5, 3),
  (7, 1);

-- 2.5 Catálogos base sintéticos (inv_categorias, inv_custodios, inv_lotes_importacion)
INSERT INTO `inv_categorias` (`area`, `nombre`, `activo`, `es_sintetico`) VALUES
  ('INFORMATICA', 'Cómputo Portátil', 1, 0),
  ('INFORMATICA', 'Redes y Telecomunicaciones', 1, 0),
  ('INFORMATICA', 'Periféricos e Impresión', 1, 0),
  ('OFICINAS', 'Mobiliario Modular', 1, 0),
  ('OFICINAS', 'Archivo y Almacenamiento', 1, 0),
  ('COCINA', 'Electrodomésticos', 1, 0),
  ('ALMACEN', 'Herramienta Eléctrica', 1, 0),
  ('ALMACEN', 'Equipos de Medición', 1, 0),
  ('ALMACEN', 'Equipos de Taller', 1, 0),
  ('ALMACEN', 'Categoría Pruebas Sintéticas', 1, 1);

INSERT INTO `inv_custodios` (`nombre`, `cargo`, `departamento`, `telefono`, `activo`, `es_sintetico`) VALUES
  ('Custodio Sintético Alfa', 'Técnico de Campo QA', 'Operaciones Campo', '809-555-0201', 1, 0),
  ('Custodio Sintético Beta', 'Asistente Administrativo QA', 'Administración', '809-555-0202', 1, 0),
  ('Custodio Sintético Gamma', 'Encargado Servicios QA', 'Servicios Generales', '809-555-0203', 1, 0),
  ('Custodio Sintético Delta', 'Técnico Electromecánico QA', 'Mantenimiento', '809-555-0204', 1, 0),
  ('Custodio Sintético Epsilon', 'Especialista Redes OPL QA', 'Operaciones OPL', '809-555-0205', 1, 0),
  ('Custodio Sintético Zeta', 'Mecánico Taller 633 QA', 'Taller M633', '809-555-0206', 1, 0),
  ('Custodio Sandbox Sintético', 'QA Tester Sintético', 'Calidad QA', '809-555-0299', 1, 1);

INSERT INTO `inv_lotes_importacion` (
  `id`, `nombre_archivo`, `fecha_corte`, `total_registros`,
  `registros_informatica`, `registros_oficinas`, `registros_cocina`, `registros_almacen`,
  `advertencias_count`, `usuario_id`, `detalles_json`
) VALUES
  (1, 'inventario_sintetico_v21_fixture.xlsx', '2026-10-16', 29, 9, 4, 3, 13, 8, 1, '{"origen":"fixture_sintetico_v21","nota":"Cero datos reales de produccion"}');

-- 2.6 Artículos Sintéticos (29 registros cubriendo TODOS los casos críticos)
INSERT INTO `inv_articulos` (
  `id`, `codigo_original`, `area`, `categoria`, `articulo_nombre`, `marca_modelo`,
  `tipo_caracteristicas`, `serie_imei`, `propietario`, `asignado_a`,
  `cantidad_num`, `cantidad_texto`, `cantidad_verificada`, `unidad_medida`,
  `estado_fisico`, `ubicacion_nombre`, `zona_estante`, `fecha_revision`,
  `observaciones`, `activo`, `hoja_origen`, `fila_origen`, `lote_id`, `creado_por`,
  `campamento_id`, `almacen_id`, `estado_cantidad`, `es_sintetico`,
  `origen_datos`, `estado_vinculacion_sede`
) VALUES
  -- --- SEDE 1: ALMACÉN 27 DE FEBRERO (campamento_id = 1, almacen_id = 1) ---
  (1, 'INF-9001', 'INFORMATICA', 'Cómputo Portátil', 'Laptop Técnica Sintética X1', 'MarcaSim Pro 15', '16GB RAM / 512GB SSD', 'SN-SYNTH-INF-9001', 'INGMELEC', 'Custodio Sintético Alfa', 2.00, '2', 1, 'Unidad', 'Bueno', 'ALMACÉN 27 DE FEBRERO', 'Rack IT-A1', '2026-10-16', '[FIXTURE SINTÉTICO] Sede 27FEB confirmada', 1, 'INFORMATICA', 1, 1, 2, 1, 1, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (2, 'MOB-9002', 'OFICINAS', 'Mobiliario Modular', 'Escritorio Metálico Modular QA', 'MobiliSim 140cm', 'Acero y melamina gris', 'N/A', 'INGMELEC', 'Custodio Sintético Beta', 4.00, '4', 1, 'Unidad', 'Bueno', 'DISTRITO NACIONAL 27 DE FEBRERO', 'Pasillo B2', '2026-10-16', '[FIXTURE SINTÉTICO] Variante histórica 27FEB + sinSerial N/A', 1, 'OFICINAS', 2, 1, 2, 1, 1, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (3, 'COC-9003', 'COCINA', 'Electrodomésticos', 'Microondas Industrial Sintético 20L', 'ChefSim 1000W', 'Acero inoxidable 110V', 'SN-SYNTH-COC-9003', 'INGMELEC', 'Custodio Sintético Gamma', 1.00, '1', 1, 'Unidad', 'Regular', 'ALMACÉN 27 DE FEBRERO', 'Comedor P1', '2026-10-16', '[FIXTURE SINTÉTICO] Estado físico Regular', 1, 'COCINA', 3, 1, 2, 1, 1, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (4, 'HER-258', 'ALMACEN', 'Herramienta Eléctrica', 'Taladro Percutor Sintético 20V (Sede 27F)', 'ToolSim Hammer-20', 'Batería Litio 20V', 'SN-SYNTH-HER-258A', 'INGMELEC', 'Custodio Sintético Alfa', 3.00, '3', 1, 'Unidad', 'Bueno', 'ALMACÉN 27 DE FEBRERO', 'Estante H-01', '2026-10-16', '[FIXTURE SINTÉTICO] Código duplicado intencional HER-258 (vs M633)', 1, 'ALMACEN', 4, 1, 2, 1, 1, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (5, 'HER-252', 'ALMACEN', 'Equipos de Medición', 'Multímetro Digital Sintético Fluke-Sim (Sede 27F)', 'MeterSim 87V', 'True RMS CAT IV', 'SN-SYNTH-HER-252A', 'INGMELEC', 'Custodio Sintético Delta', 1.00, '1', 1, 'Unidad', 'Dañado', 'ALMACÉN 27 DE FEBRERO', 'Estante H-02', '2026-10-16', '[FIXTURE SINTÉTICO] Código duplicado intencional HER-252 (vs KM19 Auditado)', 1, 'ALMACEN', 5, 1, 2, 1, 1, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (6, 'HER-9006', 'ALMACEN', 'Equipos de Taller', 'Carrete Cable Fibra Sintética (Cantidad Pendiente)', 'FiberSim 12H', 'Monomodo exterior', 'S/N', 'INGMELEC', 'Custodio Sintético Alfa', NULL, 'Por verificar', 0, 'Rollo', 'Pendiente de verificación', 'ALMACÉN 27 DE FEBRERO', 'Patio Carretes', '2026-10-16', '[FIXTURE SINTÉTICO] Cantidad NULL + cantidad_verificada=0 + S/N', 1, 'ALMACEN', 6, 1, 2, 1, 1, 'TEXTO_NO_NUMERICO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),

  -- --- SEDE 3: OPL (campamento_id = 3, almacen_id = 2) ---
  (7, 'INF-9007', 'INFORMATICA', 'Redes y Telecomunicaciones', 'Switch Rack 24 Puertos Sintético', 'NetSim GS-24P', 'Gigabit PoE+ administrable', 'SN-SYNTH-INF-9007', 'INGMELEC', 'Custodio Sintético Epsilon', 2.00, '2', 1, 'Unidad', 'Bueno', 'OPL', 'Rack OPL-01', '2026-10-16', '[FIXTURE SINTÉTICO] Sede OPL confirmada (id=3)', 1, 'INFORMATICA', 7, 1, 3, 3, 2, 'VERIFICADO', 0, 'OPERATIVO_REAL', 'CONFIRMADO'),
  (8, 'HER-9008', 'ALMACEN', 'Equipos de Taller', 'Escalera Dieléctrica Fibra 24ft Sintética', 'ClimbSim D-24', 'Aislamiento 30kV', 'SIN SERIAL', 'INGMELEC', 'Custodio Sintético Epsilon', 3.00, '3', 1, 'Unidad', 'Bueno', 'KM 19 AUTOPISTA DUARTE OPL', 'Bahía OPL-E2', '2026-10-16', '[FIXTURE SINTÉTICO] OPL histórico vinculado + sinSerial SIN SERIAL', 1, 'ALMACEN', 8, 1, 3, 3, 2, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (9, 'MOB-9009', 'OFICINAS', 'Mobiliario Modular', 'Silla Ergonómica Malla Sintética', 'ErgoSim Mesh-Pro', 'Soporte lumbar ajustable', 'NO APLICA', 'INGMELEC', 'Custodio Sintético Beta', 6.00, '6', 1, 'Unidad', 'Regular', 'OPL', 'Oficina OPL-2', '2026-10-16', '[FIXTURE SINTÉTICO] sinSerial NO APLICA', 1, 'OFICINAS', 9, 1, 3, 3, 2, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (10, 'COC-9010', 'COCINA', 'Electrodomésticos', 'Dispensador Agua Fría/Caliente Sintético', 'AquaSim 2T', 'Acero inoxidable con botellón', 'SN-SYNTH-COC-9010', 'INGMELEC', 'Custodio Sintético Gamma', NULL, NULL, 0, 'Unidad', 'Fuera de servicio', 'OPL', 'Área Comedor OPL', '2026-10-16', '[FIXTURE SINTÉTICO] Cantidad NULL + Fuera de servicio', 1, 'COCINA', 10, 1, 3, 3, 2, 'PENDIENTE_VERIFICACION', 0, 'OPERATIVO_REAL', 'CONFIRMADO'),

  -- --- SEDE 4: MANTENIMIENTO 633 (campamento_id = 4, almacen_id = 3) ---
  (11, 'HER-258', 'ALMACEN', 'Equipos de Taller', 'Compresor Neumático Portátil Sintético (Sede M633)', 'AirSim 50L-3HP', 'Tanque 50L 120 PSI', 'SN-SYNTH-HER-258B', 'INGMELEC', 'Custodio Sintético Zeta', 1.00, '1', 1, 'Unidad', 'Bueno', 'MANTENIMIENTO 633', 'Taller Bahía 1', '2026-10-16', '[FIXTURE SINTÉTICO] Código duplicado intencional HER-258 (vs 27FEB)', 1, 'ALMACEN', 11, 1, 4, 4, 3, 'VERIFICADO', 0, 'OPERATIVO_REAL', 'CONFIRMADO'),
  (12, 'HER-9012', 'ALMACEN', 'Herramienta Eléctrica', 'Soldadora Inverter 250A Sintética', 'WeldSim Arc-250', 'Bivoltaje 110/220V', 'SN-SYNTH-HER-9012', 'INGMELEC', 'Custodio Sintético Zeta', 2.00, '2', 1, 'Unidad', 'Regular', 'MANTENIMIENTO 633', 'Taller Bahía 2', '2026-10-16', '[FIXTURE SINTÉTICO] Sede M633 confirmada (id=4)', 1, 'ALMACEN', 12, 1, 4, 4, 3, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (13, 'INF-9013', 'INFORMATICA', 'Equipos de Medición', 'Escáner Diagnóstico Vehicular Sintético', 'DiagSim OBD-Pro', 'Pantalla táctil OBD-II', 'SN-SYNTH-INF-9013', 'INGMELEC', 'Custodio Sintético Delta', 1.00, '1', 1, 'Unidad', 'Dañado', 'MANTENIMIENTO 633', 'Gabinete M633', '2026-10-16', '[FIXTURE SINTÉTICO] Estado Dañado en M633', 1, 'INFORMATICA', 13, 1, 4, 4, 3, 'VERIFICADO', 0, 'OPERATIVO_REAL', 'CONFIRMADO'),
  (14, 'HER-9014', 'ALMACEN', 'Equipos de Taller', 'Juego Llaves Combinadas Sintético', 'WrenchSim 32pzas', 'Cromo vanadio milimétrico', 'SIN SERIE', 'INGMELEC', 'Custodio Sintético Zeta', NULL, 'Lote completo', 0, 'Juego', 'Bueno', 'MANTENIMIENTO 633', 'Banco Herramientas', '2026-10-16', '[FIXTURE SINTÉTICO] Cantidad NULL + sinSerial SIN SERIE', 1, 'ALMACEN', 14, 1, 4, 4, 3, 'TEXTO_NO_NUMERICO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),

  -- --- ALIAS DE UBICACIÓN SIN VINCULAR (campamento_id = NULL, SEDE_AMBIGUA) ---
  (15, 'INF-9015', 'INFORMATICA', 'Redes y Telecomunicaciones', 'Router Empresarial Dual-WAN Sintético', 'RouteSim DW-400', 'Balanceo de carga Gigabit', 'SN-SYNTH-INF-9015', 'INGMELEC', 'Custodio Sintético Alfa', 2.00, '2', 1, 'Unidad', 'Bueno', 'KM 19 AUT DUARTE', 'Sin clasificar', '2026-10-16', '[FIXTURE SINTÉTICO] Alias ambiguo KM 19 AUT DUARTE', 1, 'INFORMATICA', 15, 1, 1, NULL, NULL, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'SEDE_AMBIGUA'),
  (16, 'MOB-9016', 'OFICINAS', 'Archivo y Almacenamiento', 'Archivador Vertical 4 Gavetas Sintético', 'FileSim Met-4', 'Cerradura central metálica', '--', 'INGMELEC', 'Custodio Sintético Beta', 3.00, '3', 1, 'Unidad', 'Regular', 'KM19', 'Sin clasificar', '2026-10-16', '[FIXTURE SINTÉTICO] Alias ambiguo KM19 + sinSerial --', 1, 'OFICINAS', 16, 1, 1, NULL, NULL, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'SEDE_AMBIGUA'),
  (17, 'INF-9017', 'INFORMATICA', 'Cómputo Portátil', 'Monitor LED 24 Pulgadas Sintético', 'ViewSim IPS-24', 'Full HD HDMI/DP', 'SN-SYNTH-INF-9017', 'INGMELEC', 'Custodio Sintético Alfa', 4.00, '4', 1, 'Unidad', 'Bueno', 'KM 19', 'Sin clasificar', '2026-10-16', '[FIXTURE SINTÉTICO] Alias ambiguo KM 19', 1, 'INFORMATICA', 17, 1, 1, NULL, NULL, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'SEDE_AMBIGUA'),
  (18, 'COC-9018', 'COCINA', 'Electrodomésticos', 'Refrigerador Comercial 18 Pies Sintético', 'CoolSim 18F', 'No Frost doble puerta', 'SN-SYNTH-COC-9018', 'INGMELEC', 'Custodio Sintético Gamma', 1.00, '1', 1, 'Unidad', 'Bueno', 'KM 19 AUTOPISTA DUARTE', 'Sin clasificar', '2026-10-16', '[FIXTURE SINTÉTICO] Alias ambiguo KM 19 AUTOPISTA DUARTE', 1, 'COCINA', 18, 1, 1, NULL, NULL, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'SEDE_AMBIGUA'),
  (19, 'HER-9019', 'ALMACEN', 'Equipos de Taller', 'Generador Portátil 3500W Sintético', 'PowerSim 3500', 'Gasolina 4 tiempos', 'SN-SYNTH-HER-9019', 'INGMELEC', 'Custodio Sintético Delta', 1.00, '1', 1, 'Unidad', 'Pendiente de verificación', 'KM 19 AUTOPISTA DUARTE OPL', 'Sin clasificar', '2026-10-16', '[FIXTURE SINTÉTICO] Variante histórica OPL sin vincular (campamento_id=NULL)', 1, 'ALMACEN', 19, 1, 1, NULL, NULL, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'SEDE_AMBIGUA'),
  (20, 'HER-252', 'ALMACEN', 'Herramienta Eléctrica', 'Amoladora Angular 9 Pulgadas Sintética (KM 19 Auditado)', 'GrindSim 2200W', 'Disco 9 pulgadas industrial', 'SN-SYNTH-HER-252B', 'INGMELEC', 'Custodio Sintético Delta', 2.00, '2', 1, 'Unidad', 'Bueno', 'ALMACEN KM 19 AUDITADO', 'Auditado KM19', '2026-10-16', '[FIXTURE SINTÉTICO] Código duplicado intencional HER-252 en ALMACEN KM 19 AUDITADO (vs 27FEB)', 1, 'ALMACEN', 20, 1, 1, NULL, NULL, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'SEDE_AMBIGUA'),
  (21, 'HER-9021', 'ALMACEN', 'Equipos de Taller', 'Gato Hidráulico 10 Toneladas Sintético', 'LiftSim 10T', 'Tipo botella pesado', NULL, 'INGMELEC', 'Custodio Sintético Zeta', 2.00, '2', 1, 'Unidad', 'Bueno', 'MANTENIMIENTO', 'Sin clasificar', '2026-10-16', '[FIXTURE SINTÉTICO] Alias ambiguo MANTENIMIENTO + serie NULL', 1, 'ALMACEN', 21, 1, 1, NULL, NULL, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'SEDE_AMBIGUA'),
  (22, 'HER-9022', 'ALMACEN', 'Equipos de Taller', 'Prensa Hidráulica de Banco Sintética', 'PressSim 20T', 'Estructura H 20 toneladas', '', 'INGMELEC', 'Custodio Sintético Zeta', 1.00, '1', 1, 'Unidad', 'Regular', 'MANTENIMIENTO M633', 'Sin clasificar', '2026-10-16', '[FIXTURE SINTÉTICO] Alias ambiguo MANTENIMIENTO M633 + serie vacía', 1, 'ALMACEN', 22, 1, 1, NULL, NULL, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'SEDE_AMBIGUA'),

  -- --- REGISTROS ADICIONALES PARA COBERTURA DE SERIALES, CANTIDADES Y ESTADOS ---
  (23, 'INF-9023', 'INFORMATICA', 'Periféricos e Impresión', 'Impresora Multifunción Láser Sintética', 'PrintSim M428', 'Dúplex Red USB', 'SN-SYNTH-INF-9023', 'INGMELEC', 'Custodio Sintético Beta', 1.00, '1', 1, 'Unidad', 'Fuera de servicio', 'ALMACÉN 27 DE FEBRERO', 'Área Soporte', '2026-10-16', '[FIXTURE SINTÉTICO] Serial compartido con ítem de levantamiento para probar colisión', 1, 'INFORMATICA', 23, 1, 2, 1, 1, 'VERIFICADO', 0, 'OPERATIVO_REAL', 'CONFIRMADO'),
  (24, 'MOB-9024', 'OFICINAS', 'Mobiliario Modular', 'Mesa de Reuniones 8 Puestos Sintética', 'TableSim 240cm', 'Melamina roble sintético', 'N/A', 'INGMELEC', 'Custodio Sintético Beta', NULL, 'Sin conteo', 0, 'Unidad', 'Bueno', 'MANTENIMIENTO 633', 'Sala M633', '2026-10-16', '[FIXTURE SINTÉTICO] Cantidad NULL en M633', 1, 'OFICINAS', 24, 1, 4, 4, 3, 'TEXTO_NO_NUMERICO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (25, 'INF-9025', 'INFORMATICA', 'Redes y Telecomunicaciones', 'UPS Rack 3000VA Sintético', 'PowerBackSim 3K', 'Onda senoidal pura 2U', 'SN-SYNTH-INF-9025', 'INGMELEC', 'Custodio Sintético Epsilon', 2.00, '2', 1, 'Unidad', 'Bueno', 'OPL', 'Rack OPL-01', '2026-10-16', '[FIXTURE SINTÉTICO] Activo operativo en OPL', 1, 'INFORMATICA', 25, 1, 3, 3, 2, 'VERIFICADO', 0, 'OPERATIVO_REAL', 'CONFIRMADO'),

  -- --- REGISTROS MARCADOS CON es_sintetico = 1 E INACTIVOS (activo = 0) ---
  (26, 'SYN-9026', 'ALMACEN', 'Categoría Pruebas Sintéticas', 'Equipo Prueba Aislada Sintético Alpha', 'MockDev 100', 'Solo visible con incluir_sinteticos=true', 'SN-SYNTH-ONLY-9026', 'INGMELEC', 'Custodio Sandbox Sintético', 5.00, '5', 1, 'Unidad', 'Bueno', 'CAMPAMENTO SANDBOX SINTETICO', 'Zona Test A', '2026-11-01', '[REGISTRO SINTÉTICO QA] Prueba aislamiento es_sintetico = 1', 1, 'ALMACEN', 26, 1, 1, 6, 4, 'VERIFICADO', 1, 'SINTETICO_PRUEBA', 'CONFIRMADO'),
  (27, 'SYN-9027', 'INFORMATICA', 'Cómputo Portátil', 'Terminal Pruebas Sintético Beta', 'MockTerm T2', 'Cantidad NULL sintética', 'SIN SERIAL', 'INGMELEC', 'Custodio Sandbox Sintético', NULL, 'Pendiente', 0, 'Unidad', 'Pendiente de verificación', 'ALMACÉN 27 DE FEBRERO', 'Zona Test B', '2026-11-01', '[REGISTRO SINTÉTICO QA] Sintético dentro de sede real para probar exclusión', 1, 'INFORMATICA', 27, 1, 1, 1, 1, 'PENDIENTE_VERIFICACION', 1, 'SINTETICO_PRUEBA', 'CONFIRMADO'),
  (28, 'INF-9028', 'INFORMATICA', 'Redes y Telecomunicaciones', 'Servidor Retirado Sintético Inactivo', 'RackSim Old-G6', 'Baja lógica activo=0', 'SN-SYNTH-INACT-9028', 'INGMELEC', 'Custodio Sintético Alfa', 1.00, '1', 1, 'Unidad', 'Fuera de servicio', 'ALMACÉN 27 DE FEBRERO', 'Baja', '2026-10-16', '[FIXTURE SINTÉTICO] Registro dado de baja (activo = 0)', 0, 'INFORMATICA', 28, 1, 2, 1, 1, 'VERIFICADO', 0, 'HISTORICO_EXCEL', 'CONFIRMADO'),
  (29, 'SYN-9029', 'ALMACEN', 'Categoría Pruebas Sintéticas', 'Herramienta Sintética Dada de Baja', 'MockTool Z9', 'Baja lógica + sintético', 'SN-SYNTH-INACT-9029', 'INGMELEC', 'Custodio Sandbox Sintético', 1.00, '1', 1, 'Unidad', 'Dañado', 'CAMPAMENTO SANDBOX SINTETICO', 'Baja Test', '2026-11-01', '[REGISTRO SINTÉTICO QA] Registro sintético e inactivo (activo = 0, es_sintetico = 1)', 0, 'ALMACEN', 29, 1, 1, 6, 4, 'VERIFICADO', 1, 'SINTETICO_PRUEBA', 'CONFIRMADO');

-- 2.7 Movimientos Transaccionales Sintéticos (Kárdex)
INSERT INTO `inv_movimientos` (
  `id`, `articulo_id`, `tipo_movimiento`, `cantidad`, `unidad_medida`,
  `ubicacion_origen`, `ubicacion_destino`, `custodio_origen`, `custodio_destino`,
  `estado_previo`, `estado_nuevo`, `motivo`, `observaciones`, `usuario_id`, `es_sintetico`, `fecha_movimiento`
) VALUES
  (1, 1, 'ENTRADA', 2.00, 'Unidad', NULL, 'ALMACÉN 27 DE FEBRERO', NULL, 'Custodio Sintético Alfa', NULL, 'Bueno', 'Carga inicial sintética QA', 'Registro inicial de prueba', 2, 0, '2026-10-16 10:00:00'),
  (2, 7, 'ASIGNACION', 2.00, 'Unidad', 'OPL', 'OPL', 'Sin asignar', 'Custodio Sintético Epsilon', 'Bueno', 'Bueno', 'Asignación sintética de equipo de red', 'Prueba scope OPL', 3, 0, '2026-10-18 14:30:00'),
  (3, 13, 'AJUSTE', 1.00, 'Unidad', 'MANTENIMIENTO 633', 'MANTENIMIENTO 633', 'Custodio Sintético Delta', 'Custodio Sintético Delta', 'Regular', 'Dañado', 'Inspección física sintética M633', 'Equipo reportado dañado en prueba', 4, 0, '2026-10-22 11:15:00'),
  (4, 26, 'ENTRADA', 5.00, 'Unidad', NULL, 'CAMPAMENTO SANDBOX SINTETICO', NULL, 'Custodio Sandbox Sintético', NULL, 'Bueno', 'Movimiento sintético aislado QA', 'Solo visible con incluir_sinteticos=true', 1, 1, '2026-11-01 09:00:00');

-- 2.8 Bitácora de Auditoría con payloads JSON reales (para reproducir React Error #31 / CRIT-01)
INSERT INTO `inv_auditoria` (
  `id`, `usuario_id`, `usuario_nombre`, `accion`, `entidad`, `entidad_id`,
  `detalles_previos`, `detalles_nuevos`, `ip_origen`, `fecha`
) VALUES
  (1, 1, 'Dev Sintético Principal', 'CAMBIO_ESTADO_USUARIO', 'inv_usuarios', 7, '{"activo": 1}', '{"activo": 0}', '127.0.0.1', '2026-11-01 09:00:00'),
  (2, 1, 'Dev Sintético Principal', 'CAMBIO_ESTADO_USUARIO', 'inv_usuarios', 3, '{"activo": 0}', '{"activo": 1}', '127.0.0.1', '2026-11-01 09:05:00'),
  (3, 1, 'Dev Sintético Principal', 'ASIGNACION_PERMISOS', 'inv_usuarios', 3, '{"permisos": ["inv:ver"]}', '{"permisos": ["inv:ver", "inv:crear", "inv:movimientos_registrar"]}', '127.0.0.1', '2026-11-01 09:10:00'),
  (4, 2, 'Admin Sintético Operaciones', 'EDICION_ARTICULO', 'inv_articulos', 3, '{"estado_fisico": "Bueno", "cantidad_num": 1}', '{"estado_fisico": "Regular", "cantidad_num": 1}', '127.0.0.1', '2026-11-02 10:20:00'),
  (5, 1, 'Dev Sintético Principal', 'LOGIN_EXITOSO', 'inv_usuarios', 1, NULL, NULL, '127.0.0.1', '2026-11-10 08:00:00');

-- 2.9 Levantamientos Físicos (En proceso, Finalizado, Cancelado + 1 Sintético)
INSERT INTO `inv_levantamientos` (
  `id`, `codigo_levantamiento`, `codigo`, `titulo`, `campamento_id`, `almacen_id`,
  `fecha_inicio`, `fecha_fin`, `responsable_levantamiento`, `equipo_auditor`,
  `estado`, `notas`, `total_articulos_capturados`, `consolidado_por`, `fecha_consolidacion`,
  `creado_por`, `es_sintetico`
) VALUES
  (1, 'LEV-2026-ALM-27FEB-001', 'LEV-27F-001', 'Auditoría Trimestral Sintética 27 de Febrero', 1, 1, '2026-11-01', NULL, 'Admin Sintético Operaciones', 'Auditor Sintético Control', 'En proceso', 'Sesión abierta con seriales repetidos y colisión con maestro para QA', 4, NULL, NULL, 2, 0),
  (2, 'LEV-2026-CAMP-OPL-002', 'LEV-OPL-002', 'Conteo Físico Consolidado Sintético OPL', 3, 2, '2026-10-15', '2026-10-20', 'Operador Sintético Almacén OPL', 'Auditor Sintético Control', 'Finalizado', 'Sesión inmutable finalizada para validar bloqueo SEC-10', 3, 2, '2026-10-20 16:00:00', 3, 0),
  (3, 'LEV-2026-CAMP-M633-003', 'LEV-M633-003', 'Levantamiento Cancelado Sintético Mantenimiento 633', 4, 3, '2026-10-22', '2026-10-25', 'Supervisor Sintético M633', 'Auditor Sintético Control', 'Cancelado', 'Sesión cancelada para verificar transición terminal y conteo KPI', 2, NULL, NULL, 4, 0),
  (4, 'LEV-2026-SYNTH-004', 'LEV-SYN-004', 'Levantamiento Aislado Sintético QA', 6, 4, '2026-11-05', NULL, 'QA Tester Sintético', 'Dev Sintético Principal', 'En proceso', 'Levantamiento marcado es_sintetico = 1', 1, NULL, NULL, 1, 1);

-- 2.10 Ítems de Levantamiento (seriales repetidos + estados Bueno, Regular, Dañado)
INSERT INTO `inv_levantamiento_items` (
  `id`, `levantamiento_id`, `codigo_original`, `area`, `categoria`, `articulo_nombre`,
  `marca`, `modelo_caracteristicas`, `serie_imei`, `cantidad`, `unidad_medida`,
  `estado_fisico`, `propietario`, `responsable_custodio`, `ubicacion_exacta`,
  `fecha_revision`, `observaciones`, `consolidado`, `articulo_maestro_id`,
  `estado_verificacion`, `es_sintetico`, `creado_por`
) VALUES
  -- Levantamiento 1 ('En proceso'): incluye colisión con maestro #23 y serial repetido dentro de la sesión
  (1, 1, 'INF-9023', 'INFORMATICA', 'Periféricos e Impresión', 'Impresora Multifunción Láser Sintética', 'PrintSim', 'M428 Dúplex', 'SN-SYNTH-INF-9023', 1.00, 'Unidad', 'Bueno', 'INGMELEC', 'Custodio Sintético Beta', 'Área Soporte', '2026-11-01', 'Serial existente en inv_articulos (#23) para probar conciliación', 0, NULL, 'VERIFICADO', 0, 2),
  (2, 1, 'HER-9101', 'ALMACEN', 'Equipos de Medición', 'Pinza Amperimétrica Sintética A', 'ClampSim', 'AC/DC 600A', 'SN-SYNTH-LEV-DUP01', 1.00, 'Unidad', 'Regular', 'INGMELEC', 'Custodio Sintético Alfa', 'Estante H-04', '2026-11-01', 'Primera aparición de serial repetido en misma sesión', 0, NULL, 'VERIFICADO', 0, 2),
  (3, 1, 'HER-9102', 'ALMACEN', 'Equipos de Medición', 'Pinza Amperimétrica Sintética B (Duplicado Sesión)', 'ClampSim', 'AC/DC 600A', 'SN-SYNTH-LEV-DUP01', 1.00, 'Unidad', 'Dañado', 'INGMELEC', 'Custodio Sintético Delta', 'Estante H-04', '2026-11-01', 'Segunda aparición del mismo serial SN-SYNTH-LEV-DUP01 en la sesión', 0, NULL, 'PENDIENTE_REVISION', 0, 2),
  (4, 1, 'MOB-9103', 'OFICINAS', 'Mobiliario Modular', 'Estación Trabajo Doble Sintética', 'MobiliSim', '160x80cm', 'SN-SYNTH-LEV-NEW01', 2.00, 'Unidad', 'Bueno', 'INGMELEC', 'Custodio Sintético Beta', 'Oficina Central', '2026-11-01', 'Ítem nuevo sin colisiones', 0, NULL, 'VERIFICADO', 0, 2),

  -- Levantamiento 2 ('Finalizado')
  (5, 2, 'INF-9007', 'INFORMATICA', 'Redes y Telecomunicaciones', 'Switch Rack 24 Puertos Sintético', 'NetSim', 'GS-24P PoE+', 'SN-SYNTH-INF-9007', 2.00, 'Unidad', 'Bueno', 'INGMELEC', 'Custodio Sintético Epsilon', 'Rack OPL-01', '2026-10-18', 'Consolidado y vinculado a maestro #7', 1, 7, 'VERIFICADO', 0, 3),
  (6, 2, 'MOB-9009', 'OFICINAS', 'Mobiliario Modular', 'Silla Ergonómica Malla Sintética', 'ErgoSim', 'Mesh-Pro', 'N/A', 6.00, 'Unidad', 'Regular', 'INGMELEC', 'Custodio Sintético Beta', 'Oficina OPL-2', '2026-10-18', 'Consolidado sin serial a maestro #9', 1, 9, 'VERIFICADO', 0, 3),
  (7, 2, 'COC-9010', 'COCINA', 'Electrodomésticos', 'Dispensador Agua Fría/Caliente Sintético', 'AquaSim', '2T Inox', 'SN-SYNTH-COC-9010', 1.00, 'Unidad', 'Dañado', 'INGMELEC', 'Custodio Sintético Gamma', 'Área Comedor OPL', '2026-10-19', 'Omitido durante consolidación (consolidado = 2)', 2, NULL, 'VERIFICADO', 0, 3),

  -- Levantamiento 3 ('Cancelado')
  (8, 3, 'HER-9012', 'ALMACEN', 'Herramienta Eléctrica', 'Soldadora Inverter 250A Sintética', 'WeldSim', 'Arc-250', 'SN-SYNTH-HER-9012', 2.00, 'Unidad', 'Regular', 'INGMELEC', 'Custodio Sintético Zeta', 'Taller Bahía 2', '2026-10-23', 'Capturado antes de cancelar sesión', 0, NULL, 'VERIFICADO', 0, 4),
  (9, 3, 'INF-9013', 'INFORMATICA', 'Equipos de Medición', 'Escáner Diagnóstico Vehicular Sintético', 'DiagSim', 'OBD-Pro', 'SN-SYNTH-INF-9013', 1.00, 'Unidad', 'Dañado', 'INGMELEC', 'Custodio Sintético Delta', 'Gabinete M633', '2026-10-23', 'Equipo dañado en sesión cancelada', 0, NULL, 'VERIFICADO', 0, 4),

  -- Levantamiento 4 ('En proceso', es_sintetico = 1)
  (10, 4, 'SYN-9026', 'ALMACEN', 'Categoría Pruebas Sintéticas', 'Equipo Prueba Aislada Sintético Alpha', 'MockDev', '100', 'SN-SYNTH-ONLY-9026', 5.00, 'Unidad', 'Bueno', 'INGMELEC', 'Custodio Sandbox Sintético', 'Zona Test A', '2026-11-05', '[REGISTRO SINTÉTICO QA] Ítem en levantamiento sintético', 0, 26, 'VERIFICADO', 1, 1);

-- 2.11 Alias Canónicos de Campamentos (Etapa 4 — C03 Sec. 6.1)
-- Nota: Preserva intactos los artículos históricos con campamento_id = NULL y SEDE_AMBIGUA
--       (KM 19 AUT DUARTE, KM19, KM 19, KM 19 AUTOPISTA DUARTE, ALMACEN KM 19 AUDITADO,
--       MANTENIMIENTO, MANTENIMIENTO M633) para vista previa y aprobación humana.
INSERT INTO `inv_campamento_alias` (
  `campamento_id`, `codigo_campamento`, `alias_original`, `alias_normalizado`,
  `estado_validacion`, `requiere_revision_historica`, `es_historico`, `notas`
) VALUES
  -- Sede id=1: ALMACÉN 27 DE FEBRERO (ALM-27FEB) — Directos
  (1, 'ALM-27FEB', 'ALMACÉN 27 DE FEBRERO', 'ALMACEN 27 DE FEBRERO', 'CONFIRMADO', 0, 0, 'Nombre canónico oficial de sede Almacén 27 de Febrero'),
  (1, 'ALM-27FEB', 'DISTRITO NACIONAL 27 DE FEBRERO', 'DISTRITO NACIONAL 27 DE FEBRERO', 'CONFIRMADO', 0, 1, 'Denominación histórica inequívoca de 27 de Febrero en Excel'),
  (1, 'ALM-27FEB', 'ALM-27FEB', 'ALM-27FEB', 'CONFIRMADO', 0, 0, 'Código canónico estable de sede Almacén 27 de Febrero'),
  (1, 'ALM-27FEB', 'DN-27FEB', 'DN-27FEB', 'CONFIRMADO', 0, 1, 'Código histórico previo de sede Almacén 27 de Febrero'),

  -- Sede id=3: OPL (CAMP-OPL) — Directos
  (3, 'CAMP-OPL', 'OPL', 'OPL', 'CONFIRMADO', 0, 0, 'Nombre canónico oficial de sede OPL'),
  (3, 'CAMP-OPL', 'KM 19 AUTOPISTA DUARTE OPL', 'KM 19 AUTOPISTA DUARTE OPL', 'CONFIRMADO', 0, 1, 'Denominación histórica inequívoca de OPL en Excel'),
  (3, 'CAMP-OPL', 'CAMP-OPL', 'CAMP-OPL', 'CONFIRMADO', 0, 0, 'Código canónico estable de sede OPL'),
  (3, 'CAMP-OPL', 'KM19-OPL', 'KM19-OPL', 'CONFIRMADO', 0, 1, 'Código histórico previo de sede OPL'),

  -- Sede id=3: OPL (CAMP-OPL) — Equivalencias indicadas por propietario (requiere_revision_historica = 1)
  (3, 'CAMP-OPL', 'KM 19 AUT DUARTE', 'KM 19 AUT DUARTE', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'),
  (3, 'CAMP-OPL', 'KM19', 'KM19', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'),
  (3, 'CAMP-OPL', 'KM 19', 'KM 19', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'),
  (3, 'CAMP-OPL', 'KM 19 AUTOPISTA DUARTE', 'KM 19 AUTOPISTA DUARTE', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'),

  -- Sede id=4: MANTENIMIENTO 633 (CAMP-M633) — Directos
  (4, 'CAMP-M633', 'MANTENIMIENTO 633', 'MANTENIMIENTO 633', 'CONFIRMADO', 0, 0, 'Nombre canónico oficial de sede Mantenimiento 633'),
  (4, 'CAMP-M633', 'CAMP-M633', 'CAMP-M633', 'CONFIRMADO', 0, 0, 'Código canónico estable de sede Mantenimiento 633'),
  (4, 'CAMP-M633', 'MANT-633', 'MANT-633', 'CONFIRMADO', 0, 1, 'Código histórico previo de sede Mantenimiento 633'),

  -- Sede id=4: MANTENIMIENTO 633 (CAMP-M633) — Equivalencias indicadas por propietario (requiere_revision_historica = 1)
  (4, 'CAMP-M633', 'MANTENIMIENTO', 'MANTENIMIENTO', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos'),
  (4, 'CAMP-M633', 'MANTENIMIENTO M633', 'MANTENIMIENTO M633', 'CONFIRMADO', 1, 1, 'Equivalencia indicada por propietario; requiere vista previa y aprobación antes de reasignar históricos');

-- =================================================================================
-- FIN DE FIXTURE SINTÉTICO AISLADO v2.1 (ingmelec_v21_test_isolated)
-- =================================================================================
