# INFORME DE ETAPA 1 — PREPARACIÓN, VERSIÓN Y AISLAMIENTO LOCAL (v2.1)

**Proyecto:** INGMELEC | ALMACÉN GENERAL (`v2.1` Local)  
**Fecha:** 2026-11-11  

---

## 1. Estado
**Aprobada localmente**

## 2. Equipo
| Rol | Subagente / Agente | Responsabilidades Ejecutadas |
| :--- | :--- | :--- |
| **Coordinador Principal** | Coordinador INGMELEC | Lectura íntegra del Plan Maestro v2.1 (PDF 10 págs.), resolución preventiva de colisión de puerto `3309` -> `3310`, creación de matriz de seguimiento de 34 hallazgos e integración de etapa. |
| **Especialista Principal (DevOps/Infraestructura)** | `especialista-devops-infra` | Inventario Git y preservación de cambios previos, creación de rama `develop/almacen-v2.1`, inicialización de instancia MariaDB `10.11.10` aislada en puerto `3310`, guardrails en `guard.js` y `db.js`, helper `local-mariadb.mjs` y captura de línea base. |
| **Especialista Complementario (Arquitecto de BD)** | `especialista-arquitecto-bd` | Diseño del esquema/seed sintético `v21_synthetic_fixture.sql` (29 artículos ficticios, alias OPL/KM19/Mantenimiento, duplicados `HER-258`/`HER-252`, usuarios 6 roles + JSON) y simulador MySQL 8 `mysql8_json_shim.mjs`. |
| **Ingeniero QA Independiente** | `especialista-qa-verificador` | Construcción y ejecución independiente de la suite `server/tests/etapa01_isolation_qa.test.mjs` (`7/7` casos PASS), verificación de pruebas negativas anti-producción, carga real en `127.0.0.1:3310`, arranque HTTP Express + `dist` y verificación post-cierre sin procesos huérfanos. |

