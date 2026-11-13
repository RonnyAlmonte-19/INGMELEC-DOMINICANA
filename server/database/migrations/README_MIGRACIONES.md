# GUÍA OFICIAL DE MIGRACIONES DE BASE DE DATOS (MySQL 8.0+ / MariaDB 10.11+)

**Proyecto:** INGMELEC | ALMACÉN GENERAL (`v2.0 -> v2.1`)  
**Hallazgo Relacionado:** `MED-06` (Coexistencia de 3 generaciones de migraciones y riesgos de reversión)  
**Estado Operativo en Producción (Clever Cloud):** Ninguna migración `v2.1` (`migration_03`) ha sido ejecutada en Clever Cloud.

---

## 1. Resumen Ejecutivo: Las 3 Generaciones en `server/database/migrations/`

En esta carpeta coexisten archivos históricos de desarrollo local (MariaDB), un script consolidado de transición y la ruta oficial diseñada para **MySQL 8.0 (Clever Cloud)** y **MariaDB 10.11 (local aislado)**:

| Generación | Archivo | Motor Objetivo | Clasificación | ¿Ejecutar en Clever Cloud MySQL 8.0? |
| :---: | :--- | :--- | :--- | :---: |
| **Gen 1** | `migration_catalogos_dinamicos.sql` | MariaDB / Mixto v1.x | **Legado / Obsoleto** | **NO** |
| **Gen 1** | `migration_usuarios_multi_almacen.sql` | MariaDB 10.x (`IF NOT EXISTS`) | **Legado / MariaDB-only** | **NO** (error SQL `1064`) |
| **Gen 1** | `migration_integridad_campamentos_sinteticos.sql` | MariaDB 10.x (`IF NOT EXISTS`) | **Legado / MariaDB-only** | **NO** (error SQL `1064`) |
| **Gen 2** | `migration_clever_cloud_produccion_aditiva.sql` | MySQL 8.0 (v2.0 consolidado) | **Duplicado Obsoleto** | **NO** (duplica `01` + `02`) |
| **Gen 3** | `migration_01_estructural_ddl_clever_cloud.sql` | MySQL 8.0 / MariaDB 10.11 | **Ruta Oficial — Paso 1 (DDL v2.0)** | **SÍ** (una sola vez sobre esquema base v1) |
| **Gen 3** | `migration_02_datos_homologacion_clever_cloud.sql` | MySQL 8.0 / MariaDB 10.11 | **Ruta Oficial — Paso 2 (DML v2.0)** | **SÍ** (tras Paso 1, bajo respaldo) |
| **Gen 3** | `migration_03_v21_seguridad_y_esquema.sql` | MySQL 8.0+ / MariaDB 10.11+ | **Ruta Oficial v2.1 — Paso 3 (Seguridad/Esquema)** | **SÍ** (tras Paso 2, bajo respaldo) |
| **Gen 3** | `migration_04_v21_campamentos_alias.sql` | MySQL 8.0+ / MariaDB 10.11+ | **Ruta Oficial v2.1 — Paso 4 (Alias y Sedes)** | **SÍ** (tras Paso 3, bajo respaldo) |
| **Gen 3** | `migration_05_v21_adapted.sql` | MySQL 8.0+ / MariaDB 10.11+ | **Ruta Oficial v2.1 — Paso 5 (RBAC Adaptado Seguro)** | **SÍ** (tras Paso 4, no altera usuarios) |
| **Gen 3** | `migration_06_v21_safe.sql` | MySQL 8.0+ / MariaDB 10.11+ | **Ruta Oficial v2.1 — Paso 6 (FKs e Índices Seguros)** | **SÍ** (tras Paso 5, conserva los 15 ítems) |
| **Desactivado** | `deprecated_migration_05_...sql.disabled` | N/A | **Desactivado por Seguridad** | **PROHIBIDO** (destructivo) |
| **Desactivado** | `deprecated_migration_06_...sql.disabled` | N/A | **Desactivado por Seguridad** | **PROHIBIDO** (destructivo) |
| **Reversión** | `rollback_clever_cloud_produccion.sql` | MySQL 8.0 (v2.0) | **Uso de Emergencia (Con Riesgos Conocidos)** | **PROHIBIDO sin snapshot previo** |

---

## 2. Ruta Oficial MySQL 8.0 (Orden Estricto de Ejecución)

La secuencia canónica de evolución de esquema parte del esquema base (`schema_almacen.sql` + `schema_levantamientos.sql`) y sigue **estrictamente** este orden:

