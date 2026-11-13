# MATRIZ DE SEGUIMIENTO DEL PLAN MAESTRO — INGMELEC | ALMACÉN GENERAL v2.1

**Especificación Rectora:** `INGMELEC_Plan_Maestro_Auditoria_y_Mejoras_v2_1.pdf`  
**Rama de Trabajo Local:** `develop/almacen-v2.1` (base `feature/almacen-general-v2` @ `683fb95`)  
**Alcance Estricto:** Exclusivamente local. Prohibido push a GitHub, merge a `main`, despliegue en Render, escritura en Clever Cloud e implementación de Hoja de Asignación.

---

## 1. Control de Etapas (1 a 8)

| Etapa | Nombre | Equipo Mínimo | Informe | Estado |
| :---: | :--- | :--- | :--- | :---: |
| **ETAPA 1** | Preparación, versión y aislamiento local | `especialista-devops-infra`, `especialista-arquitecto-bd`, `especialista-qa-verificador` | `docs/actualizaciones/ETAPA_01_INFORME.md` | **Aprobada localmente** |
| **ETAPA 2** | Autenticación, autorización y seguridad | `especialista-backend-dev`, `especialista-devops-infra`, `especialista-qa-verificador` | `docs/actualizaciones/ETAPA_02_INFORME.md` | **Aprobada localmente** |
| **ETAPA 3** | Errores React #31 y compatibilidad de esquema MySQL 8 | `especialista-frontend-dev`, `especialista-backend-dev`, `especialista-arquitecto-bd`, `especialista-qa-verificador` | `docs/actualizaciones/ETAPA_03_INFORME.md` | **Aprobada localmente** |
| **ETAPA 4** | Campamentos, alias y reasignaciones seguras | `especialista-arquitecto-bd`, `especialista-backend-dev`, `especialista-frontend-dev`, `especialista-qa-verificador` | `docs/actualizaciones/ETAPA_04_INFORME.md` | **Aprobada localmente** |
| **ETAPA 5** | Usuarios, permisos y barra lateral | `especialista-backend-dev`, `especialista-frontend-dev`, `especialista-qa-verificador` | `docs/actualizaciones/ETAPA_05_INFORME.md` | **Aprobada localmente** |
| **ETAPA 6** | Inventario, movimientos y levantamientos | Coordinador INGMELEC (`ETAPA_06_INFORME.md`) | `docs/actualizaciones/ETAPA_06_INFORME.md` | **Aprobada localmente** |
| **ETAPA 7** | Dashboard, reportes e interfaz | Coordinador UI/UX, React Frontend, Especialista reportes | `docs/actualizaciones/ETAPA_07_INFORME.md` | **Aprobada localmente** |
| **ETAPA 8** | Validación integral y entrega exclusivamente local | Líder QA, Auditor AppSec, Arquitecto integración | `docs/actualizaciones/ETAPA_08_QA_FINAL.md` | **Aprobada localmente** |

---

## 2. Matriz de Seguimiento de los 34 Hallazgos (PDF + Auditoría)

