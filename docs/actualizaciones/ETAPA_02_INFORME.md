# INFORME DE ETAPA 2 — AUTENTICACIÓN, AUTORIZACIÓN Y SEGURIDAD (v2.1)

**Proyecto:** INGMELEC | ALMACÉN GENERAL (`v2.1` Local)  
**Fecha:** 2026-11-11  

---

## 1. Estado
**Aprobada localmente** *(con hallazgo menor `R-E2-01` registrado para corrección en Etapa 3 al intervenir `almacenApi.js`)*

## 2. Equipo
| Rol | Subagente / Agente | Responsabilidades Ejecutadas |
| :--- | :--- | :--- |
| **Coordinador Principal** | Coordinador INGMELEC | Definición de fronteras de archivos sin conflicto, revisión de hallazgo `active = 0 -> 403 / reactivar -> 401` (Opción A) y consolidación de cierre de etapa. |
| **Especialista Principal (Backend AppSec)** | `especialista-backend-dev` | Endurecimiento completo de JWT (`HS256`, `timingSafeEqual`, `exp`/`tv`, TTL `12h`, `POST /auth/logout` + revocación real), `requireAuth` *fail-closed* (`503`), cierre IDOR en Dashboard/almacenes/artículos/catálogos/auditoría, eliminación de `.includes()`, rate limit con `req.ip`/evicción y whitelist `CORS` + `CSP` en `server/index.js`. |
| **Especialista Complementario (DevOps/BD/Dependencias)** | `especialista-devops-infra` | TLS estricto en `db.js` con CA oficial `clever-cloud-mysql-ca.pem` (`rejectUnauthorized: true`), `multipleStatements: false` por defecto, columna `token_version` en fixture + `migration_03`, excepción `.pem` en `.gitignore` y actualización de dependencias vulnerables (`npm audit fix`). |
| **Ingeniero QA Independiente** | `especialista-qa-verificador` | Construcción y ejecución de la suite de seguridad `server/tests/etapa02_security_qa.test.mjs` (`9/9` PASS), actualización y regresión de `server/tests/etapa01_isolation_qa.test.mjs` (`7/7` PASS), verificación de `npm audit`, ESLint, Vite build y limpieza de puertos/procesos. |

