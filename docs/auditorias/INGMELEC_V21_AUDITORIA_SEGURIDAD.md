# INGMELEC | ALMACÉN GENERAL v2.1 — Auditoría de Seguridad

**Fecha de auditoría:** 16 de noviembre de 2026  
**Alcance:** Revisión estática de seguridad sobre frontend (`index.html`, `src/`), backend (`server/`), base de datos/TLS (`server/database/`, `server/certs/`) y dependencias (`package.json`, `server/package.json`).  
**Restricción cumplida:** Auditoría estrictamente de solo lectura; sin exposición de contraseñas, secretos, tokens ni valores de `.env`.

---

## 1. Resumen de Postura de Seguridad

El sistema **INGMELEC | ALMACÉN GENERAL v2.1** implementa controles de seguridad alineados con prácticas defensivas modernas (OWASP):

- **Autenticación y contraseñas:** Hashing con **Argon2id** (`64 MiB`, `timeCost: 3`, `parallelism: 1`) y actualización transparente desde formatos legados (PBKDF2/Bcrypt). Fallback de texto plano desactivado en producción.
- **Gestión de sesiones JWT:** Implementación propia con `node:crypto` en HMAC-SHA256 (`HS256`), validación estricta de cabecera (`alg === 'HS256'`, `typ === 'JWT'`), comparación en tiempo constante (`crypto.timingSafeEqual`), expiración configurable (`JWT_TTL_HOURS`, por defecto 12h), secreto obligatorio mínimo de 32 caracteres (`validateAndGetJwtSecret()`) y revocación inmediata en BD mediante `token_version`.
- **Fail-Closed en autenticación:** Si MySQL no responde durante `requireAuth`, el servidor devuelve `HTTP 503` y deniega el paso.
- **RBAC y aislamiento territorial:** Matriz de **20 permisos granulares** (`KNOWN_PERMISSION_KEYS`), regla de desarrollador único (`POST /usuarios` bloquea crear `rol === 'developer'` o asignar `*`), y aislamiento estricto por campamento mediante `getUserAllowedCampamentos()`, `buildArticleScopeFilter()`, `canAccessArticle()` y `canTargetCampamento()`.
- **Prevención de SQL Injection:** Consultas 100% parametrizadas con `mysql2/promise`, `multipleStatements: false` en el pool operativo y listas blancas explícitas para ordenamiento dinámico (`sortColumnMap`).
- **Seguridad en tránsito BD:** TLS activado para Clever Cloud mediante CA oficial `server/certs/clever-cloud-mysql-ca.pem` y `rejectUnauthorized: true` por defecto.
- **Protección contra Formula Injection (CWE-1236):** `neutralizeSpreadsheetFormula()` en `src/utils/exportUtils.js` neutraliza celdas que inicien con `=`, `+`, `-`, `@`, `\t`, `\r` al exportar CSV/XLSX, y bloquea archivos binarios `.xls` antiguos al importar.

---

## 2. Hallazgos de Seguridad Clasificados

No se detectaron vulnerabilidades de severidad **CRÍTICO** ni **ALTO** en el código auditado. Se identificaron **7 hallazgos** (5 de severidad **MEDIO** y 2 de severidad **BAJO**):

### SEC-01 — DOM XSS potencial en manejadores globales de error del cliente
- **Severidad:** **MEDIO**
- **Evidencia:** `index.html`, líneas 28 y 45 (`window.addEventListener('error', ...)` y `window.addEventListener('unhandledrejection', ...)`).
- **Detalle técnico:** Ambos listeners construyen el banner visual de error usando `errDiv.innerHTML = '<strong>...</strong>' + event.message` y `+ event.reason`.
- **Escenario de riesgo:** Si una excepción no capturada o promesa rechazada contiene markup HTML o `<img onerror=...>` originado en datos externos o parámetros manipulados, el navegador lo interpretará como HTML en el DOM.
- **Solución recomendada:** Crear el nodo `<strong>` con `document.createElement('strong')` y asignar `event.message`, `event.error.stack` y `event.reason` mediante `.textContent`.

