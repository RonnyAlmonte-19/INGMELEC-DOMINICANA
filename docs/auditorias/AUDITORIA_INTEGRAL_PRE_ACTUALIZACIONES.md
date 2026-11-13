# AUDITORÍA INTEGRAL PRE-ACTUALIZACIONES — INGMELEC | ALMACÉN GENERAL v2.0

**Proyecto:** INGMELEC | ALMACÉN GENERAL (`v2.0.0`)  
**Repositorio:** `C:\Users\gener\OneDrive\Desktop\INGMELEC-GITHUB\INGMELEC-DOMINICANA`  
**Rama Activa:** `feature/almacen-general-v2` (HEAD: `683fb95` — *fix(deploy): preparar login y dependencias para produccion*)  
**Estado de Trabajo Git Previo:** `M .gitignore`, `M server/scripts/recovery-developer.js`  
**Modalidad:** Diagnóstico integral estrictamente de **solo lectura** (cero modificaciones al código fuente, cero cambios en bases de datos, cero commits/pushes, cero despliegues y cero exposición de credenciales).  
**Equipo de Especialistas:** Coordinador Principal + Auditor Frontend/UX + Auditor Backend/API + Auditor BD/Migraciones/Ciberseguridad.

---

## SECCIÓN A — RESUMEN EJECUTIVO

### 1. Estado General de Salud por Dimensión

| Dimensión Auditada | Calificación | Nivel de Madurez | Diagnóstico Sintético |
| :--- | :---: | :---: | :--- |
| **Compilación Frontend & Stack Base** | Media-Alta | Funcional | `vite build` compila limpio (`2,320` módulos en `7.00 s`), aunque en un único bundle JS de `1,170.79 kB` sin *code-splitting*. |
| **Calidad Estática (`ESLint` / Sintaxis)** | Media | Mejorar | `node --check` pasa 10/10 archivos `server/**/*.js`; `npm run lint` falla con **152 problemas (`10` errores, `142` advertencias)**. |
| **Compatibilidad MySQL 8.0 vs MariaDB** | **Crítica** | Inestable | Diferencias no manejadas entre `MySQL 8.0` y `MariaDB` causan crash de UI (`React Error #31`), fallos en `PUT /usuarios/:id` y columnas faltantes en `migration_01` frente a `almacenApi.js`. |
| **Integridad Territorial (Campamentos/OPL)** | **Crítica** | Con Riesgo | Hardcodeo de IDs locales (`3, 12, 13`) que colisionan con los IDs reales de Clever Cloud (`1, 3, 4`), corrompiendo vinculaciones de `27 de Febrero` (`ID 3` local) hacia `OPL` (`ID 3` en Clever Cloud). |
| **Seguridad & Control de Acceso (RBAC/IDOR)** | **Crítica** | Vulnerable | `requireAuth` falla abierto (*fail-open*) ante caídas de BD, `/config/entorno` es público, existen IDOR en `/dashboard/kpis` y `/campamentos/:id/almacenes`, TLS BD acepta certificados no verificados si se habilita, y `npm audit` reporta 1 CVE crítico y 7 altos en dependencias productivas. |
| **Consistencia de Datos y Levantamientos** | Baja-Media | Parcial | Consolidación falla al vincular duplicados existentes por `undefined` en parámetros SQL; movimientos `TRASLADO` no actualizan `campamento_id`; exportaciones e importación Excel presentan brechas funcionales. |
| **UX / Accesibilidad / Responsividad Móvil** | Baja | Básica | Layout roto en pantallas móviles (`pl-64` fijo y sidebar permanente sin drawer), cero soporte ARIA/Escape en los 11 modales, métricas históricas hardcodeadas en múltiples pantallas y ausencia de `@media print`. |
| **Cobertura de Pruebas Automatizadas** | Nula | Ausente | No existe suite de pruebas unitarias, de integración ni E2E en el repositorio (`server/tests/` inexistente); solo scripts manuales históricos en `scratch/`. |

### 2. Veredicto Arquitectónico y Operativo

**VEREDICTO:** El sistema **NO está listo para iniciar una etapa de nuevas funcionalidades ni operar sin intervención correctiva inmediata**. Aunque posee una base funcional valiosa —incluyendo hashing `Argon2id` conforme a OWASP, validación estricta al arranque de `JWT_SECRET`, protección pesimista con `SELECT ... FOR UPDATE` en movimientos y levantamientos, consultas SQL parametrizadas sin SQLi directo y un procedimiento DML transaccional robusto (`sp_ejecutar_migracion_02_homologacion`)—, **es obligatorio ejecutar primero una fase de estabilización técnica y cierre de brechas críticas (`Fase 1` y `Fase 2`)** antes de construir nuevas características sobre la plataforma.

### 3. Conteo Consolidado de Hallazgos Técnicos

| Severidad | Cantidad | Descripción General |
| :--- | :---: | :--- |
| **Críticos** | **8** | Crash `React Error #31`, divergencia DDL `migration_01` vs API, colisión de IDs `3/12/13` vs `1/3/4`, fallo en `consolidar`, `requireAuth` fail-open, JWT sin revocación/no constant-time, desfase de usuarios/MySQL 8.0 JSON Array y filtro global `activeCampamento`/`refreshKpis` inoperante. |
| **Altos** | **11** | Fuga IDOR en Dashboard y almacenes, bypass cross-campamento, `/config/entorno` público, TLS BD/`multipleStatements`/código muerto `guard.js`, brute-force vía `X-Forwarded-For`, inconsistencias transaccionales en movimientos/artículos/usuarios, `hasPermission()` sin uso, exportaciones defectuosas, layout móvil roto, FKs faltantes y vulnerabilidades `npm audit`. |
| **Medios** | **9** | Divergencias Dashboard/Reportes/Inventario (`sinSerial`), bugs de levantamientos/Excel (`BUENO` vs `Bueno`), hardcodes numéricos en UI, manejo de conexiones/errores `catch` vacíos, CORS abierto/`localStorage`, 3 generaciones de migraciones y riesgos en `rollback`, colisiones de códigos/seriales, limitaciones de routing manual y acciones destructivas/bajas sin UI/confirmación. |
| **Bajos** | **6** | 152 hallazgos ESLint, metadatos/digest SHA-256 en scripts + desfase `.gitignore`, monolito `4,320` líneas + N+1 + bundle `1.17 MB`, código muerto CSS/`!important`, accesibilidad WCAG AA/ARIA, índices redundantes y ausencia de suite de pruebas. |
| **TOTAL** | **34** | **34 hallazgos documentados con evidencia exacta en código/datos.** |

---

## SECCIÓN B — INVENTARIO DE MÓDULOS Y FUNCIONALIDADES

**Criterio estricto de clasificación utilizado:**
- **`FUNCIONAL`**: Comportamiento comprobado en ejecución en esta auditoría sin fallos bloqueantes.
- **`PARCIALMENTE FUNCIONAL`**: Implementado, pero con omisiones, hardcodes, divergencias de permisos o fallos en flujos secundarios.
- **`CON ERROR`**: Defecto grave o ruptura de contrato comprobada en código o ejecución que impide el funcionamiento correcto.
- **`NO IMPLEMENTADA`**: Capacidad declarada, esperada por negocio/permisos o parcialmente esbozada sin implementación operativa.
- **`INSPECCIONADO EN CÓDIGO / PENDIENTE DE PRUEBA FUNCIONAL`**: Lógica coherente en lectura estática, pendiente de verificación en runtime contra MySQL 8.0 / MariaDB activo (servicio `:3308` no disponible durante esta sesión).

