# REVISIÓN FINAL DE COMPATIBILIDAD Y AUDITORÍA DE MIGRACIÓN PARA CLEVER CLOUD

**Proyecto:** INGMELEC | ALMACÉN GENERAL (`v2.0.0`)
**Rama Activa:** `feature/almacen-general-v2` (`C:\Users\gener\OneDrive\Desktop\INGMELEC-GITHUB\INGMELEC-DOMINICANA`)
**Base de Datos Destino (No ejecutada):** MySQL 8.0 Clever Cloud (`bkwlgxt1ccjstm5cfoy5`)
**Respaldo de Referencia:** Respaldo SQL empresarial del 4 de noviembre de 2026 (`434` artículos productivos, `5` usuarios, `5` campamentos, `5` almacenes)
**Estado de Ejecución en Clever Cloud:** **NO EJECUTADA** (Revisión estática y corrección preventiva en el repositorio local)

---

## 1. RESUMEN EJECUTIVO Y DICTAMEN DEL AUDITOR

Se revisó línea por línea el archivo original `server/database/migrations/migration_clever_cloud_produccion_aditiva.sql` contrastándolo con la estructura real de Clever Cloud (`schema_almacen.sql` + `schema_levantamientos.sql`) y los **434 artículos productivos** (`414` históricos del Excel del 16/10/2026 + `20` artículos reales registrados el 03/11/2026: `INF-090` y `ALM-HER-002`..`ALM-HER-020`).

### Hallazgos Críticos Detectados y Corregidos antes de Producción:
1. **`[BLOQUEADA -> CORREGIDA]` Duplicidad de columna `es_sintetico` en `inv_categorias` e `inv_custodios` (Líneas 196–197 del borrador original):**
   - En la Fase 1 (`CREATE TABLE IF NOT EXISTS inv_categorias` e `inv_custodios`), ambas tablas nuevas **ya incluían** la columna `es_sintetico TINYINT(1) NOT NULL DEFAULT 0`.
   - En la Fase 2.4 (líneas 196–197), el script ejecutaba nuevamente `ALTER TABLE inv_custodios ADD COLUMN es_sintetico` y `ALTER TABLE inv_categorias ADD COLUMN es_sintetico`. En MySQL 8.0 esto abortaría la ejecución con **`Error 1060 (42S21): Duplicate column name 'es_sintetico'`**.
   - **Acción aplicada:** Eliminadas las 2 líneas redundantes.
2. **`[BLOQUEADA -> ELIMINADA]` Regla peligrosa sobre `COC-001` y `COC-002` (Líneas 252–258 del borrador original):**
   - El borrador original incluía `UPDATE inv_articulos SET es_sintetico = 1 ... WHERE (area = 'COCINA' AND codigo_original IN ('COC-001', 'COC-002'))`.
   - En Clever Cloud el área `COCINA` tiene actualmente **0 artículos** (los registros sintéticos `COC-001` y `COC-002` únicamente existieron en MariaDB local `:3308`). Si en producción un usuario registra el primer activo real de cocina mediante el generador secuencial (`GET /api/v2/articulos/next-code?area=COCINA`), el sistema le asignará legítimamente el código `COC-001`. Ejecutar esa cláusula en producción ocultaría activos reales de cocina.
   - **Acción aplicada:** Eliminada por completo esa condición de los scripts de Clever Cloud.
3. **`[REQUIERE REVISIÓN -> CORREGIDA]` Uso de `WHERE id = 3` en `inv_campamentos` (Línea 214 del borrador original):**
   - El borrador original actualizaba `ALMACÉN 27 DE FEBRERO` usando `WHERE id = 3 OR codigo = 'ALM-27FEB'`. En Clever Cloud existen 5 campamentos iniciales cuyos `id` dependen del orden de auto-incremento; usar un `id = 3` fijo podría sobrescribir otro campamento si el ID 3 no correspondiera a 27 de Febrero.
   - **Acción aplicada:** Reemplazado por coincidencia estricta de código/nombre (`WHERE codigo = 'ALM-27FEB' OR UPPER(TRIM(nombre)) IN ('ALMACÉN 27 DE FEBRERO', 'ALMACEN 27 DE FEBRERO', 'DISTRITO NACIONAL 27 DE FEBRERO')`), más un `INSERT ... WHERE NOT EXISTS` si aún no existiera.