## 3. Código (Archivos Modificados y Creados)
*Implementación Backend e Infraestructura:*
- `server/index.js`: `app.set('trust proxy', ...)`, `app.disable('x-powered-by')`, whitelist CORS estricta (`403` JSON sin `Access-Control-Allow-Origin` ante origen no autorizado/`null`), headers `Content-Security-Policy` y `Permissions-Policy`, eliminación de `X-XSS-Protection`, límite JSON `1mb` global vs `10mb` acotado a rutas con Base64/lotes, handler `_next` + `413`/`400`.
- `server/routes/almacenApi.js`: `verifyToken()` con validación de algoritmo/tipo, `crypto.timingSafeEqual` y `exp` numérico finito; TTL configurable `JWT_TTL_HOURS` (`12h`); `tv` (`token_version`) y revocación vía `POST /api/v2/auth/logout`, `/recuperar`, `/estado`, `/permisos` y `PUT /usuarios/:id`; `requireAuth` *fail-closed* (`503` ante fallo BD); `GET /config/entorno` protegido con `requireAuth` sin exponer detalles privados; eliminación de bypass `gerencia` global sin sede ni `*`; eliminación de `.includes()` mediante `canAccessArticle`/`canTargetCampamento`/`buildArticleScopeFilter`; scope completo en `GET /dashboard/kpis` y `POST /campamentos/:id/almacenes`; acotación de `GET /catalogos/*` y `/auditoria`; rate limit con `req.ip` y cota de memoria (`5,000` entradas).
- `server/database/db.js`: [`buildSslConfig`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/db.js#L36-L53) con CA oficial y `rejectUnauthorized: true` por defecto; `multipleStatements: false` por defecto (pool multi-sentencia separado solo bajo `{ allowMultipleStatements: true }`); [`getTlsConfigPreview`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/db.js#L55-L90).
- `server/database/migrations/migration_03_v21_seguridad_y_esquema.sql` *(propuesta local no ejecutada en producción)*: adición idempotente de `token_version INT NOT NULL DEFAULT 1` en `inv_usuarios`.
- `.gitignore` *(añadida excepción `!server/certs/clever-cloud-mysql-ca.pem` preservando reglas previas)*, `.env.example`, `server/.env.example`, `package-lock.json`, `server/package-lock.json`.

*Pruebas y Fixtures Locales:*
- `server/tests/fixtures/v21_synthetic_fixture.sql` *(columna `token_version` en `inv_usuarios`)*.
- `server/tests/etapa01_isolation_qa.test.mjs` *(actualizado para `{ allowMultipleStatements: true }` en carga inicial y compatibilidad con `mysql2@3.24.6`)*.
- `server/tests/etapa02_security_qa.test.mjs` *(9 casos de seguridad negativa y aislamiento ejecutados contra MariaDB `127.0.0.1:3310` + subprocesos Express reales)*.

## 4. Pruebas
| Verificación / Suite | Casos / Resultado Real | Evidencia Principal |
| :--- | :--- | :--- |
| `node --test server/tests/etapa02_security_qa.test.mjs` | **`9/9` PASS**, `0` fail, `0` skipped (`15.73 s`, `exit 0`) | Validó: (1) TLS CA + rechazo de `SELECT 1; SELECT 2` por `multipleStatements: false`; (2) `requireAuth` responde `503` ante `ECONNREFUSED`; (3) rechazo `401` de `alg:"none"`, firma alterada, sin `exp`, `exp` vencido/string y `tv` inválido + revocación real vía `/logout`, `/recuperar`, `/estado` (`403` desactivado / `401` token antiguo tras reactivar) y `/permisos`; (4) `/config/entorno` `401` sin auth y filtrado mínimo para operativos; (5) defecto seguro sin sede (`[]`/`0`/`403`), IDOR KPIs/almacenes/artículos/custodios/levantamientos y bloqueo anti-`.includes()`; (6A-6B) CORS `403`, headers CSP, límite `1MB` (`413`) vs `10MB` (`201`) y bloqueo `429` resistente a rotación `X-Forwarded-For` (`TRUST_PROXY=false`); (7) cierre sin puertos residuales. |
| `node --test server/tests/etapa01_isolation_qa.test.mjs` | **`7/7` PASS**, `0` fail, `0` skipped (`13.94 s`, `exit 0`) | Regresión completa de Etapa 1 exitosa tras parches de Etapa 2. |
| `npx eslint server/index.js server/routes/almacenApi.js server/database/db.js server/database/guard.js` | `0` errores, `0` warnings (`exit 0`) | También `eslint --no-ignore` en `etapa01` y `etapa02` (`exit 0`) y `node --check` (`exit 0`). |
| `cmd /c npm audit --omit=dev --json` (post-fix) | **Server:** `1` alta (`xlsx`, `0` críticas, `0` moderadas; bajó de `6 -> 1`). **Raíz:** `1` alta (`xlsx`, `0` críticas, `0` moderadas; bajó de `7 -> 1`). | Parchados `proxy-addr@2.0.8` (crítica), `body-parser@1.20.9`, `mysql2@3.24.6`, `morgan@1.12.1`, `qs@1.16.2`, `postcss@8.5.32`, `browserslist@4.29.5`, `source-map-js@1.2.2`, `nanoid@3.3.20`. |
| `cmd /c npx vite build --outDir .../v21_qa2_dist` | `exit 0` (`2,320` módulos en `9.18 s`) | Carpeta temporal eliminada limpiamente después de validar. |

## 5. Hallazgos
- **Corregidos en Etapa 2:** **`C05`**, **`C06`** *(en backend; hook cliente `/auth/logout` en `AppContext` pasa a Etapa 3)*, **`A01`**, **`A02`**, **`A03`**, **`A04`**, **`A05`**, **`M05`**, **`B02`**, **`A11`** *(parcial: 11 de 13 vulnerabilidades resueltas; permanece únicamente `xlsx@0.18.5` sin parche npm, programado para reemplazo funcional por alternativa segura en Etapa 7)*.
- **Hallazgo menor detectado en QA (`R-E2-01` — transferido a Etapa 3):** En `POST /api/v2/levantamientos/:id/items` (`almacenApi.js:4193-4208`), se verifica `estado === 'Finalizado'` (`HTTP 409`) antes que `getUserAllowedCampamentos` (`HTTP 403`), filtrando el estado de una sesión ajena. Se corrige en Etapa 3 moviendo validación de `scope` antes de `estado`.
- **Deuda remanente declarada (a resolver en Etapas 3–7):** C01/C02/C03/C04/C07/C08 y M01..M09/B01..B06 según roadmap. Además, el orden global de CORS/CSP en producción exige definir `CORS_ORIGINS` si frontend y backend residen en dominios distintos.

## 6. Datos
- Todas las pruebas corrieron exclusivamente sobre MariaDB `10.11.10` aislada en `127.0.0.1:3310` (`ingmelec_v21_test_isolated`) con contraseñas sintéticas efímeras y `wrapMysql8JsonPool`.
- Base histórica `local-mysql/data` e instancia paralela `ingmelec-asistencia` (`127.0.0.1:3309`) verificadas intactas; puertos `3310`, `5099`, `5111`, `5112` cerrados tras cierre.
- Cero escrituras y cero conexiones a Clever Cloud.

## 7. Git
- **Rama actual:** `develop/almacen-v2.1`.
- **Push / Merge a `main`:** **0** (prohibido).
- `git ls-files server/scripts` confirmó que el único script rastreado es `recovery-developer.js`.

## 8. Publicación
- Render: **0 despliegues**.
- Clever Cloud: **0 modificaciones / 0 migraciones ejecutadas**.

## 9. Siguiente paso
Avanzar a la **ETAPA 3 — Errores React #31, compatibilidad de esquema MySQL 8 y resiliencia de conexiones BD** (`C01`, `C02`, `M04`, `M08` inicial, `B01` parcial y ajuste `R-E2-01` + integración cliente `POST /api/v2/auth/logout`).