| Dominio | Módulo / Funcionalidad | Archivos / Endpoints Principales | Clasificación Oficial | Observación Principal |
| :--- | :--- | :--- | :---: | :--- |
| **Infraestructura** | Validación estricta de arranque `JWT_SECRET` | `server/config/auth.js:31-59` | **`FUNCIONAL`** | Verificado en runtime: aborta con código `1` ante clave vacía, `< 32` chars o lista negra; acepta clave segura. |
| **Infraestructura** | Bloqueo de API legada `/api/*` y Healthcheck | `server/index.js:40-53` | **`FUNCIONAL`** | Verificado en runtime HTTP mock: `/api/*` retorna `404` JSON explícito; router activo en `/api/v2`. |
| **Infraestructura** | Compilación de producción Frontend (`Vite`) | `vite.config.js`, `package.json:10` | **`FUNCIONAL`** | Verificado en runtime: build exitoso en `7.00 s` (`2,320` módulos), con aviso por chunk `> 500 kB`. |
| **Infraestructura** | Guardián de entorno BD (`guard.js`) | `server/database/guard.js:10-71` | **`PARCIALMENTE FUNCIONAL`** | Lógica comprobada en runtime (bloquea Clever Cloud/prod), pero **no está importado en ningún archivo** (código muerto). |
| **Seguridad** | Middleware `requireAuth` y verificación JWT | `server/routes/almacenApi.js:85-156` | **`CON ERROR`** | Bloque `catch` (`L146-149`) falla abierto (*fail-open*) verificado en runtime mock; firma no usa `timingSafeEqual`; sin revocación. |
| **Seguridad** | Endpoint de entorno `/api/v2/config/entorno` | `server/routes/almacenApi.js:494-511` | **`CON ERROR`** | Accesible públicamente sin `requireAuth` (`HTTP 200` verificado), filtrando metadatos de entorno y usuario `readonly`. |
| **Autenticación** | Login (`LoginPage`, Argon2id, migración de hashes) | `src/pages/LoginPage.jsx`, `almacenApi.js:26-60,315-423` | **`INSPECCIONADO EN CÓDIGO / PENDIENTE DE PRUEBA FUNCIONAL`** | Flujo coherente con Argon2id y actualización progresiva de hashes legados; rate limit evadible vía `X-Forwarded-For`. |
| **Dashboard** | KPIs y filtro territorial (`DashboardPage` + `refreshKpis`) | `src/pages/DashboardPage.jsx:29-34`, `AppContext.jsx:134-147`, `almacenApi.js:517-1029` | **`CON ERROR`** | `refreshKpis` ignora parámetros; queries de `inv_almacenes.estado_verificacion` y `'PENDIENTE_VALIDACION'` fallan contra `migration_01`; fugas IDOR; banners hardcodeados (`433`). |
| **Layout / Navegación** | Selector global `activeCampamento` y Sidebar/Routing | `Topbar.jsx:65-85`, `Sidebar.jsx`, `App.jsx:30-141` | **`CON ERROR`** | `activeCampamento` no filtra ninguna página; layout móvil roto (`pl-64` permanente); routing sin 404 y pérdida de filtros en F5; falta `case 'levantamientos'` en Topbar. |
| **Layout / Navegación** | Manejo global de errores (`ErrorBoundary`) | `src/components/common/ErrorBoundary.jsx` | **`NO IMPLEMENTADA`** | Componente existente pero **no montado** en `App.jsx`/`main.jsx`; referencia claves legadas (`gridops_auth_token`). |
| **Inventario** | Consulta paginada y fichas de áreas (`INF/OFI/COC/ALM`) | `InventoryTable.jsx`, `*Page.jsx`, `almacenApi.js:1128-1299` | **`PARCIALMENTE FUNCIONAL`** | Opciones de campamento hardcodeadas con IDs locales (`3,12,13`); conteos fijos contradictorios (`261` vs `280`); `sinSerial` diverge del Dashboard; errores `403` silenciosos. |
| **Inventario** | Creación/Edición de bienes y vinculación territorial | `InventoryTable.jsx:750+`, `ItemDetailModal.jsx`, `almacenApi.js:1344-1687` | **`CON ERROR`** | `resolveCampamentoVinculacion()` hardcodea IDs `3,12,13` (colisión con ID `3` = OPL en Clever Cloud), retorna `'SIN_VINCULAR'` (inválido en ENUM) y no usa transacciones. |
| **Inventario** | Ordenamiento por columnas en tabla maestro | `InventoryTable.jsx:50-51,506-516` | **`NO IMPLEMENTADA`** | Estados e ícono declarados sin interacción ni handlers de clic en cabeceras. |
| **Inventario** | Baja / Retiro de activos en interfaz (`DELETE /articulos/:id`) | `AppContext.jsx:216-227`, `ItemDetailModal.jsx`, `almacenApi.js:1690-1730` | **`NO IMPLEMENTADA`** | Endpoint y método `AppContext` existen, pero no hay botón ni modal en UI; además `GET/PUT /:id` no filtran `activo = 1`. |
| **Campamentos / Sedes** | Gestión de Sedes y Almacenes (`UbicacionesPage` + API) | `UbicacionesPage.jsx`, `almacenApi.js:2648-2814` | **`PARCIALMENTE FUNCIONAL`** | `UbicacionesPage` fija sede inicial `'DISTRITO NACIONAL 27 DE FEBRERO'`; creación ignora `almacenes` del form; `POST /:id/almacenes` sin scope (IDOR); falta `PUT /campamentos/:id`. |
| **Movimientos** | Kárdex (`ENTRADA`, `SALIDA`, `TRASLADO`, `ASIGNACION`, `AJUSTE`) | `MovimientosPage.jsx`, `almacenApi.js:1736-2003` | **`PARCIALMENTE FUNCIONAL`** | Usa transacción ACID y `FOR UPDATE`, pero permite `SALIDA` cuando `cantidad_num IS NULL`, `TRASLADO` no actualiza `campamento_id`/`almacen_id` y no marca `cantidad_verificada = 1`. |
| **Levantamientos** | Gestión de sesiones, captura física e importación Excel | `LevantamientosPage.jsx`, `LevantamientoWorkspace.jsx`, `almacenApi.js:3136-4011` | **`CON ERROR`** | Comparaciones case-sensitive `'BUENO'` vs `'Bueno'` dejan KPI óptimo en `0`; campos autocomplete erróneos; `import-items` sin `FOR UPDATE` ni dedup y trunca decimales; permite operar sesiones `'Cancelado'`. |
| **Levantamientos** | Consolidación al inventario maestro (`/consolidar`) | `LevantamientoWorkspace.jsx:1387-1543`, `almacenApi.js:4017-4318` | **`CON ERROR`** | `SELECT` de duplicados omite `campamento_id` y `zona_estante`, enviando `undefined` al `UPDATE`; inserta duplicados del mismo lote; no propaga `es_sintetico` ni `almacen_id`. |
| **Levantamientos** | Cálculo de diferencias físico vs teórico y exportación acta/Excel | `LevantamientoWorkspace.jsx`, `almacenApi.js:3275-3333` | **`NO IMPLEMENTADA`** | No existe endpoint ni vista de conciliación de diferencias contra stock maestro ni descarga Excel/PDF de sesión. |
| **Reportes** | Reporte consolidado, exportación CSV/Excel e Impresión PDF | `ReportesPage.jsx`, `InventoryTable.jsx:156-189`, `almacenApi.js:2009-2238` | **`PARCIALMENTE FUNCIONAL`** | Dropdown hardcodeado (`3,12,13`); exporta CSV (no `.xlsx`) sin sanitizar fórmulas; `InventoryTable` exporta solo la página visible; sin CSS `@media print`. |
| **Usuarios y RBAC** | Listado, creación/edición de usuarios y matriz de permisos | `UsuariosPage.jsx`, `almacenApi.js:2262-2626` | **`CON ERROR`** | Lee `u.campamentos` en vez de `u.campamentos_asignados` (borra sedes al guardar); `PUT /usuarios/:id` pasa Array crudo en MySQL 8.0 si `permisos` no se envía; `hasPermission()` no se usa en UI. |
| **Usuarios y RBAC** | Pestaña Bitácora de Modificaciones de Acceso | `UsuariosPage.jsx:555-557`, `almacenApi.js:2628-2642` | **`CON ERROR`** | Dispara **`Minified React error #31` (`{activo}`)** en MySQL 8.0 por renderizar objetos JSON de `mysql2` directo en JSX. |
| **Auditoría General** | Bitácora General de Auditoría (`AuditoriaPage`) | `AuditoriaPage.jsx:106-112`, `almacenApi.js:2244-2256` | **`PARCIALMENTE FUNCIONAL`** | Protegida contra Error #31 con `typeof`/`JSON.stringify`, pero omite `detalles_previos` y carece de filtro por campamento (`scope`) o paginación. |
| **Base de Datos** | Migración DDL/DML Clever Cloud (`01` y `02`) y `rollback` | `server/database/migrations/*.sql` | **`PARCIALMENTE FUNCIONAL`** | `migration_02` posee manejo robusto (`EXIT HANDLER` + post-checks), pero `migration_01` omite columnas usadas por `almacenApi.js`, convive con migraciones MariaDB obsoletas y `rollback` tiene riesgos con IDs `1,3,4` y DDL post-operación. |

---

## SECCIÓN C — HALLAZGOS TÉCNICOS DETALLADOS (POR SEVERIDAD)

### C.1 Hallazgos Críticos (`8`)

#### `CRIT-01` — Crash de Producción `Minified React error #31` (`object with keys {activo}`) en Bitácora de Usuarios
- **Ubicación:** `src/pages/UsuariosPage.jsx:555-557`, alimentado por `GET /api/v2/usuarios/auditoria` (`server/routes/almacenApi.js:2628-2642`) y `PATCH /api/v2/usuarios/:id/estado` (`almacenApi.js:2535-2544`).
- **Evidencia observada:**
  ```jsx
  // src/pages/UsuariosPage.jsx:555-557
  <td className="py-2.5 px-4 text-slate-600 max-w-md truncate font-sans text-xs">
    {log.detalles_nuevos || log.detalles_previos || '-'}
  </td>
  ```
  Y en backend (`almacenApi.js:2541-2542`), `logAudit` guarda `{ activo: targetUser.activo }` y `{ activo: nuevoActivo }`. Verificado en prueba runtime simulando driver `MySQL 8.0`: `detalles_nuevos` llega en el JSON como `"object"` (`{ "activo": 0 }`), mientras en MariaDB local (`JSON` = alias de `LONGTEXT`) llegaba como string `'{"activo":0}'`.
- **Impacto:** Al abrir `/usuarios` -> pestaña `"Bitácora de Modificaciones de Acceso"`, React lanza `Error #31` (*Objects are not valid as a React child*). Sin `<ErrorBoundary>` montado (`src/main.jsx`/`src/App.jsx`), la aplicación entera colapsa y muestra el overlay global de `index.html:14-30`. Ocurre también para acciones `CREACION_USUARIO`, `MODIFICACION_USUARIO`, `ASIGNACION_PERMISOS` y `RECUPERACION_ACCESO_USUARIO`. *(Nota relacionada: `AuditoriaPage.jsx:108` sí serializa con `JSON.stringify`, aunque omite `detalles_previos`).*
- **Corrección recomendada:** Implementar un formateador seguro reutilizable (`typeof val === 'string' ? val : JSON.stringify(val)` con parseo amigable legible para objetos) en `UsuariosPage.jsx:556` y `AuditoriaPage.jsx`, envolver `<AppContent />` en `<ErrorBoundary>` y actualizar las claves legadas de `ErrorBoundary.jsx:20,85`.

#### `CRIT-02` — Incompatibilidad Estructural Bloqueante entre `migration_01` (Clever Cloud) y `server/routes/almacenApi.js`
- **Ubicación:** `server/database/migrations/migration_01_estructural_ddl_clever_cloud.sql` (`L28-36, L73, L78, L88`) vs `server/routes/almacenApi.js` (`L646, L661, L908, L925, L1256, L1347, L2945, L3040, L4223`).
- **Evidencia observada:**
  1. `almacenApi.js:661` y `925` consultan `inv_almacenes.estado_verificacion`, columna **inexistente** en `migration_01:78` (solo existe en `migration_integridad_campamentos_sinteticos.sql:16`, script MariaDB). En MySQL 8.0 ambos queries fallan silenciosamente en `try/catch` devolviendo `totalAlmacenes = 0` y `porAlmacen = []`.
  2. `almacenApi.js:646` y `908` filtran `clasificacion_sede = 'PENDIENTE_VALIDACION'`, valor **inexistente** en el `ENUM('CONFIRMADO','PROPUESTO','SINTETICO_PRUEBA','HISTORICO_NO_HOMOLOGADO','DUPLICADO_EQUIVALENTE')` de `migration_01:73`.
  3. `almacenApi.js:2945` y `3040` leen e insertan `departamento` y `telefono` en `inv_custodios`, columnas omitidas en `migration_01:28-36` (provocando HTTP `500` al crear custodios y silenciamiento en `GET /catalogos/custodios`).
  4. `almacenApi.js:1347` retorna `estado_vinculacion_sede = 'SIN_VINCULAR'`, valor ausente en `migration_01:88` (error SQL `1265 Data truncated` en modo estricto MySQL 8.0).
  5. `inv_levantamiento_items.area` (`schema_levantamientos.sql:65`) acepta `'OTRA'`, ausente en `inv_articulos.area` (`schema_almacen.sql:43`), rompiendo `/consolidar` (`almacenApi.js:4223`).
  6. Divergencia de nombres históricos respecto al respaldo real de Clever Cloud documentado en `docs/REVISION_FINAL_MIGRACION_CLEVER_CLOUD.md:39-44` (`marca`/`modelo_caracteristicas`/`creado_en` vs `marca_modelo`/`tipo_caracteristicas`/`fecha_creacion`; e incluso `almacenApi.js:1256` lista `creado_en` en `safeSortFields` junto a `fecha_creacion`).
- **Impacto:** Errores 500 silenciosos o fatales en KPIs de almacenes, sedes pendientes, catálogo de custodios, altas en sedes nuevas y consolidación en producción Clever Cloud.
- **Corrección recomendada:** Alinear un único esquema DDL canónico MySQL 8.0 mediante script de migración aditiva verificado con `information_schema`, asegurando que cada columna y valor `ENUM` consumido por `almacenApi.js` exista idénticamente en producción y desarrollo.

