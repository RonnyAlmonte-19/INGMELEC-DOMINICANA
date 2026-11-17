# v2.2 — Devolución vinculada al acta: FUNCIONALIDAD PENDIENTE

**Estado: NO IMPLEMENTADA.** No debe presentarse como disponible ni como aprobada.

## Qué existe hoy
- Las actas confirmadas descuentan stock con una SALIDA por artículo (`inv_acta_items.movimiento_id`, `inv_movimientos.acta_id`).
- La anulación de un acta **no repone stock** (decisión del propietario).
- La DEVOLUCION de movimientos existente (v2.1.1) funciona como antes y **no está vinculada** a ningún acta.
- Las tablas de la migración 07 no contienen columnas para registrar devoluciones por acta.

## Qué falta (cuando se autorice desarrollarlo)
1. Decidir reglas: devolución parcial o total, por ítem, estado de la herramienta, quién puede registrarla (permiso nuevo o existente).
2. Modelo de datos: vínculo entre el movimiento de DEVOLUCION y el acta/ítem (migración 08 aditiva) y cantidad pendiente por devolver.
3. API y validaciones: no devolver más de lo entregado, idempotencia, auditoría, aislamiento por campamento.
4. Interfaz: botón en el detalle del acta, estado del acta (entregada, devuelta parcial, devuelta), impresión.
5. Pruebas: el `test.todo` de `v22_actas_migration.test.mjs` pasa a prueba real, más pruebas HTTP y E2E.

## Efecto en la publicación
No bloquea publicar v2.2 con `ACTAS_ENABLED=false`. Si se activan las actas sin esta función, las devoluciones se registran como hoy (movimiento DEVOLUCION manual), sin vínculo al acta; debe comunicarse a los usuarios.