### SEC-02 — `Content-Security-Policy` permite `'unsafe-inline'` en `script-src` y `style-src`
- **Severidad:** **MEDIO**
- **Evidencia:** `server/index.js`, líneas 73–76 (`Content-Security-Policy`).
- **Detalle técnico:** La política actual incluye `script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`.
- **Escenario de riesgo:** `'unsafe-inline'` en `script-src` debilita la mitigación secundaria de CSP frente a cualquier vector XSS (como `SEC-01`), permitiendo ejecutar scripts inline inyectados.
- **Solución recomendada:** Mover los scripts globales de `index.html` a un archivo JS estático servido bajo `'self'` (eliminando `'unsafe-inline'` de `script-src`) o aplicar hashes SHA-256 / nonces por petición.

### SEC-03 — Almacenamiento de JWT y perfil de usuario en `localStorage`
- **Severidad:** **MEDIO**
- **Evidencia:** `src/context/AppContext.jsx` (`ingmelec_token`, `ingmelec_user`, `ingmelec_active_campamento`) y `server/routes/almacenApi.js` líneas 443–446 (`Authorization: Bearer <token>`).
- **Escenario de riesgo:** Cualquier script ejecutado en el contexto de la página (XSS) puede leer `localStorage.getItem('ingmelec_token')` y exfiltrar el JWT válido hasta por 12 horas (salvo revocación manual).
- **Solución recomendada:** A mediano plazo, migrar el transporte del JWT a cookies `HttpOnly`, `Secure`, `SameSite=Strict` (acompañado de protección CSRF correspondiente si aplica).

### SEC-04 — Rate limiting limitado únicamente a `/auth/login` y almacenado en memoria local
- **Severidad:** **MEDIO**
- **Evidencia:** `server/routes/almacenApi.js`, líneas 1025–1082 (`loginAttempts = new Map()`, `rateLimitLogin`).
- **Detalle técnico:** `POST /api/v2/auth/login` aplica límites por IP (15/min), IP+Email (10/min) y Email (25/min), pero endpoints sensibles o costosos como `POST /api/v2/usuarios/:id/recuperar`, `POST /api/v2/levantamientos/:id/import-items` o `GET /api/v2/reportes/exportar` no tienen limitación de tasa. Además, el `Map` en RAM no se comparte si se escalara a múltiples instancias y se reinicia con cada deploy/reinicio de Render.
- **Escenario de riesgo:** Un atacante autenticado o un proceso automatizado podría saturar rutas pesadas (importación/exportación) afectando el pool de 2 conexiones MySQL, o abusar de endpoints sin throttling.
- **Solución recomendada:** Añadir rate limiting general y por ruta sensible (`express-rate-limit` o helper reutilizable), y externalizar el store (Redis o MySQL) si en el futuro se despliegan múltiples réplicas.