4. **`[REQUIERE REVISIÓN -> CORREGIDA]` Valor por defecto de `origen_datos` y distinción de los 20 artículos del 3 de noviembre de 2026:**
   - El borrador original definía `DEFAULT 'HISTORICO_EXCEL'` en `origen_datos`, lo que etiquetaría erróneamente como históricos tanto a los **20 artículos reales creados el 3 de noviembre de 2026** (`INF-090` y `ALM-HER-002`..`ALM-HER-020`, cuyo `hoja_origen` es `CREADO_MANUAL_...`) como a los futuros artículos creados por formulario.
   - **Acción aplicada:** Se cambió el `DEFAULT` de la columna a `'OPERATIVO_REAL'` y en la fase DML se marcan como `'HISTORICO_EXCEL'` únicamente los `414` artículos donde `hoja_origen IN ('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN')`, preservando los `20` artículos del 3 de noviembre como `'OPERATIVO_REAL'`.

---

## 2. INVENTARIO DE TABLAS Y COLUMNAS EN CLEVER CLOUD (OBJETIVO 2)

### 2.1 Tablas que YA existen en el respaldo de Clever Cloud (9 tablas)

| Tabla en Clever Cloud | Filas Actuales | Columnas que YA existen en Clever Cloud | Columnas NUEVAS a añadir en `migration_01_estructural_ddl_clever_cloud.sql` |
| :--- | :---: | :--- | :--- |
| `inv_articulos` | **434** (`414` Excel + `20` reales Nov-3) | `id`, `codigo_original`, `codigo_sistema`, `area`, `categoria`, `articulo_nombre`, `marca`, `modelo_caracteristicas`, `serie_imei`, `cantidad_num`, `cantidad_texto`, `unidad_medida`, `estado_fisico`, `ubicacion_nombre`, `departamento`, `zona_estante`, `propietario`, `asignado_a`, `fecha_revision`, `observaciones`, `hoja_origen`, `fila_origen`, `activo`, `creado_en`, `actualizado_en` | `campamento_id` (`INT NULL`), `almacen_id` (`INT NULL`), `cantidad_verificada` (`TINYINT(1) DEFAULT 1`), `estado_cantidad` (`ENUM`), `es_sintetico` (`TINYINT(1) DEFAULT 0`), `origen_datos` (`ENUM DEFAULT 'OPERATIVO_REAL'`) |
| `inv_usuarios` | **5** (`admin`, `almacen`, `supervisor`, `gerencia`, `auditor`) | `id`, `nombre`, `email`, `password_hash`, `rol` (`ENUM`), `area`, `activo`, `ultimo_acceso`, `creado_en` | `MODIFY rol VARCHAR(50)`, `cargo` (`VARCHAR(100) NULL`), `es_developer` (`TINYINT(1) DEFAULT 0`), `campamento_id` (`INT NULL`), `almacen_id` (`INT NULL`), `permisos_json` (`JSON NULL`) |
| `inv_campamentos` | **5** | `id`, `nombre`, `codigo`, `provincia`, `direccion`, `responsable`, `telefono`, `activo`, `creado_en`, `actualizado_en` | `clasificacion_sede` (`ENUM`), `es_sintetico` (`TINYINT(1) DEFAULT 0`), `origen_registro` (`VARCHAR(100)`), `ubicacion_historica_equivalente` (`VARCHAR(150) NULL`) |
| `inv_almacenes` | **5** | `id`, `campamento_id`, `nombre`, `tipo`, `encargado`, `descripcion`, `activo`, `creado_en`, `actualizado_en` | `es_sintetico` (`TINYINT(1) DEFAULT 0`) |
| `inv_levantamientos` | **1** | `id`, `titulo`, `campamento_id`, `almacen_id`, `fecha_levantamiento`, `responsable_nombre`, `usuario_id`, `estado`, `observaciones`, `total_articulos_capturados`, `fecha_cierre`, `creado_en`, `actualizado_en` | `codigo` (`VARCHAR(50) NULL`), `es_sintetico` (`TINYINT(1) DEFAULT 0`) |
| `inv_levantamiento_items` | **6** | `id`, `levantamiento_id`, `codigo_original`, `area`, `categoria`, `articulo_nombre`, `marca`, `modelo_caracteristicas`, `serie_imei`, `cantidad`, `unidad_medida`, `estado_fisico`, `propietario`, `responsable_custodio`, `ubicacion_exacta`, `observaciones`, `consolidado`, `articulo_maestro_id`, `creado_por`, `creado_en` | `estado_verificacion` (`VARCHAR(40) DEFAULT 'VERIFICADO'`), `es_sintetico` (`TINYINT(1) DEFAULT 0`) |
| `inv_movimientos` | **1+** | Esquema completo de movimientos transaccionales (`id`, `articulo_id`, `tipo_movimiento`, `cantidad`, `unidad_medida`, `ubicacion_origen`, `ubicacion_destino`, `custodio_origen`, `custodio_destino`, `estado_previo`, `estado_nuevo`, `motivo`, `observaciones`, `usuario_id`, `fecha_movimiento`) | *Ninguna (100% compatible)* |
| `inv_auditoria` | **8+** | Esquema completo de bitácora (`id`, `usuario_id`, `usuario_nombre`, `accion`, `entidad`, `entidad_id`, `detalles_previos`, `detalles_nuevos`, `ip_origen`, `fecha`) | *Ninguna (100% compatible)* |
| `inv_lotes_importacion` | **1** | Esquema completo de control de lotes Excel | *Ninguna (100% compatible)* |