#### `CRIT-03` — Colisión Crítica de IDs Hardcodeados (`3, 12, 13` Locales vs `1, 3, 4` en Clever Cloud)
- **Ubicación:** `server/routes/almacenApi.js:1344-1370` (`resolveCampamentoVinculacion`), `almacenApi.js:1591-1599`, `src/components/common/InventoryTable.jsx:223-228,379-384`, `src/pages/ReportesPage.jsx:99-103`.
- **Evidencia observada:**
  - En el respaldo real del 5-Nov de Clever Cloud (`bkwlgxt1ccjstm5cfoy5 DTB SQL 2026.sql`, verificado por parser), `inv_campamentos` tiene: `id=1 DN-27FEB`, `id=2 KM19-DUARTE`, **`id=3 KM19-OPL`**, `id=4 MANT-633`, `id=5 SC`.
  - Sin embargo, `resolveCampamentoVinculacion()` (`almacenApi.js:1350-1361`) hardcodea los IDs de MariaDB local: `'27 DE FEBRERO'` -> **`cid = 3, aid = 3`**; `'OPL'` -> **`cid = 12, aid = 10`**; `'MANTENIMIENTO 633'` -> **`cid = 13, aid = 11`**. Además, `'KM 19 AUT DUARTE'` (`L1362`) tiene precedencia sobre `else if (cid)` (`L1366`), impidiendo reclasificar pendientes hacia sedes nuevas sin reescribir texto.
  - En Frontend, `InventoryTable.jsx` y `ReportesPage.jsx` envían `?campamento_id=3` para `27 DE FEBRERO`, `12` para `OPL` y `13` para `Mantenimiento 633`.
- **Impacto:** En Clever Cloud, crear o editar un bien de `27 de Febrero` le asigna **`campamento_id = 3` (que corresponde a `OPL` en producción)**; filtrar por `27 de Febrero` muestra los bienes de `OPL`, y asignar `OPL` o `Mantenimiento 633` apunta a IDs `12`/`13` inexistentes (dejándolos fuera de todo desglose por sede).
- **Corrección recomendada:** Eliminar por completo los IDs mágicos y resolver campamentos/almacenes dinámicamente desde `inv_campamentos`/`inv_almacenes` por `codigo` (`ALM-27FEB`, `CAMP-OPL`, `CAMP-M633`) o `id` real recibido, priorizando `campamento_id` explícito en reclasificaciones y poblando los `<select>` del Frontend desde `GET /api/v2/campamentos`.

#### `CRIT-04` — Fallo SQL (`undefined` binds) y Duplicación de Seriales en `POST /api/v2/levantamientos/:id/consolidar`
- **Ubicación:** `server/routes/almacenApi.js:4054, 4070-4155, 4213-4272`.
- **Evidencia observada:**
  - Línea `4079` selecciona `SELECT id, codigo_original, articulo_nombre, serie_imei, ubicacion_nombre, asignado_a, estado_fisico, cantidad_num, unidad_medida FROM inv_articulos` — **omite `campamento_id`, `almacen_id` y `zona_estante`**.
  - Líneas `4125` y `4127` asignan `masterExistente.campamento_id` y `masterExistente.zona_estante` (ambos `undefined`) y los pasan al `UPDATE` (`L4142, L4144`), lo que en `mysql2` provoca fallo de binding/transacción al elegir `VINCULAR_EXISTENTE` sin autorizar reubicación (opción por defecto).
  - Además: `dupMap` no se actualiza dentro del bucle (dos ítems nuevos con mismo serial en la sesión se insertan ambos duplicados), L4073 solo excluye `'N/A'` (no `'S/N'`, `'SIN SERIAL'`, etc.), L4054 no bloquea estado `'Cancelado'`, y `es_sintetico` ni `almacen_id` se propagan correctamente.
- **Impacto:** Bloqueo total (`HTTP 500`) al intentar conciliar levantamientos con seriales existentes, riesgo de duplicar activos maestros y contaminación de inventario real desde sesiones sintéticas o canceladas.
- **Corrección recomendada:** Incluir `campamento_id, almacen_id, zona_estante` en `L4079`, registrar seriales insertados en `dupMap` durante el loop, reutilizar lista normalizada de marcadores sin-serial, bloquear estado `'Cancelado'`, y propagar `es_sintetico`/`almacen_id`.

#### `CRIT-05` — Fallo Abierto (*Fail-Open*) de Seguridad en `requireAuth` ante Caídas de Base de Datos
- **Ubicación:** `server/routes/almacenApi.js:113-156` (especialmente líneas `146-149`).
- **Evidencia observada:**
  ```js
  // server/routes/almacenApi.js:146-149
  } catch (err) {
    req.user = decoded;
    return next();
  }
  ```
  Verificado en runtime con mock de pool lanzando `ECONNREFUSED`: ante una petición autenticada con JWT a `GET /api/v2/articulos`, `requireAuth` ignoró el fallo de BD y dejó pasar la ejecución hasta el handler del endpoint (`almacenApi.js:1243`).
- **Impacto:** Ante saturación del pool (`connectionLimit: 2`), timeout o caída momentánea de MySQL, usuarios **desactivados (`activo = 0`) o con permisos revocados** superan el middleware usando un payload JWT antiguo (hasta `48h`).
- **Corrección recomendada:** Cambiar el `catch` de `requireAuth` a política **fail-closed**: registrar el error técnico en logs de servidor y responder `503 Service Unavailable` (`Reintentar más tarde`); jamás invocar `next()`.

#### `CRIT-06` — Tokens JWT sin Revocación Real, TTL Extendido (`48h`) y Verificación Criptográfica Insegura
- **Ubicación:** `server/routes/almacenApi.js:85-110, 2593-2626`, `src/context/AppContext.jsx:123-131`.
- **Evidencia observada:**
  1. `verifyToken` (`L103`) compara firmas con `signature !== expectedSignature` (no es *constant-time* `crypto.timingSafeEqual`, a diferencia de `L48, L58`).
  2. `L99, L105` no valida `parts.length === 3`, ni `header.alg === 'HS256'`, ni `typeof decoded.exp === 'number'` (`undefined < Date.now()` evalúa `false`).
  3. El endpoint `/usuarios/:id/recuperar` (`L2593-2626`), desactivaciones o cambios de rol no invalidan tokens emitidos previamente, y `logout()` (`AppContext.jsx:123-131`) solo borra `localStorage` en el cliente.
- **Impacto:** Un token sustraído o emitido antes de un restablecimiento de contraseña permanece válido hasta `48h` sin posibilidad de revocación por incidente.
- **Corrección recomendada:** Usar `crypto.timingSafeEqual` en buffers de firma, validar algoritmo y tipo numérico de `exp`, introducir columna `token_version` en `inv_usuarios` verificada en `requireAuth` (incrementada en `/recuperar`, cambio de estado o logout global) y reducir TTL de sesión/añadir refresh tokens.

#### `CRIT-07` — Desfase Crítico en Módulo de Usuarios (`campamentos` vs `campamentos_asignados`) y Falla MySQL 8.0 en `PUT /usuarios/:id`
- **Ubicación:** `src/pages/UsuariosPage.jsx:188, 262, 435-448` vs `server/routes/almacenApi.js:2305, 2414-2485`.
- **Evidencia observada:**
  1. `GET /api/v2/usuarios` (`L2305`) retorna `campamentos_asignados`, mientras `UsuariosPage.jsx:188` y `435` leen `u.campamentos` (`c.id` en lugar de `c.campamento_id`). Todas las cuentas no-developer muestran *"Sin sede asignada"* y al editar un usuario se pierden sus campamentos adicionales al enviar `campamentos_adicionales: []`.
  2. `UsuariosPage.jsx:262` envía `area`, campo ignorado en `PUT /usuarios/:id` (`L2414-2468`).
  3. En `almacenApi.js:2447`, si `permisos === undefined`, asigna `targetUser.permisos_json`. En **MySQL 8.0**, `mysql2` entrega `permisos_json` ya parseado como **Array JS**; pasarlo sin `JSON.stringify` al placeholder `SET permisos_json = ?` produce expansión de array SQL y error de sintaxis. Adicionalmente `L2505` registra `req.body` íntegro en auditoría.
- **Impacto:** Pérdida silenciosa de asignaciones territoriales multi-sede al editar usuarios y fallos SQL 500 en actualizaciones parciales sobre MySQL 8.0.
- **Corrección recomendada:** Unificar contrato (`campamentos_asignados`), soportar `area` en `PUT /usuarios/:id` dentro de una transacción ACID, y normalizar `permisosStr` con `JSON.stringify` si es objeto/array antes de persistir.

#### `CRIT-08` — Selector Territorial Global (`activeCampamento`) y Filtro Territorial de `DashboardPage` Inoperantes
- **Ubicación:** `src/context/AppContext.jsx:24-40, 134-147`, `src/components/layout/Topbar.jsx:65-85`, `src/pages/DashboardPage.jsx:29-34`, y todas las páginas.
- **Evidencia observada:**
  - `DashboardPage.jsx:31-33` llama `refreshKpis({ campamento_id, almacen_id })`, pero `refreshKpis` en `AppContext.jsx:134` no recibe parámetros y ejecuta siempre `apiFetch('/dashboard/kpis')` sin query string.
  - `activeCampamento` del `Topbar` únicamente cambia textos informativos (`Sidebar.jsx:16`, `Topbar.jsx:45`, `DashboardPage.jsx:27`); ninguna página ni consulta API filtra por `activeCampamento`.
- **Impacto:** El selector principal de sede en la barra superior y los filtros territoriales del Dashboard crean una falsa percepción de aislamiento por campamento cuando siguen mostrando datos agregados.
- **Corrección recomendada:** Parametrizar `refreshKpis(params)` en `AppContext.jsx` enviando querystring validada, y propagar `activeCampamento` como filtro activo reactivo en Dashboard, Inventario, Ubicaciones, Movimientos, Levantamientos y Reportes.

---

### C.2 Hallazgos Altos (`11`)

#### `ALTO-01` — Fuga Global de Datos (IDOR) en `GET /api/v2/dashboard/kpis`
- **Ubicación:** `server/routes/almacenApi.js:639-666, 692-709, 921-953`.
- **Evidencia:** Los bloques `totalCampamentos`, `totalAlmacenes`, `levantamientosEnProceso`/`Finalizados`, `porAlmacen` y `levantamientosResumen` no aplican `scope` cuando `!scope.isGlobal` (ni respetan filtros `campamento_id`/`almacen_id` del request).
- **Impacto:** Usuarios restringidos a una sola sede visualizan almacenes, volúmenes físicos y títulos de levantamientos de campamentos no autorizados.
- **Corrección:** Aplicar filtrado por `scope.campamentoIds` en todos los sub-bloques de `/dashboard/kpis` y consolidar `consistenciaMatematica` según el ámbito del usuario.

