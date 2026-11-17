# INGMELEC | ALMACÉN GENERAL v2.1 — Resumen Ejecutivo

**Fecha de auditoría:** 16 de noviembre de 2026  
**Destinatario:** Dirección General / Gerencia de Operaciones y Tecnología  
**Alcance:** Auditoría integral de solo lectura sobre el código fuente, configuración, migraciones y documentación del sistema **INGMELEC | ALMACÉN GENERAL** (rama `main`, commit `468937e`).

---

## 1. Visión General y Propósito Empresarial

**INGMELEC | ALMACÉN GENERAL** es una plataforma web corporativa (SPA React + API REST Node.js/Express + MySQL 8) diseñada para controlar el ciclo de vida del inventario físico, herramientas, equipos informáticos, mobiliario y suministros de **INGMELEC DOMINICANA** a través de sus distintas sedes y campamentos operativos.

### Problemas operativos que resuelve
1. **Unificación del inventario disperso:** Consolida en una sola base relacional activos distribuidos en 4 áreas operativas (`ALMACEN`, `INFORMATICA`, `COCINA`, `OFICINAS`) y múltiples sedes territoriales (`ALM-27FEB`, `CAMP-OPL`, `CAMP-M633`).
2. **Trazabilidad de movimientos y custodia:** Registra un kárdex inmutable (`inv_movimientos`) de entradas, salidas, traslados, asignaciones, devoluciones y ajustes, evitando pérdidas de stock o cambios no autorizados.
3. **Levantamientos físicos en campo y conciliación:** Permite realizar auditorías físicas por sede, importar conteos desde Excel/CSV, detectar diferencias contra el inventario teórico y consolidar cambios de forma atómica.
4. **Control de acceso por sede y función:** Restringe qué puede ver y hacer cada usuario según su rol, su matriz granular de permisos y los campamentos asignados.
5. **Cumplimiento y auditoría forense:** Registra cada operación crítica (logins, cambios de permisos, ediciones, bajas lógicas y consolidaciones) en una bitácora estructurada (`inv_auditoria`).

---

## 2. Estado General de Salud del Proyecto

**Calificación global:** **SALUDABLE PARA OPERACIÓN CONTROLADA (con deuda técnica moderada en mantenibilidad y pruebas automáticas de UI/carga).**

- **Fortalezas principales:**
  - **Seguridad defensiva sólida:** Contraseñas con **Argon2id**, autenticación **JWT HS256** con revocación inmediata (`token_version`), control de acceso granular de **20 permisos**, aislamiento estricto por campamento, consultas SQL 100% parametrizadas y encabezados HTTP defensivos (OWASP).
  - **Integridad de datos:** Bloqueos pesimistas (`SELECT ... FOR UPDATE`) en movimientos y consolidaciones, eliminación lógica (`activo = 0`) sin borrado físico del maestro, y preservación verificada de registros históricos ambiguos o sin sede directa mediante tabla de alias (`inv_campamento_alias`).
  - **Estabilidad de interfaz:** Enrutamiento SPA con carga diferida (`React.lazy`), protección contra fallos de renderizado (`ErrorBoundary` + `jsonFormat.js`) y exportación segura a Excel/CSV con mitigación contra inyección de fórmulas (CWE-1236).
- **Incidencia reciente resuelta (`468937e`):**
  - Tras el despliegue inicial v2.1 (`f2ebf7b`), los archivos estáticos `.js` y `.css` de Vite recibían `HTTP 403` JSON por ejecutarse el middleware CORS antes de `express.static`. El hotfix `468937e` reordenó `express.static` antes de CORS en `server/index.js`, manteniendo intacta la seguridad de `/api/v2`.

---

## 3. Capacidades Implementadas vs. Limitaciones Actuales

| Capacidad / Módulo | Estado | Situación actual y limitaciones |
| :--- | :--- | :--- |
| **Dashboard ejecutivo** | Implementado | KPIs en tiempo real, gráficos por área y estado, filtros por sede y navegación directa al inventario. |
| **Inventario maestro y por áreas** | Implementado | Paginación en servidor, ordenamiento, filtros avanzados, ficha técnica, historial y creación con auto-código. No tiene edición masiva en lote. |
| **Movimientos de stock** | Implementado | Registro transaccional con validaciones de stock. El traslado mueve el registro completo (no fracciona cantidades parciales). El selector carga hasta 500 ítems. |
| **Campamentos, almacenes y alias** | Implementado | Gestión de sedes, bodegas, resolución de alias históricos y previsualización/aplicación de reasignaciones. Sin coordenadas GPS/mapas. |
| **Levantamientos y consolidación** | Implementado | Captura rápida, importación Excel/CSV, conciliación y consolidación atómica ACID. |
| **Reportes y exportación** | Implementado (PDF parcial) | Exportación segura a `.xlsx` y `.csv` (hasta 10,000 filas). La salida a PDF depende de la impresión nativa del navegador (`window.print()`). |
| **Usuarios, RBAC y auditoría** | Implementado | Gestión exclusiva del perfil Developer con 20 permisos y bitácora de auditoría. La vista de auditoría consulta los últimos 150 eventos sin paginación de servidor. |
| **Hoja de asignación formal** | Planificado (excluido v2.1) | Excluida de v2.1 por decisión de negocio; la base de datos conserva `inv_custodios` y movimientos `ASIGNACION`/`DEVOLUCION` para su fase futura. |

