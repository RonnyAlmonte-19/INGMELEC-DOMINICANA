-- ==============================================================================
-- INGMELEC | ALMACÉN GENERAL — PLAN DE MIGRACIÓN ADITIVA PARA CLEVER CLOUD (MYSQL 8)
-- Fecha: Noviembre 2026
-- Regla Absoluta: 100 % ADITIVA. Prohibido borrar, truncar o sobrescribir
--                 los 434 artículos reales de producción en inv_articulos.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- FASE 1: CREACIÓN DE TABLAS NUEVAS (SI NO EXISTEN)
-- ------------------------------------------------------------------------------

-- 1.1 Catálogo Dinámico de Categorías por Área
CREATE TABLE IF NOT EXISTS inv_categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  area VARCHAR(50) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  activo TINYINT DEFAULT 1,
  es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_area_nombre (area, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.2 Catálogo Dinámico de Custodios y Responsables
CREATE TABLE IF NOT EXISTS inv_custodios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  cargo VARCHAR(100) NULL,
  departamento VARCHAR(100) NULL,
  telefono VARCHAR(50) NULL,
  activo TINYINT DEFAULT 1,
  es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_custodio_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.3 Tabla de Campamentos / Sedes Independientes
CREATE TABLE IF NOT EXISTS inv_campamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  codigo VARCHAR(50) DEFAULT NULL,
  provincia VARCHAR(100) DEFAULT NULL,
  direccion VARCHAR(255) DEFAULT NULL,
  responsable VARCHAR(150) DEFAULT NULL,
  telefono VARCHAR(50) DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  clasificacion_sede ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'SINTETICO_PRUEBA', 'DUPLICADO_EQUIVALENTE') NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
  es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  origen_registro VARCHAR(100) DEFAULT 'MANUAL',
  ubicacion_historica_equivalente VARCHAR(150) DEFAULT NULL,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_camp_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.4 Tabla de Almacenes / Bodegas Internas por Campamento
CREATE TABLE IF NOT EXISTS inv_almacenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campamento_id INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  codigo VARCHAR(50) DEFAULT NULL,
  tipo VARCHAR(80) DEFAULT 'General',
  encargado VARCHAR(150) DEFAULT NULL,
  descripcion TEXT DEFAULT NULL,
  activo TINYINT(1) DEFAULT 1,
  es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  estado_verificacion ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
  origen_registro VARCHAR(100) DEFAULT 'MANUAL',
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campamento_id) REFERENCES inv_campamentos(id) ON DELETE CASCADE,
  INDEX idx_alm_camp (campamento_id),
  INDEX idx_alm_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.5 Relación Muchos-a-Muchos: Usuarios <-> Campamentos Autorizados