#### `ALTO-02` — IDOR en Creación de Almacenes y Bypass Cross-Campamento por Substring `.includes()`
- **Ubicación:** `server/routes/almacenApi.js:2785-2814` (`POST /campamentos/:id/almacenes`) y `L1314, L1409, L1555, L1704, L1874`.
- **Evidencia:** `POST /campamentos/:id/almacenes` valida solo `requireRole`, sin invocar `getUserAllowedCampamentos`; además los endpoints por `:id` de artículos/movimientos permiten acceso si `ubicacion_nombre` contiene por subcadena (`includes()`) el nombre de un campamento del usuario, y `PUT /articulos/:id` + `POST /movimientos` omiten verificar si la sede destino pertenece al `scope` del operador. También `GET /articulos/:id`, `PUT` y `POST /movimientos` operan sobre registros con `activo = 0` o `es_sintetico = 1`.
- **Impacto:** Creación/alteración de activos o bodegas en campamentos ajenos y lectura/edición indebida mediante coincidencia parcial de texto.
- **Corrección:** Validar `scope` por FK exacta `campamento_id` (reservando coincidencia exacta de `ubicacion_nombre` solo cuando `campamento_id IS NULL`), validar sede destino contra `scope` y restringir por defecto a `activo = 1 AND es_sintetico = 0`.

#### `ALTO-03` — Exposición Pública de Configuración y Metadatos Internos (`GET /api/v2/config/entorno`)
- **Ubicación:** `server/routes/almacenApi.js:494-511`.
- **Evidencia:** Verificado en runtime HTTP mock: `GET /api/v2/config/entorno` responde `HTTP 200` sin token JWT, devolviendo `entorno`, `etiqueta`, `esPruebas`, `fuenteActiva`, `estadoCleverCloudReadonly` y `aviso` (revelando motor local `:3308`, estado de cuenta `ingmelec_readonly` y conteos internos).
- **Impacto:** Reconocimiento de infraestructura sin autenticación previa.
- **Corrección:** Exigir `requireAuth` (y limitar detalle técnico de BD a `requireDeveloper`).

#### `ALTO-04` — Inseguridad TLS MySQL, `multipleStatements: true`, `connectionLimit: 2` y `guard.js` Inactivo
- **Ubicación:** `server/database/db.js:20-25`, `.env.example:16`, `server/database/guard.js`.
- **Evidencia:** `db.js:20` usa `{ rejectUnauthorized: false }` cuando `DB_SSL === 'true'` ignorando el certificado CA disponible en `server/certs/clever-cloud-mysql-ca.pem`; `.env.example:16` mantiene `DB_SSL=false`; `db.js:24` activa `multipleStatements: true`; y `assertSafeDatabaseTarget` (`guard.js`) no es importado en ningún archivo del servidor ni scripts.
- **Impacto:** Exposición a ataques MITM / sniffing en tránsito hacia Clever Cloud y superficie innecesaria para SQLi apilada.
- **Corrección:** Cargar `clever-cloud-mysql-ca.pem` con `rejectUnauthorized: true` por defecto en producción, desactivar `multipleStatements: true` en el pool API e integrar `guard.js` en todo script de migración/QA.

#### `ALTO-05` — Evasión de Rate Limit y Falsa Trazabilidad vía `X-Forwarded-For` + Fuga de Memoria
- **Ubicación:** `server/routes/almacenApi.js:264, 285-309`.
- **Evidencia:** `rateLimitLogin` y `logAudit` leen directamente el header `req.headers['x-forwarded-for']` sin configurar `app.set('trust proxy', ...)`, y el `Map` `loginAttempts` no posee límite de tamaño ni purga TTL de entradas caducadas.
- **Impacto:** Cualquier atacante elude el bloqueo de 15 req/min rotando la cabecera `X-Forwarded-For`, falsifica IPs en `inv_auditoria` y puede agotar memoria del proceso Node.
- **Corrección:** Configurar `trust proxy` acorde a Render (`1`), consumir `req.ip`, aplicar rate limiting por IP + email con evicción TTL acotada (ej. `express-rate-limit`).

#### `ALTO-06` — Desincronización de Stock, Vinculación y Transacciones en Movimientos y Artículos
- **Ubicación:** `server/routes/almacenApi.js:1373-1687, 1887-1962, 2317-2514`.
- **Evidencia:**
  1. `POST /movimientos:1887-1904` y `L1914` permiten `SALIDA`, `TRASLADO` y `ASIGNACION` cuando `cantidad_num IS NULL` (`currentCant !== null` omite validación), sin controlar saldo negativo ni actualizar existencia.
  2. Un `TRASLADO` (`L1924-1939`) cambia `ubicacion_nombre` pero nunca actualiza `campamento_id`, `almacen_id` ni `estado_vinculacion_sede`; tampoco propaga `es_sintetico` a `inv_movimientos` ni marca `cantidad_verificada = 1` en `ENTRADA`/`DEVOLUCION`/`AJUSTE`.
  3. `POST /articulos`, `PUT /articulos/:id`, `POST /usuarios`, `PUT /usuarios/:id`, `POST /campamentos` ejecutan escrituras multi-tabla sin transacción (`ROLLBACK` imposible si falla un paso intermedio) y `POST/PUT /articulos` registran `parsedCant || 1` en movimientos de bienes con cantidad `0` o `NULL`.
- **Impacto:** Activos trasladados quedan contabilizados en el campamento de origen, stock no verificado sigue figurando como pendiente tras recibir entradas e inconsistencias parciales en BD.
- **Corrección:** Exigir existencia verificada antes de `SALIDA`/`TRASLADO`, resolver destino (`campamento_id`/`almacen_id`) en `TRASLADO`, actualizar `cantidad_verificada = 1` en entradas/ajustes y envolver mutaciones multi-tabla en transacciones ACID.

#### `ALTO-07` — Ignorancia Total de `hasPermission()` en UI y Contradicciones con el Backend (`403` en Acción)
- **Ubicación:** `src/context/AppContext.jsx:42-48`, `ItemDetailModal.jsx:55`, `MovimientosPage.jsx:102`, `LevantamientosPage.jsx:306`, `LevantamientoWorkspace.jsx:565-662`, `InventoryTable.jsx:280`, `ReportesPage.jsx:106-120`.
- **Evidencia:** `hasPermission` está definido en `AppContext.jsx` pero tiene **0 invocaciones** en todo `src/`. La UI verifica `currentRole` con reglas discrepantes frente a `DEFAULT_ROLE_PERMISSIONS`: habilita editar bienes a `almacen`, registrar movimientos a `supervisor`, crear levantamientos a `auditor` o consolidar a `almacen`, y muestra creación de campamentos sin restricción; tampoco oculta botones de exportación/impresión según `rep:exportar`/`rep:imprimir`.
- **Impacto:** Botones visibles que culminan en `HTTP 403` en producción o que contradicen permisos personalizados otorgados por el Developer.
- **Corrección:** Reemplazar comprobaciones manuales de `currentRole` por `hasPermission('<clave>')` en navegación, vistas y acciones.

#### `ALTO-08` — Exportaciones Incompletas, Ausencia de `.xlsx`/PDF Real y Riesgo CSV Injection
- **Ubicación:** `src/pages/ReportesPage.jsx:25-77`, `src/components/common/InventoryTable.jsx:156-189`, `src/components/levantamientos/LevantamientoWorkspace.jsx`.
- **Evidencia:**
  1. `InventoryTable` (`handleExportCsv`) descarga solo los registros paginados actualmente en pantalla (`limit: 25`) en lugar del universo completo filtrado.
  2. `ReportesPage` genera CSV en lugar de libro `.xlsx` real (pese a incluir `xlsx` en dependencias), silencia errores `403`/`500` con `return;`, escapa comillas solo en 3 de 18 columnas y omite `URL.revokeObjectURL`. Ambos CSV son vulnerables a CSV/Formula Injection (`=`, `+`, `-`, `@`).
  3. `"Imprimir / PDF"` llama a `window.print()` sin ninguna regla `@media print` en `src/index.css`/`App.css`, imprimiendo sidebar oscuro y recortando tablas anchas por `pl-64`.
  4. `LevantamientoWorkspace` carece por completo de exportación de actas/resultados.
- **Impacto:** Reportes truncados e inutilizables para auditoría física y riesgo de ejecución de fórmulas al abrir en Excel.
- **Corrección:** Consultar exportación backend completa en `InventoryTable`, implementar generador seguro (ExcelJS/SheetJS sanitizado contra fórmulas + manejo de errores) y añadir hoja de estilos `@media print` dedicada.

#### `ALTO-09` — Ruptura de Layout en Dispositivos Móviles y Modales sin Scroll Contenedor
- **Ubicación:** `src/App.jsx:129-141`, `src/components/layout/Sidebar.jsx:40-44`, `LevantamientoWorkspace.jsx:1389`, `MovimientosPage.jsx:215`.
- **Evidencia:** `Sidebar` permanece `fixed` (`w-64`/`w-20`) sin menú móvil ni backdrop, mientras `App.jsx` aplica `pl-64`/`pl-20` incondicionalmente (en `375px` quedan `119px` de área útil). Dos modales críticos carecen de `max-h` + `overflow-y-auto`.
- **Impacto:** Plataforma prácticamente inutilizable desde teléfonos o tabletas usadas en campo durante levantamientos físicos.
- **Corrección:** Implementar drawer responsivo (`md:pl-64`) con botón hamburguesa móvil en `Topbar` y estandarizar altura máxima y scroll interno en todos los modales.

#### `ALTO-10` — Carencia de Llaves Foráneas Críticas en Base de Datos (`10` Relaciones sin FK)
- **Ubicación:** `server/database/schema_almacen.sql`, `server/database/schema_levantamientos.sql`, `migration_01_estructural_ddl_clever_cloud.sql`.
- **Evidencia:** Solo 4 FKs existen en todo el esquema (`inv_movimientos.articulo_id` con `ON DELETE CASCADE`, `inv_almacenes.campamento_id` `CASCADE`, `inv_levantamientos.campamento_id` `RESTRICT`, `inv_levantamiento_items.levantamiento_id` `CASCADE`). Carecen de FK: `inv_articulos.{campamento_id, almacen_id, lote_id, creado_por}`, `inv_lotes_importacion.usuario_id`, `inv_movimientos.usuario_id`, `inv_auditoria.usuario_id`, `inv_levantamientos.{almacen_id, consolidado_por, creado_por}`, `inv_levantamiento_items.{articulo_maestro_id, creado_por}`, `inv_usuarios.{campamento_id, almacen_id}` y ambas tablas puente `inv_usuario_campamentos` / `inv_usuario_almacenes`. Además `ON DELETE CASCADE` en `inv_movimientos` pondría en riesgo el kárdex si se borrara un artículo.
- **Impacto:** Riesgo de registros huérfanos en producción si ocurren ediciones o fallos fuera de transacciones.
- **Corrección:** Auditar valores huérfanos previos y añadir restricciones `FOREIGN KEY` (`RESTRICT`/`SET NULL` según historial vs puente `CASCADE`) junto con sus índices correspondientes.

