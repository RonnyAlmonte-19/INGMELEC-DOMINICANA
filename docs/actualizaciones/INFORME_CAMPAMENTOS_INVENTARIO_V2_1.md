# INFORME DE CAMPAMENTOS E INVENTARIO — INGMELEC | ALMACÉN GENERAL v2.1

**Rama:** `develop/almacen-v2.1`  
**Evaluación:** Equipo B (BD, Campamentos e Inventario) + Equipo D

---

## 1. Normalización de Sedes y Alias Canónicos (`migration_04`)
Los tres campamentos confirmados mantienen identificadores independientes y códigos estables (`ALM-27FEB`, `CAMP-OPL`, `CAMP-M633`), sin depender de IDs fijos (`1/3/4` vs `3/12/13`):

| Sede Oficial | Código Estable | Alias Verificados en Pruebas |
| :--- | :---: | :--- |
| **CAMPAMENTO OPL** | `CAMP-OPL` | `OPL`, `KM19`, `KM 19`, `KM 19 AUT DUARTE`, `KM 19 AUTOPISTA DUARTE`, `KM 19 AUTOPISTA DUARTE OPL` |
| **CAMPAMENTO MANTENIMIENTO 633** | `CAMP-M633` | `MANTENIMIENTO`, `MANTENIMIENTO 633`, `MANTENIMIENTO M633` |
| **ALMACÉN 27 DE FEBRERO** | `ALM-27FEB` | `ALMACÉN 27 DE FEBRERO`, `DISTRITO NACIONAL 27 DE FEBRERO`, `ALM-27FEB`, `DN-27FEB` *(Nota: cadena corta `'27 DE FEBRERO'` sin sembrar)* |

---

## 2. Garantías Verificadas
1. **Cero mezcla territorial:** Ningún artículo de `ALMACÉN 27 DE FEBRERO` se asigna a `OPL` o `MANTENIMIENTO 633`.
2. **Artículos pendientes (`SIN_SEDE` / `cantidad_num = NULL`):** Preservados intactos sin inventar ceros ni unos.
3. **Vista previa sin mutación y confirmación explícita:** `POST /campamentos/reasignaciones/preview` no altera `inv_articulos`; `POST /campamentos/reasignaciones/aplicar` exige confirmación explícita y nunca fusiona artículos automáticamente.
4. **Consistencia transversal:** `GET /dashboard/kpis`, `GET /articulos` y `GET /reportes/exportar` devuelven exactamente los mismos totales y conteos `sinSerial`, excluyendo por defecto registros sintéticos (`es_sintetico = 0`).
5. **Transaccionalidad e integridad:** Movimientos, generación concurrente de códigos y consolidación de levantamientos operan bajo transacciones `FOR UPDATE` y llaves foráneas `ON DELETE RESTRICT` (`migration_06`).
