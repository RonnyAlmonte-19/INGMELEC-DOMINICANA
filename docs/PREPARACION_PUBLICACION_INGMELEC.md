# INFORME TÉCNICO DE PREPARACIÓN PARA PUBLICACIÓN EN GITHUB Y DESPLIEGUE EN RENDER

**PROYECTO:** INGMELEC | ALMACÉN GENERAL (`v2.0.0`)
**REPOSITORIO DESTINO:** `RonnyAlmonte-19/INGMELEC-DOMINICANA`
**PLATAFORMA DE HOSTING:** Render (Web Service Node.js + SPA React/Vite)
**BASE DE DATOS PRODUCTIVA:** Clever Cloud MySQL (`434` artículos reales intactos)
**ESTADO ACTUAL:** Preparación Local Completada (`0` comandos Git ejecutados, `0` escrituras en Clever Cloud, `0` despliegues en Render)

---

## 1. COMPARATIVA ARQUITECTÓNICA: `BACKUP_ORIGINAL_ERP` VS NUEVO `INGMELEC | ALMACÉN GENERAL` (TAREA 1)

Se comparó archivo por archivo la copia de respaldo original (`c:\Users\gener\OneDrive\Desktop\ALMACEN INGMELEC\BACKUP_ORIGINAL_ERP\INGMELEC-DOMINICANA-main`, compuesta por **51 archivos**) contra la nueva plataforma **`INGMELEC | ALMACÉN GENERAL`**.

| Dimensión | Versión Antigua (`BACKUP_ORIGINAL_ERP`) | Versión Nueva (`INGMELEC \| ALMACÉN GENERAL`) |
| :--- | :--- | :--- |
| **Propósito Funcional** | Prototipo híbrido de brigadas/técnicos (`GridOps / NovaOps`) con módulos desconectados (`BrigadasPage`, `TecnicosPage`, `SwapsPage`, `ActasPage`, `ReposicionesPage`). | Sistema integral multi-almacén y multi-campamento para control real del inventario de INGMELEC, conciliado con el levantamiento documental oficial. |
| **Router Backend** | `/api` (`server/routes/api.js`) con cabeceras inseguras `x-username` y `x-user-role` falsificables por el cliente. | `/api/v2` (`server/routes/almacenApi.js`, 4,278 líneas) con autenticación criptográfica JWT (`HS256`), validación en vivo contra base de datos y bloqueo explícito `HTTP 404` sobre el router legado `/api`. |
| **Seguridad de Arranque (`JWT_SECRET`)** | Permitía claves por defecto en código (`secret` / `1234`). | Validación estricta en `server/config/auth.js`: aborta el arranque si `JWT_SECRET` no existe, tiene menos de 32 caracteres o coincide con claves predeterminadas prohibidas. |
| **Esquema de Base de Datos** | Tablas legadas `users`, `tecnicos`, `brigadas`, `tools`, `actas` (`gridops_mysql_dump.sql`). | Esquema relacional independiente prefijado con `inv_*`: `inv_usuarios`, `inv_campamentos`, `inv_almacenes`, `inv_usuario_campamentos`, `inv_usuario_almacenes`, `inv_articulos`, `inv_movimientos`, `inv_levantamientos`, `inv_levantamiento_items`, `inv_categorias`, `inv_custodios`, `inv_lotes_importacion`, `inv_auditoria`. |
| **Gobierno de Usuarios y Sedes** | Roles genéricos sin aislamiento territorial. | **Soberanía exclusiva del Desarrollador Principal (`developer`)** para crear usuarios, asignar permisos granulares (`permisos_json`) y asignar campamentos (`ALMACÉN 27 DE FEBRERO`, `OPL`, `MANTENIMIENTO 633`). |
| **Módulos Frontend (`src/pages/`)** | 14 vistas antiguas de brigadas/personal (`BrigadasPage.jsx`, `PersonalPage.jsx`, `SwapsPage.jsx`, etc.). | 13 vistas especializadas de Almacén General: `DashboardPage.jsx` (con tabla de 13 métricas por campamento), `InventarioGeneralPage.jsx`, `InformaticaPage.jsx`, `OficinasPage.jsx`, `CocinaPage.jsx`, `AlmacenPage.jsx`, `LevantamientosPage.jsx`, `UbicacionesPage.jsx`, `MovimientosPage.jsx`, `ReportesPage.jsx`, `AuditoriaPage.jsx`, `UsuariosPage.jsx`, `LoginPage.jsx`. |

