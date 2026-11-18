# INGMELEC v2.2 — Checklist definitiva de publicación (NO EJECUTADA)

Cada ✋ es un punto de aprobación del propietario. Si un control falla, **no se avanza**: se aplica la fila correspondiente de «Recuperación».
Referencias: `INGMELEC_V22_MANTENIMIENTO_Y_SECUENCIA_FINAL.md`, `INGMELEC_V22_PLAN_FINAL_PUBLICACION.md`, `produccion_solo_lectura/`.

## A. Antes de la ventana (sin tocar producción)
- [ ] Rama `feature/v2.2-actas`, árbol limpio; 7 commits sobre `d5d06fe`; `main` = `d5d06fe`; nada publicado.
- [ ] Copia del código actualizada fuera del repositorio (zip + SHA-256) que incluya el commit del ajuste de mantenimiento.
- [ ] Pruebas vigentes: regresión 98 pruebas (97 ✔, 0 ✘, 1 pendiente conocida: devolución vinculada), `v22_mantenimiento` 1/1, lint y build correctos. Repetir solo si cambia el código.
- [ ] Respaldo de referencia del 17-nov verificado y restaurado en MySQL 8.0.22 local (conteos = producción).
- [ ] Fecha/hora de baja actividad acordada; usuarios avisados (M-05). Nadie usará phpMyAdmin ni otros clientes durante la ventana (M-04).
- [ ] Anotado en Render el despliegue actual (v2.1.1, `d5d06fe`) como punto de retorno. `JWT_SECRET`, `DB_*`, `CORS_ORIGINS`, `TRUST_PROXY` no cambian.

## B. Modo mantenimiento (congelar escrituras) ✋
- [ ] **Iniciar sesión en la app pública antes** y dejar la sesión abierta (M-02: en mantenimiento no se puede iniciar ni cerrar sesión).
- [ ] Render — variables: `MAINTENANCE_MODE=true` (exactamente `true`; `1/yes/on` NO activan), `APP_TIMEZONE_OFFSET=-04:00`, `DB_TIME_OFFSET=+00:00`, `ACTAS_ENABLED=false`. Render redespliega v2.1.1.
- [ ] Comprobación (v2.1.1 no tiene el campo `maintenance`): `POST /api/v2/auth/login` con cuerpo `{}` → **503**. Si da 400/401: detener.
- [ ] La sesión abierta sigue leyendo (inventario carga).
- [ ] Esperar 2 min (solapamiento de instancias, M-03).

## C. Respaldo definitivo ✋
- [ ] Conteos exactos de producción (consulta de solo lectura de `INGMELEC_V22_PLAN_FINAL_PUBLICACION.md`), **dos lecturas separadas e idénticas**. Anotar valores (referencia 17-nov: 438 artículos, 49 movimientos, 8 usuarios, 5 campamentos, 5 almacenes, 17 alias, 140 auditoría, 51 custodios).
- [ ] Exportación completa (estructura + datos): sin errores, todas las tablas, `COMMIT`/`-- Dump completed` al final.
- [ ] SHA-256 anotado; copia fuera del repositorio y en un segundo disco. **Nunca en Git.**
- [ ] Restaurado en MySQL 8.0.22 local desechable: conteos = los de esta ventana.

## D. Migración 07 en producción ✋
- [ ] Ejecutar `server/database/migrations/migration_07_v22_actas_entrega.sql` completo (aditivo e idempotente). **No usar `rollback_07` en producción.**
- [ ] Sin errores 1215/3780/1064. Si se interrumpe: verificar qué existe y repetir el archivo completo.
- [ ] Verificación (`verificacion_migraciones_03_07.sql`, consulta 1): filas `07` con `presente=1` (3 tablas, columna `inv_movimientos.acta_id`, índice `idx_inv_mov_acta`, FK `fk_inv_mov_acta`).
- [ ] Conteos = los del apartado C; 0 filas en las tablas de actas.

## E. Publicar el código ✋
- [ ] Merge de `feature/v2.2-actas` a `main` y push (o Pull Request). Sin force push.
- [ ] Render construye y arranca v2.2 con `MAINTENANCE_MODE=true` y `ACTAS_ENABLED=false`.
- [ ] `GET /health` → 200 con **`"maintenance": true`**; registros de Render muestran `[MANTENIMIENTO] ACTIVO` y ningún error de arranque.

## F. Pruebas posteriores (solo lectura, sesión abierta) ✋
- [ ] Inventario: contadores, filtros, etiqueta AGOTADO; Informática, Oficinas, Cocina, Almacén.
- [ ] Levantamientos, Sedes, Movimientos, Reportes, Auditoría, Usuarios, Dashboard.
- [ ] Calendario: un día con movimientos conocidos coincide con la bitácora (zona horaria correcta).
- [ ] Actas no visibles (flag apagado); `/api/v2/actas/disponible` informa no disponible.
- [ ] Registros de Render sin 500 ni errores SQL.

## G. Reabrir ✋
- [ ] Render: `MAINTENANCE_MODE=false` (o eliminarla). `GET /health` → `"maintenance": false`; login con `{}` → 400/401.
- [ ] Cerrar la sesión abierta e iniciar una nueva.
- [ ] Una escritura acordada de bajo riesgo; revisar que aparece en la bitácora y en auditoría.

## H. Actas (ventana aparte, autorización adicional) ✋
- [ ] `ACTAS_ENABLED=true`; permisos `act:*` solo a quien se decida.
- [ ] Acta de prueba con un artículo de bajo valor: PDF correcto y descuento exacto de existencias.
- [ ] Devolución vinculada: **pendiente de desarrollo** (no anunciar).

## Recuperación
| Falla en | Acción |
|---|---|
| B (mantenimiento no activa) | No continuar; revisar valor exacto `true`; no tocar la base. |
| C (respaldo inválido) | Repetir exportación; no migrar sin respaldo verificado. |
| D (migración 07) | Verificar objetos y repetir el archivo; con actas apagadas el código no usa esas tablas. Si no se resuelve: restaurar el respaldo en una base **nueva** y cambiar `DB_NAME` tras comparar. |
| E–F (despliegue/verificación) | En Render, volver al despliegue `d5d06fe`; la base es compatible (objetos aditivos); el mantenimiento sigue activo. |
| G (tras reabrir) | `ACTAS_ENABLED=false`; si persiste, desplegar el anterior; restaurar datos solo con autorización. |