### 2.2 Tablas NUEVAS que aún NO existen en Clever Cloud (4 tablas)
Estas 4 tablas se crean limpiamente mediante `CREATE TABLE IF NOT EXISTS` en `migration_01_estructural_ddl_clever_cloud.sql`:
1. `inv_categorias` (Catálogo dinámico de categorías por área).
2. `inv_custodios` (Catálogo dinámico de custodios y responsables).
3. `inv_usuario_campamentos` (Relación N:M de usuarios autorizados por sede/campamento).
4. `inv_usuario_almacenes` (Relación N:M de usuarios autorizados por almacén interno).

---

## 3. CLASIFICACIÓN SENTENCIA POR SENTENCIA (OBJETIVOS 1, 4 Y 10)

Cada bloque e instrucción ha sido evaluado y clasificado bajo los tres estados reglamentarios: **`SEGURA`**, **`REQUIERE REVISIÓN`** o **`BLOQUEADA`**.

| # | Bloque / Sentencia SQL | Efecto Exacto en Base de Datos | Clasificación | Observación / Acción Aplicada |
| :---: | :--- | :--- | :---: | :--- |
| **1** | `CREATE TABLE IF NOT EXISTS inv_categorias (...)` | Crea la tabla de categorías dinámicas por área con `es_sintetico DEFAULT 0`. | **`SEGURA`** | Necesaria para `GET/POST /api/v2/catalogos/categorias`. |
| **2** | `CREATE TABLE IF NOT EXISTS inv_custodios (...)` | Crea la tabla de responsables/custodios con `es_sintetico DEFAULT 0`. | **`SEGURA`** | Necesaria para `GET/POST /api/v2/catalogos/custodios`. |
| **3** | `CREATE TABLE IF NOT EXISTS inv_usuario_campamentos (...)` | Crea la tabla de asignación de sedes por usuario (`uk_usuario_campamento`). | **`SEGURA`** | Indispensable para el aislamiento de sedes por usuario (`getUserAllowedCampamentos`). |
| **4** | `CREATE TABLE IF NOT EXISTS inv_usuario_almacenes (...)` | Crea la tabla de asignación de almacenes internos por usuario. | **`SEGURA`** | Necesaria para `/api/v2/usuarios`. |
| **5** | `CREATE TABLE IF NOT EXISTS inv_campamentos / inv_almacenes / inv_levantamientos / inv_levantamiento_items` (en borrador original) | En Clever Cloud estas 4 tablas **ya existen**, por lo que `CREATE TABLE IF NOT EXISTS` no añade las columnas nuevas. | **`REQUIERE REVISIÓN`** | Retiradas del archivo `migration_01_estructural_ddl_clever_cloud.sql` para evitar falsa sensación de creación; las columnas nuevas se agregan vía `ALTER TABLE`. |
| **6** | `ALTER TABLE inv_usuarios MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'almacen'` | Amplía la columna `rol` (que era `ENUM('admin','almacen','supervisor','gerencia','auditor')`) a `VARCHAR(50)` conservando intactos los roles actuales de las 5 cuentas. | **`SEGURA`** | Indispensable para permitir el rol `'developer'` sin truncamiento de `ENUM`. |
| **7** | `ALTER TABLE inv_usuarios ADD COLUMN cargo, es_developer DEFAULT 0, campamento_id, almacen_id, permisos_json` | Añade las columnas de perfil y permisos. Todas las cuentas existentes quedan con `es_developer = 0`. | **`SEGURA`** | Ningún usuario existente adquiere privilegios `developer`. |
| **8** | `ALTER TABLE inv_campamentos ADD COLUMN clasificacion_sede, es_sintetico, origen_registro, ubicacion_historica_equivalente` | Añade metadatos de clasificación de sede sin alterar los nombres ni IDs actuales. | **`SEGURA`** | Necesaria para filtrar sedes confirmadas vs propuestas. |
| **9** | `ALTER TABLE inv_almacenes ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0` | Añade bandera `es_sintetico = 0` a los almacenes existentes. | **`SEGURA`** | Necesaria para `GET /api/v2/campamentos`. |
| **10** | `ALTER TABLE inv_articulos ADD COLUMN campamento_id, almacen_id, cantidad_verificada, estado_cantidad, es_sintetico, origen_datos` | Añade soporte multi-campamento y estado de cantidad a los 434 artículos sin tocar ningún valor existente. | **`SEGURA`** | Ajustado `DEFAULT 'OPERATIVO_REAL'` en `origen_datos`. |
| **11** | `ALTER TABLE inv_levantamientos ADD COLUMN codigo, es_sintetico` y `ALTER TABLE inv_levantamiento_items ADD COLUMN estado_verificacion, es_sintetico` | Añade código de auditoría (`LEV-...`) y estado de verificación por ítem. | **`SEGURA`** | Necesaria para el módulo de Levantamientos v2. |
| **12** | `ALTER TABLE inv_custodios ADD COLUMN es_sintetico` y `ALTER TABLE inv_categorias ADD COLUMN es_sintetico` (Líneas 196–197 del borrador original) | Intentaba agregar nuevamente una columna ya definida en el `CREATE TABLE` de la Fase 1, provocando `Error 1060: Duplicate column name`. | **`BLOQUEADA`** | **Eliminada** en la versión corregida. |
| **13** | `UPDATE inv_campamentos ... WHERE id = 3 OR codigo = 'ALM-27FEB'` (Línea 214 del borrador original) | Podía sobrescribir el campamento con `id = 3` en Clever Cloud aunque no fuera Almacén 27 de Febrero. | **`REQUIERE REVISIÓN`** | **Corregida:** Eliminado `id = 3`; se busca únicamente por nombre o código y se incluye `INSERT ... WHERE NOT EXISTS`. |
| **14** | `INSERT INTO inv_campamentos ... ('OPL')` y `('MANTENIMIENTO 633')` + sus almacenes principales | Crea las dos sedes operativas independientes confirmadas por Gerencia si no existen. | **`SEGURA`** | Incluye cláusula `WHERE NOT EXISTS` para no duplicar sedes. |
| **15** | `UPDATE inv_campamentos SET activo = 0 WHERE codigo = 'CAMP-KM19' ...` (Línea 242 del borrador original) | Desactivaba automáticamente un campamento existente en Clever Cloud sin verificar si tiene el levantamiento #1 asociado. | **`REQUIERE REVISIÓN`** | **Reemplazada:** En lugar de desactivar (`activo = 0`) campamentos preexistentes a ciegas, se clasifican como `clasificacion_sede = 'PROPUESTO'` manteniendo la integridad referencial con `inv_levantamientos`. |
| **16** | `UPDATE inv_articulos SET es_sintetico = 1 WHERE (area = 'COCINA' AND codigo_original IN ('COC-001', 'COC-002'))` (Línea 255 del borrador original) | En Clever Cloud hay 0 filas en `COCINA`. Si se ejecuta después de crear el primer activo real de cocina (`COC-001`), lo ocultaría como sintético. | **`BLOQUEADA`** | **Eliminada** de los scripts productivos. |
| **17** | `UPDATE inv_articulos SET origen_datos = 'HISTORICO_EXCEL' WHERE hoja_origen IN ('INFORMATICA','OFICINAS','COCINA','ALMACEN')` y `'OPERATIVO_REAL'` para el resto | Clasifica los `414` artículos del Excel como `'HISTORICO_EXCEL'` y los `20` artículos del 03/11/2026 (`INF-090`, `ALM-HER-002..020`) como `'OPERATIVO_REAL'`. | **`SEGURA`** | Preserva el 100% de los 434 artículos con `es_sintetico = 0`. |
| **18** | `UPDATE inv_articulos SET cantidad_verificada = ..., estado_cantidad = ...` | Marca `cantidad_verificada = 0` únicamente donde `cantidad_num IS NULL` (las 22 filas vacías + `HER-220`), sin alterar `cantidad_num` ni `cantidad_texto`. | **`SEGURA`** | Cumple las decisiones de auditoría sin inventar cantidades. |
| **19** | `UPDATE inv_articulos a JOIN inv_campamentos c ON c.codigo = 'ALM-27FEB' SET a.campamento_id = c.id WHERE ... UPPER(TRIM(a.ubicacion_nombre)) IN ('ALMACEN 27 DE FEBRERO', 'ALMACÉN 27 DE FEBRERO')` | Vincula `campamento_id` solo para artículos con ubicación inequívoca `ALMACÉN 27 DE FEBRERO`. Mantiene `KM 19 AUT DUARTE` en `campamento_id = NULL`. | **`SEGURA`** | No modifica `ubicacion_nombre` ni reasigna `KM 19 AUT DUARTE` arbitrariamente. |
| **20** | `INSERT IGNORE INTO inv_categorias / inv_custodios SELECT DISTINCT ... FROM inv_articulos` | Puebla los catálogos desplegables con las categorías y custodios reales de los 434 artículos. | **`SEGURA`** | Usa `INSERT IGNORE` (cero duplicados). |
| **21** | `UPDATE inv_usuarios SET es_developer = 0, permisos_json = JSON_ARRAY(...) WHERE rol = ... AND permisos_json IS NULL` | Asigna permisos operativos base a las 5 cuentas existentes según su rol sin otorgar privilegios de `developer`. | **`SEGURA`** | Protege la operatividad de las cuentas existentes manteniendo `es_developer = 0`. |