---

## 2. ARCHIVOS QUE DEBEN PUBLICARSE EN GITHUB (TAREA 2)

Únicamente deben incluirse en el control de versiones los archivos de código fuente, configuración de compilación, esquemas/migraciones SQL y documentación técnica oficial:

### 2.1 Raíz del Proyecto (Configuración y Entrada Frontend)
- `.gitignore` *(Actualizado y endurecido para bloquear secretos, respaldos y scripts QA)*
- `.env.example` *(Plantilla limpia sin valores sensibles)*
- `package.json` y `package-lock.json` *(Con dependencias unificadas de frontend + backend para Render)*
- `index.html`
- `vite.config.js`
- `tailwind.config.js`
- `postcss.config.js`
- `eslint.config.js`
- `README.md`

### 2.2 Frontend React (`src/` y `public/`)
- `public/favicon.svg`, `public/icons.svg`
- `src/main.jsx`, `src/App.jsx`, `src/App.css`, `src/index.css`
- `src/context/AppContext.jsx`
- `src/utils/statusMapper.js`
- `src/components/common/ErrorBoundary.jsx`
- `src/components/common/IngmelecLogo.jsx`
- `src/components/common/InventoryTable.jsx`
- `src/components/common/ItemDetailModal.jsx`
- `src/components/common/SearchableSelect.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/layout/Topbar.jsx`
- `src/components/levantamientos/LevantamientoWorkspace.jsx`
- `src/pages/AlmacenPage.jsx`
- `src/pages/AuditoriaPage.jsx`
- `src/pages/CocinaPage.jsx`
- `src/pages/DashboardPage.jsx`
- `src/pages/InformaticaPage.jsx`
- `src/pages/InventarioGeneralPage.jsx`
- `src/pages/LevantamientosPage.jsx`
- `src/pages/LoginPage.jsx` *(Saneado: sin credenciales pre-cargadas ni botones de acceso rápido QA)*
- `src/pages/MovimientosPage.jsx`
- `src/pages/OficinasPage.jsx`
- `src/pages/ReportesPage.jsx`
- `src/pages/UbicacionesPage.jsx`
- `src/pages/UsuariosPage.jsx`

### 2.3 Backend Express y Esquemas SQL (`server/`)
- `server/.gitignore` y `server/.env.example`
- `server/package.json` y `server/package-lock.json`
- `server/index.js` *(Incluye endpoint `/health`, cabeceras HSTS/OWASP, servicio estático de `dist/` y router `/api/v2`)*
- `server/config/auth.js` *(Validador criptográfico de `JWT_SECRET`)*
- `server/database/db.js` *(Pool MySQL con `connectionLimit: 2` optimizado para el límite de 5 conexiones de Clever Cloud)*
- `server/database/guard.js` *(Protector contra ejecuciones destructivas en hosts remotos)*
- `server/database/schema_almacen.sql`
- `server/database/schema_levantamientos.sql`
- `server/database/migrations/migration_catalogos_dinamicos.sql`
- `server/database/migrations/migration_usuarios_multi_almacen.sql`
- `server/database/migrations/migration_integridad_campamentos_sinteticos.sql`
- `server/database/migrations/migration_clever_cloud_produccion_aditiva.sql` *(Plan consolidado aditivo para Clever Cloud)*
- `server/database/migrations/rollback_clever_cloud_produccion.sql` *(Plan de reversión no destructivo)*
- `server/routes/almacenApi.js`

