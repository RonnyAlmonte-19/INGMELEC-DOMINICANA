# INGMELEC | ALMACÉN GENERAL v2.1 — Hallazgos, Deuda Técnica y Hoja de Ruta

**Fecha de auditoría:** 16 de noviembre de 2026  
**Base de análisis:** Inspección estática completa del código en `main` (`468937e`) y verificación local de compilación/linting.

---

## 1. Matriz Consolidada de Deuda Técnica y Problemas (Fase 9)

| ID | Severidad | Problema | Evidencia | Impacto empresarial | Corrección recomendada | Esfuerzo estimado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DT-01** | **MEDIO** | Monolito backend de ~8,511 líneas en un único archivo | `server/routes/almacenApi.js` (L1–8511, 49 endpoints + helpers + SQL) | Alto riesgo de regresiones al editar, baja mantenibilidad y dificultad para pruebas unitarias aisladas | Separar en módulos por dominio (`auth`, `articulos`, `movimientos`, `campamentos`, `levantamientos`, `usuarios`, `reportes`) y capa de servicios/repositorios | Alto (3–5 días) |
| **DT-02** | **MEDIO** | DOM XSS potencial en manejadores globales de error | `index.html` (L28 y L45: `errDiv.innerHTML = ... + event.message / event.reason`) | Riesgo de ejecución de HTML/JS si un error runtime contiene contenido no sanitizado | Reemplazar `innerHTML` por construcción segura de nodos y `.textContent` | Bajo (< 1 hora) |
| **DT-03** | **MEDIO** | CSP con `'unsafe-inline'` en `script-src` y `style-src` | `server/index.js` (L73–76) | Reduce la defensa en profundidad frente a XSS | Externalizar el script inline de `index.html` a un archivo bajo `'self'` o usar hashes/nonces SHA-256 | Bajo–Medio (2–4 horas) |
| **DT-04** | **MEDIO** | JWT almacenado en `localStorage` | `src/context/AppContext.jsx` (`ingmelec_token`) | Exposición del token ante cualquier XSS exitoso en el navegador | Evaluar migración a cookies `HttpOnly`, `Secure`, `SameSite=Strict` | Medio–Alto (1–2 días) |
| **DT-05** | **MEDIO** | Rate limiting solo en memoria y solo en `/auth/login` | `server/routes/almacenApi.js` (L1025–1082, `loginAttempts = new Map()`) | Endpoints costosos (`import-items`, `exportar`, `recuperar`) quedan sin throttling; no escala multi-instancia | Extender rate limiting a rutas sensibles/pesadas y usar store compartido si se escala horizontalmente | Medio (0.5–1 día) |
| **DT-06** | **MEDIO** | Pool MySQL fijo en `connectionLimit: 2` sin leer `DB_CONNECTION_LIMIT` | `server/database/db.js` (L94, L105) vs `.env.example` (`DB_CONNECTION_LIMIT`) | Bajo concurrencia de importaciones/consolidaciones puede provocar colas y timeouts HTTP | Leer `process.env.DB_CONNECTION_LIMIT` (con valor por defecto `2` y validación segura) | Bajo (< 1 hora) |
| **DT-07** | **MEDIO** | Peticiones `same-origin` mutables dependen de `CORS_ORIGINS` manual | `server/index.js` (L49–63, `isOriginAllowed`) | Si cambia el dominio o falta `CORS_ORIGINS` en Render, `POST`/`PUT`/`DELETE` devuelven `403` | Permitir explícitamente `same-origin` exacto (`origin === `${req.protocol}://${req.get('host')}``) manteniendo bloqueo a terceros | Bajo (1–2 horas) |
| **DT-08** | **MEDIO** | Traslados mueven el registro completo sin fraccionar cantidad parcial | `server/routes/almacenApi.js` (L3845–3945) | No permite trasladar 4 de 10 unidades manteniendo 6 en sede origen | Diseñar lógica de split de lote/stock en `TRASLADO` cuando `cantidad < cantidad_num` | Medio–Alto (1–2 días) |
| **DT-09** | **BAJO** | Dependencia `xlsx@0.18.5` declarada sin uso en backend | `server/package.json` (L18) | Ruido en auditorías SCA/CVEs y peso innecesario en `node_modules` | Desinstalar `xlsx` de `server/package.json` y regenerar lockfile | Bajo (< 30 min) |
| **DT-10** | **BAJO** | Errores ESLint en `server/scripts/` y 54 warnings en `src/` | `npm.cmd run lint` (7 errores en `server/scripts/*.js`, 54 warnings en `src/`) | Degrada higiene de CI/CD y oculta advertencias reales | Corregir escapes/asignaciones en scripts y limpiar imports no usados en `src/` | Bajo–Medio (2–4 horas) |
| **DT-11** | **BAJO** | Selector de artículos en `MovimientosPage` carga 500 filas en `<select>` | `src/pages/MovimientosPage.jsx` (L59–68) | Degradación UX y truncamiento si un almacén supera 500 bienes activos | Reemplazar por `SearchableSelect` con búsqueda asíncrona en `/api/v2/articulos` | Medio (3–4 horas) |
| **DT-12** | **BAJO** | Código duplicado en páginas de inventario, exportación y campamentos | `src/pages/*Page.jsx`, `InventoryTable.jsx`, `ReportesPage.jsx`, `Topbar.jsx` | Cambios repetitivos en varios archivos ante ajustes de exportación o sedes | Extraer hooks/helpers compartidos (`useFullExport`, `useCampamentoOptions`) | Bajo–Medio (3–4 horas) |
| **DT-13** | **BAJO** | Auditoría fija en últimos 150 eventos sin paginación ni filtro de fecha | `src/pages/AuditoriaPage.jsx`, `almacenApi.js` (L4315) | Dificulta investigaciones forenses históricas de largo plazo | Añadir paginación y filtros `desde`/`hasta` en `GET /api/v2/auditoria` | Medio (0.5–1 día) |
| **DT-14** | **BAJO** | Ausencia de tabla `schema_migrations` y pruebas de carga/UI unitaria | `server/database/migrations/`, `server/tests/` | Mayor esfuerzo operativo para validar estado de esquema y regresiones de carga | Incorporar registro de migraciones aplicadas y tests de carga/reconexión BD | Medio (1–2 días) |

---

## 2. Hoja de Ruta y Evolución Recomendada (Fase 10)

### 2.1 Corto Plazo (1–2 semanas) — Estabilidad, Seguridad y Respaldos
*Objetivo: Cerrar hallazgos rápidos de seguridad y validar producción sin interrupciones.*
1. **Validación post-hotfix `468937e` en Render:** Confirmar en vivo carga de `.js`/`.css` (`HTTP 200` y MIME correcto), login, dashboard, movimientos y exportaciones.
2. **Hardening rápido de cliente y dependencias (`DT-02`, `DT-03`, `DT-09`):**
   - Cambiar `innerHTML` por `.textContent` en `index.html`.
   - Eliminar `xlsx@0.18.5` de `server/package.json`.
   - Mover script inline de `index.html` a archivo estático para retirar `'unsafe-inline'` de `script-src` en CSP.
3. **Resiliencia operativa (`DT-06`, `DT-07`, `DT-10`):**
   - Conectar `DB_CONNECTION_LIMIT` en `server/database/db.js`.
   - Soportar *same-origin* explícito en `isOriginAllowed` manteniendo whitelist estricta para orígenes externos.
   - Resolver los 7 errores de ESLint en `server/scripts/` y sincronizar `"version": "2.1.0"` en `package.json`.
4. **Automatización de respaldos:** Programar respaldos automáticos diarios de Clever Cloud y pruebas periódicas de restauración en entorno aislado.

### 2.2 Mediano Plazo (1–2 meses) — Mantenibilidad, Calidad y UX
*Objetivo: Reducir deuda estructural y mejorar experiencia operativa.*
1. **Modularización del backend (`DT-01`):** Dividir `server/routes/almacenApi.js` en rutas, controladores y servicios por dominio (`auth`, `articulos`, `movimientos`, `campamentos`, `levantamientos`, `usuarios`, `reportes`).
2. **Mejoras de UX y rendimiento (`DT-11`, `DT-12`, `DT-13`):**
   - Sustituir `<select>` de 500 ítems en `MovimientosPage.jsx` por búsqueda asíncrona.
   - Paginación y rango de fechas en `AuditoriaPage.jsx`.
   - Extraer helpers compartidos de exportación y opciones de sede.
   - Virtualizar tabla de `LevantamientoWorkspace.jsx` para levantamientos >1,000 filas.
3. **Ampliación de QA (`DT-14`):**
   - Añadir pruebas automatizadas para `MAINTENANCE_MODE=true`, caída/reconexión del pool MySQL y pruebas de carga (k6/autocannon).
   - Actualizar `etapa01_isolation_qa.test.mjs` para no fallar por nombre de rama cuando se ejecute en `main`.
4. **PDF corporativo nativo:** Evaluar generación directa de reportes y actas en PDF sin depender de `window.print()`.

### 2.3 Largo Plazo (3–6+ meses) — Escalabilidad y Arquitectura Empresarial ERP
*Objetivo: Evolucionar la plataforma hacia un sistema multi-sede de alta disponibilidad.*
1. **Gestión de stock fraccionable (`DT-08`) y Hoja de Asignación:** Implementar división de lotes en traslados parciales y completar el módulo planificado de Hoja de Asignación con firma/recepción de custodios.
2. **Cookies `HttpOnly` + Rate Limit Distribuido (`DT-04`, `DT-05`):** Migrar sesión JWT a cookies `HttpOnly; Secure; SameSite=Strict` y mover rate limiting a Redis/store compartido para escalado horizontal en Render.
3. **Orquestación de migraciones y observabilidad:** Adoptar tabla formal `schema_migrations`, logging estructurado JSON (Pino/Winston) con correlación de peticiones y métricas de latencia de BD.
4. **Integración ERP INGMELEC:** Conectar mediante webhooks o APIs internas con compras, contabilidad/activos fijos y gestión de proyectos/obras de INGMELEC DOMINICANA.