---

## 4. COMPATIBILIDAD CON LOS 434 ARTÍCULOS PRODUCTIVOS (OBJETIVOS 3 Y 6)

En Clever Cloud existen exactamente **434 artículos activos**:
1. **IDs `1` al `414` (414 artículos históricos del Excel del 16/10/2026):**
   - `84` en `INFORMATICA` (`INF-001`..`INF-089`).
   - `69` en `OFICINAS` (`OFI-001`..`OFI-069`).
   - `0` en `COCINA`.
   - `261` en `ALMACEN` (`HER-001`..`HER-261`).
2. **IDs `415` al `434` (20 artículos operativos reales registrados el 03/11/2026):**
   - `1` en `INFORMATICA` (`INF-090`).
   - `19` en `ALMACEN` (`ALM-HER-002` al `ALM-HER-020`).

### Garantías Verificadas sobre los 434 Artículos:
- **Cero duplicados:** Ninguna instrucción ejecuta `INSERT INTO inv_articulos`. Los 434 artículos siguen siendo exactamente 434 artículos antes y después de la migración.
- **Cero sobrescritura de campos maestros:** Ninguna sentencia toca `codigo_original`, `codigo_sistema`, `articulo_nombre`, `marca`, `modelo_caracteristicas`, `serie_imei`, `cantidad_num`, `cantidad_texto`, `estado_fisico`, `asignado_a` (custodio) ni `ubicacion_nombre`.
- **Clasificación exacta de origen (`origen_datos`):**
  - Los **414** registros con `hoja_origen IN ('INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN')` quedan con `origen_datos = 'HISTORICO_EXCEL'` y `es_sintetico = 0`.
  - Los **20** registros creados manualmente el 3 de noviembre (`hoja_origen LIKE 'CREADO_MANUAL_%'`) quedan con `origen_datos = 'OPERATIVO_REAL'` y `es_sintetico = 0`.