### 2.4 Documentación Técnica (`docs/`)
- `docs/MANUAL_COMPLETO_USUARIO_INGMELEC.md`
- `docs/ESTRUCTURA_CAMPAMENTOS_INDEPENDIENTES.md`
- `docs/DEPURACION_INTEGRAL_DATOS_CAMPAMENTOS.md`
- `docs/PREPARACION_PUBLICACION_INGMELEC.md`

---

## 3. ARCHIVOS Y DIRECTORIOS QUE DEBEN EXCLUIRSE (TAREA 4)

Se actualizaron `.gitignore` y `server/.gitignore` para garantizar que **ninguno** de los siguientes archivos o carpetas locales se suba jamás a GitHub:

| Categoría Excluida | Rutas / Patrones Bloqueados en `.gitignore` | Motivo de Exclusión |
| :--- | :--- | :--- |
| **Variables de Entorno y Secretos** | `.env`, `.env.*`, `server/.env`, `server/.env.*`, `*.env`, `*.pem`, `*.key` | Contienen credenciales reales o locales de base de datos y secretos JWT. |
| **Respaldos y Volcados de Datos** | `server/backups/`, `backups/`, `gridops_mysql_dump.sql`, `server/scripts/*.json`, `*.bak`, `*.dump` | Contienen volcados completos de tablas (`backup_mariadb_3308_pre_depuracion_20261104.json`, `mariadb_3308_full_dump.json`, hashes de usuarios). |
| **Archivos Excel de Inventario Físico** | `server/data/*.xlsx`, `*.xlsx`, `*.xls` | Contienen nombres de custodios, números de serie e inventario interno de la empresa. |
| **Scripts Locales de Auditoría y QA** | `server/scripts/`, `server/tests/`, `scripts/`, `scratch/`, `archive/`, `check-db.js`, `test-api.js`, `server/check-db.js`, `server/test-hash.js`, `server/start-test-server.js` | Contienen cuentas sintéticas (`@qa-real.test`), semillas ficticias y scripts de manipulación local para MariaDB `:3308`. |
| **Suites y Reportes Playwright E2E** | `e2e/`, `playwright-report/`, `test-results/`, `playwright.config.js` | Contienen credenciales de prueba automatizada y capturas de pantalla de sesiones locales. |
| **Dependencias y Compilados** | `node_modules/`, `server/node_modules/`, `dist/` | Se instalan y compilan limpiamente en Render durante el despliegue. |

---

## 4. LIMPIEZA DE SEGURIDAD EN EL CÓDIGO PUBLICABLE (TAREA 5)

Se realizó un escaneo automatizado (`scratch/analyze-publish-readiness.js`) sobre todos los archivos publicables (`src/**`, `public/**`, `server/config/**`, `server/routes/**`, `server/database/**` y archivos raíz):

1. **Eliminación de Credenciales y Botones QA en `src/pages/LoginPage.jsx`:**
   - Se eliminaron los estados iniciales pre-llenados (`useState('developer@ingmelec.com')` y `useState('[CONTRASEÑA_REDACTADA]')`), reemplazándolos por campos vacíos (`useState('')`).
   - Se eliminó la función `accesoRapidoQA` y el bloque completo **"Acceso Rápido por Rol"** que exponía botones de autocompletado para `developer@ingmelec.com`, `usuario-operativo@ejemplo.local`, `usuario-operativo@ejemplo.local`, `usuario-operativo@ejemplo.local` y `usuario-operativo@ejemplo.local`.
2. **Verificación Post-Limpieza:**
   - El escáner de seguridad confirmó **0 contraseñas hardcodeadas**, **0 correos `@qa-real.test`** y **0 botones de auto-login** en el código publicable.
   - Se recompiló el bundle de producción (`npm run build`) y se re-ejecutó la suite Playwright (`e2e/campamentos-conciliacion-stats.spec.js`), pasando las **3 suites E2E en Chromium (`3 passed`)** sobre el formulario limpio.

