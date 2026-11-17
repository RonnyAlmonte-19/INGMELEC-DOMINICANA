# PLAN DE ESTABILIZACIÓN v2.1.1 — INGMELEC | ALMACÉN GENERAL

**Fecha:** 16 de noviembre de 2026  
**Rama local verificada:** `main` (`HEAD` = `468937e`, incluye `f2ebf7b`)  
**Alcance:** Verificación directa en código fuente de los 10 hallazgos evaluados y plan de estabilización mínimo sin alterar inventario, BD, usuarios ni flujo productivo.

---

## 0. Verificación del Hotfix `468937e` y Estado Productivo

- **Rama `main` local:** **CONFIRMADO.** `git branch --show-current` devuelve `main` y `git log -n 4 --oneline` muestra `468937e fix(server): servir estaticos dist antes del middleware CORS de API` en `HEAD`, con `express.static` montado en `server/index.js` (L84–85) antes del filtro CORS (L88–97).
- **Estado productivo en vivo (Render / Clever Cloud):** **NO VERIFICADO** en esta auditoría por aislamiento de red del sandbox y restricción de no consultar/operar servicios productivos.

---

## 1. Hallazgos Confirmados

| # | Hallazgo | Evidencia directa en código | Clasificación | Nivel de riesgo |
|---|---|---|---|---|
| **1** | Posible DOM XSS por `innerHTML` en `index.html` | `index.html` L28 (`errDiv.innerHTML = ... + event.message + ...`) y L45 (`+ event.reason`) | **Riesgo potencial** | **MEDIO** |
| **2** | `'unsafe-inline'` en `Content-Security-Policy` | `server/index.js` L73–76 (`script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' ...`) | **Riesgo potencial / Hardening** | **MEDIO** |
| **3** | JWT almacenado en `localStorage` | `src/context/AppContext.jsx` L28, L77, L91, L115, L137, L162 (`ingmelec_token`); `src/pages/ReportesPage.jsx` L78 | **Riesgo potencial (arquitectónico)** | **MEDIO** |
| **5** | CORS en producción depende de `CORS_ORIGINS` incluso para `same-origin` mutables | `server/index.js` L49–63 (`isOriginAllowed` no compara `origin` contra `req.protocol + '://' + req.get('host')`) | **Riesgo operativo / Configuración** | **MEDIO** |
| **6** | Dependencia `xlsx@0.18.5` declarada sin uso en backend | `server/package.json` L18 (`"xlsx": "^0.18.5"`); 0 imports/requires en `server/` y `src/` (solo aserciones negativas en `server/tests/etapa06..08`) | **Deuda técnica (sin vector runtime activo)** | **BAJO** |
| **7** | Monolito `server/routes/almacenApi.js` | `8,511` líneas y `49` endpoints (`router.get\|post\|put\|patch\|delete`) + crypto, RBAC, scope, auditoría, rate limit y SQL | **Deuda técnica estructural** | **MEDIO** |
| **8** | Errores de ESLint en `server/scripts` | `server/scripts/recovery-developer.js` L192 y L218 (`no-useless-assignment`, único script versionado en Git); 4 scripts locales ignorados por `.gitignore` suman 5 errores más | **Deuda técnica** | **BAJO** |
| **9** | Rate limiting en memoria y solo en `/auth/login` | `server/routes/almacenApi.js` L1025–1088 (`loginAttempts = new Map()`, `MAX_RATE_LIMIT_ENTRIES = 5000`, aplicado solo a `POST /auth/login`) | **Riesgo potencial / Deuda técnica** | **MEDIO** |
| **10** | Cobertura insuficiente de pruebas de carga, reconexión BD y UI unitaria | `server/tests/` (11 archivos E2E/integración); sin tests de estrés, caída de conexión en transacción ni JSDOM/Vitest; `etapa01` L177 espera rama `develop/almacen-v2.1` | **Deuda técnica de QA** | **MEDIO** |

> **Nota sobre vulnerabilidades demostradas:** Ninguno de los 10 puntos representa una vulnerabilidad crítica explotable directamente sin precondiciones (ej. XSS previo para leer `localStorage` o error runtime con HTML controlado para `index.html`).

---

## 2. Hallazgos Descartados