- **Respeto estricto a ubicaciones históricas:**
  - Los artículos con `ubicacion_nombre = 'ALMACEN 27 DE FEBRERO'` se vinculan por llave foránea lógica (`campamento_id`) a la sede `ALMACÉN 27 DE FEBRERO` (`ALM-27FEB`).
  - Los artículos con `ubicacion_nombre = 'KM 19 AUT DUARTE'` conservan `campamento_id = NULL` (`SIN SEDE VERIFICADA`) hasta que se clasifiquen físicamente entre `OPL` y `MANTENIMIENTO 633`.

---

## 5. SEPARACIÓN ENTRE MIGRACIÓN ESTRUCTURAL (DDL) Y DE DATOS (DML) (OBJETIVO 5)

Para máxima seguridad operativa, la migración en `server/database/migrations/` ha quedado dividida en dos archivos independientes:

1. **[migration_01_estructural_ddl_clever_cloud.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_01_estructural_ddl_clever_cloud.sql)**
   - **Contenido:** Exclusivamente `CREATE TABLE IF NOT EXISTS` (para las 4 tablas nuevas: `inv_categorias`, `inv_custodios`, `inv_usuario_campamentos`, `inv_usuario_almacenes`), `ALTER TABLE ... ADD/MODIFY COLUMN` y `CREATE INDEX`.
   - **Operaciones sobre datos:** **CERO (`0` `INSERT`, `0` `UPDATE`, `0` `DELETE`)**.