#### `ALTO-11` — Vulnerabilidades de Seguridad Conocidas en Dependencias Productivas (`npm audit --omit=dev`)
- **Ubicación:** `package.json`, `package-lock.json`, `server/package.json`, `server/package-lock.json`.
- **Evidencia verificada en runtime (`npm audit --omit=dev --json`):**
  - **`server/` (`96` dependencias prod — `6` vulnerabilidades: `1` Crítica, `2` Altas, `3` Moderadas):**
    - `proxy-addr` (`1.1.0 - 2.0.7`) — **Crítica (CVSS 9.1, GHSA-jqcg-44mw-7w3h):** IP spoofing vía subredes IPv6 mapeadas en IPv4 *(fix disponible)*.
    - `body-parser` (`<=1.20.8`) — **Alta (CVSS 7.5, GHSA-27r3-jxmh-p828):** DoS por bytes residuales tras cuerpo comprimido *(fix disponible)*.
    - `xlsx` (`^0.18.5`) — **Alta (CVSS 7.8, GHSA-4r6h-8v6p-xvw6 & GHSA-5pgg-2g8v-p4x9):** Prototype Pollution & ReDoS — **`fixAvailable: false`** en el registro npm oficial para `xlsx`.
    - `mysql2` (`<=3.23.0`) — **Moderada (CVSS 5.9):** Decompression-bomb DoS vía zlib sin cota *(fix disponible)*.
    - `morgan` (`<=1.12.0`) — **Moderada (CVSS 5.3):** Log Forging / Injection *(fix disponible)*.
    - `qs` (`2.2.5 - 6.16.0`) — **Moderada (CVSS 5.3):** Bypass de límite de array / DoS *(fix disponible)*.
  - **Raíz Frontend (`242` dependencias prod — `7` vulnerabilidades: `0` Críticas, `5` Altas, `2` Moderadas):**
    - `xlsx` (Alta, `fixAvailable: false`), `postcss` (Alta, Path Traversal en source maps), `browserslist` (Alta, OOM/prototype write), `source-map-js` (Alta, DoS), `nanoid` (Alta, bucle infinito), `postcss-selector-parser` (Moderada), `baseline-browser-mapping` (Moderada).
- **Impacto:** Exposición a DoS, contaminación de prototipos en parseo Excel (`xlsx`) y spoofing de IP en infraestructura Express.
- **Corrección:** Actualizar Express/sub-dependencias (`proxy-addr`, `body-parser`, `mysql2`, `morgan`, `qs`, `postcss`, etc.) vía `npm audit fix` probado en staging y evaluar reemplazo o migración de `xlsx` (`0.18.5`) hacia una librería mantenida (ej. `exceljs` o tarball oficial seguro) con validación estricta de entrada.

---

### C.3 Hallazgos Medios (`9`)

#### `MED-01` — Divergencias de Cálculos entre Dashboard, Inventario y Reportes
- **Ubicación:** `server/routes/almacenApi.js:213` vs `1218` vs `2212`, `L597-620`, `L1173`, `L2034`, `L2657`.
- **Evidencia:** `SQL_SIN_SERIAL_CONDITION` (`L213`, usado en Dashboard) evalúa `('N/A','S/N','SIN SERIAL','NO APLICA','NONE','-')`, pero `/articulos` (`L1218`) y `/reportes/exportar` (`L2212`) evalúan `('N/A','S/N','SIN SERIE','NONE','NULL','--','-')`; `porArea` (`L597-620`) descarta áreas fuera de las 4 llaves fijas o con `area IS NULL`; el scope híbrido (`OR ubicacion_nombre IN`) suma filas que `porCampamento` (`JOIN` estricto por `campamento_id`) excluye; `almacen_id` solo aplica para `scope.isGlobal` en Dashboard y no existe en `/articulos` ni `/reportes`.
- **Impacto:** Discrepancias visibles entre los KPIs del Dashboard y los listados al filtrar `?sinSerial=true` o por sede.
- **Corrección:** Centralizar condiciones SQL en helpers únicos compartidos y armonizar `almacen_id` y `scope` en los 4 módulos.

#### `MED-02` — Defectos Funcionales en Levantamientos, Contratos de Respuesta e Importación Excel
- **Ubicación:** `src/pages/LevantamientosPage.jsx:214`, `src/context/AppContext.jsx:394,430`, `src/components/levantamientos/LevantamientoWorkspace.jsx:146,214-219,320-400,653,715,881-884,1091-1095`, `server/routes/almacenApi.js:3897-4011`.
- **Evidencia:**
  1. `LevantamientoWorkspace.jsx` compara `estado_fisico === 'BUENO'/'REGULAR'/'DAÑADO'` en mayúsculas contra `'Bueno'/'Regular'/'Dañado'`, haciendo que el KPI *"Condición Óptima"* (`L653`) siempre muestre `0` y los badges caigan en gris neutro.
  2. Autocomplete maestro lee `art.marca`, `art.modelo_caracteristicas`, `art.codigo_interno`, `art.responsable_custodio` en vez de `marca_modelo`, `tipo_caracteristicas`, `codigo_original`, `asignado_a`.
  3. `LevantamientosPage.jsx:214` envía `almacenes` (strings) cuando backend (`L2729`) espera `almacenesIniciales` (`[{nombre}]`); `AppContext.jsx:394,430` lee `res.codigo_levantamiento` (`codigo`) y `res.warning_duplicado` (`advertencia`), ocultando advertencias de duplicado en captura.
  4. `POST /levantamientos/:id/import-items` valida estado fuera de la transacción y sin `FOR UPDATE` (TOCTOU frente a consolidar), convierte cantidades `<= 0`/texto silenciosamente a `1`, trunca decimales en cliente con `parseInt` (`L371`), usa `readAsBinaryString` obsoleto y ejecuta N+1 inserts individuales (hasta `5,000`).
- **Impacto:** Pérdida silenciosa de decimales, alertas de duplicado invisibles, KPIs erróneos en sesiones físicas y riesgo de colisión al importar lotes concurrentemente.
- **Corrección:** Alinear todos los contratos JSON/case-sensitivity, proteger `import-items` con `FOR UPDATE`, usar bulk `INSERT` validando cantidades sin conversión silenciosa y soportar decimales/unidades en importador Excel.

#### `MED-03` — Hardcodes Históricos Estáticos y Contradicciones Numéricas en Interfaz
- **Ubicación:** `DashboardPage.jsx:148,210,227,243,304,316,330`, `InventarioGeneralPage.jsx:9`, `InformaticaPage.jsx:9`, `OficinasPage.jsx:9`, `AlmacenPage.jsx:9`, `CocinaPage.jsx:16-26`, `UbicacionesPage.jsx:7,56,60,125`, `ItemDetailModal.jsx:434,449`.
- **Evidencia:** Textos literales muestran cifras congeladas al corte 16-Oct (`433`, `1,971`, `329`, `104`, `84`, `69`, `261` en `AlmacenPage.jsx:9` vs `280` en `InventoryTable.jsx:399`) incluso para usuarios restringidos a una sede o tras nuevas altas; `UbicacionesPage` inicia fijo en `'DISTRITO NACIONAL 27 DE FEBRERO'` dejando en `0` la vista inicial para operadores de otras sedes; `ItemDetailModal` atribuye archivo histórico `2026-10-16.xlsx` a activos creados manualmente.
- **Impacto:** Información contradictoria y confusión operativa conforme el inventario real evoluciona.
- **Corrección:** Alimentar contadores, sedes disponibles y trazabilidad de origen dinámicamente desde `kpis` y `origen_datos` del registro.

#### `MED-04` — Manejo Inseguro de Conexiones Pool, `catch` Vacíos y DDL en Tiempo de Petición HTTP
- **Ubicación:** `server/routes/almacenApi.js` (`L1800,3347,3516,3672,3816,3899,4019` para `getConnection()`, `L990,2964` `catch {}` vacíos, `L2902-2913` y `L3025-3036` `CREATE TABLE` en `catch`).
- **Evidencia:** Siete handlers transaccionales llaman `await pool.getConnection()` fuera del bloque `try` y ejecutan `await conn.rollback()` sin `try/catch` en el manejador de error; bajo `connectionLimit: 2`, una caída de red o agotamiento de conexiones lanza rechazo no controlado. Adicionalmente `POST /catalogos/*` ejecuta `CREATE TABLE IF NOT EXISTS` dentro de un `catch` omitiendo columna `es_sintetico`.
- **Impacto:** Posibles caídas del servidor Node ante errores transitorios de MySQL y esquemas incompletos creados al vuelo.
- **Corrección:** Adquirir `conn` dentro de `try` con liberación segura (`if (conn) conn.release()`), proteger `rollback().catch(() => {})` y retirar cualquier sentencia DDL de handlers HTTP.

#### `MED-05` — CORS Totalmente Abierto, Ausencia de CSP y Límite `10 MB` Global
- **Ubicación:** `server/index.js:19, 22-33`, `src/context/AppContext.jsx:21,64`.
- **Evidencia:** `app.use(cors())` habilita `Origin: *`; los headers HTTP omiten `Content-Security-Policy` y `Permissions-Policy` (mientras almacenan JWT en `localStorage`); y `express.json({ limit: '10mb' })` aplica globalmente a todos los endpoints incluidos `/auth/login` o `/articulos`.
- **Impacto:** Superficie ampliada frente a abuso cross-origin, XSS con robo de token en `localStorage` y consumo excesivo de memoria por payloads grandes en rutas de texto.
- **Corrección:** Restringir CORS vía variable `CORS_ORIGINS`, implementar CSP estricta, acotar `10mb` solo a rutas con carga de imágenes/lotes y considerar cookies `HttpOnly; SameSite` en refactorización de auth.

#### `MED-06` — Coexistencia de 3 Generaciones de Migraciones y Riesgos en `rollback_clever_cloud_produccion.sql`
- **Ubicación:** `server/database/migrations/*.sql` (7 archivos), `rollback_clever_cloud_produccion.sql:43-66, 75-120`.
- **Evidencia:** Conviven `migration_01`/`02` (MySQL 8.0), el duplicado consolidado `migration_clever_cloud_produccion_aditiva.sql` y scripts previos con sintaxis MariaDB (`ADD COLUMN IF NOT EXISTS` en `migration_integridad` y `migration_usuarios_multi_almacen`), sin tabla de control `schema_migrations`. Asimismo `migration_01` usa `ALTER TABLE ADD COLUMN` sin verificación `information_schema` (no es re-ejecutable). En `rollback_clever_cloud_produccion.sql`: Nivel 1 usa IDs fijos `WHERE id IN (1, 3, 4)` sin `EXIT HANDLER` DML y revoca permisos globalmente sin filtrar cuentas post-migración; Nivel 2 ejecuta `DROP COLUMN campamento_id, almacen_id` destruyendo vinculaciones de registros nuevos (`id > 434`) y dejando incompatible la BD con el backend v2.0.
- **Impacto:** Alto riesgo humano de ejecutar un archivo obsoleto o no idempotente sobre Clever Cloud y pérdida de datos territoriales post-migración si se corre Rollback Nivel 2.
- **Corrección:** Archivar migraciones obsoletas, introducir historial `schema_migrations`, parametrizar el rollback por código (`codigo`) en lugar de `id IN (1,3,4)` y respaldar tablas antes de cualquier cambio estructural.