| # | Hallazgo evaluado | Evidencia directa en código | Motivo del descarte |
|---|---|---|---|
| **4** | `connectionLimit: 2` fijo (hardcodeado) en el pool MySQL | `server/database/db.js` L94 y L105: `Number.parseInt(process.env.DB_CONNECTION_LIMIT \|\| '2', 10)` | **Descartado como hardcode.** El código **sí lee `process.env.DB_CONNECTION_LIMIT`**; `2` es únicamente el valor por defecto para proteger el tope de 5 conexiones de Clever Cloud. No requiere cambio de código. |

---

## 3. Riesgos Pendientes de Comprobación

1. **Verificación HTTP en vivo de producción (`https://ingmelec-dominicana.onrender.com`):** Confirmar que tras el despliegue de `468937e` + `CORS_ORIGINS` en Render, `/`, `/assets/*.js`, `/assets/*.css` y `POST /api/v2/auth/login` responden `HTTP 200` con `Content-Type` correcto.
2. **Estilos inline en React/Recharts frente a `style-src`:** Antes de retirar `'unsafe-inline'` de `style-src` en `server/index.js`, debe comprobarse si Recharts o atributos `style={{...}}` en componentes fallan bajo CSP estricto.
3. **Ejecución de `etapa02..08` fuera del sandbox TCP:** Validar la suite completa sobre MariaDB `3310` en la rama `main` actual.

---

## 4. Correcciones Propuestas (Priorizadas por Bajo Riesgo y Cero Impacto en Inventario)

### Grupo A — Estabilización inmediata v2.1.1 (cambios pequeños, reversibles, cero impacto en inventario/BD)
1. **Sanitizar listeners de error en `index.html` (L13–48) y externalizar script inline:**
   - Mover el script de captura global a `public/error-trap.js` (cargado con `<script src="/error-trap.js"></script>`) y reemplazar `errDiv.innerHTML = ...` por creación de nodo `<strong>` + asignación segura con `.textContent`.
2. **Retirar `'unsafe-inline'` de `script-src` en `server/index.js` (L75):**
   - Dejar `script-src 'self'` tras externalizar `error-trap.js`. *(Mantener `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` en v2.1.1 para no romper Recharts ni estilos dinámicos).*
3. **Eliminar dependencia no utilizada `xlsx@0.18.5` de `server/package.json` (L18):**
   - Remover `"xlsx": "^0.18.5"` y actualizar `server/package-lock.json` (`npm install --prefix server --package-lock-only` o `npm uninstall`).
4. **Corregir ESLint en `server/scripts/recovery-developer.js` (L192, L218):**
   - Resolver las dos asignaciones `no-useless-assignment` manteniendo la funcionalidad intacta.
5. **Reconocer `same-origin` exacto en `isOriginAllowed` (`server/index.js` L49–63, L90):**
   - Permitir `origin === `${req.protocol}://${req.get('host')}`` (cuando `req.get('host')` exista) además de `CORS_ORIGINS`, evitando bloqueos `403` si cambia la URL de Render, sin abrir orígenes de terceros.

### Grupo B — Postergados fuera de v2.1.1 (alto impacto estructural o cambio de contrato)
- **Migración de JWT de `localStorage` a cookies `HttpOnly` (`#3`):** Afecta `login`, `logout`, `requireAuth`, `apiFetch` y `credentials: 'include'`; planificar en v2.2.
- **Modularización de `server/routes/almacenApi.js` (`#7`) y rate limit distribuido (`#9`):** Planificar en v2.2 con suite E2E completa.
- **Pruebas de carga y reconexión MySQL (`#10`):** Añadir en suite de QA dedicada sin bloquear el hotfix v2.1.1.

---

## 5. Orden de Implementación Recomendado

1. **Paso 0 (Previo):** Confirmar en navegador/Render que producción con `468937e` ya carga el frontend y permite login.
2. **Paso 1:** Eliminar `xlsx` de `server/package.json` y actualizar `server/package-lock.json`.
3. **Paso 2:** Crear `public/error-trap.js` usando `.textContent` y referenciarlo desde `index.html` sin script inline.
4. **Paso 3:** Actualizar `Content-Security-Policy` (`script-src 'self'`) y soporte `same-origin` exacto en `server/index.js`.
5. **Paso 4:** Corregir los 2 errores ESLint en `server/scripts/recovery-developer.js` (y opcionalmente ajustar `etapa01_isolation_qa.test.mjs` L177 para aceptar `main`).
6. **Paso 5:** Ejecutar build, lint, pruebas de seguridad/CORS y verificación HTTP local antes de autorizar commit/push/deploy.