2. **[migration_02_datos_homologacion_clever_cloud.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_02_datos_homologacion_clever_cloud.sql)**
   - **Contenido:** Transacción controlada (`START TRANSACTION ... COMMIT`) que homologa las 3 sedes confirmadas (`ALMACÉN 27 DE FEBRERO`, `OPL`, `MANTENIMIENTO 633`), clasifica `origen_datos` y `estado_cantidad` en los 434 artículos sin alterar cantidades ni custodios, puebla `inv_categorias` e `inv_custodios` desde los datos reales, y asigna la plantilla de permisos de mínimo privilegio a los usuarios existentes.

---

## 6. ACTIVACIÓN SEGURA DEL ROL `developer` Y CONTROL DE PRIVILEGIOS (OBJETIVOS 7 Y 8)

### 6.1 Estado de las 5 cuentas existentes en Clever Cloud tras la migración
En Clever Cloud existen 5 cuentas iniciales en `inv_usuarios`:
- `admin@ingmelec.com` (`rol = 'admin'`)
- `almacen@ingmelec.com` (`rol = 'almacen'`)
- `supervisor@ingmelec.com` (`rol = 'supervisor'`)
- `gerencia@ingmelec.com` (`rol = 'gerencia'`)
- `auditor@ingmelec.com` (`rol = 'auditor'`)

Al aplicar `migration_01_estructural_ddl_clever_cloud.sql` y `migration_02_datos_homologacion_clever_cloud.sql`:
1. **Ninguna de las 5 cuentas adquiere privilegios de Desarrollador Principal:** Todas quedan con `es_developer = 0` y conservan su `rol` original (`admin`, `almacen`, `supervisor`, `gerencia`, `auditor`).
2. **Aislamiento total del módulo de Usuarios (`/api/v2/usuarios`):** En [almacenApi.js](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L125-L136), todos los endpoints de `/api/v2/usuarios` exigen el middleware `requireDeveloper` (`req.user.rol === 'developer' || req.user.es_developer === 1`). Ni siquiera el rol `admin` puede listar, crear, editar ni cambiar contraseñas de usuarios.
3. **Aislamiento por sede (`getUserAllowedCampamentos`):** En [almacenApi.js](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L185-L225), los roles operativos (`admin`, `almacen`, `supervisor`, `auditor`) solo pueden ver los campamentos que el `developer` les asigne en `inv_usuario_campamentos` o `campamento_id`.
4. **Cero cambio de contraseñas:** La migración SQL **no modifica `password_hash`** de ningún usuario existente.