| ID PDF | Hallazgo | Etapa(s) | Estado Actual | Evidencia / Nota |
| :---: | :--- | :---: | :--- | :--- |
| **C01** | Render React #31 (`UsuariosPage.jsx:555-557`, `{activo}`, ErrorBoundary) | E3 | **Corregido localmente** (`ETAPA 3`) | `jsonFormat.js` + render React SSR/DOM validado con `{activo:0}` y objetos circulares; `<ErrorBoundary>` montado y probado. |
| **C02** | Esquema MySQL 8 incompatible (`migration_01` vs API) | E3 | **Corregido localmente** (`ETAPA 3`) | `migration_03` idempotente x2 + `getSchemaCapabilities`; KPIs, custodios, `sortBy=creado_en` y `'SIN_SEDE'` probados en `3310`. |
| **C03** | Colisión de IDs campamentos `3/12/13` vs `1/3/4` | E4 | **Corregido localmente** (`ETAPA 4`) | `migration_04` idempotente x2, `resolveCampamentoVinculacion` dinámica sin `3/12/13`, dry-run preview/aplicar transaccional, UI dinámica sin hardcodes (`36/36` PASS). |
| **C04** | Consolidación insegura `/levantamientos/:id/consolidar` | E6 | **Corregido localmente** (`ETAPA 6`) | Consolidación ACID `FOR UPDATE`, detección colisión maestro + duplicado intra-lote, conciliación físico vs teórico solo lectura y propagación `es_sintetico` (`44/44` PASS E1-E6). |
| **C05** | Autenticación fail-open en `requireAuth` | E2 | **Corregido localmente** (`ETAPA 2`) | `requireAuth` responde HTTP `503` ante error BD; verificado en `etapa02_security_qa`. |
| **C06** | Control JWT incompleto (`48h`, revocación, timing-safe, `alg`, `exp`) | E2 / E3 | **Corregido localmente** (`ETAPA 2 y 3`) | TTL `12h`, `timingSafeEqual`, `alg`/`exp`/`tv` + `POST /auth/logout` integrado en `AppContext.jsx`. |
| **C07** | Usuarios / MySQL JSON Array (`campamentos_asignados`, `area`, `permisos_json`) | E5 | **Corregido localmente** (`ETAPA 5`) | `migration_05`, CRUD usuarios ACID (`area`, `campamentos_asignados`, validación fuerte, anti-`*`/developer, `409` email), UI `UsuariosPage` + tests `etapa05` (`40/40` PASS E1-E5). |
| **C08** | Filtro territorial / KPIs (`activeCampamento`, `refreshKpis`) | E4 / E7 | **Corregido localmente** (`ETAPA 4 y 7`) | `campamento_codigo` + `sinSedeVerificada` dinámico + propagación global y sincronización bidireccional `DashboardPage` <-> `Topbar` (`etapa07` `4/4 PASS`). |
| **A01** | IDOR en `/dashboard/kpis` y `/campamentos/:id/almacenes` | E2 | **Corregido localmente** (`ETAPA 2`) | Sub-bloques KPIs y almacenes acotados por `scope`; menor `R-E2-01` (orden `scope` antes de `estado` en `POST /levantamientos/:id/items`) pasa a E3. |
| **A02** | Autorización insegura basada en `.includes()` | E2 | **Corregido localmente** (`ETAPA 2`) | Eliminado `.includes()`; defecto seguro sin sede; validación origen/destino; verificado `etapa02_security_qa`. |
| **A03** | `/api/v2/config/entorno` expuesto públicamente | E2 | **Corregido localmente** (`ETAPA 2`) | Exige `requireAuth` y oculta datos internos; verificado `etapa02_security_qa`. |
| **A04** | TLS MySQL sin CA, `multipleStatements` activo y `guard.js` sin integrar | E1 / E2 | **Corregido localmente** (`ETAPA 1 y 2`) | CA oficial + `rejectUnauthorized: true`, `multipleStatements: false` por defecto, `guard.js` integrado. |
| **A05** | Rate limit evadible por `X-Forwarded-For` / `trust proxy` | E2 | **Corregido localmente** (`ETAPA 2`) | `req.ip` + `trust proxy` + purga acotada; bloquea rotación `X-Forwarded-For` (`429`). |
| **A06** | Movimientos y artículos: transacciones, `NULL`, `TRASLADO`, cantidades | E6 | **Corregido localmente** (`ETAPA 6`) | Transacciones `FOR UPDATE`, bloqueo `409` en stock pendiente/`NULL`, `TRASLADO` con destino obligatorio y actualización territorial, propagación `es_sintetico`. |
| **A07** | `hasPermission()` no conectado a navegación ni UI | E5 | **Corregido localmente** (`ETAPA 5`) | `src/utils/permissions.js`, `Sidebar.jsx` dinámico, `App.jsx` con bloqueo URL directa (`403` UI / redirección raíz), guardas en `AppContext` y controles por acción en `InventoryTable`, `ItemDetailModal`, `MovimientosPage`, `LevantamientosPage`, `LevantamientoWorkspace` y `ReportesPage`. |
| **A08** | Exportaciones incompletas y riesgo CSV/formula injection | E7 | **Corregido localmente** (`ETAPA 7`) | `GET /reportes/exportar` con filtros/orden completos + `exportUtils.js` (`CWE-1236`) y roundtrip `.xlsx`/CSV (`etapa07` `4/4 PASS`). |
| **A09** | Layout móvil roto (`pl-64`) y modales | E7 | **Corregido localmente** (`ETAPA 7`) | Layout `pl-0 md:pl-64`, `Sidebar` drawer móvil y botón hamburguesa en `Topbar` (`etapa07` Test 4 PASS). |
| **A10** | 10 relaciones sin claves foráneas | E6 | **Corregido localmente** (`ETAPA 6`) | `migration_06_v21_integridad_fk_indices.sql` idempotente x2 agrega todas las FK faltantes y cambia `fk_mov_articulo` a `ON DELETE RESTRICT` (verificado con rechazo `ER_ROW_IS_REFERENCED_2`). |
| **A11** | Vulnerabilidades en dependencias `npm audit` | E2 / E7 | **Corregido localmente** (`ETAPA 7`) | Eliminada `xlsx@0.18.5`; reemplazada por `read-excel-file` y `write-excel-file` (`0` vulnerabilidades en `npm audit --omit=dev`). |
| **M01** | Divergencias `sinSerial` Dashboard vs Inventario vs Reportes | E7 | **Corregido localmente** (`ETAPA 7`) | Función SQL canónica `buildSqlSinSerialCondition` compartida en los 3 endpoints (`etapa07` Test 1 PASS). |
| **M02** | Case-sensitivity `Bueno`/`BUENO` en importaciones y levantamientos | E6 | **Corregido localmente** (`ETAPA 6`) | Excel `ArrayBuffer` estricto (`warnings`/`errores`), normalización insensible a mayúsculas en `LevantamientoWorkspace`, payload `almacenesIniciales` y modal de conciliación físico vs teórico. |
| **M03** | Cifras hardcodeadas (`433`, `261`, `280`) | E7 | **Corregido localmente** (`ETAPA 7`) | Eliminadas cifras estáticas en Dashboard y páginas de áreas (`etapa07` Test 3 PASS). |
| **M04** | `getConnection()`/`rollback()` sin manejo seguro; DDL en `catch` | E3 | **Corregido localmente** (`ETAPA 3`) | 7 endpoints transaccionales protegidos (`503`/`safeRollback`/`safeRelease`), DDL HTTP retirado y `0` `catch` vacíos. |
| **M05** | CORS abierto `*` y falta CSP | E2 | **Corregido localmente** (`ETAPA 2`) | Whitelist CORS (`403`), headers CSP/Permissions-Policy, `1mb`/`10mb` por ruta. |
| **M06** | Tres generaciones de migraciones y riesgo en `rollback` | E1 / E3 / E6 | **Corregido localmente** (`ETAPA 6`) | `rollback_clever_cloud_produccion.sql` endurecido sin `id<=434`, `IN(1,3,4)` ni `permisos_json=NULL`; verificado idempotente sobre `3310`. |
| **M07** | Race conditions en códigos y seriales | E6 | **Corregido localmente** (`ETAPA 6`) | `generateNextCodeForArea(..., { forUpdate })` concurrente (`Promise.all` único `3/3`), unicidad de seriales no-placeholder (`409`) y registro exacto de cantidad `0` en `inv_movimientos`. |
| **M08** | Routing manual frágil | E3 / E7 | **Corregido localmente** (`ETAPA 3 y 7`) | Vista 404, trailing slash, `React.lazy` + `<Suspense>` en `App.jsx` y `getFirstAuthorizedPage` (`etapa07` Test 4 PASS). |
| **M09** | Toggle de usuario sin confirmación | E5 | **Corregido localmente** (`ETAPA 5`) | Modal React de confirmación (`pendingStatusUser`) en `UsuariosPage.jsx` con advertencia de revocación inmediata de sesiones (sin `window.confirm`). |
| **B01** | ESLint: `10` errores y `142` advertencias | E3 / E8 | Línea base capturada (E1) | Limpieza progresiva por archivo tocado; meta `0` errores en E8. |
| **B02** | `EXPECTED_SHA256` y rutas locales en scripts; `.gitignore` | E1 / E2 | **Verificado / CA excepcionado** (`ETAPA 2`) | Scripts fuera de índice Git; `!server/certs/clever-cloud-mysql-ca.pem` añadido al `.gitignore`. |
| **B03** | Monolito backend `4,320` líneas, N+1 y bundle `1.17 MB` | E7 / E8 | **Parcialmente corregido** (`ETAPA 7`) | Bundle dividido con `React.lazy` (`0` chunks > 500 kB; `index` `253.37 kB`) y exclusión Base64 en listados (`etapa07` Test 1 PASS); modularización backend en E8 si aplica. |
| **B04** | CSS muerto y `!important` redundantes | E7 | **Corregido localmente** (`ETAPA 7`) | Limpieza de estilos Vite plantilla en `App.css` e `index.css` (`etapa07` Test 4 PASS). |
| **B05** | Problemas accesibilidad y ARIA/WCAG AA | E7 | **Corregido localmente** (`ETAPA 7`) | Etiquetas ARIA en `Topbar`, `Sidebar`, `MovimientosPage`, modales y navegación accesible (`etapa07` Test 4 PASS). |
| **B06** | Índices redundantes y carencia de pruebas automatizadas | E1 / E6 / E8 | **Corregido en BD y suites E1–E7** | Índices compuestos creados, `7` redundantes eliminados y `48/48` pruebas PASS en `etapa01`–`etapa07` (E2E Playwright en E8). |

---

## 3. Requisitos Explícitos del Propietario (Página 4 PDF)

1. **Alias OPL (`OPL = KM19 = KM 19 = KM 19 AUT DUARTE = KM 19 AUTOPISTA DUARTE = KM 19 AUTOPISTA DUARTE OPL`) y MANTENIMIENTO (`MANTENIMIENTO = MANTENIMIENTO 633 = MANTENIMIENTO M633`):** **Cumplido localmente (`ETAPA 4`)** (`inv_campamento_alias`, vista previa Antes vs Después obligatoria, bloqueos `409` en duplicados/ambiguos, cero fusiones ni pérdida de cantidades).
2. **Permisos y barra lateral (Developer autoriza -> visible; no autorizado -> oculto en barra lateral + bloqueado en URL y API):** **Cumplido localmente (`ETAPA 5`)** (catálogo `20` permisos, fail-closed `[]`, `Sidebar.jsx`, `App.jsx` directo URL y API `403`/`401`).
3. **Hoja de Asignación (proyecto siguiente):** **EXCLUIDA de implementación v2.1**; solo notas técnicas de dependencias al cierre (Etapa 8).
