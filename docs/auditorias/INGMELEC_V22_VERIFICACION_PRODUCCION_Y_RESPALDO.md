# INGMELEC v2.2 — Verificación de Clever Cloud, zona horaria y respaldo

## 1. Hechos confirmados por el propietario (phpMyAdmin, solo lectura)
- MySQL/Percona **8.0.22-13**. Zona horaria de sesión `SYSTEM`, con hora igual a UTC → **la base trabaja en UTC**.
- `sql_mode` = `STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION` (**sin** `ONLY_FULL_GROUP_BY`, más permisivo que el MySQL 8 local de las pruebas).
- `inv_articulos` ≈ 434, `inv_movimientos` ≈ 41; **15 tablas `inv_*`**; no existen las 3 tablas de actas.

## 2. Qué dice la estructura histórica (volcado del 12-nov, solo estructura)
El volcado tenía **13** tablas `inv_*`. Hoy hay **15**: dos tablas aparecieron después. Una candidata es `inv_campamento_alias` (migración 04); la otra no la crea ninguna migración 03–07 del repositorio y se identifica con la consulta 2.

Migración | Qué deja en el esquema | Estado histórico (12-nov) | Estado si está aplicada
---|---|---|---
01/02 | ya aplicadas (tablas base, `area`, `cantidad_num`, etc.) | presentes | presentes
03 | columnas nuevas y ampliación de 5 tipos | 5/10 columnas, con tipos antiguos | 10/10 y tipos ampliados (ver 3)
04 | tabla `inv_campamento_alias` + 3 índices + 1 FK | 0/5 | 5/5
05 | **no deja huella** (solo valida usuarios/permisos) | no detectable | no detectable
06 | 4 índices + 19 claves foráneas | 0/23 | 21/23 (normal, ver 3)
07 | 3 tablas + `inv_movimientos.acta_id` + índice + FK | 0/6 | 6/6

## 3. Interpretación de la consulta 1 (columna `presente`, 1 = existe)
No basta que exista un objeto: la 03 también **modifica tipos** de columnas que ya existían. Mire `detalle`:
| Columna | Sin 03 | Con 03 aplicada |
|---|---|---|
| `inv_articulos.area` | `enum('INFORMATICA','OFICINAS','COCINA','ALMACEN')` | agrega `'OTRA'` |
| `inv_articulos.cantidad_num` | `decimal(10,2)` | `decimal(12,2)` |
| `inv_articulos.estado_vinculacion_sede` | termina en `'SIN_SEDE'` | agrega `'SIN_VINCULAR'` |
| `inv_campamentos.clasificacion_sede` | sin `'PENDIENTE_VALIDACION'` | con `'PENDIENTE_VALIDACION'` |
| `inv_levantamientos.estado` | sin `'Cancelado'` | con `'Cancelado'` |
| `inv_usuarios.token_version`, `inv_custodios.departamento/telefono`, `inv_almacenes.estado_verificacion/origen_registro` | `presente=0` | `presente=1` |

Casos:
- **Resultado como el histórico (03: 5/10, 04: 0/5, 06: 0/23, 07: 0/6):** ninguna migración v2.1 aplicada; la v2.1.1 pública funciona con alternativas en el código (por ejemplo, sin `token_version`).
- **Mezcla (algunos 1 y otros 0 dentro de una misma migración):** aplicada a medias. No ejecutar nada; consultarlo antes.
- **Todo presente:** ya aplicadas; solo falta la 07.
- **Dos FK de la 06 en 0 es normal** (`fk_lev_campamento`, `fk_item_levantamiento`): la estructura base ya las tiene con nombres automáticos (`inv_levantamientos_ibfk_1`, `inv_levantamiento_items_ibfk_1`) y la 06 no las duplica. Con 06 aplicada se espera 21/23.
- **Compatibilidad 07 (`07-compat`):** los 5 `id` deben decir `int` (con signo). Verificado igual en el volcado histórico.
- **Consulta 2:** nombres de las 15 tablas `inv_*`; todas deben ser `InnoDB` y `utf8mb4_unicode_ci`.
- **Consulta 3 (solo si la 06 no está aplicada):** huérfanos; todo debe ser 0, o la 06 fallaría al crear claves foráneas.