---

## 6. Archivos que Sería Necesario Modificar (v2.1.1)

- `public/error-trap.js` *(nuevo archivo estático para listeners globales sin `innerHTML` ni script inline)*
- `index.html` *(reemplazar `<script>` inline L13–48 por `<script src="/error-trap.js"></script>`)*
- `server/index.js` *(ajustar `script-src 'self'` en CSP L75 y validación `same-origin` en `isOriginAllowed`)*
- `server/package.json` y `server/package-lock.json` *(remover `"xlsx": "^0.18.5"`)*
- `server/scripts/recovery-developer.js` *(limpiar `no-useless-assignment` en L192 y L218)*

> **Intocables en v2.1.1:** `server/routes/almacenApi.js`, `server/database/db.js`, `server/database/migrations/*`, `src/context/AppContext.jsx`, páginas de inventario, movimientos y levantamientos.

---

## 7. Plan de Pruebas y Reversión

### Plan de Pruebas por Corrección
- **XSS / CSP (`index.html` + `public/error-trap.js` + `server/index.js`):**
  - `npm.cmd run build` -> verificar que `dist/error-trap.js` existe y `dist/index.html` no tiene `<script>` inline.
  - Simular un error con payload `'<img src=x onerror=alert(1)>'` en navegador local y comprobar que se renderiza como texto plano (sin ejecutar script ni bloquear CSP).
  - Verificar en consola del navegador que no hay violaciones CSP al cargar la app.
- **CORS `same-origin` (`server/index.js`):**
  - Probar con `NODE_ENV=production` y `CORS_ORIGINS=''`:
    - `GET /assets/*.js` y `.css` con `Origin: https://ingmelec-dominicana.onrender.com` y `Host: ingmelec-dominicana.onrender.com` -> `HTTP 200` + MIME correcto.
    - `POST /api/v2/auth/login` con `Origin: https://ingmelec-dominicana.onrender.com` y `Host: ingmelec-dominicana.onrender.com` -> pasa CORS (no `403 Origen CORS no autorizado`).
    - `GET /api/v2/articulos` y `OPTIONS /api/v2/auth/login` con `Origin: https://attacker.example` y `Origin: null` -> `HTTP 403` sin `Access-Control-Allow-Origin`.
- **Dependencia `xlsx` y ESLint:**
  - `npm audit --prefix server` y `npx.cmd eslint server/index.js server/scripts/recovery-developer.js` -> `0` errores.
- **Regresión general:**
  - Ejecutar `etapa02_security_qa.test.mjs`, `etapa03_react_mysql8_qa.test.mjs` y `etapa08_browser_e2e_qa.test.mjs` sobre MariaDB local `3310`.

### Plan de Reversión
- Ningún cambio de v2.1.1 toca base de datos, migraciones ni datos de inventario.
- Si ocurriera cualquier anomalía tras desplegar v2.1.1 en Render:
  1. **Reversión inmediata en Render:** Hacer rollback al despliegue anterior (`468937e`) desde el panel de Render (`Manual Deploy` sobre commit previo) — tiempo estimado < 3 minutos.
  2. **Reversión en Git:** `git revert <commit-v211>` sobre `main` (sin `reset --hard` ni `--force`).

---

## 8. Evaluación del Riesgo sobre el Sistema Desplegado

| Cambio v2.1.1 | Riesgo sobre inventario / BD | Riesgo sobre operación web | Mitigación |
|---|---|---|---|
| Externalizar `error-trap.js` y usar `.textContent` | **Nulo** | **Muy bajo** (solo afecta banner de crash no capturado) | Probar build en `dist/` y disparo de error sintético |
| Quitar `'unsafe-inline'` de `script-src` en CSP | **Nulo** | **Bajo** (Vite genera `<script type="module" src="...">` externos) | Verificar carga completa de SPA en navegador sin errores CSP |
| Remover `xlsx` de `server/package.json` | **Nulo** | **Nulo** (no tiene ningún `import`/`require` en `server/`) | `node --check server/index.js` + pruebas API |
| Permitir `same-origin` exacto en `isOriginAllowed` | **Nulo** | **Bajo** (requiere `Origin` === `protocol://host`; `attacker.example` sigue en `403`) | Pruebas negativas `etapa02` (sección 6A) |
| Limpiar `recovery-developer.js` | **Nulo** | **Nulo** (script CLI manual offline) | `node --check` + `eslint` |