### 6.2 Procedimiento Seguro para Activar el Perfil `developer` en Producción (Argon2id Interactivo)
Dado que los scripts SQL y commits versionados en Git **nunca deben contener contraseñas en texto plano ni hashes predeterminados**, el aprovisionamiento de la cuenta única del Desarrollador Principal se realiza mediante el script interactivo auditado:

- **Script CLI Oficial con Argon2id Interactivo:**
  Ejecutar desde una terminal autorizada (consola SSH o terminal privada de producción) el script [recovery-developer.js](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/scripts/recovery-developer.js):
  ```bash
  node server/scripts/recovery-developer.js [email_opcional]
  ```
  *Características de Seguridad Estricta:*
  1. **Captura Interactiva sin Eco:** La contraseña se solicita interactivamente enmascarada con asteriscos (`*`) en terminales interactivas (TTY) y con confirmación obligatoria.
  2. **Cero Argumentos Visibles:** No se reciben contraseñas por línea de comandos (evitando que queden expuestas en el historial de bash, procesos `ps aux` o logs de auditoría).
  3. **Cifrado Robusto Argon2id:** Utiliza parámetros OWASP 2026 (64 MiB de memoria, 3 iteraciones, paralelismo 1). La memoria se limpia inmediatamente tras generar el hash.
  4. **Cero Contraseñas Predeterminadas:** No existen claves por defecto ni puertas traseras. La cuenta developer se aprovisiona exclusivamente con la contraseña suministrada por el operador autorizado.
  5. **Compatibilidad y Rehash Progresivo:** Las cuentas operativas existentes migran automáticamente a Argon2id de forma transparente en su primer inicio de sesión exitoso.

---

## 7. SECUENCIA RECOMENDADA DE EJECUCIÓN, VALIDACIÓN POST-MIGRACIÓN Y RECUPERACIÓN CONTROLADA (OBJETIVOS 9 Y 10)

### 7.1 Secuencia Exacta Paso a Paso (Cuando el Director de Ingeniería Autorice)
1. **Paso 0 (Completado por el usuario):** Confirmar que el respaldo SQL del 4 de noviembre de 2026 está resguardado fuera del repositorio (`privado sql database`).
2. **Paso 1 — Ventana de Mantenimiento y Verificación Previa:**
   Programar ventana de mantenimiento de 5 a 10 minutos y verificar conteos actuales en producción:
   ```sql
   SELECT COUNT(*) AS total_articulos, SUM(COALESCE(cantidad_num, 0)) AS total_unidades FROM inv_articulos WHERE activo = 1;
   SELECT id, nombre, codigo, activo FROM inv_campamentos ORDER BY id;
   SELECT id, nombre, email, rol, activo FROM inv_usuarios ORDER BY id;
   ```
   *(Resultado esperado antes de migrar: `434` artículos activos, `5` campamentos, `5` usuarios).*
3. **Paso 2 — Ejecución de la Migración Estructural Pura (DDL):**
   Ejecutar [migration_01_estructural_ddl_clever_cloud.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_01_estructural_ddl_clever_cloud.sql).
4. **Paso 3 — Ejecución de la Homologación de Datos (DML Controlado con Manejador de Excepciones):**
   Ejecutar [migration_02_datos_homologacion_clever_cloud.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_02_datos_homologacion_clever_cloud.sql).
5. **Paso 4 — Aprovisionamiento interactivo de la cuenta `developer`:**
   Ejecutar `node server/scripts/recovery-developer.js` ingresando la contraseña interactiva con Argon2id.
6. **Paso 5 — Rotación de DB_PASSWORD / JWT_SECRET y Despliegue en Render:**
   Actualizar credenciales en Render y verificar reconexión en `/health`.