### Paso 1 — `migration_01_estructural_ddl_clever_cloud.sql` (DDL v2.0)
- **Propósito:** Crea las 4 tablas nuevas (`inv_categorias`, `inv_custodios`, `inv_usuario_campamentos`, `inv_usuario_almacenes`) y añade de forma puramente estructural (0 `INSERT`, 0 `UPDATE`, 0 `DELETE`) las columnas e índices base de multi-sede, trazabilidad y control de acceso v2.0 (`es_developer`, `permisos_json`, `clasificacion_sede`, `campamento_id`, `almacen_id`, `estado_cantidad`, `es_sintetico`, `origen_datos`, `estado_vinculacion_sede`, etc.).
- **Limitación conocida (`MED-06`):** Sus sentencias `ALTER TABLE ... ADD COLUMN` y `CREATE INDEX` **no validan `information_schema`** (MySQL 8.0 no soporta `ADD COLUMN IF NOT EXISTS`), por lo que está pensado para ejecutarse **una sola vez** sobre el esquema v1.x previo a v2.0.

### Paso 2 — `migration_02_datos_homologacion_clever_cloud.sql` (DML v2.0)
- **Precondición:** Haber completado el Paso 1 (`migration_01`).
- **Propósito:** Ejecuta el procedimiento transaccional `sp_ejecutar_migracion_02_homologacion()` protegido con `DECLARE EXIT HANDLER FOR SQLEXCEPTION` (`ROLLBACK` automático ante fallo) y aserciones pre-`COMMIT`:
  1. Homologa sin duplicar las 3 sedes confirmadas por Gerencia: `ALMACÉN 27 DE FEBRERO` (`ALM-27FEB`), `OPL` (`CAMP-OPL`) y `MANTENIMIENTO 633` (`CAMP-M633`) con sus almacenes principales.
  2. Clasifica `origen_datos` (`HISTORICO_EXCEL` vs `OPERATIVO_REAL`) y `estado_cantidad` preservando `cantidad_num = NULL` sin inventar ceros ni unos.
  3. Vincula `campamento_id` solo cuando la ubicación es inequívoca y mantiene explícitamente `campamento_id = NULL` (`estado_vinculacion_sede = 'SEDE_AMBIGUA'`) para `KM 19 AUT DUARTE` y `ALMACEN KM 19 AUDITADO`.
  4. Puebla `inv_categorias` e `inv_custodios` (`INSERT IGNORE`) y asigna `permisos_json` base manteniendo `es_developer = 0` en cuentas existentes.
  5. Verifica pre-`COMMIT` que `total_articulos >= 434`, `total_unidades >= 1964.00` y que las 3 sedes confirmadas existan activas (`DROP PROCEDURE` al finalizar).

### Paso 3 — `migration_03_v21_seguridad_y_esquema.sql` *(Propuesta Futura v2.1 — Local / No Ejecutada en Clever Cloud)*
- **Precondición:** Esquema con Paso 1 (`migration_01`) y Paso 2 (`migration_02`) aplicados (o equivalente).
- **Tecnología MySQL 8.0+ / MariaDB 10.11+:** 100% idempotente y re-ejecutable mediante consultas a `information_schema.COLUMNS` + SQL dinámico (`PREPARE / EXECUTE / DEALLOCATE PREPARE`), con `SET NAMES utf8mb4` para preservar acentos UTF-8.
- **Cambios cubiertos (`CRIT-06` y `CRIT-02`):**
  - `inv_usuarios`: añade `token_version INT NOT NULL DEFAULT 1 AFTER es_developer` para revocación inmediata de JWT.
  - `inv_almacenes`: añade `estado_verificacion ENUM('CONFIRMADO','PENDIENTE_VALIDACION','SINTETICO_PRUEBA') NOT NULL DEFAULT 'CONFIRMADO'` y `origen_registro VARCHAR(100) NOT NULL DEFAULT 'SISTEMA_INICIAL'`.
  - `inv_campamentos`: amplía `clasificacion_sede` para incluir `'PENDIENTE_VALIDACION'` junto a `'CONFIRMADO','PROPUESTO','SINTETICO_PRUEBA','HISTORICO_NO_HOMOLOGADO','DUPLICADO_EQUIVALENTE'`.
  - `inv_custodios`: añade `departamento VARCHAR(100) NULL` y `telefono VARCHAR(50) NULL`.
  - `inv_articulos`: amplía `area` a `ENUM('INFORMATICA','OFICINAS','COCINA','ALMACEN','OTRA') NOT NULL DEFAULT 'ALMACEN'`, amplía `estado_vinculacion_sede` a `ENUM('CONFIRMADO','PROPUESTO','SEDE_AMBIGUA','SIN_SEDE','SIN_VINCULAR') NOT NULL DEFAULT 'CONFIRMADO'`, y asegura `cantidad_num DECIMAL(12,2) NULL DEFAULT NULL`.
  - `inv_levantamientos`: asegura `estado ENUM('En preparación','En proceso','Pendiente de revisión','Finalizado','Cancelado') NOT NULL DEFAULT 'En preparación'` (normalizando `NULL` previos solo si la columna era nullable).
- **Verificación y Rollback:** Incluye al pie consultas de solo lectura sobre `information_schema.COLUMNS` y un plan de reversión seguro no destructivo condicionado a `COUNT(*) = 0` de los nuevos valores antes de contraer cualquier `ENUM`.

---

## 3. Archivos Legados y Duplicados (PROHIBIDO Ejecutar en Clever Cloud MySQL 8.0)