CREATE TABLE IF NOT EXISTS inv_usuario_campamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  campamento_id INT NOT NULL,
  es_principal TINYINT(1) DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_campamento (usuario_id, campamento_id),
  INDEX idx_uc_usuario (usuario_id),
  INDEX idx_uc_campamento (campamento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.6 Relación Muchos-a-Muchos: Usuarios <-> Almacenes Autorizados
CREATE TABLE IF NOT EXISTS inv_usuario_almacenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  almacen_id INT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_almacen (usuario_id, almacen_id),
  INDEX idx_ua_usuario (usuario_id),
  INDEX idx_ua_almacen (almacen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.7 Tabla de Sesiones de Levantamiento Físico
CREATE TABLE IF NOT EXISTS inv_levantamientos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_levantamiento VARCHAR(60) UNIQUE NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  campamento_id INT NOT NULL,
  almacen_id INT DEFAULT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE DEFAULT NULL,
  responsable_levantamiento VARCHAR(150) NOT NULL,
  equipo_auditor VARCHAR(255) DEFAULT NULL,
  estado ENUM('En preparación', 'En proceso', 'Pendiente de revisión', 'Finalizado') DEFAULT 'En proceso',
  notas TEXT DEFAULT NULL,
  total_articulos_capturados INT DEFAULT 0,
  consolidado_por INT DEFAULT NULL,
  fecha_consolidacion DATETIME DEFAULT NULL,
  creado_por INT NOT NULL,
  es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  origen_registro VARCHAR(100) DEFAULT 'MANUAL',
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (campamento_id) REFERENCES inv_campamentos(id) ON DELETE RESTRICT,
  INDEX idx_lev_codigo (codigo_levantamiento),
  INDEX idx_lev_estado (estado),
  INDEX idx_lev_camp (campamento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1.8 Tabla de Ítems Capturados en Levantamientos Físicos
CREATE TABLE IF NOT EXISTS inv_levantamiento_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  levantamiento_id INT NOT NULL,
  codigo_original VARCHAR(100) DEFAULT NULL,
  area ENUM('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN', 'OTRA') NOT NULL DEFAULT 'ALMACEN',
  categoria VARCHAR(100) NOT NULL,
  articulo_nombre VARCHAR(255) NOT NULL,
  marca VARCHAR(150) DEFAULT NULL,
  modelo_caracteristicas VARCHAR(255) DEFAULT NULL,
  serie_imei VARCHAR(150) DEFAULT NULL,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  unidad_medida VARCHAR(50) DEFAULT 'Unidad',
  estado_fisico ENUM('Bueno', 'Regular', 'Dañado', 'Fuera de servicio', 'Pendiente de verificación') NOT NULL DEFAULT 'Bueno',
  propietario VARCHAR(100) DEFAULT 'INGMELEC',
  responsable_custodio VARCHAR(150) DEFAULT NULL,
  ubicacion_exacta VARCHAR(150) DEFAULT NULL,
  fecha_revision DATE DEFAULT NULL,
  observaciones TEXT DEFAULT NULL,
  evidencia_foto MEDIUMTEXT DEFAULT NULL,
  consolidado TINYINT(1) DEFAULT 0,
  articulo_maestro_id INT DEFAULT NULL,
  creado_por INT DEFAULT NULL,
  es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  fecha_captura DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (levantamiento_id) REFERENCES inv_levantamientos(id) ON DELETE CASCADE,
  INDEX idx_item_lev (levantamiento_id),
  INDEX idx_item_area (area),
  INDEX idx_item_serie (serie_imei),
  INDEX idx_item_codigo (codigo_original)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- FASE 2: ALTERACIONES ADITIVAS DE COLUMNAS EN TABLAS PREEXISTENTES
-- ------------------------------------------------------------------------------

-- 2.1 Ampliar inv_usuarios para soportar rol 'developer', permisos_json y campamento_id
ALTER TABLE inv_usuarios MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'almacen';
ALTER TABLE inv_usuarios ADD COLUMN campamento_id INT NULL;
ALTER TABLE inv_usuarios ADD COLUMN almacen_id INT NULL;
ALTER TABLE inv_usuarios ADD COLUMN permisos_json JSON NULL;
ALTER TABLE inv_usuarios ADD COLUMN es_developer TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_usuarios ADD COLUMN bloqueado_hasta DATETIME NULL;

-- 2.2 Ampliar inv_campamentos e inv_almacenes si ya existían de la Fase 1
ALTER TABLE inv_campamentos ADD COLUMN clasificacion_sede ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'SINTETICO_PRUEBA', 'DUPLICADO_EQUIVALENTE') NOT NULL DEFAULT 'PENDIENTE_VALIDACION';
ALTER TABLE inv_campamentos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_campamentos ADD COLUMN origen_registro VARCHAR(100) DEFAULT 'MANUAL';
ALTER TABLE inv_campamentos ADD COLUMN ubicacion_historica_equivalente VARCHAR(150) DEFAULT NULL;

ALTER TABLE inv_almacenes ADD COLUMN codigo VARCHAR(50) DEFAULT NULL;
ALTER TABLE inv_almacenes ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_almacenes ADD COLUMN estado_verificacion ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'PENDIENTE_VALIDACION';
ALTER TABLE inv_almacenes ADD COLUMN origen_registro VARCHAR(100) DEFAULT 'MANUAL';

-- 2.3 Ampliar inv_articulos (conservando intactos los 434 registros productivos)
ALTER TABLE inv_articulos MODIFY COLUMN cantidad_num DECIMAL(12,2) NULL DEFAULT NULL;
ALTER TABLE inv_articulos ADD COLUMN campamento_id INT NULL;
ALTER TABLE inv_articulos ADD COLUMN almacen_id INT NULL;
ALTER TABLE inv_articulos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_articulos ADD COLUMN origen_datos ENUM('HISTORICO_EXCEL', 'OPERATIVO_REAL', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'HISTORICO_EXCEL';
ALTER TABLE inv_articulos ADD COLUMN estado_vinculacion_sede ENUM('CONFIRMADO', 'ALMACEN_CONFIRMADO', 'UBICACION_HISTORICA_COMPATIBLE', 'SEDE_AMBIGUA', 'PENDIENTE_ASIGNACION', 'SINTETICO') NOT NULL DEFAULT 'PENDIENTE_ASIGNACION';

CREATE INDEX idx_articulos_campamento ON inv_articulos (campamento_id);
CREATE INDEX idx_articulos_sintetico ON inv_articulos (es_sintetico);
CREATE INDEX idx_articulos_vinculacion ON inv_articulos (estado_vinculacion_sede);

-- 2.4 Ampliar tablas operativas restantes con es_sintetico
ALTER TABLE inv_levantamientos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_levantamientos ADD COLUMN origen_registro VARCHAR(100) DEFAULT 'MANUAL';
ALTER TABLE inv_levantamiento_items ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_movimientos ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_custodios ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE inv_categorias ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

-- ------------------------------------------------------------------------------
-- FASE 3: CONFIGURACIÓN DE LOS 3 CAMPAMENTOS INDEPENDIENTES CONFIRMADOS
-- ------------------------------------------------------------------------------

-- 3.1 Homologar ALMACÉN 27 DE FEBRERO (ID 3 en Clever Cloud)
UPDATE inv_campamentos
SET nombre = 'ALMACÉN 27 DE FEBRERO',
    codigo = 'ALM-27FEB',
    provincia = 'Distrito Nacional',
    direccion = 'AV. 27 DE FEBRERO, DISTRITO NACIONAL',
    clasificacion_sede = 'CONFIRMADO',
    es_sintetico = 0,
    origen_registro = 'CONFIRMADO_GERENCIA',
    ubicacion_historica_equivalente = 'DISTRITO NACIONAL 27 DE FEBRERO',
    activo = 1
WHERE id = 3 OR codigo = 'ALM-27FEB';

-- 3.2 Crear / actualizar sede independiente OPL
INSERT INTO inv_campamentos (nombre, codigo, provincia, direccion, responsable, activo, clasificacion_sede, es_sintetico, origen_registro, ubicacion_historica_equivalente)
VALUES ('OPL', 'CAMP-OPL', 'Santo Domingo Oeste', 'KM 19 AUTOPISTA DUARTE', 'JONATHAN HERNANDEZ', 1, 'CONFIRMADO', 0, 'CONFIRMADO_GERENCIA', 'KM 19 AUTOPISTA DUARTE OPL')
ON DUPLICATE KEY UPDATE
  codigo = 'CAMP-OPL',
  clasificacion_sede = 'CONFIRMADO',
  es_sintetico = 0,
  ubicacion_historica_equivalente = 'KM 19 AUTOPISTA DUARTE OPL',
  activo = 1;

-- 3.3 Crear / actualizar sede independiente MANTENIMIENTO 633
INSERT INTO inv_campamentos (nombre, codigo, provincia, direccion, responsable, activo, clasificacion_sede, es_sintetico, origen_registro, ubicacion_historica_equivalente)
VALUES ('MANTENIMIENTO 633', 'MANT-633', 'Santo Domingo', 'MANTENIMIENTO 633', 'WILLIAM ALMANZAR', 1, 'CONFIRMADO', 0, 'CONFIRMADO_GERENCIA', 'MANTENIMIENTO 633')
ON DUPLICATE KEY UPDATE
  codigo = 'MANT-633',
  clasificacion_sede = 'CONFIRMADO',
  es_sintetico = 0,
  ubicacion_historica_equivalente = 'MANTENIMIENTO 633',
  activo = 1;

-- 3.4 Marcar San Cristóbal, Azua y Pedernales como PENDIENTE_VALIDACION
UPDATE inv_campamentos
SET clasificacion_sede = 'PENDIENTE_VALIDACION', es_sintetico = 0
WHERE codigo IN ('CAMP-SC', 'CAMP-AZUA', 'CAMP-AZ', 'CAMP-PED') OR nombre IN ('San Cristóbal', 'Campamento San Cristóbal', 'Azua', 'Campamento Azua', 'Pedernales', 'Campamento Pedernales');

-- 3.5 Si existe el registro agrupado antiguo 'Campamento Base Central KM 19' (CAMP-KM19), marcarlo como DUPLICADO_EQUIVALENTE e inactivo
UPDATE inv_campamentos
SET clasificacion_sede = 'DUPLICADO_EQUIVALENTE', activo = 0
WHERE codigo = 'CAMP-KM19' OR nombre LIKE '%Base Central KM 19%';

-- ------------------------------------------------------------------------------
-- FASE 4: VINCULACIÓN NO DESTRUCTIVA DE ARTÍCULOS CON SEDES CONFIRMADAS
-- (Respeta códigos, cantidades y ubicaciones históricas; NO borra ningún artículo)
-- ------------------------------------------------------------------------------

-- 4.1 Aislar cualquier registro sintético de prueba (ej. COC-001 de test-fase2-integrity.js)
UPDATE inv_articulos
SET es_sintetico = 1,
    origen_datos = 'SINTETICO_PRUEBA',
    estado_vinculacion_sede = 'SINTETICO'
WHERE (area = 'COCINA' AND codigo_original IN ('COC-001', 'COC-002'))
   OR observaciones LIKE '%[REGISTRO SINTÉTICO%'
   OR articulo_nombre LIKE '%E2E-%';

-- 4.2 Vincular artículos de DISTRITO NACIONAL 27 DE FEBRERO -> ALMACÉN 27 DE FEBRERO
UPDATE inv_articulos a
JOIN inv_campamentos c ON c.codigo = 'ALM-27FEB'
SET a.campamento_id = c.id,
    a.estado_vinculacion_sede = 'UBICACION_HISTORICA_COMPATIBLE'
WHERE a.es_sintetico = 0
  AND UPPER(TRIM(a.ubicacion_nombre)) = 'DISTRITO NACIONAL 27 DE FEBRERO';

-- 4.3 Vincular artículos de KM 19 AUTOPISTA DUARTE OPL -> OPL
UPDATE inv_articulos a
JOIN inv_campamentos c ON c.codigo = 'CAMP-OPL'
SET a.campamento_id = c.id,
    a.estado_vinculacion_sede = 'UBICACION_HISTORICA_COMPATIBLE'
WHERE a.es_sintetico = 0
  AND UPPER(TRIM(a.ubicacion_nombre)) = 'KM 19 AUTOPISTA DUARTE OPL';

-- 4.4 Vincular artículos de MANTENIMIENTO 633 -> MANTENIMIENTO 633
UPDATE inv_articulos a
JOIN inv_campamentos c ON c.codigo = 'MANT-633'
SET a.campamento_id = c.id,
    a.estado_vinculacion_sede = 'UBICACION_HISTORICA_COMPATIBLE'
WHERE a.es_sintetico = 0
  AND UPPER(TRIM(a.ubicacion_nombre)) = 'MANTENIMIENTO 633';

-- 4.5 Mantener los 104 artículos de KM 19 AUT DUARTE como SEDE_AMBIGUA (campamento_id = NULL)
UPDATE inv_articulos
SET campamento_id = NULL,
    almacen_id = NULL,
    estado_vinculacion_sede = 'SEDE_AMBIGUA'
WHERE es_sintetico = 0
  AND UPPER(TRIM(ubicacion_nombre)) = 'KM 19 AUT DUARTE';

-- 4.6 Poblar catálogos dinámicos desde los registros reales existentes
INSERT IGNORE INTO inv_categorias (area, nombre, activo, es_sintetico)
SELECT DISTINCT UPPER(TRIM(area)), TRIM(categoria), 1, 0
FROM inv_articulos
WHERE activo = 1 AND es_sintetico = 0 AND categoria IS NOT NULL AND TRIM(categoria) <> '';

INSERT IGNORE INTO inv_custodios (nombre, activo, es_sintetico)
SELECT DISTINCT TRIM(asignado_a), 1, 0
FROM inv_articulos
WHERE activo = 1 AND es_sintetico = 0 AND asignado_a IS NOT NULL AND TRIM(asignado_a) <> '';
