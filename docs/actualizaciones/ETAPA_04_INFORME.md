# INFORME DE ETAPA 4 — CAMPAMENTOS, ALIAS CANÓNICOS Y REASIGNACIONES SEGURAS (v2.1)

**Proyecto:** INGMELEC | ALMACÉN GENERAL (`v2.1` Local)  
**Fecha:** 2026-11-11  

---

## 1. Estado
**Aprobada localmente**

## 2. Equipo
| Rol | Subagente / Agente | Responsabilidades Ejecutadas |
| :--- | :--- | :--- |
| **Coordinador Principal** | Coordinador INGMELEC | Dirección por archivos disjuntos, corrección de campo obligatorio `codigo_campamento` en `POST /campamentos/alias`, alineación del contrato JSON de vista previa/bloqueo en `UbicacionesPage.jsx` y control de calidad. |
| **Especialista Principal BD (Arquitecto BD)** | `especialista-arquitecto-bd` | Creación idempotente de [`migration_04_v21_campamentos_alias.sql`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_04_v21_campamentos_alias.sql) (`inv_campamento_alias`, `uk_alias_normalizado`, `fk_alias_campamento` `RESTRICT`, resolución dinámica por códigos estables) y alineación en [`v21_synthetic_fixture.sql`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/tests/fixtures/v21_synthetic_fixture.sql) conservando intactos los `29` artículos sintéticos. |
| **Especialista Complementario Backend (API & Transacciones)** | `especialista-backend-dev` | Implementación en [`almacenApi.js`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js) de `normalizeAliasKey`, `resolveCampamentoVinculacion` dinámica sin IDs `3/12/13`, detección de capacidad `campamentoAlias`, `/campamentos/alias`, `/campamentos/resolver-alias`, `/campamentos/reasignaciones/preview`, `/campamentos/reasignaciones/aplicar` ACID (`409` sin aprobación individual), `PUT /campamentos/:id`, filtro `campamento_codigo` y cálculo dinámico de `sinSedeVerificada`. |
| **Especialista Complementario Frontend (React UI)** | `especialista-frontend-dev` | Actualización de [`AppContext.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/context/AppContext.jsx), [`InventoryTable.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/components/common/InventoryTable.jsx), [`ReportesPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/ReportesPage.jsx) y [`UbicacionesPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/UbicacionesPage.jsx): retiro de IDs fijos `3/12/13` y conteos quemados, catálogo dinámico y panel de normalización/vista previa Antes vs Después con aprobación individual explícita. |
| **Ingeniero QA Independiente** | `especialista-qa-verificador` | Creación y ejecución de `server/tests/etapa04_campamentos_alias_qa.test.mjs` (`8/8` PASS), detección del desajuste JSON en `UbicacionesPage.jsx`, re-verificación SSR con payload real tras corrección, regresión secuencial `etapa01`–`etapa04` (`36/36` PASS), ESLint y `vite build`. |

## 3. Código (Archivos Modificados y Creados)
*Base de datos y migraciones futuras:*
- [`migration_04_v21_campamentos_alias.sql`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_04_v21_campamentos_alias.sql) *(NUEVO, propuesta futura local sin ejecutar en Clever Cloud)*: tabla `inv_campamento_alias`, índice `uk_alias_normalizado`, FK `fk_alias_campamento` (`ON DELETE RESTRICT`), sembrado dinámico por código (`ALM-27FEB`, `CAMP-OPL`, `CAMP-M633`) sin tocar `inv_articulos` existentes, marcando variantes históricas ambiguas con `requiere_revision_historica = 1`.
- [`v21_synthetic_fixture.sql`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/tests/fixtures/v21_synthetic_fixture.sql): tabla `inv_campamento_alias` + `17` alias sintéticos para sedes `id=1/3/4`, manteniendo `29` artículos (`15..22` con `campamento_id = NULL` y `SEDE_AMBIGUA` + duplicados `HER-258`/`HER-252` + `ALMACEN KM 19 AUDITADO`).