### 7.2 Consultas de Validación Post-Migración
Inmediatamente después de ejecutar los Pasos 2 y 3, verificar con estas 5 consultas de control:

```sql
-- 1. Confirmar que los 434 artículos productivos siguen intactos y 0 son sintéticos
SELECT origen_datos, es_sintetico, COUNT(*) AS registros, SUM(COALESCE(cantidad_num, 0)) AS unidades_fisicas
FROM inv_articulos
WHERE activo = 1
GROUP BY origen_datos, es_sintetico;
-- Esperado: HISTORICO_EXCEL = 414, OPERATIVO_REAL = 20 (Total = 434, es_sintetico = 0)

-- 2. Confirmar el estado de verificación de cantidades (22 pendientes + 1 texto no numérico)
SELECT estado_cantidad, cantidad_verificada, COUNT(*) AS registros
FROM inv_articulos
WHERE activo = 1
GROUP BY estado_cantidad, cantidad_verificada;

-- 3. Confirmar las 3 sedes confirmadas por Gerencia (ALMACÉN 27 DE FEBRERO, OPL, MANTENIMIENTO 633)
SELECT id, nombre, codigo, clasificacion_sede, ubicacion_historica_equivalente, activo
FROM inv_campamentos
WHERE clasificacion_sede = 'CONFIRMADO'
ORDER BY id;

-- 4. Confirmar distribución de artículos por sede vinculada vs SIN SEDE VERIFICADA
SELECT COALESCE(c.nombre, 'SIN SEDE VERIFICADA (KM 19 AUT DUARTE)') AS sede,
       COUNT(*) AS articulos,
       SUM(COALESCE(a.cantidad_num, 0)) AS unidades
FROM inv_articulos a
LEFT JOIN inv_campamentos c ON a.campamento_id = c.id
WHERE a.activo = 1 AND a.es_sintetico = 0
GROUP BY sede;

-- 5. Confirmar que ningún usuario operativo tiene es_developer = 1
SELECT id, nombre, email, rol, es_developer, JSON_LENGTH(permisos_json) AS total_permisos
FROM inv_usuarios
ORDER BY id;
```

### 7.3 Plan de Recuperación Controlado y Rollback (Sin Restauración Ciega)

> [!CAUTION]
> **REGLA DE ORO DE RECUPERACIÓN:**
> **Ninguna restauración SQL completa debe ejecutarse directamente sobre Clever Cloud sin verificar previamente:**
> 1. El estado actual de la base de datos en producción (`SHOW TABLES`, conteo de `inv_articulos`, `inv_movimientos`).
> 2. Si se han generado datos operativos posteriores al 4 de noviembre de 2026 (una restauración ciega destruiría esos registros).
> 3. La existencia de un snapshot de emergencia tomado justo antes de intervenir.

En caso de requerir reversión parcial (solo datos DML) o total (incluyendo retiro de columnas y tablas nuevas), el archivo [rollback_clever_cloud_produccion.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/rollback_clever_cloud_produccion.sql) contiene ambos niveles de reversión sin tocar ninguna de las 434 filas de `inv_articulos` ni las 5 cuentas originales de `inv_usuarios`.

### 7.4 Protocolo de Rotación de Credenciales (DB_PASSWORD y JWT_SECRET)
> [!IMPORTANT]
> **No prometer cero tiempo de inactividad:** La rotación de contraseñas de base de datos interrumpe de forma instantánea las conexiones en vuelo del pool. Se planifica una **ventana de mantenimiento de 5 a 10 minutos**.

1. **Ventana de Mantenimiento:** Coordinar ventana de 5 a 10 minutos.
2. **Rotación en Clever Cloud:** Cambiar `MYSQL_ADDON_PASSWORD` en el panel de Clever Cloud.
3. **Generación de JWT_SECRET:** Generar cadena aleatoria de mínimo 64 caracteres.
4. **Actualización en Render:** Actualizar `DB_PASSWORD` y `JWT_SECRET` en Render > *Environment* y desplegar.
5. **Comprobación de Reconexión:** Verificar en logs de Render la reconexión exitosa y probar `/health` y `/api/v2/dashboard/kpis` con código HTTP `200 OK`.
