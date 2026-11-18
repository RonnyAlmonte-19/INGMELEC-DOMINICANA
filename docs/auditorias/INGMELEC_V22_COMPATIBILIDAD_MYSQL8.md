# INGMELEC v2.2 — Compatibilidad con MySQL 8.0 (ensayo local, 17-nov-2026)

**Veredicto: COMPATIBLE con MySQL 8.0.22** en las pruebas realizadas (migraciones y consultas), con los riesgos residuales indicados al final.

## Entorno
- MySQL Community Server **8.0.22** (Oracle), ZIP oficial `mysql-8.0.22-winx64.zip`, MD5 `a78e5da2bb87b51b6df06690977be199` (coincide con el publicado por Oracle), SHA-256 `faec240419fdd3c5b7fb450b5b59164396f1686cff7413a515008479ef4d4201`.
- Portátil, sin servicio de Windows, en `...\scratch\oracle-mysql-8\server-8.0.22\`, instancia `127.0.0.1:3312`, datos propios (ya eliminados).
- `sql_mode` por defecto de MySQL 8: `ONLY_FULL_GROUP_BY, STRICT_TRANS_TABLES, NO_ZERO_IN_DATE, NO_ZERO_DATE, ERROR_FOR_DIVISION_BY_ZERO, NO_ENGINE_SUBSTITUTION`. La API no lo modifica (`database/db.js` no fija `sql_mode`).
- Producción: 8.0.22-13 (variante Percona). Misma rama y versión base.

## Resultados
| Prueba | Resultado |
|---|---|
| Esquema de producción (copia del volcado 12-nov) + migración 07, dos veces | OK; 3 tablas, 10 claves foráneas, `acta_id` NULL |
| Cadena 03→04→05→06→07 + 07 repetida sobre la copia | OK, sin errores |
| Rollback ×2 + re-aplicar 07 (solo copia desechable) | OK |
| Datos históricos (27 tablas: recuentos y huellas por columnas originales; incluye artículos, usuarios, permisos, movimientos) | Sin cambios tras 07 |
| Tipos/collation/motor | `int` con signo y `utf8mb4_unicode_ci` InnoDB en producción y en las tablas nuevas: coinciden |
| API real sobre base sintética en MySQL 8 (modo estricto + `ONLY_FULL_GROUP_BY`) | 39 OK, 0 FAIL: inventario con facetas y filtros, calendario en 5 módulos, reportes, auditoría, usuarios, campamentos, catálogos, levantamientos, ciclo de acta (crear, idempotencia, descuento exacto, imprimir, anular sin reposición) |
| Consultas de lectura sobre la copia con datos de forma real (434 artículos, 41 movimientos, 113 auditorías) | 32 OK, 0 FAIL |
| Errores `ER_*`/1055 en el log del servidor | 0 |

## Riesgos residuales
1. Clever Cloud usa una variante Percona de 8.0.22 y otros ajustes (zona horaria, `max_connections`=5, SSL); no verificables sin conexión (la consulta de solo lectura está en el plan).
2. Volumen: la copia es de 434 artículos; los tiempos con más datos no se midieron.
3. Estado real de las migraciones 03–06 en producción por confirmar (consulta de solo lectura preparada).
4. Escrituras de actas probadas solo en base sintética, no sobre datos reales (a propósito).
5. Zona horaria de producción pendiente.

Scripts del ensayo: `C:\Users\gener\INGMELEC-RESPALDOS\ensayo-mig07\` (`ensayo8.mjs`, `mysql8_app.mjs`, `mysql8_real.mjs`).