#### `MED-07` — Condiciones de Carrera en Códigos Autogenerados y Sin Validación de Seriales en Inventario Maestro
- **Ubicación:** `server/routes/almacenApi.js:1042-1108` (`generateNextCodeForArea`), `L1422-1437` (`POST /articulos`), `L1601-1645` (`PUT /articulos/:id`), `L3231-3233` (`POST /levantamientos`).
- **Evidencia:** Generación por `SELECT` + `match(/\d+/g)` o `COUNT(*) + 1` sin transacción ni secuencia; `POST /articulos` y `PUT /articulos/:id` no validan unicidad de `serie_imei` ni capturan `ER_DUP_ENTRY` de `codigo_levantamiento`; `inv_almacenes` carece de `UNIQUE(campamento_id, nombre)`.
- **Impacto:** Colisiones de códigos y seriales duplicados bajo concurrencia o al importar/crear bienes consecutivamente.
- **Corrección:** Usar secuencias/contadores atómicos bloqueados (`FOR UPDATE`) y validación de unicidad normalizada para seriales en altas y ediciones.

#### `MED-08` — Limitaciones de Enrutamiento Manual y Pérdida de Estado en URL
- **Ubicación:** `src/App.jsx:30-71, 84, 111-120`, `src/components/common/InventoryTable.jsx:30-94`, `src/components/layout/Topbar.jsx:8-23`.
- **Evidencia:** Sin página 404 ni normalización de slash final (URLs inválidas o rutas bloqueadas por rol renderizan `DashboardPage` manteniendo la URL errónea); `InventoryTable` escribe `area` y `search` con `replaceState` pero al montar no los restaura tras un F5 ni limpia filtros cuando `popstate` elimina parámetros; `Topbar.jsx` omite `case 'levantamientos'` en `getPageTitle`.
- **Impacto:** Pérdida de filtros compartibles por URL y experiencia inconsistente de navegación con botón Atrás del navegador.
- **Corrección:** Incorporar `react-router-dom` o sincronizar estado URL completo en montaje/`popstate` con vista 404 explícita y título para `levantamientos`.

#### `MED-09` — Falta de Confirmación en Desactivación de Usuarios y Validación Insuficiente de Inputs/Roles
- **Ubicación:** `src/pages/UsuariosPage.jsx:287-293, 465-483`, `almacenApi.js:1190,1740,1778,2247,2317-2468,2726,2876,3001`.
- **Evidencia:** Activar/desactivar cuentas ocurre en 1 clic sin diálogo de confirmación; `POST /usuarios` no exige longitud mínima de contraseña (mientras `/recuperar` exige 8 y `recovery-developer.js` exige 10) ni valida `rol` contra whitelist o unicidad de email en `PUT`; `limit` negativo o parámetros query repetidos como arrays lanzan error SQL `500` / `TypeError` en `.toUpperCase()`/`.trim()`; campamentos y catálogos validan `requireRole` ignorando `requirePermission`.
- **Impacto:** Desactivaciones accidentales en producción, creación de usuarios con contraseñas triviales y excepciones 500 evitables ante parámetros malformados.
- **Corrección:** Añadir confirmación en toggle de estado usuario, validación centralizada de esquemas de entrada (`limit`, tipos string, contraseñas fuertes, roles válidos) y migración de endpoints a `requirePermission`.

---

### C.4 Hallazgos Bajos (`6`)

#### `BAJO-01` — Incumplimiento de `ESLint` (`152` Problemas: `10` Errores, `142` Advertencias)
- **Ubicación:** Salida completa de `npm run lint` (verificada en runtime): `server/routes/almacenApi.js:990` (`no-empty`), `2295` (`no-useless-assignment` en `perms`), `2964` (`no-empty`), `server/scripts/calcular-huella-hash.js:36`, `diagnostico-login-developer.js:92`, `generate-developer-sql.js:91,114`, `generate-update-sql.js:38`, `recovery-developer.js:192,218`, más `142` advertencias de `no-unused-vars` y `react-hooks/exhaustive-deps` en `src/` y `server/`.
- **Corrección:** Limpiar código muerto/catch vacíos y exigir `npm run lint` verde en CI.

#### `BAJO-02` — Metadatos/Digest SHA-256 en Scripts Operativos y Desfase de `.gitignore`
- **Ubicación:** `server/scripts/generate-update-sql.js:10,25,29-30`, `.gitignore:32,58-59`, `server/.gitignore:9-10`, `server/certs/clever-cloud-mysql-ca.pem`.
- **Evidencia:** `git ls-files` confirmó que **no hay archivos privados/backups rastreados** en el índice Git (`recovery-developer.js`, migraciones y `docs/` únicamente), y `clever-cloud-mysql-ca.pem` contiene solo certificado CA público sin clave privada. No obstante, `generate-update-sql.js` conserva hardcoded la constante `EXPECTED_SHA256` (huella SHA-256 del hash productivo de `developer`), rutas locales (`privado sql database`), email administrativo y nombre de BD Clever Cloud (también visible en encabezados SQL y `REVISION_FINAL`). Además, los 4 scripts auxiliares siguen físicamente en `server/scripts/` aunque están ignorados por `.gitignore`.
- **Corrección:** Retirar `EXPECTED_SHA256`, rutas locales y referencias operativas de scripts versionados o mover scripts históricos fuera del repositorio; añadir `!server/certs/clever-cloud-mysql-ca.pem` en `.gitignore` si `db.js` lo adopta.

#### `BAJO-03` — Monolito Backend (`4,320` Líneas), Consultas N+1/Secuenciales y Bundle Frontend de `1.17 MB`
- **Ubicación:** `server/routes/almacenApi.js` (4,320 líneas), `L573-990` (~14 queries secuenciales en Dashboard), `L1265` / `L3500` (`SELECT *` incluyendo columna `MEDIUMTEXT` Base64 `evidencia_foto`), y `dist/assets/index-ClgDyz-3.js` (`1,170.79 kB`).
- **Corrección:** Modularizar por dominios (`auth`, `inventario`, `campamentos`, `levantamientos`, `reportes`, `usuarios`), excluir `evidencia_foto` de listados e implementar `React.lazy` / `manualChunks`.

#### `BAJO-04` — CSS Residual, Overrides `!important` y Código Muerto en Interfaz
- **Ubicación:** `src/App.css` (184 líneas plantilla Vite sin usar), `src/index.css:104-148` (`!important` en `text-xs`..`text-lg` e inputs inflando tablas de 11–14 columnas), `src/index.css:150-316` (selectores huérfanos `div.fixed.inset-0.bg-black`, `motion\.div`), `tailwind.config.js:16-17` (`cyan` asignado a naranja `#f28524`), `InventoryTable.jsx:58,123-125` (`availableUbicaciones` sin uso).
- **Corrección:** Depurar `App.css` y reglas legadas en `index.css`, eliminar `!important` tipográficos globales y limpiar estados muertos.

#### `BAJO-05` — Brechas de Accesibilidad (WCAG AA / Teclado / ARIA) y Overlay de Errores en `index.html`
- **Ubicación:** Los 11 modales del sistema, `SearchableSelect.jsx`, tablas/tarjetas clicables (`DashboardPage`, `InventoryTable`, `UbicacionesPage`), `index.html:14-48`.
- **Evidencia:** Ningún modal implementa `role="dialog"`, `aria-modal="true"`, cierre con `Escape`, clic en backdrop ni atrapamiento de foco; `<label>` carecen de `htmlFor`; contraste insuficiente en `text-slate-400` (~2.56:1) y `#F28524` sobre blanco (~2.61:1); `index.html` inserta `event.message` mediante `innerHTML` sin escape ni botón de cierre.
- **Corrección:** Crear componente `<Modal>` accesible común, asociar `htmlFor`/`id`, usar botones reales o `role="button"` con soporte de teclado y cambiar `innerHTML` por `textContent` en `index.html`.

#### `BAJO-06` — Índices SQL Redundantes y Ausencia de Suite Automatizada de Pruebas
- **Ubicación:** `schema_almacen.sql`, `schema_levantamientos.sql`, `migration_01` (índices duplicados como `idx_inv_usuarios_email` sobre `UNIQUE(email)`, `idx_cat_area` sobre `uk_area_categoria`, `idx_uc_usuario` sobre `uk_usuario_campamento`, etc., frente a ausencia de índice compuesto `inv_articulos(activo, es_sintetico, campamento_id, area)`). No existen tests automatizados ni scripts npm `test`.
- **Corrección:** Eliminar índices duplicados tras crear índices compuestos óptimos e incorporar suite automatizada (`node:test` / Vitest / Playwright) en fases posteriores.

---

## SECCIÓN D — AUDITORÍA DE SEGURIDAD

### 1. Matriz de Seguridad Aplicativa e Infraestructura

| Vector / Dominio | Estado Actual | Evidencia Verificada | Riesgo Resid. | Remediación Prioritaria |
| :--- | :--- | :--- | :---: | :--- |
| **Autenticación y JWT** | **Deficiente** | `requireAuth` (`almacenApi.js:146-149`) fail-open ante fallo BD; `verifyToken` (`L103-105`) sin `timingSafeEqual`, sin check `alg` ni `typeof exp`; 48h sin revocación; `validateAndGetJwtSecret` (`auth.js`) sí cumple política de arranque. | **Crítico** | Fail-closed (`503`), `timingSafeEqual`, `token_version` por usuario, reducción TTL. |
| **Contraseñas / Hashing** | **Adecuado con legado** | `Argon2id` OWASP (`64 MiB`, `t=3`, `p=1`) + `verifyPassword` (`L26-60`) migra PBKDF2 (`1000` iter.) y texto plano legado al iniciar sesión; `POST /usuarios` no exige longitud mínima de clave. | **Medio** | Exigir `>= 10` caracteres al crear usuarios y planificar expiración/rotación de cuentas aún en formato legado. |
| **Control de Acceso (RBAC & IDOR)** | **Deficiente** | IDOR en `GET /dashboard/kpis` y `POST /campamentos/:id/almacenes`; bypass `.includes()` en artículos/movimientos; `GET /config/entorno` público (`200`); `hasPermission()` no usado en UI; catálogos/campamentos usan solo `requireRole`. | **Alto** | Scope estricto por FK `campamento_id` en todas las rutas, `requirePermission` en backend y `hasPermission()` en UI. |
| **Inyección SQL (SQLi)** | **Controlado (con deuda `multipleStatements`)** | Queries parametrizadas con `?`, whitelists en `ORDER BY` (`L1256`). Riesgo latente: `db.js:24` activa `multipleStatements: true` y parámetros `limit`/`parseInt` sin cota provocan error 500. | **Bajo-Medio** | Desactivar `multipleStatements: true` en `db.js` y validar estrictamente query params. |
| **Seguridad BD & Transporte (TLS)** | **Deficiente** | `DB_SSL=false` en `.env.example`; `db.js:20` usa `rejectUnauthorized: false` ignorando `server/certs/clever-cloud-mysql-ca.pem`; `guard.js` no integrado. | **Alto** | Habilitar TLS estricto con CA oficial en producción (`rejectUnauthorized: true`). |
| **Red / HTTP / XSS / CORS** | **Parcial** | Headers básicos en `server/index.js:22-31`, pero `cors()` es `*`, falta CSP/Permissions-Policy, JWT se guarda en `localStorage`, CSV vulnerable a Formula Injection y `index.html:28` usa `innerHTML`. | **Medio** | Whitelist `CORS_ORIGINS`, cabecera CSP, neutralización prefijos CSV (`=,+,-,@`) y `textContent` en `index.html`. |
| **Fuerza Bruta / DoS** | **Vulnerable** | `rateLimitLogin` (`L289-309`) lee `X-Forwarded-For` falsificable sin `trust proxy`, `Map` sin límite de memoria y `express.json({ limit: '10mb' })` global (`server/index.js:33`). | **Alto** | `trust proxy`, `express-rate-limit` acotado por IP+email y límite JSON específico por ruta. |
| **Secretos, Scripts y Git** | **Limpio en índice Git / Con deuda documental** | `.env*`, `*privado*.sql`, `server/backups/` y `server/scripts/*` excluidos; `git ls-files` sin leaks. Sin embargo, `generate-update-sql.js:25` expone huella `EXPECTED_SHA256`, rutas locales y BD destino; 4 scripts auxiliares existen localmente fuera de regla `!recovery-developer.js`. | **Bajo-Medio** | Limpiar scripts auxiliares del directorio y retirar identificadores/huellas operativas del código fuente. |
| **Dependencias (`npm audit`)** | **Vulnerable** | Server: `1` Crítica (`proxy-addr`), `2` Altas (`body-parser`, `xlsx`), `3` Moderadas (`mysql2`, `morgan`, `qs`). Raíz: `5` Altas (`xlsx`, `postcss`, `browserslist`, `source-map-js`, `nanoid`), `2` Moderadas. | **Alto** | Ejecutar `npm audit fix` controlado y reemplazar `xlsx 0.18.5`. |