*Backend (`server/routes/almacenApi.js`):*
- [`normalizeAliasKey`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L1070-L1078) y [`resolveCampamentoVinculacion`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L1102-L1282): resolución por `campamento_id`, `inv_campamento_alias` y catálogo activo de `inv_campamentos` eliminando IDs fijos `3/12/13`.
- [`getSchemaCapabilities`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L561-L670) *(capacidad `campamentoAlias`)*, `resolveRequestedCampamentoFilter` *(soporte `campamento_codigo`)* y [`buildSinSedeSummary`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L1334-L1414).
- Corrección en `POST /articulos` y `PUT /articulos/:id` ([`almacenApi.js`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L2884-L2945)): actualiza `almacen_id` al almacén destino real al cambiar campamento/ubicación sin arrastrar `prev.almacen_id` previo ni reasignar alias ambiguos sin aprobación.
- Endpoints de campamentos y homologación ([`almacenApi.js`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L4141-L5222)): `GET /campamentos` (incluyendo `aliases` y `sin_sede_verificada` dinámico), `GET /campamentos/alias`, `POST /campamentos/alias` *(con `codigo_campamento` y `HTTP 409` duplicado)*, `POST /campamentos/resolver-alias`, `POST /campamentos/reasignaciones/preview`, `POST /campamentos/reasignaciones/aplicar` (`FOR UPDATE`, bloqueo `409` `REVISION_INDIVIDUAL_REQUERIDA`, preservación de `cantidad_num`/`cantidad_texto`/`ubicacion_nombre` histórica y verificación post-update pre-commit), y `PUT /campamentos/:id`.

