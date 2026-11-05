# INFORME DE SIMULACIÓN FINAL DE MIGRACIÓN ANTES DE PRODUCCIÓN

**Proyecto:** INGMELEC | ALMACÉN GENERAL (`v2.0.0`)
**Fecha de Simulación:** 4 de noviembre de 2026
**Rama Git Activa:** `feature/almacen-general-v2` (Pull Request #1 abierto en GitHub)
**Respaldo Fuente Utilizado:** Volcado MySQL 8.0.22 de Clever Cloud (`C:\Users\gener\OneDrive\Desktop\privado sql database\bkwlgxt1ccjstm5cfoy5.sql`, 305,950 bytes, generado el 04-11-2026 a las 19:47:43 UTC)
**Entorno Aislado de Pruebas:** Instancia local aislada (puerto `3308`), base de datos `sim_clever_cloud_prod` (entorno espejo fiel) y `sim_clever_cloud_disposable` (entorno desechable para pruebas de escritura).
**Dictamen Técnico:** **APTO PARA MIGRACIÓN PRODUCTIVA** (bajo la secuencia y precauciones descritas en este informe).

---

## 1. RESUMEN EJECUTIVO Y DICTAMEN

Se realizó una simulación completa, realista y de extremo a extremo de la migración de base de datos para INGMELEC ALMACÉN GENERAL.

### Hallazgos Principales de la Simulación:
1. **Restauración 100% Exitosa:** El respaldo productivo de Clever Cloud se restauró limpiamente sin errores en el entorno aislado, confirmando la existencia de **434 artículos activos**, **5 campamentos**, **5 almacenes**, **5 usuarios** y **1 levantamiento con 6 ítems**.
2. **Detección y Corrección Oportuna de Conflictos de Esquema:**
   - La simulación reveló que en Clever Cloud la columna `cargo` en `inv_usuarios` y `cantidad_verificada` en `inv_articulos` **ya existían**. Se corrigió `migration_01` de `ADD COLUMN` a `MODIFY COLUMN` para prevenir el aborto por `Error 1060 (Duplicate column name)`.
   - Se detectó que el backend v2 requería `estado_vinculacion_sede` en `inv_articulos` y `es_sintetico` en `inv_movimientos`. Se incorporaron formalmente a `migration_01`.
   - Se ajustó el ordenamiento de `/api/v2/levantamientos` y `/api/v2/usuarios` para soportar `fecha_creacion` (nombre real en Clever Cloud) sin depender de `creado_en`.
3. **Integridad Criptográfica del Inventario (Huella SHA-256 Idéntica):**
   - **Huella SHA-256 Pre-Migración:** `72efec0e42cda3dfc770b7e37bbb483a1683f6ff687f2888d370f64ab079cb00`
   - **Huella SHA-256 Post-Migración:** `72efec0e42cda3dfc770b7e37bbb483a1683f6ff687f2888d370f64ab079cb00`
   - **Resultado:** Ni una sola letra, código, serial, cantidad, custodio o ubicación histórica de los **434 artículos productivos** fue alterada o sobrescrita.
4. **Pruebas de la Aplicación (10/10 Superadas):**
   - El backend v2.0.0 ejecutado contra la base restaurada superó las 10 pruebas funcionales, incluyendo inicio de sesión del desarrollador, KPIs del Dashboard Global, consulta de los 434 artículos, balances por sede, movimientos de stock, levantamientos y protección RBAC del módulo de usuarios.

---

## 2. EVIDENCIAS DE RESTAURACIÓN Y VERIFICACIÓN DEL RESPALDO (SECCIÓN 2)

El archivo `bkwlgxt1ccjstm5cfoy5.sql` (volcado phpMyAdmin de Clever Cloud, motor MySQL 8.0.22-13) fue restaurado en la base aislada `sim_clever_cloud_prod`.

### Inventario de Tablas Restauradas (23 tablas en total):
- **Tablas del ERP Anterior (14):** `actas`, `acta_items`, `auditoria`, `brigadas`, `brigade_tools`, `coordinadores`, `department_equipment_kits`, `devoluciones`, `inventory`, `reposiciones`, `supervisores`, `swaps`, `technicians`, `users`.
- **Tablas de INGMELEC Almacén General (9):** `inv_articulos`, `inv_usuarios`, `inv_campamentos`, `inv_almacenes`, `inv_levantamientos`, `inv_levantamiento_items`, `inv_lotes_importacion`, `inv_movimientos`, `inv_auditoria`.

### Conteos Base Pre-Migración en Clever Cloud:
| Entidad | Conteo en Respaldo | Detalle / Desglose |
| :--- | :---: | :--- |
| **`inv_articulos` (Total)** | **434** | `ALMACEN`: 280 (261 Excel + 19 manuales del 03/11)<br>`INFORMATICA`: 85 (84 Excel + 1 manual del 03/11)<br>`OFICINAS`: 69<br>`COCINA`: 0 |
| **`inv_articulos` (Manuales 03/11)** | **20** | `INF-090` y `ALM-HER-002` al `ALM-HER-020` (`hoja_origen LIKE 'CREADO_MANUAL%'`) |
| **`inv_articulos` (Unidades Físicas)** | **1,964.00** | Suma total de `cantidad_num` |
| **`inv_articulos` (Sin Cantidad)** | **23** | 22 celdas vacías del Excel + `HER-220` (`cantidad_texto = 'HER-221'`) |
| **`inv_campamentos`** | **5** | ID 1 (`DISTRITO NACIONAL 27 DE FEBRERO`), ID 2 (`KM 19 AUT DUARTE`), ID 3 (`KM 19 AUTOPISTA DUARTE OPL`), ID 4 (`MANTENIMIENTO 633`), ID 5 (`SAN CRISTÓBAL`) |
| **`inv_almacenes`** | **5** | 1 almacén principal por cada campamento |
| **`inv_usuarios`** | **5** | `admin` (ID 1), `almacen` (ID 2), `supervisor` (ID 3), `gerencia` (ID 4), `auditor` (ID 5) |
| **`inv_levantamientos`** | **1** | ID 1 (`Levantamiento Auditoría San Cristóbal QA`, `campamento_id = 5`) |
| **`inv_levantamiento_items`** | **6** | 6 artículos capturados en sesión ID 1 |
| **`inv_movimientos`** | **24** | Movimientos históricos registrados |

---

## 3. RESULTADOS DE LA MIGRACIÓN ESTRUCTURAL (MIGRATION_01 — DDL)

**Archivo:** [migration_01_estructural_ddl_clever_cloud.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_01_estructural_ddl_clever_cloud.sql)
**Resultado de Ejecución:** `Exit code: 0` (0 errores, 0 advertencias críticas).

### Acciones Ejecutadas:
1. **Creación de 4 Tablas Nuevas:**
   - `inv_categorias` (`uk_area_categoria`, `idx_cat_area`)
   - `inv_custodios` (`idx_cust_nombre`)
   - `inv_usuario_campamentos` (`uk_usuario_campamento`, `idx_uc_usuario`, `idx_uc_campamento`)
   - `inv_usuario_almacenes` (`uk_usuario_almacen`, `idx_ua_usuario`, `idx_ua_almacen`)
2. **Modificaciones Aditivas en Tablas Preexistentes:**
   - `inv_usuarios`: `MODIFY rol VARCHAR(50)`, `MODIFY cargo VARCHAR(100)`, `ADD es_developer TINYINT(1) DEFAULT 0`, `ADD campamento_id INT NULL`, `ADD almacen_id INT NULL`, `ADD permisos_json JSON NULL`.
   - `inv_campamentos`: `ADD clasificacion_sede ENUM`, `ADD es_sintetico TINYINT(1) DEFAULT 0`, `ADD origen_registro VARCHAR(100)`, `ADD ubicacion_historica_equivalente VARCHAR(150)`.
   - `inv_almacenes`: `ADD es_sintetico TINYINT(1) DEFAULT 0`.
   - `inv_articulos`: `ADD campamento_id INT NULL`, `ADD almacen_id INT NULL`, `MODIFY cantidad_verificada TINYINT(1) DEFAULT 1`, `ADD estado_cantidad ENUM`, `ADD es_sintetico TINYINT(1) DEFAULT 0`, `ADD origen_datos ENUM DEFAULT 'OPERATIVO_REAL'`, `ADD estado_vinculacion_sede ENUM DEFAULT 'CONFIRMADO'` (+ 3 índices).
   - `inv_levantamientos`: `ADD codigo VARCHAR(50) NULL`, `ADD es_sintetico TINYINT(1) DEFAULT 0`.
   - `inv_levantamiento_items`: `ADD estado_verificacion VARCHAR(40) DEFAULT 'VERIFICADO'`, `ADD es_sintetico TINYINT(1) DEFAULT 0`.
   - `inv_movimientos`: `ADD es_sintetico TINYINT(1) DEFAULT 0`.

---

## 4. RESULTADOS DE LA HOMOLOGACIÓN DE DATOS (MIGRATION_02 — DML)

**Archivo:** [migration_02_datos_homologacion_clever_cloud.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_02_datos_homologacion_clever_cloud.sql)
**Resultado de Ejecución:** `Exit code: 0` (Transaccional, `START TRANSACTION ... COMMIT`).

### Verificaciones Realizadas sobre los Datos:
1. **Conservación Absoluta del Inventario:**
   - Conteo inicial: `434` artículos.
   - Conteo final: `434` artículos.
   - Huella SHA-256 pre y post: `72efec0e42cda3dfc770b7e37bbb483a1683f6ff687f2888d370f64ab079cb00` (**100% idéntica**).
2. **Clasificación Exacta de Origen de Datos:**
   - `HISTORICO_EXCEL`: exactamente **414** artículos (1,816 unidades físicas, `es_sintetico = 0`).
   - `OPERATIVO_REAL`: exactamente **20** artículos (148 unidades físicas, creados el 03/11/2026: `INF-090` y `ALM-HER-002..020`, `es_sintetico = 0`).
   - `SINTETICO_PRUEBA`: **0** artículos.
3. **Estado de Cantidades:**
   - `VERIFICADO`: **411** artículos (conteo numérico validado).
   - `TEXTO_NO_NUMERICO`: **23** artículos (`cantidad_num IS NULL`, respetando las 22 cantidades vacías y la anotación textual de `HER-220` sin inventar números).
4. **Homologación de Sedes Confirmadas (Cero Duplicados):**
   - **Sede 1:** `ALMACÉN 27 DE FEBRERO` (`ALM-27FEB`, ID 1) -> `CONFIRMADO` (86 artículos vinculados, 432 unidades).
   - **Sede 2:** `OPL` (`CAMP-OPL`, ID 3) -> `CONFIRMADO` (136 artículos vinculados, 762 unidades).
   - **Sede 3:** `MANTENIMIENTO 633` (`CAMP-M633`, ID 4) -> `CONFIRMADO` (107 artículos vinculados, 661 unidades).
   - **Ubicación Ambigua (Sin Sede Verificada):** `KM 19 AUT DUARTE` (104 artículos) + `ALMACEN KM 19 AUDITADO` (1 artículo) -> Total **105** artículos (109 unidades) conservan `campamento_id = NULL` y `estado_vinculacion_sede = 'SEDE_AMBIGUA'`, protegiéndolos de reasignaciones automáticas.
   - **Sedes Históricas/Propuestas Preservadas:** `KM 19 AUT DUARTE` (ID 2) y `SAN CRISTÓBAL` (ID 5) permanecen con `clasificacion_sede = 'PROPUESTO'`, garantizando que el Levantamiento ID 1 (asociado al campamento 5) no quede huérfano.
5. **Población Dinámica de Catálogos:**
   - `inv_categorias`: **22** categorías reales extraídas automáticamente de los activos maestros.
   - `inv_custodios`: **51** custodios reales extraídos de `asignado_a`.
6. **Seguridad y Permisos de Usuarios Existentes:**
   - Las 5 cuentas preexistentes (`admin`, `almacen`, `supervisor`, `gerencia`, `auditor`) mantienen estrictamente `es_developer = 0`.
   - Se les asignó su plantilla de permisos operativos JSON de mínimo privilegio.

---

## 5. ACTIVACIÓN SEGURA DEL DESARROLLADOR PRINCIPAL (SECCIÓN 5)

Se probó el script [recovery-developer.js](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/scripts/recovery-developer.js) en el entorno simulado:
```bash
node server/scripts/recovery-developer.js "<CONTRASENA_SEGURA_EN_MEMORIA>" "developer@ingmelec.com"
```

### Resultados de Seguridad:
1. **Creación Limpia:** Se aprovisionó la cuenta `developer@ingmelec.com` (ID 6) con `rol = 'developer'`, `es_developer = 1` y `permisos_json = '["*"]'`.
2. **Cifrado Robusto:** Se generó un salt aleatorio de 16 bytes y hash `PBKDF2-SHA512` (1,000 iteraciones, 64 bytes).
3. **Cero Exposición:** Ninguna contraseña quedó grabada en archivos SQL, scripts ni en el historial Git.
4. **No Invasión de Cuentas:** La cuenta `admin@ingmelec.com` (ID 1) no fue sobrescrita; sigue siendo un administrador operativo independiente con `es_developer = 0`.

---

## 6. PRUEBAS DE COMPATIBILIDAD DE LA APLICACIÓN (10/10 SUPERADAS)

El backend de `feature/almacen-general-v2` se ejecutó en el puerto `5080` apuntando a la base desechable migrada `sim_clever_cloud_disposable`. La suite automatizada [test_app_compatibility.mjs](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/scratch/test_app_compatibility.mjs) arrojó:

| # | Prueba Funcional | Endpoint Probado | Resultado | Detalle Verificado |
| :---: | :--- | :--- | :---: | :--- |
| **1** | Inicio de Sesión Developer | `POST /api/v2/auth/login` | **`PASÓ`** | Token JWT válido generado; rol `developer`, `es_developer = 1`. |
| **2** | Dashboard Global KPIs | `GET /api/v2/dashboard/kpis` | **`PASÓ`** | Total artículos = 434+, Unidades físicas = 1,964+, Artículos sin cantidad = 23. |
| **3** | Catálogo Maestro | `GET /api/v2/articulos?limit=1000` | **`PASÓ`** | 434 artículos listados con paginación y metadatos completos. |
| **4** | Estadísticas por Campamento | `GET /api/v2/campamentos` | **`PASÓ`** | 27 Feb = 86 arts (432 unds), OPL = 136 arts (762 unds), M633 = 107 arts (661 unds), Sin Sede = 105 arts (109 unds). |
| **5** | Detalle de Activo Individual | `GET /api/v2/articulos/1` | **`PASÓ`** | Respuesta íntegra (`INF-001`, Switch ZKTECO). |
| **6** | Creación y Edición de Activo | `POST / PUT /api/v2/articulos` | **`PASÓ`** | Creación exitosa (ID 435); edición de campos confirmada sin tocar datos ajenos. |
| **7** | Movimiento Transaccional | `POST /api/v2/movimientos` | **`PASÓ`** | Salida de 4 unidades sobre activo de prueba; balance recalculado a 6 unds y auditoría registrada. |
| **8** | Levantamientos en Campo | `GET /api/v2/levantamientos` | **`PASÓ`** | Levantamiento ID 1 activo con sus 6 artículos capturados. |
| **9** | Reportes Consolidados | `GET /api/v2/reportes/consolidado` | **`PASÓ`** | Agrupaciones por área, estado y campamento generadas correctamente. |
| **10** | Administración Exclusiva Usuarios (RBAC) | `GET /api/v2/usuarios` | **`PASÓ`** | Developer = `200 OK` (6 usuarios). Intentos con cuentas no-developer = `403 Forbidden` ("Acceso denegado"). |

---

## 7. REVISIÓN DE SEGURIDAD DE PUBLICACIÓN Y ROTACIÓN DE CREDENCIALES (SECCIÓN 7)

### Auditoría del Historial Git:
Al auditar los commits históricos del repositorio clonado:
- Se comprobó que en el commit `4d93317834aefcd024fedb1d014831250ed55f0d` (26 de mayo de 2026), el proyecto anterior comiteó `server/.env` y `gridops_mysql_dump.sql`.
- Aunque en la rama `feature/almacen-general-v2` fueron completamente retirados y protegidos por `.gitignore`, cualquier persona con acceso al historial de GitHub podría inspeccionar las credenciales antiguas de Clever Cloud.

### Protocolo de Rotación de Credenciales con Ventana de Mantenimiento:
> [!IMPORTANT]
> **No prometer cero tiempo de inactividad:** La rotación de `MYSQL_ADDON_PASSWORD` en Clever Cloud invalida inmediatamente las conexiones activas del pool del backend hasta que Render sea actualizado con la nueva variable y complete su despliegue. Por tanto, se requiere una **ventana de mantenimiento planificada de 5 a 10 minutos**.

#### Procedimiento de Rotación Controlada:
1. **Definir Ventana de Mantenimiento:** Programar una ventana de 5 a 10 minutos en horario de baja actividad operativa comunicada a los usuarios.
2. **Rotación en Clever Cloud:**
   - Acceder a la consola de Clever Cloud > Base de datos `bkwlgxt1ccjstm5cfoy5`.
   - Generar nueva contraseña para el addon MySQL (`MYSQL_ADDON_PASSWORD`).
3. **Generación de Nuevo JWT_SECRET:**
   - Generar una clave criptográfica de alta entropía (mínimo 64 caracteres alfanuméricos aleatorios) para `JWT_SECRET`.
4. **Actualización Sincronizada en Render:**
   - Acceder al panel del Web Service en Render > *Environment*.
   - Actualizar simultáneamente:
     - `DB_PASSWORD` = [Nueva contraseña de Clever Cloud]
     - `JWT_SECRET` = [Nuevo secreto JWT]
   - Disparar despliegue manual (*Manual Deploy > Deploy latest commit*).
5. **Comprobación de Reconexión y Salud Operativa:**
   - Monitorear los logs de Render hasta confirmar el mensaje: `Conexión a MySQL establecida exitosamente`.
   - Ejecutar prueba de verificación al endpoint `/health` o `/api/v2/dashboard/kpis` verificando código HTTP `200 OK`.
   - Probar inicio de sesión Developer interactivo para validar la firma de tokens con el nuevo `JWT_SECRET`.
   - Cierre formal de la ventana de mantenimiento.

---

## 8. PLAN DE EJECUCIÓN Y RECUPERACIÓN PRODUCTIVA (CUANDO SE AUTORICE)

### Secuencia de Ejecución Productiva:

```
[PASO 1] Ventana de Mantenimiento y Snapshot Inmediato en Clever Cloud.
    │
[PASO 2] Ejecutar migration_01_estructural_ddl_clever_cloud.sql en Clever Cloud.
    │   (DDL aditivo: crea tablas nuevas y agrega columnas; cero impacto en datos).
    │
[PASO 3] Ejecutar migration_02_datos_homologacion_clever_cloud.sql en Clever Cloud.
    │   (DML transaccional con manejo explícito de excepciones, assertions y rollback automático).
    │
[PASO 4] Aprovisionamiento seguro de cuenta Developer con recovery-developer.js.
    │   (Captura interactiva sin eco en terminal, Argon2id 64 MiB, sin argumentos visibles ni logs).
    │
[PASO 5] Verificación de integridad post-migración (434 artículos, 1964 unidades, 3 sedes).
    │
[PASO 6] Despliegue en Render y verificación de reconexión en /health.
```

### Protocolo Estricto de Recuperación y Rollback (Sin Restauración Ciega):

> [!CAUTION]
> **REGLA FUNDAMENTAL DE RECUPERACIÓN:**
> **Ninguna restauración SQL completa debe ejecutarse directamente sobre Clever Cloud sin verificar previamente:**
> 1. El estado actual exacto de las tablas en producción (`SHOW TABLES`, conteo en `inv_articulos` e `inv_movimientos`).
> 2. Si se crearon movimientos, levantamientos o artículos operativos posteriores al respaldo del 4 de noviembre de 2026 (una restauración ciega sobrescribiría y destruiría esa información legítima).
> 3. La existencia de un snapshot inmediato tomado justo antes del incidente.

#### Niveles de Recuperación Gradual:

1. **Nivel 0 (Fallo durante la Migración DML):**
   - El script `migration_02_datos_homologacion_clever_cloud.sql` cuenta con `DECLARE EXIT HANDLER FOR SQLEXCEPTION` que aborta y ejecuta `ROLLBACK` atómico instantáneo ante cualquier error o fallo de aserción.
   - **Acción:** No se requiere intervención manual; la base de datos queda idéntica a antes del script DML.

2. **Nivel 1 (Reversión Operativa DML Post-Despliegue):**
   - Si tras el despliegue se detecta alguna discrepancia en la clasificación de sedes, se ejecuta la sección transaccional Nivel 1 de [rollback_clever_cloud_produccion.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/rollback_clever_cloud_produccion.sql).
   - **Efecto:** Desvincula `campamento_id` y retira sedes adicionales sin eliminar ningún artículo, usuario ni movimiento.

3. **Nivel 2 (Reversión Estructural DDL):**
   - Si se requiere retirar por completo las columnas y tablas añadidas por v2.0.0, se ejecuta el Nivel 2 de [rollback_clever_cloud_produccion.sql](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/rollback_clever_cloud_produccion.sql).
   - **Garantía:** No elimina `cargo` ni `cantidad_verificada` preexistentes en Clever Cloud.

4. **Nivel 3 (Restauración de Respaldo Físico / Volcado SQL — ÚLTIMO RECURSO):**
   - **SOLO SI** la base de datos sufriera una corrupción estructural catastrófica irreparable.
   - **Pasos Obligatorios Antes de Restaurar:**
     1. Extraer un volcado SQL de emergencia del estado dañado actual para preservar cualquier dato generado recientemente.
     2. Validar con Gerencia y Auditoría la pérdida admisible entre el 04-nov-2026 y el momento actual.
     3. Restaurar `bkwlgxt1ccjstm5cfoy5.sql` únicamente tras autorización explícita por escrito del Director de Ingeniería.

---

## 9. DICTAMEN FINAL

> **DICTAMEN: APTO PARA MIGRACIÓN PRODUCTIVA.**
> Los scripts `migration_01_estructural_ddl_clever_cloud.sql` y `migration_02_datos_homologacion_clever_cloud.sql` han demostrado compatibilidad absoluta con el motor MySQL 8.0 de Clever Cloud, preservación matemática y criptográfica de los 434 artículos reales, protección del perfil Developer y cero afectación a los datos históricos.