## 3. Código (Archivos Modificados y Creados)
*Modificados en código de infraestructura BD:*
- `server/database/guard.js`: reforzado [`assertSafeDatabaseTarget`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/guard.js#L87-L152) para rechazar `DB_HOST` vacío (`process.exit(1)`) e incorporada [`assertLocalIsolatedTarget`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/guard.js#L40-L85) (lanza `Error` explícito ante host vacío, no local, Clever Cloud o `gridops_enterprise` sin modo permitido).
- `server/database/db.js`: refactorizado [`getPool`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/db.js#L62-L92) con construcción dinámica desde `process.env`, invocación obligatoria de [`assertLocalIsolatedTarget`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/guard.js#L40-L85) en modos `test` / `isolated_test` / `local_test` / `ISOLATED_LOCAL_ONLY` / `BLOCK_REMOTE_DB`, y función [`closePool`](file:///C:/Users/gener/OneDrive/Desktop/INGMELEC-GITHUB/INGMELEC-DOMINICANA/server/database/db.js#L105-L113).

*Creados en pruebas y documentación local (fuera del runtime productivo):*
- `server/tests/helpers/local-mariadb.mjs` (ciclo de vida seguro de instancia portable MariaDB `10.11.10` en `127.0.0.1:3310`, datadir `scratch/local-mysql-v21/data`).
- `server/tests/fixtures/v21_synthetic_fixture.sql` (DDL + seed 100% sintético para `ingmelec_v21_test_isolated`, con documentación explícita de las brechas `BRECHA-01..06` frente a `migration_01` y MySQL 8).
- `server/tests/fixtures/mysql8_json_shim.mjs` (simulador de columnas `MYSQL_TYPE_JSON` devolviendo objetos/arrays JS sobre MariaDB).
- `server/tests/etapa01_isolation_qa.test.mjs` (suite independiente `node:test` de Etapa 1).
- `docs/actualizaciones/MATRIZ_SEGUIMIENTO_v2_1.md` y `docs/actualizaciones/ETAPA_01_INFORME.md`.

*Preexistentes conservados intactos:* `M .gitignore`, `M server/scripts/recovery-developer.js`, `?? docs/auditorias/AUDITORIA_INTEGRAL_PRE_ACTUALIZACIONES.md`. Cero archivos `.env` con secretos en el repositorio.

## 4. Pruebas
| Comando / Verificación | Casos / Resultado Real | Evidencia |
| :--- | :--- | :--- |
| `node --check server/` (`.js` + `.mjs`) | `12/12` OK (`exit 0`) | Todos los módulos backend/helpers sintácticamente válidos en Node `v26.13.0`. |
| `eslint` en archivos editados/creados E1 | `0` errores, `0` warnings (`exit 0`) | `guard.js`, `db.js` y `--no-ignore local-mariadb.mjs` limpios. |
| `cmd /c npm run lint` (línea base repo) | `152` problemas (`10` errores, `142` warnings), `exit 1` | Línea base intacta respecto a auditoría previa (cero regresiones introducidas). |
| `cmd /c npx vite build --outDir .../v21_baseline_dist` | `exit 0` (`2,320` módulos en `5.12 s`) | Bundle compilado limpio; carpeta temporal eliminada tras medición. |
| `node --test server/tests/etapa01_isolation_qa.test.mjs` | **`7/7` PASS**, `0` fail, `0` skipped (`14.75 s`, `exit 0`) | Validó: (1) rama `develop/almacen-v2.1` y cambios preservados; (2) bloqueo negativo de `*.clever-cloud.com`, IP remota, `DB_HOST=""`, `gridops_enterprise` y CLI exit `1`; (3A) carga completa de 29 artículos sintéticos, 6 campamentos, 4 almacenes, 7 usuarios, 5 auditorías y 4 levantamientos en MariaDB `127.0.0.1:3310`; (3B) parseo MySQL 8 JSON a objeto JS `{activo}` y Array `permisos_json`; (4) arranque HTTP real de `server/index.js` (`PORT 5099`: `GET /health -> 200`, `GET /api/articulos -> 404`, `GET /api/v2/articulos` sin token -> `401`, con JWT developer sintético -> `200` con 25 ítems reales, `GET / -> 200` HTML); (5) apagado limpio sin puertos abiertos ni procesos huérfanos en `3310`/`5099`. |

## 5. Hallazgos
- **Resuelto en Etapa 1:** Parcialmente **`A04`** (`guard.js` ahora integrado activamente en `db.js` cuando corre en entorno de pruebas/bloqueo remoto) y **`B06`** (base de suite automatizada `node:test` + fixtures sintéticos creada).
- **Reproducido en fixture local (pendiente de corrección en etapas asignadas):** **`C01`** (shim confirma retorno objeto JS en `inv_auditoria`), **`C02`** (6 brechas DDL vs API documentadas en fixture), **`C03`** (`id=1 27Feb / id=3 OPL / id=4 M633`), **`C07`** (`permisos_json` Array JS), **`B01`** (`152` incidencias ESLint).
- **Limitaciones técnicas detectadas por QA:**
  1. En ESM Windows, `db.js` ejecuta `dotenv.config()` al cargar módulo; las pruebas deben fijar `process.env` antes de importar dinámicamente `db.js` si desean aislar configuraciones.
  2. La base portátil corre sobre **MariaDB `10.11.10`** (equivalente compatible) combinada con `mysql8_json_shim.mjs` para emular el comportamiento JSON nativo de MySQL 8.0.
  3. El puerto `3309` estaba ocupado por el proyecto paralelo `ingmelec-asistencia` (`datadir` separado); se asignó limpiamente **`127.0.0.1:3310`** para v2.1 sin interferencia.

## 6. Datos
- Base de datos de prueba creada y verificada en `127.0.0.1:3310`: `ingmelec_v21_test_isolated` (datadir nuevo `scratch/local-mysql-v21/data`).
- `C:/Users/gener/.gemini/antigravity/scratch/local-mysql/data` (base local histórica preexistente) y `127.0.0.1:3309` (`ingmelec-asistencia`) comprobados intactos tras el cierre.
- Cero conexiones y cero escrituras contra Clever Cloud.

## 7. Git
- **Rama actual:** `develop/almacen-v2.1` (creada desde `feature/almacen-general-v2` @ `683fb95`).
- **Cambios en working tree:** `M .gitignore`, `M server/scripts/recovery-developer.js`, `M server/database/db.js`, `M server/database/guard.js`, `?? docs/auditorias/`, `?? docs/actualizaciones/`.
- **Push / Merge a `main`:** **0** (prohibido).

## 8. Publicación
- Render: **0 despliegues** (entorno remoto sin tocar).
- Clever Cloud: **0 modificaciones / 0 migraciones**.

## 9. Siguiente paso
Avanzar a la **ETAPA 2 — Autenticación, autorización y seguridad** (`C05`, `C06`, `A01`, `A02`, `A03`, `A04` TLS/`multipleStatements`, `A05`, `A11`, `M05`, `B02`).
