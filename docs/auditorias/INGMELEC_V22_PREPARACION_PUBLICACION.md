# INGMELEC v2.2 — Preparación de publicación (local, 17-nov-2026)

Rama: `feature/v2.2-actas`. Nada de esto se ha publicado ni commiteado. Sin acceso a Clever Cloud ni Render.

## 1. Protección del trabajo de v2.2

### 1.1 Inventario (43 entradas de `git status`)
| Grupo | Archivos | Acción prevista |
|---|---|---|
| Backend modificado | `server/index.js`, `server/routes/almacenApi.js`, `server/.env.example` | commit |
| Backend nuevo | `server/routes/actasApi.js`, `server/services/` (dateRange, actas/*), `server/config/features.js` | commit |
| Migraciones | `migration_07_v22_actas_entrega.sql`, `rollback_07_v22_actas_entrega.sql` | commit |
| Migraciones `.disabled` (05/06 obsoletas) | 2 archivos `deprecated_*.sql.disabled` | commit (documentan lo prohibido; ya referenciados en README_MIGRACIONES) |
| Frontend modificado | `InventoryTable`, `ItemDetailModal`, `AppContext`, `AuditoriaPage`, `LevantamientosPage`, `MovimientosPage`, `ReportesPage`, `UbicacionesPage`, `permissions.js` | commit |
| Frontend nuevo | `src/components/actas/`, `AgotadoBadge.jsx`, `DateRangeFilter.jsx`, `src/utils/stock.js` | commit |
| Pruebas | `v22_*.test.mjs` (8), `helpers/backup-local-db.mjs`; modificadas: etapa01, etapa08 (security_db y browser_e2e) | commit |
| Documentación | `docs/auditorias/*` (6 + este), `docs/equipo/`, `CLAUDE.md`, `.claude/agents/*.md` | commit (revisar `.claude/` antes: sin credenciales, 15 agentes) |

### 1.2 Archivos ignorados necesarios para reproducir las pruebas
`.gitignore` excluye `server/scripts/*`, por lo que **no estaban respaldados**:
- `server/scripts/dev-local-v22.mjs` (lanzador local con siembra sintética)
- `server/scripts/e2e-actas-ui.mjs`, `e2e-fechas-ui.mjs`, `e2e-cantidades-ui.mjs`, `e2e-filtros-ui.mjs`

Se revisó que no contienen contraseñas ni claves. Se agregaron excepciones (5 scripts) en `.gitignore` y en `server/.gitignore` para poder versionarlos.
Siguen ignorados a propósito: `server/.env.dev-credenciales`, `server/.env*`, `*.bak`, `dist/`, `node_modules/`, `scratch/`, `server/scripts/*` restantes (scripts de recuperación/generación de hashes de desarrollador).

### 1.3 Plan de commit local (NO ejecutado; requiere autorización)
Commits pequeños, en `feature/v2.2-actas`, sin push:
1. `feat(v2.2): migracion 07 actas de entrega + rollback local`
2. `feat(v2.2): servicio y API de actas (flag ACTAS_ENABLED)`
3. `feat(v2.2): filtros de calendario y filtros de inventario con contadores`
4. `feat(v2.2): interfaz de actas, AGOTADO y calendario`
5. `test(v2.2): suites v22 y ajustes de arnes Etapa 1/8`
6. `chore(v2.2): scripts locales (lanzador y E2E) y documentacion`

Antes de cada commit: `git diff --cached --stat` y búsqueda de secretos. No usar `git add -A` sin revisar.

### 1.4 Respaldo
Copia del código (sin secretos, sin bases, sin `node_modules`/`dist`) fuera de OneDrive y fuera del repo:
`C:\Users\gener\INGMELEC-RESPALDOS\` (zip + parche de los archivos modificados). Ver informe de entrega para nombre y suma SHA-256.

## 2. Ensayo de la migración 07 (hecho, local)
Origen: `INGMELEC_PRODUCCION_2026-11-12_13-31-26.sql` (volcado real de Clever Cloud, MySQL 8.0.22; esquema = migraciones 01+02, sin 03–06). El archivo original **no se modificó**; se cargó en una instancia MariaDB 10.11 nueva (puerto 3311, directorio de datos propio, `127.0.0.1`), en bases con prefijo `ensayo_`.

| Comprobación | Resultado |
|---|---|
| Tipos de las claves referenciadas (`inv_campamentos/custodios/usuarios/articulos/movimientos.id`) | `int NOT NULL` con signo: **coinciden** con las columnas nuevas |
| Collation de las tablas | `utf8mb4_unicode_ci` en producción y en las tablas nuevas: **coinciden** |
| Motor | InnoDB en ambas |
| Escenario A: esquema de producción hoy + 07 | OK; 3 tablas, 10 claves foráneas, `acta_id` NULL |
| Idempotencia (07 dos veces) | OK, sin error |
| Escenario B: 03→04→05→06→07 | OK |
| Datos históricos (27 tablas, recuento + CRC por columnas originales) | **sin cambios** tras 07 |
| Rollback ×2 y re-aplicar 07 (solo en la copia desechable) | OK |
| Nombres: producción ya tiene tablas legadas `actas` y `acta_items` | **sin colisión** (la v2.2 usa `inv_actas_entrega`, `inv_acta_items`) |

**No verificado:** MySQL 8.0.22 real (no hay servidor MySQL 8 local; solo el cliente). Diferencias conocidas de riesgo bajo (`ALTER` con FK, DDL no transaccional). Ensayar también en una instancia MySQL 8 antes de publicar, si es posible (p. ej. un contenedor o MySQL Community local).

### 2.1 Procedimiento para repetirlo
1. Iniciar instancia aislada (otro puerto y datadir) y crear base `ensayo_*`.
2. Cargar el volcado (solo lectura sobre el archivo).
3. `node ensayo.mjs A|B|R` (script en el espacio de trabajo de la sesión) o aplicar a mano `migration_07…sql` dos veces.
4. Comparar recuentos/huellas de las tablas originales y revisar `information_schema` (tipos, FKs, collations).
5. Apagar la instancia y borrar el directorio de datos de ensayo (contiene datos reales).

## 3. Verificación de zona horaria de producción (solo lectura, pendiente de autorización)
Hechos del código/esquema: `fecha_movimiento` y `inv_auditoria.fecha` son `DATETIME DEFAULT CURRENT_TIMESTAMP` (los fija la sesión del servidor MySQL); el pool de Node no define `timezone`. Con datos no se puede deducir la zona (última auditoría 12:07 y último movimiento 20:22 son plausibles en UTC o en hora local).

Ejecutar, **solo si el propietario lo autoriza**, en la consola SQL de Clever Cloud o con un cliente (consulta de lectura, sin cambios):
```sql
SELECT @@global.time_zone AS global_tz, @@session.time_zone AS sesion_tz,
       @@system_time_zone AS sistema_tz, NOW() AS ahora, UTC_TIMESTAMP() AS utc,
       TIMEDIFF(NOW(), UTC_TIMESTAMP()) AS desfase;
```
| `desfase` | Acción en Render (variables de entorno) |
|---|---|
| `00:00:00` (UTC) | `APP_TIMEZONE_OFFSET=-04:00` y `DB_TIME_OFFSET=+00:00` |
| `-04:00:00` | `APP_TIMEZONE_OFFSET=-04:00` (sin `DB_TIME_OFFSET`) |
| otro | `DB_TIME_OFFSET=<desfase>` y consultar antes de publicar |

Comprobación posterior (lectura): filtrar un día con movimientos conocidos y confirmar que coincide con la bitácora. Sin variables, se asume que la base guarda hora local: si guarda UTC, los filtros por día se desplazan 4 h (los registros entre 20:00 y 23:59 hora local caerían en el día siguiente).

## 4. Dependencias: 10 alertas `npm audit` (alcance real)
Todas provienen de **un solo aviso**: `picomatch` (ReDoS en extglobs repetidos, GHSA-fc5q-39xc-vjpf, rango ≤4.0.7). Entra por `tailwindcss@3.4.17` (chokidar, micromatch, fast-glob, sucrase/tinyglobby).
- Se usa solo al **compilar** CSS (patrones fijos de `tailwind.config.js`, sin entrada de usuarios). No aparece en `dist/` ni en el servidor (`server/` tiene 0 alertas).
- La versión más reciente publicada de picomatch (4.0.7) sigue en el rango vulnerable: no hay corrección disponible; `npm audit fix` solo ofrece cambios incompatibles con `--force`.
- **Decisión:** no actualizar nada; riesgo BAJO y no bloquea. Reevaluar cuando exista picomatch corregido.

## 5. Funcionalidad pendiente
Ver `V22_DEVOLUCION_VINCULADA_PENDIENTE.md`.