---

## 4. Principales Riesgos y Problemas Detectados

1. **Monolito backend extenso (`server/routes/almacenApi.js` ~8,511 líneas):** Dificulta el mantenimiento, la revisión de cambios y el trabajo paralelo de varios desarrolladores.
2. **Pool de conexiones MySQL limitado a 2 (`connectionLimit: 2`):** Configurado así por el límite de conexiones de Clever Cloud; bajo concurrencia simultánea en importaciones o consolidaciones puede generar colas o esperas prolongadas.
3. **Dependencia del entorno en `CORS_ORIGINS`:** El backend exige la variable `CORS_ORIGINS` en producción para aceptar peticiones `POST`/`PUT`/`DELETE` con cabecera `Origin`; si cambia el dominio o hay URLs de previsualización, se bloquearán si no se actualizan en Render.
4. **Riesgo XSS menor en manejador global de errores (`index.html`):** Los listeners globales `window.onerror` y `unhandledrejection` usan `innerHTML` en lugar de `textContent`.
5. **Política CSP con `'unsafe-inline'`:** Reduce parcialmente la defensa frente a XSS si llegara a existir un vector de inyección en el cliente.
6. **Rate limiting solo en memoria y solo en login:** El límite de intentos vive en un `Map` en RAM (no compartido si hubiera múltiples réplicas) y no cubre rutas como reseteo de contraseña o importación masiva.
7. **Dependencia `xlsx@0.18.5` residual en `server/package.json`:** Aunque no se importa en el código del servidor, permanece declarada como dependencia con CVEs conocidos.
8. **Ausencia de pruebas automatizadas de UI unitarias, carga y desconexión de BD:** Las pruebas de integración existen en `server/tests/`, pero no cubren pruebas de estrés, reconexión ante caídas de Clever Cloud ni pruebas unitarias DOM en React.
9. **Errores de ESLint en scripts auxiliares y warnings en frontend:** `npm run lint` reporta 7 errores en `server/scripts/*.js` y 54 advertencias en `src/`.
10. **Control manual de migraciones SQL:** No existe una tabla automática tipo `schema_migrations`; depende de disciplina operativa y scripts idempotentes.

---

## 5. Plan de Acción Prioritario

| Prioridad | Horizonte | Acción recomendada | Impacto esperado |
| :--- | :--- | :--- | :--- |
| **1** | Corto plazo | Verificar en vivo `https://ingmelec-dominicana.onrender.com` tras despliegue de `468937e` (carga de JS/CSS, login, dashboard, exportación). | Confirmación operativa total en producción. |
| **2** | Corto plazo | Corregir `innerHTML` -> `textContent` en `index.html` y eliminar `xlsx` de `server/package.json`. | Cierre de superficie XSS/CVE con esfuerzo mínimo. |
| **3** | Corto plazo | Permitir *same-origin* explícito en `isOriginAllowed` o documentar/validar `CORS_ORIGINS` en Render, y parametrizar `DB_CONNECTION_LIMIT` en `db.js`. | Evita bloqueos operativos y prepara el pool ante mejoras de plan BD. |
| **4** | Mediano plazo | Modularizar `server/routes/almacenApi.js` por dominios (auth, inventario, movimientos, campamentos, levantamientos, usuarios). | Reduce drásticamente el riesgo de regresiones y acelera el desarrollo. |
| **5** | Mediano/Largo plazo | Añadir pruebas de carga/reconexión BD, paginación en `/auditoria` y evaluación de traslado parcial de stock por cantidades. | Escalabilidad empresarial y operación multi-sede robusta. |

---

## 6. Evidencias y Grado de Certeza

- **Verificado directamente en esta auditoría (16/11/2026):** Lectura completa de estructura del repositorio, `package.json`, `server/package.json`, `server/index.js`, `server/routes/almacenApi.js`, `server/database/db.js`, `server/database/guard.js`, migraciones `03`–`06_safe`, frontend completo en `src/`, `index.html`, `eslint.config.js` y suite `server/tests/`.
- **Información histórica (no re-verificada en vivo contra servidores remotos en esta sesión):** Cantidad exacta de registros en Clever Cloud (434 artículos, 1,965 unidades, 8 usuarios, 41 movimientos, 114 auditorías), estado actual del panel de Render y resultados históricos de las 51 pruebas E2E ejecutadas antes del cierre de v2.1.
- **No verificado en esta sesión:** Respuesta HTTP en vivo de `https://ingmelec-dominicana.onrender.com` después de desplegar `468937e`, ni ejecución de `server/tests/` contra MariaDB 3310 fuera del sandbox de red local.