*Frontend (`src/`):*
- [`AppContext.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/context/AppContext.jsx): estado global `campamentosCatalog` y helpers `refreshCampamentosCatalog`, `updateCampamento`, `fetchCampamentoAliases`, `resolverAliasCampamento`, `previewReasignacionAlias` y `aplicarReasignacionAlias`.
- [`InventoryTable.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/components/common/InventoryTable.jsx#L274-L355): filtros dinámicos desde `campamentosCatalog`/`kpis`, sin `campamentoLabelMap` fijo (`3/12/13`), sin default `'DISTRITO NACIONAL 27 DE FEBRERO'` y sin conteos estáticos en selectores.
- [`ReportesPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/ReportesPage.jsx#L17-L38): selector dinámico de campamentos y métricas reales sin valores `433/1971/23` ni opciones `3/12/13`.
- [`UbicacionesPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/UbicacionesPage.jsx): tarjetas con alias canónicos desde `campamentosCatalog`, card `SIN SEDE VERIFICADA` dinámica y panel completo **"Normalización de Alias y Reasignación Territorial Segura"** con vista previa Antes vs Después, detección de duplicados (`HER-258`/`HER-252`) y no homologados (`ALMACEN KM 19 AUDITADO`), selección y aprobación individual explícita alineada 1:1 con `campamento_destino_unidades`, `sin_sede_unidades`, `total_*_global`, `impacto_fusiones_articulos`, `impacto_cantidades_alteradas` y `motivos_bloqueo`.

*Pruebas:*
- `server/tests/etapa04_campamentos_alias_qa.test.mjs` *(NUEVO)*.

## 4. Pruebas
*(Ejecutadas tras la última edición de Etapa 4)*

| Suite / Comando | Resultado Real | Evidencia |
| :--- | :--- | :--- |
| `node --test server/tests/etapa04_campamentos_alias_qa.test.mjs` | **`8/8` PASS** (`0` fail, `0` skipped, `17.35 s`, `exit 0`) | Idempotencia `migration_04` x2 + `DROP TABLE` x2; `uk_alias_normalizado` (`ER_DUP_ENTRY` / `HTTP 409`) y FK `RESTRICT`; `0` cambios en `29` artículos; `27FEB (id=1)` vs `OPL (id=3)` sin colisión; resolución de alias sin duplicar `inv_campamentos`; `SEDE_AMBIGUA` en variantes con `requiere_revision_historica=1`; campamento dinámico `ID>4` + traslado `almacen_id` real; `403` no global en preview/aplicar; detección `HER-252` / `ALMACEN KM 19 AUDITADO` / `HER-258` / serial repetido; rollback atómico `HTTP 409` sin confirmación individual; `200` transaccional conservando cantidades y registrando `REASIGNACION_CAMPAMENTO_ALIAS`; chequeo estático UI + SSR `rolldown` de `UbicacionesPage` con payload real exacto mostrando `12 art. · 30 u.` -> `16 art. · 34 u.` y `motivos_bloqueo`. |
| `node --test server/tests/etapa01_isolation_qa.test.mjs` | **`7/7` PASS** (`18.06 s`, `exit 0`) | Regresión completa Etapa 1 exitosa. |
| `node --test server/tests/etapa02_security_qa.test.mjs` | **`9/9` PASS** (`18.52 s`, `exit 0`) | Regresión completa Etapa 2 exitosa. |
| `node --test server/tests/etapa03_react_mysql8_qa.test.mjs` | **`12/12` PASS** (`17.81 s`, `exit 0`) | Regresión completa Etapa 3 exitosa. |
| ESLint Backend Etapa 4 (`almacenApi.js --max-warnings 0`) | **`0` errores, `0` warnings** (`exit 0`) | — |
| ESLint Frontend 4 archivos E4 | **`0` errores** (`6` warnings preexistentes, `exit 0`) | Warnings preexistentes (`React`, `setSortBy`/`setSortOrder` en `InventoryTable.jsx`, `react-refresh` en `AppContext.jsx`). |
| `node ./node_modules/vite/bin/vite.js build --outDir <scratch>` | **`exit 0`** (`2,322` módulos en `14.14 s`) | Compilación limpia; directorio temporal eliminado al terminar. |

## 5. Hallazgos
- **Corregidos en Etapa 4:** **`C03`** (colisión `3/12/13` vs `1/3/4` eliminada, modelo de alias `inv_campamento_alias`, normalización `OPL` / `MANTENIMIENTO 633` sin fusión ni pérdida de cantidades y UI dinámica con vista previa + aprobación humana), **`C08` parcial** (filtros y catálogo de campamentos en `almacenApi.js`, `InventoryTable.jsx`, `ReportesPage.jsx` y `UbicacionesPage.jsx`; propagación global completa en Dashboard/Movimientos/Levantamientos va en Etapa 7).
- **Observaciones para Etapas posteriores:**
  - `DashboardPage.jsx` e `InventarioGeneralPage.jsx` mantienen textos históricos estáticos (`433`, `329`, `104`, `1,971`) programados para limpieza en **Etapa 7 (`M03`)**.
  - `server/scripts/*.js` conservan `7` errores ESLint previos (`no-useless-escape`, `no-useless-assignment`), a revisar en cierre (`Etapa 8` / `B01`).

## 6. Datos
- Pruebas ejecutadas en instancia aislada `127.0.0.1:3310` (`ingmelec_v21_test_isolated`); `LISTEN_3310_COUNT=0` tras el cierre (`127.0.0.1:3309` PID `29660` intacto).
- Cero modificaciones automáticas sobre cantidades o ubicaciones históricas durante la migración y pruebas de vistas previas.

## 7. Git
- **Rama actual:** `develop/almacen-v2.1`. **Push / Merge a `main`:** `0`.

## 8. Publicación
- Render: **0 despliegues**. Clever Cloud: **0 ejecuciones ni cambios productivos**.

## 9. Siguiente paso
Ejecutar **ETAPA 5 — Usuarios, roles, permisos granulares y visibilidad en barra lateral / rutas / API (`C07`, `A07`, `M09` y requisito explícito de ocultamiento/bloqueo por permisos sin autoescalamiento a `developer`)**.