---

## SECCIÓN E — AUDITORÍA DE DATOS Y CASO ESPECÍFICO `OPL` / `105` PENDIENTES vs `137`

### 1. Reconciliación Forense de Volúmenes Documentales vs Respaldo 5-Nov Clever Cloud

Verificado mediante análisis léxico de `bkwlgxt1ccjstm5cfoy5 DTB SQL 2026.sql` (respaldo previo a migración en Clever Cloud) contrastado con `docs/DEPURACION_INTEGRAL_DATOS_CAMPAMENTOS.md` y `migration_02`:

| Origen / Ubicación Exacta (`ubicacion_nombre`) | Respaldo Clever Cloud (05-Nov, Pre-Migración) | MariaDB Local Conciliado (`DEPURACION_INTEGRAL`) | Vínculo Definido en `migration_02` | Observación Técnica |
| :--- | :---: | :---: | :--- | :--- |
| `'DISTRITO NACIONAL 27 DE FEBRERO'` | **86** art. / **432** u. (`2` NULL) | **84** art. / **416** u. (`2` NULL) | `ALM-27FEB` (`CONFIRMADO`) | Incluye registros operativos del 03/11 (`INF-090` y adiciones manuales) en Clever Cloud. |
| `'KM 19 AUTOPISTA DUARTE OPL'` | **136** art. / **762** u. (`0` NULL) | **136** art. / **762** u. (`0` NULL) | `CAMP-OPL` (`CONFIRMADO`) | Sedes confirmadas de `OPL` (`HER-001`..`HER-136`). |
| `'MANTENIMIENTO 633'` | **107** art. / **661** u. (`0` NULL) | **109** art. / **685** u. (`0` NULL) | `CAMP-M633` (`CONFIRMADO`) | Diferencia de 2 ítems respecto al corte local (`109` vs `107`). |
| `'KM 19 AUT DUARTE'` | **104** art. / **108** u. (`21` NULL) | **104** art. / **108** u. (`21` NULL) | `campamento_id = NULL` (`SEDE_AMBIGUA`) | `61` de `INFORMATICA` + `43` de `OFICINAS`; **`21` sin cantidad verificada**. |
| `'ALMACEN KM 19 AUDITADO'` (`id=180`, `HER-252`) | **1** art. / **1** u. | *(incluido como auditado en local)* | `campamento_id = NULL` (`SEDE_AMBIGUA`) | Marcado explícitamente como pendiente en `migration_02:228-231` (**`104 + 1 = 105`**). |
| **TOTAL UNIVERSO** | **434** art. / **1,964** u. | **433** art. / **1,971** u. | **`329` vinculados + `105` pendientes** | `migration_02` L302/308 exige `>= 434` y `>= 1,964` u. antes del `COMMIT`. |

### 2. Explicación Exacta del Caso `OPL = KM 19 AUT DUARTE = KM 19 AUTOPISTA DUARTE OPL` (`105` vs `137`)

1. **Por qué son `105` artículos pendientes (`campamento_id IS NULL`, `SEDE_AMBIGUA`):**
   - Provienen estrictamente de sumar **`104`** artículos con `ubicacion_nombre = 'KM 19 AUT DUARTE'` (`61` Informática + `43` Oficinas) más **`1`** artículo (`id = 180`, `HER-252` `'SISTEMA DE PORTA TIERRA'`) con `ubicacion_nombre = 'ALMACEN KM 19 AUDITADO'`, ambos fijados deliberadamente con `campamento_id = NULL` y `estado_vinculacion_sede = 'SEDE_AMBIGUA'` por `migration_02:228-231`.
   - Verificado en el respaldo 5-Nov que la intersección de `codigo_original` entre `'KM 19 AUTOPISTA DUARTE OPL'` y `'KM 19 AUT DUARTE'` es **`0` (`[]`)** y la de áreas es disjunta (`ALMACEN` en OPL vs `INFORMATICA`/`OFICINAS` en `KM 19 AUT DUARTE`). Por tanto, **NO se trata de artículos duplicados ni deben fusionarse automáticamente con OPL**, porque el complejo del Km 19 alberga tanto a `OPL`, como a `MANTENIMIENTO 633` y oficinas administrativas generales.

2. **Por qué producción puede mostrar `137` en `OPL` (frente a `136` históricos) y el riesgo grave activo:**
   - *(Hecho verificado en respaldo + código; conteo vivo en Clever Cloud no consultado directamente en esta auditoría por regla de no conexión).*
   - En el respaldo 5-Nov de Clever Cloud, `inv_campamentos` tiene **5 filas** donde **`id = 1` es `DISTRITO NACIONAL 27 DE FEBRERO`**, `id = 2` es `KM 19 AUT DUARTE`, **`id = 3` es `KM 19 AUTOPISTA DUARTE OPL` (`CAMP-OPL`)**, `id = 4` es `MANTENIMIENTO 633` y `id = 5` es `SAN CRISTÓBAL`.
   - Sin embargo, el código actual (`server/routes/almacenApi.js:1350-1353`) hardcodea **`cid = 3`** para `'27 DE FEBRERO'` (porque `3` era su ID en MariaDB local). En consecuencia, **cualquier alta (`POST /articulos`) o edición (`PUT /articulos/:id`) realizada tras el despliegue sobre un bien de `27 de Febrero` termina escribiendo `campamento_id = 3` —asignando ese artículo a `OPL` en Clever Cloud (`136 -> 137`)**—; paralelamente, editar un bien de `OPL` le asigna `cid = 12` (inexistente en Clever Cloud) y los filtros de Frontend (`InventoryTable.jsx:224,380` y `ReportesPage.jsx:100`) envían `campamento_id = 3` creyendo filtrar `27 de Febrero` cuando en realidad consultan `OPL`.
   - Asimismo, si un usuario dio de alta o movió un artículo directamente con `campamento_id = 3` o ubicación `'OPL'`, incrementaría OPL a `137`. Este desfase de IDs (`3/12/13` vs `1/3/4`) es el riesgo de integridad de datos más urgente del sistema.

3. **Hallazgos Adicionales de Calidad de Datos Detectados:**
   - **Duplicidad histórica de códigos en el respaldo 5-Nov:** Verificados exactamente dos `codigo_original` repetidos en `inv_articulos`: `HER-258` (`id=178` en Mantenimiento 633 e `id=400` en 27 de Febrero) y `HER-252` (`id=180` en `ALMACEN KM 19 AUDITADO` e `id=414` en 27 de Febrero), además de `20` filas operativas del 03-Nov con `codigo_original IS NULL`.
   - **Inconsistencia `DEFAULT` de `estado_vinculacion_sede`:** Cualquier artículo con `campamento_id IS NULL` distinto a los 4 `UPDATE` de `migration_02` conserva `estado_vinculacion_sede = 'CONFIRMADO'` por el `DEFAULT` de `migration_01:88`.
   - **`23` cantidades pendientes (`cantidad_num = NULL`):** `21` en `KM 19 AUT DUARTE` y `2` en `27 de Febrero` — correctamente preservadas sin inventar `0` ni `1` en `migration_02`, aunque `POST /movimientos` aún permite registrar salidas sobre registros `NULL`.

---

## SECCIÓN F — PLAN RECOMENDADO DE ACTUALIZACIONES (ROADMAP TÉCNICO)

Las tareas se clasifican siguiendo la escala de complejidad enterprise (**0–3 Ligero** · **4–6 Estándar** · **7–10 Profundo**), elevando automáticamente el riesgo ante impactos sobre seguridad, irreversibilidad o datos productivos.

| Fase | Nombre y Objetivo | Prioridad | Complejidad (0–10) | Dependencias Técnicas | Riesgos si no se ejecuta / Controles |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **FASE 1** | **Estabilización Crítica de Producción y Esquema MySQL 8.0** | **P0 (Inmediata)** | **9 / 10** *(Profundo)* | Respaldo previo completo Clever Cloud antes de tocar DDL/código. | Riesgo de caída de React (`#31`), errores 500 en `PUT /usuarios`, `inv_custodios`, `/consolidar` y corrupción progresiva de `campamento_id = 3` hacia OPL. |
| **FASE 2** | **Blindaje de Seguridad, Sesiones, RBAC/IDOR y Base de Datos** | **P1 (Urgente)** | **8 / 10** *(Profundo)* | Requiere Fase 1 estabilizada para probar sesiones/permisos reales sin crashes. | Riesgo de acceso tras revocación (`requireAuth` fail-open), ataques brute-force, exposición `/config/entorno`, IDOR entre sedes y tráfico BD sin TLS verificado. |
| **FASE 3** | **Integridad de Datos, Flujos Operativos y Contratos API–UI** | **P1 (Alta)** | **7 / 10** *(Profundo)* | Depende de catálogos dinámicos (`Fase 1`) y permisos granulares (`Fase 2`). | Mantiene inventario descuadrado entre Dashboard/Inventario/Reportes, `TRASLADO` huérfano, KPIs en 0 en levantamientos y pérdidas al editar sedes de usuarios. |
| **FASE 4** | **UX/UI Móvil, Reportes Reales (XLSX/PDF), Accesibilidad e Higiene** | **P2 (Media)** | **5 / 10** *(Estándar)* | Depende de endpoints de exportación y selector global `activeCampamento` de Fase 3. | Impide uso en campo desde celulares/tabletas, mantiene reportes CSV parciales y textos estáticos desactualizados (`433`, `261` vs `280`). |
| **FASE 5** | **Modularización Backend, Suite de Tests y Actualización de Dependencias** | **P2–P3 (Evolutiva)** | **6 / 10** *(Estándar/Profundo)* | Requiere contratos estables de Fases 1–4. | Dificulta futuras actualizaciones sobre monolito de `4,320` líneas y deja vulnerabilidades en librerías (`proxy-addr`, `xlsx`). |

