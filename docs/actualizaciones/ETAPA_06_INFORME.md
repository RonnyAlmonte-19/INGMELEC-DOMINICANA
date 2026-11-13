# INFORME DE CIERRE — ETAPA 6: INVENTARIO, MOVIMIENTOS Y LEVANTAMIENTOS

**Proyecto:** INGMELEC | ALMACÉN GENERAL v2.1  
**Rama:** `develop/almacen-v2.1`  
**Entorno de Ejecución:** Exclusivamente local (`127.0.0.1:3310`, base `ingmelec_v21_test_isolated`). Cero modificaciones a GitHub, Render o Clever Cloud.  
**Estado:** **APROBADA LOCALMENTE**

---

## 1. Alcance y Hallazgos Atendidos
- **C04:** Consolidación atómica `TODO O NADA` de levantamientos (`POST /api/v2/levantamientos/:id/consolidar`), detección de colisiones y duplicados intra-lote, conciliación físico vs teórico solo lectura y propagación de `es_sintetico`.
- **A06:** Transacciones `SELECT ... FOR UPDATE` en movimientos (`inv_movimientos`), bloqueo `HTTP 409` en stock pendiente/`NULL`, validación de `TRASLADO` con destino obligatorio y actualización territorial, y propagación `es_sintetico`.
- **A10:** Integridad referencial mediante `server/database/migrations/migration_06_v21_integridad_fk_indices.sql` (idempotente x2), incorporando llaves foráneas y cambiando `fk_mov_articulo` a `ON DELETE RESTRICT` (rechazo `ER_ROW_IS_REFERENCED_2` verificado).
- **M02:** Normalización insensible a mayúsculas/minúsculas (`Bueno`/`BUENO`) en importaciones y levantamientos (`LevantamientoWorkspace.jsx`), lectura estricta de `ArrayBuffer` y modal de conciliación físico vs teórico.
- **M06:** Endurecimiento de `server/database/migrations/rollback_clever_cloud_produccion.sql` eliminando `id <= 434`, `WHERE id IN (1, 3, 4)` y `permisos_json = NULL`, sustituidos por resolución por código estable y guardas de seguridad (`SIGNAL SQLSTATE '45000'`).
- **M07:** Generación concurrente segura de códigos (`generateNextCodeForArea(..., { forUpdate })`), unicidad de seriales no-placeholder (`HTTP 409`) y registro exacto de cantidad `0` en `inv_movimientos`.
- **B06 (BD):** Creación de índices compuestos (`idx_art_filtro_compuesto`, `idx_mov_sint_fecha`) y eliminación de `7` índices redundantes en `migration_06`.

---

## 2. Evidencia de Pruebas Ejecutadas
- **Suite ejecutada:** `node --test server/tests/etapa06_inventory_consolidate_qa.test.mjs`
- **Resultado:** **4 / 4 PASS (`100%`)** en re-ejecución de regresión (`task-6367`, `8.35s`):
  1. **BD (`A10`, `B06`, `M06`):** `migration_06` idempotente x2, `ON DELETE RESTRICT`, FKs, índices y rollback seguro — **PASS**
  2. **API Transaccional (`A06`, `M07`):** stock `NULL`/`0`, bloqueo `SALIDA`/`TRASLADO`, concurrencia `FOR UPDATE` (`Promise.all` `3/3`) y seriales — **PASS**
  3. **Levantamientos (`C04`, `M02`):** importación estricta, consolidación ACID con duplicados y conciliación físico vs teórico — **PASS**
  4. **Frontend React (`ETAPA 6`):** `LevantamientoWorkspace` (case-insensitive, Excel, Conciliación) e `ItemDetailModal` (`inv:eliminar`) — **PASS**
- **Regresión acumulada Etapas 1–6:** **44 / 44 PASS (`0 fail`)**.