---

## 5. DEPENDENCIAS, `package.json` Y COMANDOS DE RENDER (TAREAS 2, 3 Y 6)

### 5.1 Corrección Crítica Detectada y Aplicada en `package.json`
En la estructura anterior, los paquetes del servidor (`express`, `cors`, `dotenv`, `morgan`, `mysql2`) solo figuraban en `server/package.json` y no en el `package.json` de la raíz. Si Render ejecutaba `npm install && npm run build` desde la raíz, el comando `node server/index.js` podía fallar al no encontrar `express` en el `node_modules` raíz.

**Solución implementada:**
1. Se incorporaron `cors`, `dotenv`, `express`, `morgan`, `mysql2` y `xlsx` directamente en las `dependencies` del `package.json` raíz (manteniéndolas también en `server/package.json`).
2. Se añadió el script `"render-build": "npm install --prefix server && vite build"` en el `package.json` raíz.
3. Se añadió el endpoint público de verificación de salud `GET /health` en `server/index.js` para el monitor de estado de Render.

### 5.2 Configuración Exacta para el Servicio Web en Render

| Parámetro en Render | Valor Recomendado |
| :--- | :--- |
| **Environment / Runtime** | `Node` (Node.js 20.x o superior) |
| **Root Directory** | *(Dejar vacío — raíz del repositorio)* |
| **Build Command** | `npm install && npm run build` *(o `npm install && npm run render-build`)* |
| **Start Command** | `npm start` *(ejecuta `node server/index.js`)* |
| **Health Check Path** | `/health` |

### 5.3 Prueba Local de Arranque en Modo Producción (Tarea 6)
Se verificó el arranque real del servidor Express compilado con `NODE_ENV=production`:
- `GET /health` -> `HTTP 200 OK` (`{"status":"ok","service":"INGMELEC | ALMACÉN GENERAL"}`).
- `GET /` -> `HTTP 200 OK` sirviendo `dist/index.html` con cabecera de seguridad `Strict-Transport-Security: max-age=31536000; includeSubDomains` activa.
- `GET /api/tecnicos` (ruta legada) -> `HTTP 404 Not Found` (`Endpoint legado /api desmantelado. Utilice /api/v2.`).

---

## 6. VARIABLES DE ENTORNO NECESARIAS EN RENDER (SIN VALORES SENSIBLES)

En el panel **Environment** del servicio en Render deben configurarse las siguientes **8 variables de entorno** (no incluir jamás sus valores reales en el código):

| Variable | Obligatoria | Descripción y Requisitos |
| :--- | :---: | :--- |
| `NODE_ENV` | Sí | Debe establecerse en `production` para activar HSTS y ocultar trazas de error internas. |
| `PORT` | Sí | Puerto de escucha HTTP (Render lo inyecta automáticamente o se define como `5000` / `10000`). |
| `DB_HOST` | Sí | Host del servidor MySQL productivo en Clever Cloud (`*.services.clever-cloud.com`). |
| `DB_PORT` | Sí | Puerto MySQL de Clever Cloud (`3306`). |
| `DB_USER` | Sí | Usuario de conexión MySQL proporcionado por Clever Cloud. |
| `DB_PASSWORD` | Sí | Contraseña del usuario MySQL en Clever Cloud. |
| `DB_NAME` | Sí | Nombre de la base de datos MySQL en Clever Cloud. |
| `DB_SSL` | Opcional | `false` o `true` según se requiera conexión TLS hacia el motor MySQL. |
| `JWT_SECRET` | **Crítica** | Clave criptográfica aleatoria de **mínimo 32 caracteres** para firmar los tokens JWT (`HS256`). Si falta o es débil, `server/config/auth.js` abortará el inicio por seguridad. |