### Detalle Técnico por Fase

- **FASE 1 — Estabilización Crítica MySQL 8.0 y Territorial:**
  1. Corregir renderizado JSON en `UsuariosPage.jsx:556` (y `AuditoriaPage.jsx`) + montar `<ErrorBoundary>` con claves `ingmelec_*`.
  2. Emitir migración aditiva segura MySQL 8.0 (usando consultas a `information_schema`) para añadir `inv_almacenes.estado_verificacion`, `inv_custodios.{departamento,telefono}`, alinear `ENUM`s (`clasificacion_sede` con `'PENDIENTE_VALIDACION'`, `estado_vinculacion_sede` con `'SIN_VINCULAR'`, `inv_articulos.area` con `'OTRA'`), y corregir `PUT /usuarios/:id:2447` ante `permisos_json` ya parseado como Array.
  3. Eliminar IDs hardcodeados (`3,12,13`) en `resolveCampamentoVinculacion()`, `InventoryTable.jsx` y `ReportesPage.jsx`, resolviendo sedes por `codigo` (`ALM-27FEB`, `CAMP-OPL`, `CAMP-M633`) desde BD, y auditar los registros modificados recientemente en Clever Cloud (`campamento_id = 3` vs `27 de Febrero`).
  4. Corregir `/levantamientos/:id/consolidar` (`L4079`) añadiendo `campamento_id`, `almacen_id`, `zona_estante`, dedup intra-lote, exclusión completa sin-serial y bloqueo de `'Cancelado'`.
  5. Depurar migraciones MariaDB obsoletas y corregir `rollback_clever_cloud_produccion.sql` (sin `WHERE id IN (1,3,4)` ni destrucción de `id > 434`).

- **FASE 2 — Blindaje de Seguridad y BD:**
  1. Cambiar `requireAuth` (`L146-149`) a **fail-closed (`503`)**, migrar `verifyToken` a `crypto.timingSafeEqual` + validación `alg`/`exp`, añadir `token_version` para revocación inmediata en logout/recuperación/desactivación.
  2. Proteger `/config/entorno` con `requireAuth`, cerrar IDOR en `GET /dashboard/kpis` y `POST /campamentos/:id/almacenes`, reemplazar matching `.includes()` por validación estricta de `campamento_id` en origen y destino.
  3. Habilitar TLS estricto en `db.js` cargando `server/certs/clever-cloud-mysql-ca.pem` (`rejectUnauthorized: true`), desactivar `multipleStatements: true`, acotar pool/timeouts (`getConnection` dentro de `try`) e integrar `guard.js`.
  4. Configurar `trust proxy`, `express-rate-limit` con evicción TTL por IP+email, whitelist `CORS_ORIGINS`, cabecera CSP y política mínima de contraseña en `POST /usuarios`.

- **FASE 3 — Contratos API–UI y Consistencia Operativa:**
  1. Activar `activeCampamento` como filtro transversal real y corregir `refreshKpis(params)` en `AppContext.jsx`.
  2. Corregir contrato de usuarios (`campamentos_asignados`, `area`), aplicar `hasPermission()` en toda la UI y confirmar acciones críticas (toggle estado usuario, baja de activos `inv:eliminar`).
  3. Corregir `POST /movimientos` (bloquear `SALIDA`/`TRASLADO` cuando `cantidad_num IS NULL`, actualizar `campamento_id`/`almacen_id` en `TRASLADO`, marcar `cantidad_verificada = 1`), unificar `SQL_SIN_SERIAL_CONDITION` en todo el backend y envolver altas/ediciones multi-tabla en transacciones ACID.
  4. Corregir `LevantamientoWorkspace` (case `'Bueno'`/`'Regular'`/`'Dañado'`, mapeo autocomplete maestro, `advertencia`/`codigo`, `FOR UPDATE` en `import-items` con bulk `INSERT`) y crear módulo real de conciliación de diferencias físico vs teórico + `PUT /campamentos/:id`.
  5. Agregar FKs faltantes e índices compuestos óptimos (`inv_articulos(activo, es_sintetico, campamento_id, area)`).

- **FASE 4 — UX Móvil, Reportes, Accesibilidad y Higiene:**
  1. Rediseñar layout shell con drawer móvil (`md:pl-64`) y scroll en todos los modales.
  2. Reemplazar textos/conteos estáticos por datos dinámicos del backend; implementar descarga completa en `InventoryTable`, exportación `.xlsx` segura (sin formula injection), exportación de levantamientos y estilos `@media print`.
  3. Estandarizar `<Modal>` accesible (`role="dialog"`, `Escape`, focus-trap), contrastes WCAG AA, limpieza de `src/App.css`/CSS residual en `src/index.css` y corrección de los `152` avisos/errores `ESLint`.

- **FASE 5 — Arquitectura, Tests y Dependencias:**
  1. Dividir `server/routes/almacenApi.js` en módulos por dominio + middlewares compartidos y optimizar `GET /dashboard/kpis` / listados excluyendo `evidencia_foto` Base64 (`code-splitting` Vite con `React.lazy`).
  2. Actualizar dependencias (`npm audit fix` para `proxy-addr`, `body-parser`, `mysql2`, `morgan`, `qs`, etc.) y migrar de `xlsx 0.18.5` hacia alternativa mantenida sin CVEs.
  3. Crear suite de pruebas automatizadas (unitarias backend, integración API contra BD aislada y E2E Playwright contra navegador real).

---

## SECCIÓN G — CONCLUSIÓN Y PRUEBAS EJECUTADAS vs PENDIENTES

### 1. Registro Exacto de Verificaciones Ejecutadas en Esta Auditoría

Todas las verificaciones siguientes fueron **estrictamente no destructivas** (sin escrituras en el código del repositorio ni en bases de datos):

| Verificación Ejecutada | Resultado Real Observado | Alcance y Condiciones |
| :--- | :--- | :--- |
| **`node --check server/**/*.js`** | **Exitoso (`exit 0`)** en los `10` archivos JS del servidor (`index.js`, `auth.js`, `db.js`, `guard.js`, `almacenApi.js` y `5` scripts). | Verificación sintáctica Node v26.13.0. No ejecuta consultas reales ni valida lógica de negocio. |
| **`npx vite build --outDir <scratch>`** | **Exitoso (`exit 0`, `7.00 s`)**, `2,320` módulos transformados; genera bundle JS único de `1,170.79 kB` (`gzip: 337.86 kB`, warning chunk `> 500 kB`). | Compilado hacia directorio temporal externo (`scratch`) para preservar intacto el repositorio. |
| **`npm run lint` (`ESLint`)** | **Fallido (`exit 1`)**: **`152` problemas (`10` errores, `142` advertencias)**. | Ejecutado sobre todo el repositorio (`src/`, `server/`, `server/scripts/`). |
| **`npm audit --omit=dev --json`** | **Raíz:** `7` vulnerabilidades (`5` altas, `2` moderadas en `242` deps prod, `exit 1`). **Server:** `6` vulnerabilidades (`1` crítica, `2` altas, `3` moderadas en `96` deps prod, `exit 1`). | Auditoría offline/catálogo npm sobre `package-lock.json` vigentes. |
| **Pruebas Spawn `auth.js` (`JWT_SECRET`)** | **4/4 casos pasaron (`exit 1` en vacío/`<32` chars/lista negra; `exit 0` con secreto sintético `>=32`).** | Ejecutado en subprocesos Node aislados con variables sintéticas en memoria. |
| **Pruebas Spawn `guard.js`** | **4/4 casos pasaron (`exit 1` bloqueando Clever Cloud, falta de flag y `gridops_enterprise`; `exit 0` con `qa_isolated`).** | Ejecutado en subprocesos Node aislados sin conexión a BD. |
| **Sondeo HTTP Express en Memoria (`setPoolOverride` mock)** | Confirmó `404` en `/api/articulos`, `401` sin token en `/articulos` y `/dashboard/kpis`, **`200` público en `/api/v2/config/entorno`**, retorno tipo **`object`** en `logs[0].detalles_nuevos` bajo payload MySQL 8.0, y **llegada al handler tras error `ECONNREFUSED` en `requireAuth`** (fail-open). | Ejecutado en proceso HTTP efímero (`127.0.0.1:0`) con **mock in-memory de BD**, sin conexión real a MySQL ni Render. |
| **Análisis Léxico de Volcado 5-Nov Clever Cloud** | Verificó `434` artículos (`1,964` u.), `5` campamentos (`1: DN-27FEB`, `2: KM19-DUARTE`, `3: KM19-OPL`, `4: MANT-633`, `5: SC`), `86` `27 Feb`, `136` `OPL`, `107` `Mant. 633`, `104` `KM 19 AUT DUARTE` (`61 INF + 43 OFI`), `1` `ALMACEN KM 19 AUDITADO` (`id=180`), `0` códigos compartidos OPL vs `KM 19 AUT DUARTE`, `2` códigos duplicados (`HER-258`, `HER-252`). | Lectura estática local sobre respaldo SQL del 5-Nov; no consultó el estado vivo actual en Clever Cloud. |
| **Disponibilidad MariaDB Local `:3308` & `git ls-files`** | Puerto `127.0.0.1:3308` devolvió **`ECONNREFUSED`** (servicio apagado). `git ls-files` confirmó ausencia de credenciales, dumps o `.env` en el índice Git. | Comprobación de socket TCP y consulta de índice Git local. |

### 2. Pruebas Pendientes (Requieren BD Activa / Navegador Real Tras Autorizar Correcciones)

1. **Pruebas Funcionales End-to-End en Navegador (`Playwright` / UI real sobre MySQL 8.0):** Validación visual post-corrección de `UsuariosPage` (bitácora sin Error #31), filtros por `activeCampamento`, exportación `.xlsx`/impresión PDF en papel, responsividad móvil a `375px` y accesibilidad teclado en modales.
2. **Pruebas de Integración Backend contra Esquema Real MySQL 8.0:** Flujo completo de `POST /levantamientos/:id/consolidar` (`VINCULAR_EXISTENTE` y `OMITIR_DUPLICADOS`), `TRASLADO` entre campamentos, verificación de permisos por rol real (`admin`, `almacen`, `supervisor`, `auditor`, `gerencia`) y pruebas de concurrencia sobre códigos/stock.
3. **Auditoría SQL de Solo Lectura en Clever Cloud Producción (Bajo Autorización Explícita):** Confirmar conteo actual de `inv_campamentos` e `inv_articulos` (específicamente el registro `137` de `OPL` y registros creados tras la migración con `campamento_id = 3` vs `27 de Febrero`) antes de ejecutar el parche DDL/DML de Fase 1.

---
*Documento generado en modalidad de diagnóstico exclusivamente de solo lectura. No se ha modificado ningún archivo funcional, base de datos ni configuración operativa.*
