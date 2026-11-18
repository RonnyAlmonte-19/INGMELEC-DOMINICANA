# INGMELEC v2.2 — Plan final de aplicación de la migración 07 y publicación (NO EJECUTADO)

Estado verificado: producción (Clever Cloud, MySQL/Percona 8.0.22-13, UTC, `STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION`) tiene las migraciones 03, 04 y 06 COMPLETAS; la 05 no deja huella; la 07 NO está aplicada. Respaldo del 17-nov-2026 restaurado y verificado en MySQL 8.0.22 local (ver `...\INGMELEC-RESPALDOS\produccion\`). Ninguna fase se ejecuta sin autorización explícita del propietario en cada paso.

## Qué falta antes de empezar
1. **Confirmar conteos exactos de producción** contra el respaldo (consulta de solo lectura, abajo). Los números informados antes eran aproximados; el respaldo trae 438 artículos, 49 movimientos, 140 auditorías.
2. **Respaldo final con escrituras congeladas** (fase 2): el del 17-nov se hizo con la aplicación abierta. Sirve como respaldo de referencia, no como el definitivo.
3. Variables de Render preparadas (fase 1).
4. Decidir cuándo se activan las actas (fase 8): no es parte de la publicación.

```sql
-- Conteos exactos (SOLO LECTURA)
SELECT 'inv_articulos' AS tabla, COUNT(*) AS filas FROM `bkwlgxt1ccjstm5cfoy5`.inv_articulos
UNION ALL SELECT 'inv_movimientos', COUNT(*) FROM `bkwlgxt1ccjstm5cfoy5`.inv_movimientos
UNION ALL SELECT 'inv_usuarios', COUNT(*) FROM `bkwlgxt1ccjstm5cfoy5`.inv_usuarios
UNION ALL SELECT 'inv_campamentos', COUNT(*) FROM `bkwlgxt1ccjstm5cfoy5`.inv_campamentos
UNION ALL SELECT 'inv_almacenes', COUNT(*) FROM `bkwlgxt1ccjstm5cfoy5`.inv_almacenes
UNION ALL SELECT 'inv_auditoria', COUNT(*) FROM `bkwlgxt1ccjstm5cfoy5`.inv_auditoria
UNION ALL SELECT 'inv_custodios', COUNT(*) FROM `bkwlgxt1ccjstm5cfoy5`.inv_custodios;
```

## Fase 1 — Preparación en Render (sin tocar código ni base)
Variables nuevas/revisadas (Environment):
```
APP_TIMEZONE_OFFSET=-04:00
DB_TIME_OFFSET=+00:00
ACTAS_ENABLED=false
MAINTENANCE_MODE=true      # solo desde la fase 2 hasta la fase 7
```
`JWT_SECRET`, `DB_*`, `CORS_ORIGINS`, `TRUST_PROXY` no cambian. Anotar el despliegue actual de Render (v2.1.1, commit `d5d06fe`) como punto de retorno.

## Fase 2 — Congelar escrituras y respaldo final
1. Avisar a los usuarios (ventana de 30–60 min).
2. `MAINTENANCE_MODE=true` en Render y reinicio. Comprobar: una lectura funciona; una escritura devuelve 503.
3. Exportar de nuevo desde phpMyAdmin (o `mysqldump --single-transaction`). Archivo nuevo con fecha y hora.
4. Verificar igual que el del 17-nov: sin errores de exportación, 28 tablas, `COMMIT` al final, SHA-256 anotado, copia fuera del repositorio y en un segundo disco.
5. (Recomendado) restaurar en MySQL 8.0.22 local desechable y comparar conteos.
6. Comparar los conteos de producción (consulta de arriba) con los del respaldo: deben coincidir exactamente.

## Fase 3 — Aplicar `migration_07` (producción, requiere autorización)
Archivo: `server/database/migrations/migration_07_v22_actas_entrega.sql` (commit `7b504c5`). Es aditiva e idempotente: 3 tablas nuevas, 1 columna `acta_id` (NULL) con índice y clave foránea en `inv_movimientos`. No modifica ni borra datos.
1. Con la base `bkwlgxt1ccjstm5cfoy5` seleccionada en phpMyAdmin (pestaña SQL), pegar el contenido completo y ejecutar. Alternativa con el mismo resultado probado: cliente `mysql` desde la terminal del propietario.
2. Si algo falla: no repetir a ciegas; ejecutar la consulta de verificación (fase 4) y revisar qué objetos existen. Como es idempotente, repetirla completa es seguro tras identificar el error.
3. Ensayada en MySQL 8.0.22 con el esquema de producción: sin errores, dos ejecuciones, datos históricos sin cambios.

## Fase 4 — Verificación de la migración (solo lectura)
Esperado: las 3 tablas de actas existen y están vacías; `inv_movimientos.acta_id` existe; `fk_inv_mov_acta` existe; conteos iguales a los de la fase 2. Consulta: la consulta 1 de `verificacion_migraciones_03_07.sql` (filas `07` deben dar `presente=1`) y los conteos exactos.

## Fase 5 — Publicar el código (requiere autorización explícita)
1. Confirmar rama `feature/v2.2-actas` limpia (6 commits locales sobre `d5d06fe`) y, si se desea, añadir los documentos pendientes en un commit propio.
2. Merge a `main` y push (el propietario decide si por `merge` local o Pull Request). Etiqueta opcional `v2.2.0`.
3. Render construye (`vite build`) y despliega. Esperar `GET /health` = 200 (arranque en frío posible).

## Fase 6 — Verificación posterior (con `MAINTENANCE_MODE=true` aún activo: solo lecturas)
Inicio de sesión; Inventario Maestro y sus áreas; contadores y filtros; calendario (un día con movimientos conocidos comparado con la bitácora); Reportes; Auditoría; Usuarios; Sedes; Levantamientos; revisar los registros de Render sin errores 500. Conteos iguales a los de la fase 2.

## Fase 7 — Reabrir
`MAINTENANCE_MODE=false` (o eliminar la variable) y reinicio. Probar una operación de escritura de bajo riesgo acordada con el propietario, y verificar la bitácora.

## Fase 8 — Activar las actas (ventana aparte, no obligatoria)
Prerrequisitos ya cumplidos: migración 03 (departamentos) y 07. Luego: `ACTAS_ENABLED=true`; otorgar `act:ver`, `act:crear`, `act:anular` solo a quien decida el propietario; crear un acta de prueba con un artículo de bajo valor, imprimir el PDF y comprobar el descuento exacto; anular no repone stock. Si hay cualquier problema: `ACTAS_ENABLED=false`.
Pendiente de producto: la devolución vinculada al acta no está implementada.

## Recuperación
| Situación | Acción |
|---|---|
| Falla el despliegue (build/arranque) | En Render, volver al despliegue anterior (`d5d06fe`). La base sigue siendo compatible (solo se agregaron objetos aditivos). |
| Falla o queda a medias la 07 | Idempotente: verificar y repetir. No ejecutar `rollback_07` en producción sin autorización expresa. |
| Error funcional tras publicar | `ACTAS_ENABLED=false`; si persiste, volver al despliegue anterior. |
| Datos dañados | Restaurar el respaldo en una base **nueva**, comparar, y solo después apuntar `DB_NAME`. No sobrescribir la base original. |

## Autorizaciones que se necesitan (una por una)
1. Consulta de conteos exactos (lectura).
2. Fase 2: mantenimiento y respaldo final.
3. Fase 3: ejecutar la migración 07 en producción.
4. Fase 5: merge a `main`, push y despliegue en Render.
5. Fase 8: activar actas y otorgar permisos.
