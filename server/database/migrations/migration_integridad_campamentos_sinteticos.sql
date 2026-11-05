-- ==============================================================================
-- MIGRACIÓN: INTEGRIDAD DE CAMPAMENTOS, CONCILIACIÓN DE SEDES Y SEPARACIÓN DE SINTÉTICOS
-- PROYECTO: INGMELEC | ALMACÉN GENERAL
-- ==============================================================================

-- 1. Clasificación estructurada en inv_campamentos
ALTER TABLE inv_campamentos
  ADD COLUMN IF NOT EXISTS clasificacion_sede ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'SINTETICO_PRUEBA', 'DUPLICADO_EQUIVALENTE') NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(100) DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS ubicacion_historica_equivalente VARCHAR(150) DEFAULT NULL;

-- 2. Clasificación estructurada en inv_almacenes
ALTER TABLE inv_almacenes
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado_verificacion ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
  ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(100) DEFAULT 'MANUAL';

-- 3. Clasificación estructurada en inv_articulos y soporte de cantidad_num NULL (Tarea 6: no inventar 0 ni 1)
ALTER TABLE inv_articulos
  MODIFY COLUMN cantidad_num DECIMAL(12,2) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origen_datos ENUM('HISTORICO_EXCEL', 'OPERATIVO_REAL', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'OPERATIVO_REAL',
  ADD COLUMN IF NOT EXISTS estado_vinculacion_sede ENUM('CONFIRMADO', 'ALMACEN_CONFIRMADO', 'UBICACION_HISTORICA_COMPATIBLE', 'SEDE_AMBIGUA', 'PENDIENTE_ASIGNACION', 'SINTETICO') NOT NULL DEFAULT 'PENDIENTE_ASIGNACION';

CREATE INDEX IF NOT EXISTS idx_articulos_sintetico ON inv_articulos (es_sintetico);
CREATE INDEX IF NOT EXISTS idx_articulos_vinculacion ON inv_articulos (estado_vinculacion_sede);

-- 4. Separación estructurada de datos sintéticos en tablas operativas y catálogos
ALTER TABLE inv_levantamientos
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(100) DEFAULT 'MANUAL';

ALTER TABLE inv_levantamiento_items
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE inv_movimientos
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE inv_custodios
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE inv_categorias
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE inv_usuarios
  ADD COLUMN IF NOT EXISTS es_sintetico TINYINT(1) NOT NULL DEFAULT 0;