---

## 7. MIGRACIONES SQL PENDIENTES PARA CLEVER CLOUD Y COHERENCIA DE TABLAS (TAREAS 7 Y 9)

### 7.1 Estado Actual de Clever Cloud vs Requerimientos de la Nueva Versión
En Clever Cloud existen actualmente los **434 artículos productivos** en `inv_articulos` (`414` históricos + `20` registrados el 3 de noviembre de 2026) y los 5 campamentos iniciales (`IDs 3, 4, 5, 6, 7`).

Para que Clever Cloud soporte el 100 % de las nuevas funciones de **INGMELEC | ALMACÉN GENERAL** (usuarios por sede, permisos JSON, catálogos dinámicos, 3 campamentos independientes confirmados y aislamiento de datos sintéticos), están pendientes las siguientes operaciones **estrictamente aditivas** consolidadas en [`server/database/migrations/migration_clever_cloud_produccion_aditiva.sql`](file:///c:/Users/gener/OneDrive/Desktop/ALMACEN%20INGMELEC/INGMELEC-DOMINICANA-main/INGMELEC-DOMINICANA-main/server/database/migrations/migration_clever_cloud_produccion_aditiva.sql):

| Tabla en Clever Cloud | Estado Actual en Producción | Cambios Aditivos Requeridos (`migration_clever_cloud_produccion_aditiva.sql`) | Impacto sobre los 434 Artículos Reales |
| :--- | :--- | :--- | :--- |
| `inv_usuarios` | Existe (Esquema Fase 1) | `MODIFY COLUMN rol VARCHAR(50)`, `ADD COLUMN campamento_id`, `almacen_id`, `permisos_json`, `es_developer`, `bloqueado_hasta`. | Ninguno. |
| `inv_usuario_campamentos` | Verificar / Crear | `CREATE TABLE IF NOT EXISTS inv_usuario_campamentos` (asignación multi-sede). | Ninguno. |
| `inv_usuario_almacenes` | Verificar / Crear | `CREATE TABLE IF NOT EXISTS inv_usuario_almacenes` (asignación de bodegas). | Ninguno. |
| `inv_categorias` | Verificar / Crear | `CREATE TABLE IF NOT EXISTS inv_categorias` + `INSERT IGNORE` desde categorías reales de `inv_articulos`. | Ninguno (solo lee categorías existentes). |
| `inv_custodios` | Verificar / Crear | `CREATE TABLE IF NOT EXISTS inv_custodios` + `INSERT IGNORE` desde custodios reales de `inv_articulos`. | Ninguno (solo lee custodios existentes). |
| `inv_campamentos` | Existen 5 registros (`IDs 3..7`) | `ADD COLUMN clasificacion_sede`, `es_sintetico`, `origen_registro`, `ubicacion_historica_equivalente`. Homologa `ID 3` como `ALMACÉN 27 DE FEBRERO`, inserta las sedes independientes `OPL` y `MANTENIMIENTO 633`, marca `San Cristóbal`, `Azua`, `Pedernales` como `PENDIENTE_VALIDACION` y desactiva el antiguo `CAMP-KM19`. | Ninguno. |
| `inv_almacenes` | Existen 5 registros | `ADD COLUMN codigo`, `es_sintetico`, `estado_verificacion`, `origen_registro`. Crea los almacenes principales de `OPL` y `MANTENIMIENTO 633`. | Ninguno. |
| `inv_articulos` | **Contiene los 434 artículos reales** | `MODIFY COLUMN cantidad_num DECIMAL(12,2) NULL`, `ADD COLUMN campamento_id`, `almacen_id`, `es_sintetico`, `origen_datos`, `estado_vinculacion_sede`. Vincula por `ubicacion_nombre` los artículos de `27 DE FEBRERO`, `OPL` y `MANTENIMIENTO 633`, y deja `KM 19 AUT DUARTE` en `SEDE_AMBIGUA`. | **Cero borrados, cero sobrescrituras.** Conserva intactos los 434 registros productivos. |
| `inv_levantamientos` e `inv_levantamiento_items` | Existen | `ADD COLUMN es_sintetico TINYINT(1) NOT NULL DEFAULT 0`. | Ninguno. |

> [!IMPORTANT]
> **Advertencia sobre privilegios DDL en Clever Cloud:** Como se documentó previamente, si el usuario de aplicación configurado en `DB_USER` tiene restringidos los permisos `ALTER TABLE` o `CREATE TABLE` en el plan compartido de Clever Cloud, el archivo `migration_clever_cloud_produccion_aditiva.sql` debe ejecutarse desde el panel **PHPMyAdmin / Console SQL de Clever Cloud** utilizando el usuario propietario de la base de datos antes de abrir el tráfico en Render.

---

## 8. PLAN DE MIGRACIÓN ADITIVA, RESPALDO Y REVERSIÓN (TAREA 8)

### Paso 1: Respaldo Íntegro Pre-Migración de Clever Cloud
Antes de ejecutar cualquier sentencia DDL/DML en Clever Cloud:
1. Exportar un volcado completo (`.sql` y `.json`) de las tablas productivas (`inv_articulos`, `inv_usuarios`, `inv_campamentos`, `inv_almacenes`, `inv_movimientos`, `inv_levantamientos`, `inv_levantamiento_items`, `inv_auditoria`).
2. Comprobar que el respaldo contiene exactamente los **434 artículos activos** (`SELECT COUNT(*) FROM inv_articulos WHERE activo = 1` = `434`).

### Paso 2: Ejecución de la Migración Aditiva Consolidada
1. Ejecutar en la consola SQL de Clever Cloud el script [`server/database/migrations/migration_clever_cloud_produccion_aditiva.sql`](file:///c:/Users/gener/OneDrive/Desktop/ALMACEN%20INGMELEC/INGMELEC-DOMINICANA-main/INGMELEC-DOMINICANA-main/server/database/migrations/migration_clever_cloud_produccion_aditiva.sql).
2. **Prohibición expresa cumplida:** Este script **no importa ni copia** los 433 artículos del Excel local; opera exclusivamente sobre los registros que ya residen en Clever Cloud.

### Paso 3: Verificación Post-Migración en Clever Cloud
Ejecutar las siguientes consultas de control:
- `SELECT COUNT(*) FROM inv_articulos WHERE activo = 1;` -> Debe seguir siendo **`434`** (`433` reales si `COC-001` se marca con `es_sintetico = 1`, más `1` sintético aislado = `434` filas totales intactas).
- `SELECT codigo, nombre, clasificacion_sede FROM inv_campamentos WHERE clasificacion_sede = 'CONFIRMADO';` -> Debe listar exactamente las 3 sedes independientes: **`ALMACÉN 27 DE FEBRERO`**, **`OPL`** y **`MANTENIMIENTO 633`**.

### Paso 4: Plan de Reversión Inmediata (Rollback)
En caso de cualquier anomalía durante la ventana de mantenimiento, ejecutar [`server/database/migrations/rollback_clever_cloud_produccion.sql`](file:///c:/Users/gener/OneDrive/Desktop/ALMACEN%20INGMELEC/INGMELEC-DOMINICANA-main/INGMELEC-DOMINICANA-main/server/database/migrations/rollback_clever_cloud_produccion.sql), el cual restablece los indicadores de vinculación sin tocar un solo dato de los 434 artículos.

---

## 9. RIESGOS DE REEMPLAZAR EL REPOSITORIO ANTERIOR (`RonnyAlmonte-19/INGMELEC-DOMINICANA`)

| # | Riesgo Identificado | Severidad | Mitigación Implementada |
| :---: | :--- | :---: | :--- |
| **1** | **Pérdida del código histórico del prototipo anterior (`GridOps / Brigadas`)** al hacer push de la nueva arquitectura. | Media | Antes de publicar en la rama `main`, se creará una rama o etiqueta de archivo en GitHub (`git branch backup-erp-v1-legacy` / `git tag v1.0-legacy-erp`) además de conservar la carpeta local `BACKUP_ORIGINAL_ERP`. |
| **2** | **Despliegue automático en Render antes de aplicar la migración SQL en Clever Cloud.** Si Render se conecta a GitHub con Auto-Deploy activo, compilará y arrancará la nueva versión inmediatamente al detectar el `git push`. | Alta | Ejecutar primero `migration_clever_cloud_produccion_aditiva.sql` en Clever Cloud y verificar `JWT_SECRET` (mínimo 32 caracteres) en las variables de entorno de Render **antes** de hacer `git push origin main`. |
| **3** | **Fallo de arranque en Render si `JWT_SECRET` en Render es menor de 32 caracteres o usa el valor antiguo.** | Alta | `server/config/auth.js` exige mínimo 32 caracteres. Antes del despliegue se debe verificar/actualizar `JWT_SECRET` en el panel Environment de Render con una cadena aleatoria de 64 caracteres hexadecimales. |
| **4** | **Filtración accidental de `.env`, volcados JSON o scripts con contraseñas de prueba.** | Crítica | Mitigado al 100 % mediante la limpieza de `LoginPage.jsx` y el bloqueo explícito en `.gitignore` de `.env*`, `server/backups/`, `server/scripts/`, `server/tests/`, `e2e/`, `scratch/`, `*.xlsx` y `*.sql` de volcado. |

---

## 10. PLAN GUIADO DE PUBLICACIÓN Y RECUPERACIÓN (PARA EJECUTAR CUANDO SE CONFIGURE GIT)

No se ha ejecutado ningún comando Git todavía. Cuando usted autorice iniciar la configuración guiada de GitHub en esta computadora, seguiremos esta secuencia exacta:

1. **Fase A — Respaldo y Preparación en Clever Cloud y Render:**
   - Generar respaldo de las tablas actuales de Clever Cloud.
   - Ejecutar `server/database/migrations/migration_clever_cloud_produccion_aditiva.sql` en Clever Cloud.
   - Verificar en el panel de Render las variables de entorno (`NODE_ENV=production`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` >= 32 caracteres).
2. **Fase B — Configuración de Git y Resguardo del Repositorio Anterior:**
   - Configurar `git config --global user.name` y `user.email` e iniciar sesión en GitHub (`gh auth login` o credencial HTTPS/SSH).
   - Clonar o conectar el remoto `https://github.com/RonnyAlmonte-19/INGMELEC-DOMINICANA.git` y respaldar el estado remoto actual en una rama `backup-erp-legacy-2026` en GitHub.
3. **Fase C — Verificación de `git status` (Control de Exclusiones):**
   - Comprobar con `git status --ignored` que ningún archivo `.env`, `.xlsx`, `server/backups/`, `server/scripts/`, `e2e/` ni `scratch/` esté en la lista de archivos a confirmar (`staged`).
4. **Fase D — Publicación y Verificación en Render:**
   - Realizar el commit de la versión `v2.0.0` (`INGMELEC | ALMACÉN GENERAL`) y publicar en `main`.
   - Verificar en Render el resultado de `npm install && npm run build`, el arranque de `node server/index.js`, la respuesta HTTP `200` en `/health` y el inicio de sesión del Desarrollador Principal con los 434 artículos productivos conciliados.
5. **Fase E — Plan de Recuperación Inmediata (Si ocurriera algún incidente en Render):**
   - En Render: usar el botón **Rollback to previous deploy** en el panel de Eventos, o apuntar temporalmente la rama de despliegue a `backup-erp-legacy-2026`.
   - En Clever Cloud: ejecutar `rollback_clever_cloud_produccion.sql`.