### SEC-05 — Acoplamiento de peticiones `same-origin` mutables a la configuración manual de `CORS_ORIGINS`
- **Severidad:** **MEDIO**
- **Evidencia:** `server/index.js`, líneas 49–63 (`isOriginAllowed`) y líneas 88–97.
- **Detalle técnico:** Tras el hotfix `468937e`, `express.static` se sirve antes de CORS (resolviendo la carga de JS/CSS), pero en producción `isOriginAllowed(origin)` solo acepta solicitudes con cabecera `Origin` si coinciden exactamente con `CORS_ORIGINS`. Los navegadores siempre envían `Origin` en peticiones `POST`/`PUT`/`PATCH`/`DELETE` incluso cuando son *same-origin*.
- **Escenario de riesgo:** Si `CORS_ORIGINS` se omite, queda mal escrita o el servicio se accede desde un dominio espejo/preview de Render, las operaciones de login y mutación en `/api/v2` serán rechazadas con `HTTP 403`.
- **Solución recomendada:** Mantener la lista blanca estricta para orígenes externos y evaluar reconocer explícitamente el propio host/protocolo *same-origin* (`origin === `${req.protocol}://${req.get('host')}`` cuando `trust proxy` esté validado), sin abrir orígenes de terceros.

### SEC-06 — Dependencia no utilizada `xlsx@0.18.5` presente en `server/package.json`
- **Severidad:** **BAJO**
- **Evidencia:** `server/package.json`, línea 18 (`"xlsx": "^0.18.5"`).
- **Detalle técnico:** El frontend migró correctamente a `read-excel-file` y `write-excel-file`, y el backend recibe JSON ya parseado desde el cliente en `import-items`. Sin embargo, `server/package.json` sigue declarando `xlsx@0.18.5`, versión históricamente asociada a vulnerabilidades de Prototype Pollution y ReDoS en SheetJS.
- **Escenario de riesgo:** Exposición innecesaria en escaneos SCA/auditorías de dependencias (`npm audit`) y riesgo latente si algún script futuro la importara.
- **Solución recomendada:** Eliminar `"xlsx"` de `server/package.json` y regenerar `server/package-lock.json`.

### SEC-07 — Rutas absolutas locales del desarrollador en scripts CLI auxiliares
- **Severidad:** **BAJO**
- **Evidencia:** `server/scripts/calcular-huella-hash.js` (L24), `server/scripts/diagnostico-login-developer.js` (L80), `server/scripts/generate-update-sql.js` (L29).
- **Escenario de riesgo:** Exposición menor de estructura de directorios local del equipo de desarrollo (aunque estos scripts están excluidos de Git salvo `recovery-developer.js` según `.gitignore`).
- **Solución recomendada:** Reemplazar rutas absolutas por `path.resolve()` relativo al repositorio o argumentos CLI.

---

## 3. Verificación por Dominio de Seguridad

| Dominio | Control verificado | Estado |
| :--- | :--- | :--- |
| **Contraseñas y hashes** | Argon2id (`memoryCost: 65536`, `timeCost: 3`), upgrade automático desde legados, sin plain fallback en prod | **Cumple** |
| **JWT y sesiones** | `HS256` estricto, `timingSafeEqual`, TTL 12h, secreto >= 32 chars, `token_version` en cada request | **Cumple** |
| **RBAC y privilegios** | 20 permisos granulares, bloqueo de creación de `developer` y asignación de `*` vía API | **Cumple** |
| **Aislamiento por sede** | `buildArticleScopeFilter`, `canAccessArticle`, `canTargetCampamento` en inventario, movimientos y levantamientos | **Cumple** |
| **Inyección SQL** | Consultas parametrizadas con `mysql2/promise`, `multipleStatements: false`, `sortColumnMap` cerrado | **Cumple** |
| **XSS** | Sin `dangerouslySetInnerHTML` ni `eval()` en `src/`; pendiente sanitizar `innerHTML` en `index.html` y endurecer CSP | **Parcial (MEDIO)** |
| **CSRF y CORS** | Whitelist estricta por `CORS_ORIGINS`; estáticos desacoplados antes de CORS; sin cookies de sesión | **Cumple (vigilar `CORS_ORIGINS`)** |
| **Importación de archivos** | Rechazo de `.xls` binario, límite 10 MB / 5,000 filas, validación atómica fila por fila, chunking de 500 | **Cumple** |
| **Auditoría y trazabilidad** | Registro en `inv_auditoria` con IP, usuario, acción, entidad y diff JSON en todas las mutaciones clave | **Cumple** |
| **BD y TLS** | TLS con `clever-cloud-mysql-ca.pem` y `rejectUnauthorized: true`; `guard.js` bloquea pruebas contra prod | **Cumple** |