**Dependencia nueva a tener en cuenta:** el catálogo de departamentos de las actas lee `inv_custodios.departamento` (columna de la 03). Con actas activadas, **la 03 es requisito**; con `ACTAS_ENABLED=false` no hace falta.

## 4. Zona horaria de Render (según los resultados)
La base está en UTC y guarda `DATETIME DEFAULT CURRENT_TIMESTAMP` en UTC. Variables recomendadas:
```
APP_TIMEZONE_OFFSET=-04:00   # día del usuario: Santo Domingo
DB_TIME_OFFSET=+00:00        # la base guarda UTC
```
Sin `DB_TIME_OFFSET=+00:00` los filtros por día se correrían 4 h (un movimiento de las 20:30 locales, que está en la base como 00:30 del día siguiente, caería en el día equivocado). Comprobación posterior: filtrar un día con movimientos conocidos y comparar con la bitácora. Prueba de cordura de solo lectura:
`SELECT id, fecha_movimiento FROM inv_movimientos ORDER BY id DESC LIMIT 3;` → la hora almacenada debe ser 4 h mayor que la hora local real del registro.
Los campos de solo fecha (levantamientos) no se desplazan.

## 5. Procedimiento de respaldo completo (antes de cualquier migración)
1. **Congelar escrituras:** avisar a los usuarios y poner `MAINTENANCE_MODE=true` en Render (las escrituras dan 503) antes del respaldo, para que respaldo y migración vean los mismos datos.
2. **Respaldo A (principal), `mysqldump` desde una terminal propia** (sin pegar la contraseña en el chat ni en archivos):
   ```
   mysqldump --single-transaction --routines --triggers --events --hex-blob --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 -h <host> -P <puerto> -u <usuario> -p <base> > INGMELEC_PRODUCCION_AAAA-MM-DD_HH-MM.sql
   ```
   (en Windows PowerShell use `--result-file=` en lugar de `>` para conservar UTF-8).
3. **Respaldo B (alternativo), phpMyAdmin:** base → Exportar → método **Personalizado** → todas las tablas → formato SQL → estructura y datos, incluir `CREATE TABLE`, procedimientos/eventos, codificación utf8mb4; guardar sin comprimir o en ZIP.
4. **Verificar el archivo:** última línea `-- Dump completed`; contiene `CREATE TABLE` de todas las tablas (29 si hay 15 `inv_*` y las 14 del sistema anterior; el volcado del 12-nov tenía 27; contrastar con el recuento real de la consulta de tablas); tamaño razonable (≈400 KB al 12-nov); anotar **SHA-256**.
5. **Probar la restauración** en una MySQL 8.0.22 local aislada (ya disponible portable en `scratch\oracle-mysql-8`): restaurar en una base nueva y comparar recuentos de artículos, movimientos, usuarios, campamentos, almacenes y auditoría con los de producción.
6. **Copias:** guardar en dos lugares distintos (disco externo y otra ubicación), fuera del repositorio. Los respaldos contienen datos reales: no subirlos a GitHub ni compartirlos.
7. Revisar además la copia automática del propio plan de Clever Cloud (fecha de la última) como respaldo adicional, nunca como único.

**Recuperación:** restaurar el volcado en una base **nueva**, comparar, y solo entonces decidir si se apunta `DB_NAME` a ella. No sobrescribir la base original sin comprobar.

## 6. Siguiente paso seguro
Ejecutar las consultas 1 y 2 (y la 3 solo si la 06 no aparece aplicada) y compartir el resultado. Con eso se decide qué migraciones faltan y en qué orden. No se ejecuta ninguna migración ni respaldo sin autorización.
