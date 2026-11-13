# INFORME DE CIERRE — ETAPA 7: DASHBOARD, REPORTES, EXPORTACIÓN SEGURA, RBAC MOVIMIENTOS Y UX

**Proyecto:** INGMELEC | ALMACÉN GENERAL v2.1  
**Rama:** `develop/almacen-v2.1`  
**Entorno de Ejecución:** Exclusivamente local (`127.0.0.1:3310`, base `ingmelec_v21_test_isolated`). Cero modificaciones a GitHub, Render o Clever Cloud.  
**Estado:** **APROBADA LOCALMENTE**

---

## 1. Alcance y Hallazgos Atendidos
- **M01:** Unificación de `buildSqlSinSerialCondition` en `server/routes/almacenApi.js` entre `/api/v2/dashboard/kpis`, `/api/v2/articulos?sinSerial=true` y `/api/v2/reportes/exportar`.
- **A08 / M04 / A11:** Eliminación completa de la dependencia vulnerable `xlsx@0.18.5` y reemplazo por `read-excel-file@^9.3.15` y `write-excel-file@^4.1.1` en `src/utils/exportUtils.js` (`0` vulnerabilidades en `npm audit --omit=dev`). Neutralización de CSV/Excel Formula Injection (`CWE-1236`), ampliación de `/api/v2/reportes/exportar` con soporte completo de filtros y ordenamiento.
- **M03:** Eliminación de cifras históricas hardcodeadas (`433`, `329`, `104`, `1,971`) y etiquetas estáticas en Dashboard y páginas de áreas.
- **C08 (Sincronización UI):** Propagación global de `activeCampamento` desde `Topbar.jsx` hacia `DashboardPage.jsx`, `InventoryTable.jsx`, `ReportesPage.jsx` y `MovimientosPage.jsx`, más sincronización bidireccional desde el selector `dash-campamento-select` en `DashboardPage.jsx` hacia `setActiveCampamento` en `AppContext`.
- **A09 / M08 / B04 / B05:** Code-splitting con `React.lazy` + `<Suspense>` en `src/App.jsx` (`0` chunks > 500 kB), menú lateral móvil tipo drawer en `Sidebar.jsx`, limpieza de estilos plantilla Vite en `src/App.css` y `src/index.css`, endpoint `/health` mínimo seguro, paginación y vista previa de impresión.
- **B03 (Payload):** Exclusión de `evidencia_foto` Base64 en listados (`GET /articulos`, `GET /levantamientos/:id/items`) conservando `tiene_foto = 1` y detalle completo bajo demanda.
- **Corrección Controlada RBAC (`Movimientos`):** En `src/utils/permissions.js` y `src/pages/MovimientosPage.jsx`, se mantiene la independencia estricta entre `inv:movimientos_ver` e `inv:movimientos_registrar`. Un usuario con únicamente `inv:movimientos_registrar` accede a la vista de registro en Sidebar y URL sin disparar `GET /api/v2/movimientos` (evitando `403` innecesarios) y visualiza un aviso explícito de historial restringido, mientras el backend conserva intacta la protección `403` en `GET /movimientos` y territorial por campamento.

---

## 2. Evidencia de Pruebas y Compilación
- **Suite Etapa 7 (`node --test server/tests/etapa07_dashboard_reports_ux_qa.test.mjs`, `task-6391`):** **4 / 4 PASS (`100%`)**
  1. Backend (`M01`, `A08`, `B03`): equivalencia exacta `sinSerial` en Dashboard/Inventario/Reportes, filtros de exportación y exclusión Base64 — **PASS** (`2.98s`)
  2. Seguridad Dependencias y Exportación (`A11`, `A08`): cero `xlsx` vulnerable, neutralización CSV Formula Injection y roundtrip binario `.xlsx` con `write-excel-file/node` (`.toBuffer()`) y `read-excel-file/node` — **PASS** (`0.24s`)
  3. Dashboard, Áreas (`M03`), Propagación Territorial (`C08`) y RBAC Movimientos: sincronización `DashboardPage` <-> `Topbar`, `ReportesPage`, `MovimientosPage` (`inv:movimientos_ver` vs solo `inv:movimientos_registrar`) — **PASS** (`2.25s`)
  4. UX, Routing `M08`, Responsive Móvil `A09`, CSS `B04`, Media Print y Accesibilidad `B05` — **PASS** (`0.27s`)
- **Matriz RBAC Movimientos (`verify_movimientos_rbac.mjs` sobre BD aislada `127.0.0.1:3310`):** Solo registrar (`GET 403`, `POST OPL 200`, `POST 27FEB 403`), solo visualizar (`GET 200`, `POST 403`), ambos (`GET 200`, `POST OPL 200`), ninguno (`canAccessModule=false`, `GET 403`, `POST 403`) — **PASS**.
- **Regresión Etapas 1–6 (`task-6367`):** **44 / 44 PASS (`0 fail`)**.
- **ESLint (`task-6391`):** `0` errores en `src/utils/permissions.js`, `src/pages/MovimientosPage.jsx` y `src/pages/DashboardPage.jsx` (`16` warnings preexistentes de `no-unused-vars`).
- **Compilación Vite (`npm run build`, `task-6391`):** Exitosa en `4.60s` (`index` `253.37 kB`, `DashboardPage` `407.57 kB`, `exportUtils` `124.39 kB`, `0` chunks > 500 kB).
