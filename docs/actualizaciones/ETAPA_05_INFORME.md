# INFORME DE ETAPA 5 — USUARIOS, PERMISOS GRANULARES Y BARRA LATERAL / RUTAS DINÁMICAS (v2.1)

**Proyecto:** INGMELEC | ALMACÉN GENERAL (`v2.1` Local)  
**Fecha:** 2026-11-11  

---

## 1. Estado
**Aprobada localmente**

## 2. Equipo
| Rol | Subagente / Agente | Responsabilidades Ejecutadas |
| :--- | :--- | :--- |
| **Coordinador Principal** | Coordinador INGMELEC | Dirección, completado transaccional ACID de la Sección 7 (`/usuarios*`) en [`almacenApi.js`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js), integración completa en [`AppContext.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/context/AppContext.jsx) y [`App.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/App.jsx), cierre de hallazgos estáticos QA (`rep:exportar` y `camp:operar` en `InventoryTable.jsx`, `aud:ver` en inactivos), creación de `server/tests/etapa05_rbac_permissions_qa.test.mjs` y validación final en MariaDB `3310`. |
| **Arquitecto de BD** | `especialista-arquitecto-bd` (`654e43b6`) | Diseño e idempotencia de [`migration_05_v21_rbac_y_permisos.sql`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_05_v21_rbac_y_permisos.sql) y actualización de [`v21_synthetic_fixture.sql`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/tests/fixtures/v21_synthetic_fixture.sql) con `dash:ver` / `aud:ver` y preservación de cuentas vacías `[]`. |
| **Especialista Backend** | `especialista-backend-dev` (`e3a06b0d`) + Coordinador | Helpers `VALID_OPERATIONAL_ROLES`, `KNOWN_PERMISSION_KEYS`, `parsePermisosJson`, `validateAndSanitizePermissions`, `parseUserCampamentoSelection`, `requirePermission('dash:ver')` en `/dashboard/kpis`, eliminación de fallback por rol en `requireAuditoriaAccess` (`aud:ver`), catálogo `/usuarios/permisos-catalogo` y CRUD ACID en `/usuarios*`. |
| **Especialista Frontend** | `especialista-frontend-dev` (`9e640bed`) + Coordinador | Fuente única [`permissions.js`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/utils/permissions.js), filtrado dinámico del [`Sidebar.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/components/layout/Sidebar.jsx), bloqueo de rutas directas en [`App.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/App.jsx), mejoras `C07`/`M09` en [`UsuariosPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/UsuariosPage.jsx) y botones granulares `A07` en componentes operativos. |
| **Auditor / QA Verificador** | `especialista-qa-verificador` (`5f6b15c0`) + Coordinador | Revisión estática previa (detectando 3 brechas en `InventoryTable.jsx` y `/articulos/:id`) y ejecución integral de `etapa01`–`etapa05` sobre MariaDB `127.0.0.1:3310` tras los ajustes finales. |

## 3. Código (Archivos Modificados y Creados)
*Base de datos y fixtures:*
- [`migration_05_v21_rbac_y_permisos.sql`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/migrations/migration_05_v21_rbac_y_permisos.sql) *(NUEVO, propuesta futura sin ejecutar en Clever Cloud)*: normaliza `NULL`/inválidos/no-array y wildcard `'*'` en cuentas no developer a `'[]'`, preserva `'["*"]'` exclusivamente en `developer` (`es_developer=1`), agrega `'dash:ver'` idempotente a cuentas activas con permisos no vacíos y `'aud:ver'` a `'admin'`/`'auditor'`/`'gerencia'` con permisos previos, sin alterar cuentas vacías `'[]'` ni tablas operativas.
- [`v21_synthetic_fixture.sql`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/tests/fixtures/v21_synthetic_fixture.sql): añade `'dash:ver'` en cuentas operativas activas `#2..#6` y `'aud:ver'` en `#2/#5/#6`, manteniendo inalterada la cuenta inactiva `#7`.

*Backend (`server/routes/almacenApi.js`):*
- Helpers RBAC y saneamiento ([`almacenApi.js#L92-L318`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L92-L318)): `VALID_OPERATIONAL_ROLES` (5 roles sin `'developer'`), `KNOWN_PERMISSION_KEYS` (20 claves sin `'*'`), `parsePermisosJson`, `validateAndSanitizePermissions` (rechaza `'*'` en operativos con `HTTP 403`), `parseUserCampamentoSelection`, `validateStrongPassword` (`>= 8` caracteres con letras y números) e `isValidEmailFormat`.
- Autenticación, KPIs y Auditoría: propagación de `es_developer` a `parsePermisosJson` en `requireAuth`, `POST /auth/login` y `GET /auth/me`; `requirePermission('dash:ver')` en `GET /dashboard/kpis`; eliminación de fallback por rol en `requireAuditoriaAccess` (`GET /auditoria` exige `'aud:ver'`) y en `incluir_inactivos=true` de `GET /articulos/:id`.
- Gestión de usuarios (`/api/v2/usuarios*`, [`almacenApi.js#L3902-L4410`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/routes/almacenApi.js#L3902-L4410)): nuevo `GET /usuarios/permisos-catalogo`; `GET /usuarios` con `u.es_developer`; `POST /usuarios`, `PUT /usuarios/:id`, `PATCH /usuarios/:id/estado`, `PUT /usuarios/:id/permisos` y `POST /usuarios/:id/recuperar` envueltos en transacciones ACID (`FOR UPDATE`, `safeRollback`, `safeRelease`), soporte de `area`, múltiples `campamentos`/`campamentos_adicionales` (`C07`), bloqueo `403` ante autoescalamiento o revocación de `developer`/`*`, validación `409` en correo duplicado al editar e invalidación inmediata de JWT vía `bumpUserTokenVersion` ante cambios de rol, área, estado, permisos o campamentos.

*Frontend (`src/`):*
- [`src/utils/permissions.js`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/utils/permissions.js) *(NUEVO)*: `PERMISSION_CATEGORIES` (20 permisos), `DEFAULT_ROLE_PERMISSIONS`, `MODULE_ACCESS_RULES`, `isDeveloperUser`, `userHasPermission` (ignora `'*'` en cuentas no developer), `userHasAnyPermission`, `canAccessModule` y `getFirstAuthorizedPage` (retorna `'sin_acceso'` cuando `permisos` está vacío).
- [`Sidebar.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/components/layout/Sidebar.jsx): filtrado dinámico de los `12` módulos con `canAccessModule(currentUser, item.id)` y vista explícita `data-testid="sidebar-no-modules"` para cuentas sin módulos asignados.
- [`App.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/App.jsx): inicialización síncrona de ruta (`readRouteFromLocation`), redirección desde raíz `'/'` hacia el primer módulo autorizado cuando falta `dash:ver`, pantalla explícita **"Acceso Restringido · 403 / Acceso Denegado al Módulo"** ante ingreso directo por URL no autorizada (sin montar módulos restringidos) y preservación de vista `404 — Ruta no encontrada`.
- [`AppContext.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/context/AppContext.jsx): exposición de `hasPermission`, `hasAnyPermission`, `canAccessModule` e `isDeveloper`; guardas en `refreshKpis` (`dash:ver`) y `refreshCampamentosCatalog` (`camp:ver`) para evitar peticiones `403` automáticas tras login.
- [`UsuariosPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/UsuariosPage.jsx): preservación exacta de índices `useState` `0..4` (`usuarios`, `campamentos`, `auditorias`, `loading`, `activeTab`), visualización y edición de `area` y `campamentos_asignados` múltiples (`C07`), matriz completa de `20` permisos sin opciones `developer` ni `*`, botón **"Sin acceso (0 permisos)"**, validación de contraseña fuerte, banners de error en modales y modal de confirmación React (`M09`) para activar/desactivar cuentas sin `window.confirm`.
- Controles granulares `A07`: [`InventoryTable.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/components/common/InventoryTable.jsx) (`inv:crear`, `rep:exportar`, `camp:operar` y lectura SSR-safe de `window.location.search`), [`ItemDetailModal.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/components/common/ItemDetailModal.jsx) (`inv:editar`), [`MovimientosPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/MovimientosPage.jsx) (`inv:movimientos_registrar`), [`LevantamientosPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/LevantamientosPage.jsx) (`lev:crear`, `camp:ver`, `camp:operar`), [`LevantamientoWorkspace.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/components/levantamientos/LevantamientoWorkspace.jsx) (`lev:capturar`, `lev:editar`, `lev:importar`, `lev:consolidar`) y [`ReportesPage.jsx`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/src/pages/ReportesPage.jsx) (`rep:exportar`, `rep:imprimir`).

*Pruebas:*
- [`etapa05_rbac_permissions_qa.test.mjs`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/tests/etapa05_rbac_permissions_qa.test.mjs) *(NUEVO)* y ajuste de fixture `'dash:ver'` en [`etapa02_security_qa.test.mjs`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/tests/etapa02_security_qa.test.mjs#L439-L470) para mantener la prueba IDOR de `/dashboard/kpis`.

## 4. Pruebas
*(Ejecutadas secuencialmente tras la última edición de Etapa 5)*

| Suite / Comando | Resultado Real | Evidencia |
| :--- | :--- | :--- |
| `node --test server/tests/etapa05_rbac_permissions_qa.test.mjs` | **`4/4` PASS** (`0` fail, `0` skipped, `16.99 s`, `exit 0`) | Idempotencia `migration_05` x2 (`NULL`/`{}`/`["*"]` -> `[]`, `'[]'` preservado, `dash:ver`/`aud:ver` sin duplicados, `0` cambios en tablas operativas); `GET /usuarios/permisos-catalogo`; validaciones email/password/`409`/`403` anti-escalamiento; login y fail-closed `403` con `[]` en los `8` endpoints principales; revocación inmediata `401` tras `PUT /usuarios/:id`; ausencia de fallback por rol en `/auditoria` e inactivos; render `Rolldown` + `MiniDOM` de `Sidebar`, `App` (`/usuarios`, `/reportes`, `/`, `/ruta-inexistente-etapa5`), `UsuariosPage` (`C07` y `M09`) y controles `A07`. |
| `node --test server/tests/etapa01_isolation_qa.test.mjs` | **`7/7` PASS** (`0` fail, `0` skipped, `15.88 s`, `exit 0`) | Regresión Etapa 1 superada. |
| `node --test server/tests/etapa02_security_qa.test.mjs` | **`9/9` PASS** (`0` fail, `0` skipped, `16.45 s`, `exit 0`) | Regresión Etapa 2 superada. |
| `node --test server/tests/etapa03_react_mysql8_qa.test.mjs` | **`12/12` PASS** (`0` fail, `0` skipped, `15.21 s`, `exit 0`) | Regresión Etapa 3 superada (`hooks` `0..4` de `UsuariosPage` compatibles). |
| `node --test server/tests/etapa04_campamentos_alias_qa.test.mjs` | **`8/8` PASS** (`0` fail, `0` skipped, `16.51 s`, `exit 0`) | Regresión Etapa 4 superada. |
| ESLint Backend (`server/routes/almacenApi.js --max-warnings 0`) | **`0` errores, `0` warnings** (`exit 0`) | Sin errores ni advertencias. |
| ESLint Frontend (`11` archivos de Etapa 5) | **`0` errores** (`44` warnings preexistentes, `exit 0`) | Sin errores de compilación ni React Compiler en ninguno de los `11` archivos. |
| `node ./node_modules/vite/bin/vite.js build --outDir <scratch>` | **`exit 0`** (`2,323` módulos en `5.92 s`) | Empaquetado limpio (`dist` temporal eliminado tras verificación). |

## 5. Hallazgos
- **Corregidos en Etapa 5:** **`C07`** (persistencia, lectura y UI de `campamentos_asignados`, `area` y `permisos_json` validado sin `'*'`/`developer`), **`A07`** (barra lateral dinámica, bloqueo de rutas por URL directa y botones granulares de acción por permiso) y **`M09`** (modal de confirmación React al activar/desactivar usuarios con advertencia de revocación de sesión).
- **Requisito explícito de barra lateral y URL directa:** Cumplido y verificado en API (`403`/`401`), `Sidebar.jsx` y `App.jsx`.

## 6. Datos
- Pruebas ejecutadas en MariaDB aislado `127.0.0.1:3310` (`ingmelec_v21_test_isolated`); verificado `LISTEN_3310_COUNT=0` tras el cierre (`127.0.0.1:3309` PID `29660` intacto).
- `0` consultas ni escrituras en Clever Cloud.

## 7. Git
- **Rama actual:** `develop/almacen-v2.1`. **Push / Merge a `main`:** `0`.

## 8. Publicación
- Render: **0 despliegues**. Clever Cloud: **0 ejecuciones ni cambios productivos**.

## 9. Siguiente paso
Ejecutar **ETAPA 6 — Inventario, movimientos, levantamientos y consolidación (`C04`, `A06`, `A10`, `M02`, `M06`, `M07`, `B06`)**.