Los siguientes 4 archivos se conservan únicamente como referencia histórica de auditoría y **NO deben ejecutarse en producción ni en nuevos despliegues**:

1. **`migration_clever_cloud_produccion_aditiva.sql`** *(Gen 2 — Duplicado Consolidado)*
   - **Motivo de exclusión:** Fusiona en un único archivo el contenido de `migration_01` y `migration_02`. Carece de verificaciones `information_schema` en su bloque DDL, mezcla DDL no transaccional con DML y es redundante respecto a la ruta oficial separada `migration_01` -> `migration_02`.
2. **`migration_catalogos_dinamicos.sql`** *(Gen 1 — Legado)*
   - **Motivo de exclusión:** Versión inicial previa a la homologación v2.0. Crea `inv_categorias` e `inv_custodios` con nombres de llaves únicas divergentes (`uq_area_nombre`, `uq_custodio_nombre`), omite `es_sintetico` e inserta semillas fijas de custodios y categorías.
3. **`migration_integridad_campamentos_sinteticos.sql`** *(Gen 1 — MariaDB-only)*
   - **Motivo de exclusión:** Utiliza sintaxis exclusiva de MariaDB (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` y `CREATE INDEX IF NOT EXISTS`) que **falla con error de sintaxis en MySQL 8.0**. Además define conjuntos `ENUM` incompatibles (`clasificacion_sede` sin `'PROPUESTO'` ni `'HISTORICO_NO_HOMOLOGADO'`; `estado_vinculacion_sede` con `'ALMACEN_CONFIRMADO'`, `'PENDIENTE_ASIGNACION'`, `'SINTETICO'`) y añade columnas no oficiales (`inv_usuarios.es_sintetico`, `inv_levantamientos.origen_registro`).
4. **`migration_usuarios_multi_almacen.sql`** *(Gen 1 — MariaDB-only)*
   - **Motivo de exclusión:** Utiliza sintaxis exclusiva de MariaDB (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), añade `inv_usuarios.bloqueado_hasta` (fuera del esquema oficial) y crea tablas puente con nombres de columnas/índices distintos (`creado_en`, `uq_usuario_*`) a los de `migration_01` (`asignado_en`, `uk_usuario_*`).

---

## 4. Estado y Advertencias Críticas sobre `rollback_clever_cloud_produccion.sql`

El archivo `rollback_clever_cloud_produccion.sql` fue redactado para revertir `migration_01` + `migration_02` al respaldo v1.x del 4 de noviembre de 2026, pero presenta **riesgos documentados (`MED-06`)** que serán corregidos en la **Etapa 6**:

1. **IDs fijos en Nivel 1 (`WHERE id IN (1, 3, 4)`):** Sobrescribe `codigo`, `nombre` y `clasificacion_sede` asumiendo IDs fijos `1, 3, 4` en `inv_campamentos` en lugar de identificar sedes por `codigo` (`ALM-27FEB`, `CAMP-OPL`, `CAMP-M633`).
2. **Sin `EXIT HANDLER` en Nivel 1:** Ejecuta `START TRANSACTION ... COMMIT` sin `DECLARE EXIT HANDLER FOR SQLEXCEPTION` (a diferencia de `migration_02`).
3. **Limpieza global de usuarios por `rol`:** Restablece `permisos_json = NULL` y `es_developer = 0` en todas las filas con `rol IN ('admin','almacen','supervisor','auditor','gerencia')`, afectando también cuentas creadas con posterioridad a la migración.
4. **Riesgo destructivo en Nivel 2 (`DROP TABLE` / `DROP COLUMN`):** Elimina las tablas `inv_usuario_*`, `inv_custodios`, `inv_categorias` y columnas como `campamento_id` y `almacen_id` de `inv_articulos`, destruyendo vinculaciones territoriales de artículos nuevos (`id > 434`) y dejando la BD incompatible con el código backend `v2.0` / `v2.1`.
5. **No cubre cambios de `migration_03` (`v2.1`):** Para revertir cambios de Etapa 2/3, debe utilizarse exclusivamente el plan de reversión no destructivo documentado al pie de `migration_03_v21_seguridad_y_esquema.sql` tras verificar respaldo completo y reversión previa del código servidor.

---

## 5. Política Operativa y Seguridad

1. **Prohibición absoluta de ejecución directa sin respaldo:** Ningún script en `server/database/migrations/` debe ejecutarse sobre Clever Cloud sin snapshot verificado previo y autorización explícita del responsable técnico.
2. **Validación previa en entorno aislado:** Toda modificación DDL/DML debe probarse primero en la instancia local aislada (`127.0.0.1:3310`, base `ingmelec_v21_test_isolated`) validando sintaxis, idempotencia (mínimo 2 ejecuciones consecutivas sin errores) y preservación de datos.
3. **Control futuro (`schema_migrations`):** La incorporación de una tabla formal de historial de migraciones (`schema_migrations`) y la remediación final de `rollback_clever_cloud_produccion.sql` forman parte del plan de consolidación de Etapa 6.
