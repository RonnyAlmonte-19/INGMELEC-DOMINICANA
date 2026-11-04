# INFORME DE DEPURACIÓN INTEGRAL DE DATOS, CAMPAMENTOS Y ESTADÍSTICAS

**PROYECTO:** INGMELEC | ALMACÉN GENERAL
**FECHA DE AUDITORÍA Y DEPURACIÓN:** 4 de noviembre de 2026
**ENTORNO DE EJECUCIÓN:** Desarrollo Local y MariaDB Aislado (`127.0.0.1:3308` / `ingmelec_test_isolated`)
**ESTADO DE PRODUCCIÓN (CLEVER CLOUD):** Intacto (`0` escrituras, `0` migraciones ejecutadas en producción)
**RESPALDO PREVIO GENERADO:** `server/backups/backup_mariadb_3308_pre_depuracion_20261104.json`

---

## 1. RESUMEN EJECUTIVO

Se ejecutó una auditoría forense y depuración estructural completa del inventario, sedes y estadísticas de **INGMELEC | ALMACÉN GENERAL** para eliminar la contaminación visual de registros sintéticos de desarrollo y conciliar matemáticamente el sistema con el levantamiento documental oficial del 16 de octubre de 2026 (`Ingmelec_Levantamiento_Sencillo_2026-10-16 (1)(1).xlsx`).

### Logros Principales Verificados
1. **Aislamiento Estructurado de Datos Sintéticos (Sin Borrados Destructivos):** Se incorporaron columnas formales (`es_sintetico TINYINT(1)`, `origen_datos`, `clasificacion_sede`, `estado_vinculacion_sede`) en todas las tablas operativas (`inv_campamentos`, `inv_almacenes`, `inv_articulos`, `inv_levantamientos`, `inv_levantamiento_items`, `inv_movimientos`, `inv_custodios`, `inv_categorias`). Los **18 artículos sintéticos** (`COC-001`, `COC-002`, `HERR-REAL-001`..`SEG-REAL-005`, `Multímetro Fluke E2E`) y los **2 campamentos sintéticos** (`IDs 1 y 2`) quedaron marcados con `es_sintetico = 1` y excluidos por defecto de todas las estadísticas empresariales, sin eliminar ningún registro histórico ni de prueba.
2. **Carga Íntegra de los 433 Artículos Documentales del Excel:** Se importaron en el entorno local (`MariaDB :3308`) los **433 registros reales con bienes** del archivo `Ingmelec_Levantamiento_Sencillo_2026-10-16 (1)(1).xlsx`, preservando intactos sus códigos históricos originales (incluyendo códigos duplicados históricos como `INF-052`, `OFI-015`, `OFI-025`, `OFI-036`), sus custodios originales y sus **23 cantidades pendientes de verificación física** (`cantidad_num = NULL`, sin inventar `0` ni `1`).
3. **Estructura Independiente de los 3 Campamentos Confirmados:** Se consolidó la separación estricta de las tres sedes operativas confirmadas por la gerencia:
   - **`ALMACÉN 27 DE FEBRERO`** (`ID 3`, código `ALM-27FEB`): **84 artículos** | **416 unidades físicas conocidas** | **2 cantidades pendientes**.
   - **`OPL`** (`ID 12`, código `CAMP-OPL`, ubicado en `KM 19 AUTOPISTA DUARTE`): **136 artículos** | **762 unidades físicas conocidas** | **0 cantidades pendientes**.
   - **`MANTENIMIENTO 633`** (`ID 13`, código `MANT-633`): **109 artículos** (`90 base + 19 adenda`) | **685 unidades físicas conocidas** | **0 cantidades pendientes**.
4. **Tratamiento Transparente de `KM 19 AUT DUARTE` (104 Artículos Ambiguos):** Los **104 artículos** (`61 INFORMATICA + 43 OFICINAS`) cuya ubicación histórica en el Excel es únicamente `KM 19 AUT DUARTE` no fueron asignados arbitrariamente ni a `OPL` ni a `MANTENIMIENTO 633`. Se mantienen con `campamento_id = NULL`, `estado_vinculacion_sede = 'SEDE_AMBIGUA'` y se visualizan explícitamente bajo la categoría **`SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)`** hasta decisión humana.
5. **Consistencia Matemática Total (`100 %` Cuadrado en SQL, API y UI):**
   - **Artículos Maestros:** `84 (27 de Febrero) + 136 (OPL) + 109 (Mantenimiento 633) = 329 confirmados` + `104 sin sede verificada` = **`433 artículos empresariales`**.
   - **Unidades Físicas Conocidas:** `416 + 762 + 685 = 1,863 en sedes confirmadas` + `108 sin sede verificada` = **`1,971 unidades físicas conocidas`**.
   - **Cantidades Pendientes (`NULL`):** `2 (en 27 de Febrero: INF-001 y HER-220) + 21 (en KM 19 AUT DUARTE: INF-065 a INF-085)` = **`23 artículos pendientes de conteo físico`**.

---

## 2. FUENTES DE DATOS IDENTIFICADAS

| # | Fuente de Datos | Ubicación / Identificador | Naturaleza de los Datos | Cantidad de Registros | Uso en el Sistema |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Excel Oficial del Levantamiento (16-Oct-2026)** | `Ingmelec_Levantamiento_Sencillo_2026-10-16 (1)(1).xlsx` | **Datos Empresariales Reales (Referencia Documental Primaria)** | **433 artículos con bienes** (`84 INF`, `69 OFI`, `0 COC`, `280 ALM`) y **1,971 unidades físicas** | Fuente de verdad documental para conciliación e inventario maestro. |
| **2** | **MySQL Clever Cloud (Producción)** | `b9x9...clever-cloud.com:3306` (`b9x9...`) | **Datos Empresariales Reales + 1 registro sintético (`COC-001`)** | **434 artículos** (`433` del Excel + `1` sintético `COC-001`), **5 campamentos** (`IDs 3, 4, 5, 6, 7`) | Entorno productivo en solo lectura (no modificado ni intervenido). |
| **3** | **MariaDB Local Aislado (`:3308` — `es_sintetico = 0`)** | `127.0.0.1:3308` (`ingmelec_test_isolated`) | **Datos Empresariales Reales Conciliados con el Excel** | **433 artículos**, **1,971 unidades físicas**, **3 campamentos confirmados**, **3 pendientes de validación** | Base de datos activa del entorno local para operación empresarial y pruebas de aceptación. |
| **4** | **MariaDB Local Aislado (`:3308` — `es_sintetico = 1`)** | `127.0.0.1:3308` (`ingmelec_test_isolated`) | **Datos Sintéticos de Prueba Aislados (Desarrollo / Playwright)** | **18 artículos sintéticos**, **2 campamentos sintéticos (`IDs 1, 2`)**, **4 almacenes sintéticos**, **2 levantamientos sintéticos** | Aislados mediante `es_sintetico = 1`; ocultos por defecto en estadísticas empresariales. |
| **5** | **Respaldo Pre-Depuración MariaDB `:3308`** | `server/backups/backup_mariadb_3308_pre_depuracion_20261104.json` | **Snapshot Completo Previo a la Depuración** | Todas las tablas (`inv_campamentos`, `inv_almacenes`, `inv_articulos`, etc.) | Respaldo íntegro de seguridad y trazabilidad. |

---

## 3. AUDITORÍA DE CAMPAMENTOS Y ALMACENES

### 3.1 Clasificación de los 8 Registros en `inv_campamentos`

| ID | Código | Nombre en Base de Datos | Provincia / Ubicación | Clasificación (`clasificacion_sede`) | `es_sintetico` | Almacenes Asociados (`inv_almacenes`) | Artículos Reales (`es_sintetico = 0`) | Artículos Sintéticos (`es_sintetico = 1`) | Levantamientos Reales / Sintéticos |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **3** | `ALM-27FEB` | **`ALMACÉN 27 DE FEBRERO`** | Distrito Nacional (`AV. 27 DE FEBRERO`) | **`A. CONFIRMADO POR EL USUARIO`** (`CONFIRMADO`) | `0` | **1** (`ID 5`: *Almacén General 27 de Febrero*) | **84** (`416 u.`) | `0` | `0 / 0` |
| **12** | `CAMP-OPL` | **`OPL`** | Santo Domingo Oeste (`KM 19 AUTOPISTA DUARTE`) | **`A. CONFIRMADO POR EL USUARIO`** (`CONFIRMADO`) | `0` | **1** (`ID 10`: *Almacén General OPL*) | **136** (`762 u.`) | `0` | `0 / 0` |
| **13** | `MANT-633` | **`MANTENIMIENTO 633`** | Santo Domingo (`MANTENIMIENTO 633`) | **`A. CONFIRMADO POR EL USUARIO`** (`CONFIRMADO`) | `0` | **1** (`ID 11`: *Almacén Mantenimiento 633*) | **109** (`685 u.`) | `0` | `0 / 0` |
| **4** | `CAMP-SC` | `Campamento San Cristóbal` | San Cristóbal | **`B. PENDIENTE DE VALIDACIÓN`** (`PENDIENTE_VALIDACION`) | `0` | **1** (`ID 6`: *Bodega Técnica San Cristóbal*) | **0** | `0` | `0 / 0` |
| **5** | `CAMP-AZUA` | `Campamento Azua` | Azua | **`B. PENDIENTE DE VALIDACIÓN`** (`PENDIENTE_VALIDACION`) | `0` | **1** (`ID 7`: *Almacén Operativo Azua*) | **0** | `0` | `0 / 0` |
| **6** | `CAMP-PED` | `Campamento Pedernales` | Pedernales | **`B. PENDIENTE DE VALIDACIÓN`** (`PENDIENTE_VALIDACION`) | `0` | **1** (`ID 8`: *Depósito Proyecto Pedernales*) | **0** | `0` | `0 / 0` |
| **1** | `CAMP-CENTRAL-REAL` | `Campamento Base Central Real` | Santo Domingo | **`C. SINTÉTICO DE PRUEBA`** (`SINTETICO_PRUEBA`) | `1` | **3** (`IDs 1, 2, 4`: sintéticos) | `0` | **13** | `0 / 1` (`LEV-2026-0001`) |
| **2** | `CAMP-SC-REAL` | `Campamento San Cristóbal Real` | San Cristóbal | **`C. SINTÉTICO DE PRUEBA`** (`SINTETICO_PRUEBA`) | `1` | **1** (`ID 3`: sintético) | `0` | **3** | `0 / 1` (`LEV-2026-0002`) |

> **Nota sobre `D. DUPLICADOS O POSIBLES EQUIVALENCIAS`:** En Clever Cloud productivo existe el registro `ID 7` (`CAMP-KM19`, *Campamento Base Central KM 19*), el cual fue creado durante la migración inicial multi-almacén interpretando erróneamente que `KM 19` era un único campamento que agrupaba `OPL` y `MANTENIMIENTO 633`. En el modelo depurado local no se creó ningún campamento llamado `KM 19`, respetando la independencia absoluta de **`OPL`** (`ID 12`) y **`MANTENIMIENTO 633`** (`ID 13`).

---

## 4. ESTRUCTURA REAL DE LOS TRES CAMPAMENTOS CONFIRMADOS

De conformidad con la instrucción expresa de la gerencia de INGMELEC, el sistema opera con **tres sedes o campamentos confirmados e independientes**:

### 4.1 Sede 1: `ALMACÉN 27 DE FEBRERO` (`ID = 3`, Código `ALM-27FEB`)
- **Ubicación geográfica:** Distrito Nacional, Av. 27 de Febrero.
- **Almacén interno principal:** `Almacén General 27 de Febrero` (`ID = 5`, código `BOD-27FEB-01`).
- **Ubicación histórica equivalente en Excel:** `DISTRITO NACIONAL 27 DE FEBRERO`.
- **Inventario vinculado:** **84 artículos maestros** (**416 unidades físicas conocidas** + **2 artículos con cantidad pendiente de verificación**: `INF-001` y `HER-220`).
- **Distribución departamental:**
  - `INFORMATICA`: **23 artículos** (**30 unidades físicas**, `1` cantidad pendiente: `INF-001`).
  - `OFICINAS`: **26 artículos** (**26 unidades físicas**, `0` pendientes).
  - `COCINA`: **0 artículos**.
  - `ALMACEN`: **35 artículos** (**360 unidades físicas**, `1` cantidad inválida/pendiente: `HER-220` con texto `'B'`).
- **Usuario operativo de prueba asignado:** `usuario-operativo@ejemplo.local` (restringido exclusivamente a `campamento_id = 3`).

### 4.2 Sede 2: `OPL` (`ID = 12`, Código `CAMP-OPL`)
- **Ubicación geográfica:** `KM 19 AUTOPISTA DUARTE`, Santo Domingo Oeste (referencia geográfica/dirección física, no un campamento padre).
- **Almacén interno principal:** `Almacén General OPL` (`ID = 10`, código `BOD-OPL-01`).
- **Ubicación histórica equivalente en Excel:** `KM 19 AUTOPISTA DUARTE OPL`.
- **Custodio histórico en Excel:** `JONATHAN HERNANDEZ`.
- **Inventario vinculado:** **136 artículos maestros** (**762 unidades físicas conocidas**, **0 cantidades pendientes**).
- **Distribución departamental:**
  - `ALMACEN`: **136 artículos** (`HER-001` a `HER-136`, **762 unidades físicas**).
- **Usuario operativo de prueba asignado:** `usuario-operativo@ejemplo.local` (restringido exclusivamente a `campamento_id = 12`).

### 4.3 Sede 3: `MANTENIMIENTO 633` (`ID = 13`, Código `MANT-633`)
- **Ubicación geográfica:** `MANTENIMIENTO 633`, Santo Domingo (sede independiente; no agrupada dentro de `OPL`).
- **Almacén interno principal:** `Almacén Mantenimiento 633` (`ID = 11`, código `BOD-MANT633-01`).
- **Ubicaciones históricas equivalentes en Excel:** `MANTENIMIENTO 633` (bloque principal de 90 registros + adenda de 19 registros en filas 315–333 de la hoja `ALMACEN`).
- **Custodio histórico en Excel:** `WILLIAM ALMANZAR`.
- **Inventario vinculado:** **109 artículos maestros** (**685 unidades físicas conocidas**, **0 cantidades pendientes**).
- **Distribución departamental:**
  - `ALMACEN`: **109 artículos** (`90` registros `HER-137`..`HER-226` con `451` unidades + `19` registros de adenda `HER-253`..`HER-271` con `234` unidades = **685 unidades físicas**).
- **Usuario operativo de prueba asignado:** `usuario-operativo@ejemplo.local` (restringido exclusivamente a `campamento_id = 13`).

---

## 5. CONCILIACIÓN DE UBICACIONES HISTÓRICAS CON CAMPAMENTOS

| Ubicación Histórica en Excel (`ubicacion_nombre`) | Hoja(s) del Excel | Registros Maestros | Unidades Físicas Conocidas | Cantidades Pendientes (`NULL`) | Estado de Vinculación (`estado_vinculacion_sede`) | Campamento Vinculado (`campamento_id`) | Almacén Vinculado (`almacen_id`) |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| **`DISTRITO NACIONAL 27 DE FEBRERO`** | `INFORMATICA` (23), `OFICINAS` (26), `ALMACEN` (35) | **84** | **416** | **2** (`INF-001`, `HER-220`) | `UBICACION_HISTORICA_COMPATIBLE` | **`3` — `ALMACÉN 27 DE FEBRERO`** | `5` — *Almacén General 27 de Febrero* |
| **`KM 19 AUTOPISTA DUARTE OPL`** | `ALMACEN` (136) | **136** | **762** | **0** | `UBICACION_HISTORICA_COMPATIBLE` | **`12` — `OPL`** | `10` — *Almacén General OPL* |
| **`MANTENIMIENTO 633`** | `ALMACEN` (90 base + 19 adenda = 109) | **109** | **685** | **0** | `UBICACION_HISTORICA_COMPATIBLE` | **`13` — `MANTENIMIENTO 633`** | `11` — *Almacén Mantenimiento 633* |
| **`KM 19 AUT DUARTE`** | `INFORMATICA` (61), `OFICINAS` (43) | **104** | **108** | **21** (`INF-065`..`INF-085`) | **`SEDE_AMBIGUA`** | **`NULL` — `SIN SEDE VERIFICADA`** | `NULL` |
| **TOTAL CONCILIADO** | **Todas las hojas** | **433** | **1,971** | **23** | **100 % Trazable** | **329 vinculados + 104 sin sede** | **329 vinculados + 104 sin sede** |

---

## 6. TRATAMIENTO DE `KM 19 AUT DUARTE` (104 ARTÍCULOS AMBIGUOS)

### 6.1 Diagnóstico Documental Exacto
En el archivo `Ingmelec_Levantamiento_Sencillo_2026-10-16 (1)(1).xlsx`, existen exactamente **104 artículos** cuya columna de ubicación dice literalmente **`KM 19 AUT DUARTE`**, sin especificar si corresponden a **`OPL`**, a **`MANTENIMIENTO 633`** o a oficinas administrativas/informática ubicadas en el predio del Km 19:

1. **Hoja `INFORMATICA` (61 artículos, `INF-024` a `INF-085`, excluyendo duplicado en numeración):**
   - **40 artículos con cantidad conocida (`1` unidad cada uno = `40 unidades físicas`)** y **21 artículos con cantidad vacía (`INF-065` a `INF-085`, `cantidad_num = NULL`)**.
   - **Zonas/ Sub-ubicaciones registradas en el Excel:** `OFICINA PRINCIPAL` (57 registros), `OFICINA DE CONTABILIDAD` (2 registros), `SALA DE REUNIONES` (1 registro), `OFICINA DE INGENIERIA` (1 registro).
   - **Custodios principales:** `INGMELEC` (21), `WENDY MERCEDES` (4), `LUIS MIGUEL` (3), `CARLOS MANUEL` (3), `YOMAIRA` (3), `FRANCISCO` (2), `YUDELKA` (2), entre otros.
2. **Hoja `OFICINAS` (43 artículos, `OFI-025` a `OFI-063`, incluyendo códigos repetidos históricos):**
   - **43 artículos con cantidad conocida = `68 unidades físicas`** (`0` cantidades vacías).
   - **Zonas / Sub-ubicaciones registradas en el Excel:** `OFICINA DE CONTABILIDAD` (8), `SALA DE REUNIONES` (6), `OFICINA DE GERENCIA` (5), `OFICINA DE INGENIERIA` (5), `OFICINA DE RECURSOS HUMANOS` (5), `RECEPCION` (5), `OFICINA DE COMPRAS` (4), `BAÑO` (2), `COCINA` (2 — mobiliario de oficina en área cocina), `ARCHIVO` (1).
   - **Custodios principales:** `CONTABILIDAD` (8), `SALA DE REUNIONES` (6), `GERENCIA` (5), `INGENIERIA` (5), `RECURSOS HUMANOS` (5), `RECEPCION` (5), `COMPRAS` (4).

### 6.2 Regla Aplicada en el Sistema
Cumpliendo estrictamente la orden de **no asignar arbitrariamente estos 104 registros a `OPL` ni a `MANTENIMIENTO 633`**:
- Se conservaron intactos su texto histórico `ubicacion_nombre = 'KM 19 AUT DUARTE'`, sus códigos originales, sus zonas/estantes y sus custodios.
- Su campo `campamento_id` permanece en `NULL` y su `estado_vinculacion_sede` es `'SEDE_AMBIGUA'`.
- En el Dashboard General, Inventario Maestro, Sedes y Reportes aparecen claramente identificados como **`SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)`**, permitiendo filtrarlos con un solo clic (`104 registros / 108 unidades físicas / 21 cantidades pendientes`).

---

## 7. ESTADÍSTICAS COMPLETAS POR CAMPAMENTO (13 MÉTRICAS OBLIGATORIAS)

La nueva sección **`INVENTARIO POR CAMPAMENTO`** del Dashboard General presenta en tiempo real las **13 métricas requeridas** para cada campamento confirmado y para el bloque pendiente de clasificación:

| Métrica | `ALMACÉN 27 DE FEBRERO` (`ID 3`) | `OPL` (`ID 12`) | `MANTENIMIENTO 633` (`ID 13`) | Subtotal Sedes Confirmadas | `SIN SEDE VERIFICADA` (`KM 19 AUT DUARTE`) | **TOTAL EMPRESARIAL CONCILIADO** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Nombre del Campamento** | `ALMACÉN 27 DE FEBRERO` | `OPL` | `MANTENIMIENTO 633` | **3 Sedes Confirmadas** | `SIN SEDE VERIFICADA` | **Global INGMELEC** |
| **2. Cantidad de Almacenes** | `1` | `1` | `1` | **`3`** | `0` | **`3` confirmados (+3 pend.)** |
| **3. Total Registros Maestros** | **`84`** | **`136`** | **`109`** | **`329`** | **`104`** | **`433`** |
| **4. Total Unidades Físicas Conocidas** | **`416`** | **`762`** | **`685`** | **`1,863`** | **`108`** | **`1,971`** |
| **5. Artículos por Departamento** | `INF: 23 \| OFI: 26 \| COC: 0 \| ALM: 35` | `INF: 0 \| OFI: 0 \| COC: 0 \| ALM: 136` | `INF: 0 \| OFI: 0 \| COC: 0 \| ALM: 109` | `INF: 23 \| OFI: 26 \| COC: 0 \| ALM: 280` | `INF: 61 \| OFI: 43 \| COC: 0 \| ALM: 0` | **`INF: 84 \| OFI: 69 \| COC: 0 \| ALM: 280`** |
| **6. Artículos Buenos (`Bueno`)** | `76` | `97` | `86` | `259` | `83` | **`342`** |
| **7. Artículos Regulares (`Regular`)** | `6` | `35` | `2` | `43` | `0` | **`43`** |
| **8. Artículos Dañados (`Dañado`)** | `1` | `4` | `2` | `7` | `0` | **`7`** |
| **9. Artículos Fuera de Servicio** | `0` | `0` | `0` | `0` | `0` | **`0`** |
| **10. Artículos Pendientes de Verificación** | `1` (`INF-001` estado vacío + `2` cant. nula) | `0` | `19` (adenda sin estado físico) | `20` (estado) / `2` (cant.) | `21` (`INF-065`..`085` sin estado ni cant.) | **`41` (estado) / `23` (cantidad)** |
| **11. Artículos Sin Serie (`S/N`, `N/A`, vacío)** | `43` | `136` | `109` | `288` | `7` | **`295`** |
| **12. Levantamientos Abiertos** | `0` | `0` | `0` | `0` | `N/A` | **`0`** |
| **13. Levantamientos Finalizados** | `0` | `0` | `0` | `0` | `N/A` | **`0`** |

---

## 8. CONSISTENCIA MATEMÁTICA VERIFICADA

Se verificó en SQL, en los endpoints del backend (`/api/v2/dashboard/kpis`, `/api/v2/articulos`, `/api/v2/campamentos`, `/api/v2/reportes/consolidado`, `/api/v2/reportes/exportar`) y en la interfaz de usuario que todas las ecuaciones de control cuadran sin discrepancias:

$$\text{TOTAL GENERAL DE ARTÍCULOS} = 84 + 136 + 109 + 104 = 329 + 104 = 433$$

$$\text{TOTAL UNIDADES FÍSICAS CONOCIDAS} = 416 + 762 + 685 + 108 = 1,863 + 108 = 1,971$$

$$\text{TOTAL POR DEPARTAMENTO} = 84\text{ (INFORMATICA)} + 69\text{ (OFICINAS)} + 0\text{ (COCINA)} + 280\text{ (ALMACEN)} = 433$$

$$\text{TOTAL CANTIDADES PENDIENTES (NULL)} = 2\text{ (en ALMACÉN 27 DE FEBRERO)} + 21\text{ (en KM 19 AUT DUARTE)} = 23$$

$$\text{TOTAL ARTÍCULOS CON CANTIDAD VERIFICADA} = 433 - 23 = 410\text{ artículos (que suman exactamente } 1,971\text{ unidades)}$$

- **Criterio unificado de `Sin Serie` (`SQL_SIN_SERIAL_CONDITION`):** Evalúa de forma idéntica en todos los módulos `serie_imei IS NULL OR TRIM(serie_imei) = '' OR UPPER(TRIM(serie_imei)) IN ('N/A', 'S/N', 'SIN SERIE', 'NONE', 'NULL', '--', '-')`, arrojando **295 artículos sin serie** tanto en el KPI global como en la suma por campamentos (`43 + 136 + 109 + 7 = 295`).

---

## 9. LIMPIEZA Y SEPARACIÓN DE DATOS SINTÉTICOS

### 9.1 Mecanismo Estructurado Implementado
En lugar de depender únicamente de texto libre en `observaciones`, se implementó separación a nivel de esquema en `server/database/migrations/migration_integridad_campamentos_sinteticos.sql`:
- `inv_articulos.es_sintetico TINYINT(1) NOT NULL DEFAULT 0`
- `inv_articulos.origen_datos ENUM('HISTORICO_EXCEL', 'OPERATIVO_REAL', 'SINTETICO_PRUEBA') NOT NULL DEFAULT 'OPERATIVO_REAL'`
- `inv_articulos.estado_vinculacion_sede ENUM('CONFIRMADO', 'ALMACEN_CONFIRMADO', 'UBICACION_HISTORICA_COMPATIBLE', 'SEDE_AMBIGUA', 'PENDIENTE_ASIGNACION', 'SINTETICO')`
- `inv_campamentos.clasificacion_sede ENUM('CONFIRMADO', 'PENDIENTE_VALIDACION', 'SINTETICO_PRUEBA', 'DUPLICADO_EQUIVALENTE')`
- `es_sintetico TINYINT(1) NOT NULL DEFAULT 0` en `inv_campamentos`, `inv_almacenes`, `inv_levantamientos`, `inv_levantamiento_items`, `inv_movimientos`, `inv_custodios` e `inv_categorias`.

### 9.2 Inventario de Registros Sintéticos Aislados (`es_sintetico = 1`)
Ningún registro fue eliminado sin autorización; los siguientes **18 artículos sintéticos** quedaron preservados pero aislados (`es_sintetico = 1`):
- **Cocina (2 registros):** `COC-001` (*Cafetera Industrial 12 Tazas*, 2 u.) y `COC-002` (* Dispensador de Agua Fría/Caliente*, 3 u.).
- **Semilla de pruebas aisladas (15 registros):** `HERR-REAL-001` a `HERR-REAL-004`, `ELEC-REAL-001` a `ELEC-REAL-003`, `COMP-REAL-001` a `COMP-REAL-003`, `OFIC-REAL-001` a `OFIC-REAL-002`, `SEG-REAL-001` a `SEG-REAL-005`.
- **Artefactos E2E Playwright (1 registro):** `HER-001` (*Multímetro Fluke E2E-1793722112702*, 2 u.).

### 9.3 Script Seguro de Control y Reinicio de Datos Sintéticos
Se creó el script `server/scripts/reset-isolated-synthetic-db.js`:
- **Modo auditoría (por defecto, solo lectura):** `node server/scripts/reset-isolated-synthetic-db.js` muestra el conteo exacto de registros reales (`433`) vs sintéticos (`18`).
- **Modo aislamiento autorizado:** `node server/scripts/reset-isolated-synthetic-db.js --confirm-authorized-reset` asegura que todo registro sintético tenga `es_sintetico = 1` sin tocar jamás los 433 registros reales.
- **Bloqueo de seguridad:** Aborta inmediatamente si el host no es `127.0.0.1` / `localhost` o si el puerto no es `3308`.

---

## 10. ESTADO REAL DEL MÓDULO COCINA

1. **Verificación en el Excel Original (`Ingmelec_Levantamiento_Sencillo_2026-10-16 (1)(1).xlsx`):** La hoja `COCINA` contiene únicamente los encabezados institucionales y la fila de columnas (`CODIGO`, `ARTICULO`, `CANTIDAD`, etc.), con **0 filas de bienes registrados**.
2. **Verificación en Clever Cloud y MariaDB Local:** El registro `COC-001` (*Cafetera Industrial 12 Tazas*) fue creado por el script de prueba `server/tests/test-fase2-integrity.js` y `COC-002` fue creado en la semilla local de pruebas.
3. **Estado Actual en la Interfaz (`CocinaPage.jsx`):**
   - Muestra **0 activos reales** en la vista empresarial por defecto, reflejando con total honestidad el estado documental real del departamento de Cocina.
   - Incluye un banner informativo claro explicando que la hoja `COCINA` del levantamiento del 16 de octubre de 2026 tiene `0` registros reales y que los `2` registros sintéticos (`COC-001` y `COC-002`) están aislados.
   - Permite al Desarrollador alternar un botón (`Ver 2 Sintéticos Aislados` / `Mostrando Sintéticos (2)`) si desea inspeccionar las pruebas aisladas, manteniendo el módulo 100 % habilitado para registrar futuros activos reales de Cocina y Comedor.

---

## 11. FUNCIONES VERIFICADAS DEL DESARROLLADOR PRINCIPAL

Con las credenciales de Desarrollador Principal (`developer@ingmelec.com`), se comprobaron las siguientes capacidades globales:
1. **Visión Global Multi-Sede:** Consulta de los 3 campamentos confirmados, los 3 pendientes de validación, los 3 almacenes confirmados y el inventario global completo (`433 artículos / 1,971 unidades`).
2. **Filtros Avanzados Combinables:** Filtrado por campamento (`ALMACÉN 27 DE FEBRERO`, `OPL`, `MANTENIMIENTO 633`), por artículos `SIN SEDE VERIFICADA (104)`, por departamento (`INFORMATICA`, `OFICINAS`, `COCINA`, `ALMACEN`), por estado físico, por artículos sin serie (`295`) y por artículos con cantidad pendiente (`23`).
3. **Operaciones Transaccionales Completas:** Creación de artículos vinculados automáticamente al campamento y almacén correspondientes, edición de artículos, registro de movimientos transaccionales (`ENTRADA`, `SALIDA`, `TRASLADO`, `ASIGNACION`, `DEVOLUCION`, `AJUSTE`) y creación de levantamientos físicos por sede.
4. **Administración Exclusiva de Usuarios y Permisos:** Acceso exclusivo a `/api/v2/usuarios` y a la vista de Administración de Usuarios; bloqueo estricto HTTP `403` y ocultamiento en UI para cualquier otro rol (`supervisor`, `almacen`, `auditor`, `gerencia`).
5. **Limitación Real Documentada sobre Clever Cloud Productivo:** El usuario MySQL configurado en Clever Cloud (`u...`) posee permisos `SELECT, INSERT, UPDATE, DELETE` sobre las tablas existentes, pero **carece de privilegios `ALTER` y `CREATE`** en el plan compartido de Clever Cloud. Por tanto, cualquier migración DDL futura en producción requerirá ejecutarse desde la consola de administración de Clever Cloud o mediante una cuenta propietaria con privilegios DDL, y nunca de forma automática desde el backend.

---

## 12. PRUEBAS SQL REALIZADAS

Ejecutadas directamente contra MariaDB `127.0.0.1:3308` (`ingmelec_test_isolated`):
- `SELECT es_sintetico, origen_datos, estado_vinculacion_sede, COUNT(*) as registros, SUM(COALESCE(cantidad_num, 0)) as unidades_fisicas, SUM(CASE WHEN cantidad_num IS NULL THEN 1 ELSE 0 END) as sin_cantidad FROM inv_articulos WHERE activo = 1 GROUP BY es_sintetico, origen_datos, estado_vinculacion_sede`:
  - `es_sintetico = 0 | HISTORICO_EXCEL | UBICACION_HISTORICA_COMPATIBLE`: **329 registros**, **1,863 unidades físicas**, **2 sin cantidad**.
  - `es_sintetico = 0 | HISTORICO_EXCEL | SEDE_AMBIGUA`: **104 registros**, **108 unidades físicas**, **21 sin cantidad**.
  - `es_sintetico = 1 | SINTETICO_PRUEBA | SINTETICO`: **18 registros**, **172 unidades físicas**, **0 sin cantidad**.
- `SELECT c.id, c.codigo, c.nombre, c.clasificacion_sede, COUNT(a.id) as articulos_reales, SUM(COALESCE(a.cantidad_num, 0)) as unidades_reales FROM inv_campamentos c LEFT JOIN inv_articulos a ON a.campamento_id = c.id AND a.activo = 1 AND a.es_sintetico = 0 GROUP BY c.id`:
  - `ID 3 (ALMACÉN 27 DE FEBRERO)`: **84 artículos**, **416 unidades**.
  - `ID 12 (OPL)`: **136 artículos**, **762 unidades**.
  - `ID 13 (MANTENIMIENTO 633)`: **109 artículos**, **685 unidades**.
  - `IDs 4, 5, 6 (San Cristóbal, Azua, Pedernales)`: **0 artículos**, estado `PENDIENTE_VALIDACION`.

---

## 13. PRUEBAS API REALIZADAS (`15/15` ESCENARIOS APROBADOS)

Ejecutadas mediante `server/scripts/verify-all-15-scenarios.js` contra `http://127.0.0.1:5000/api/v2` (resultados guardados en `server/scripts/verification_15_scenarios_results.json`):

| Escenario | Prueba Ejecutada | Resultado | Evidencia Verificada |
| :---: | :--- | :---: | :--- |
| **01** | Login como `developer` (`developer@ingmelec.com`) | **PASÓ** | `rol: "developer"`, `es_developer: 1`, JWT emitido. |
| **02** | Visualización del Dashboard General con datos reales | **PASÓ** | `totalArticulos: 433`, `cantidadFisicaTotal: 1971`, `articulosSinCantidad: 23`, `COCINA: 0`. |
| **03** | Visualización de los 3 campamentos confirmados | **PASÓ** | `ALMACÉN 27 DE FEBRERO (84/416)`, `OPL (136/762)`, `MANTENIMIENTO 633 (109/685)`. |
| **04** | Estadísticas por campamento (13 métricas) y cuadre matemático | **PASÓ** | `329 confirmados + 104 sin sede = 433`; `1863 + 108 = 1971`; `cuadraArticulos: true`, `cuadraUnidades: true`. |
| **05** | Filtro en `ALMACÉN 27 DE FEBRERO` (`campamento_id=3`) | **PASÓ** | `84 registros`, `416 unidades físicas`, `2 cantidades pendientes`. |
| **06** | Filtro en `OPL` (`campamento_id=12`) | **PASÓ** | `136 registros`, `762 unidades físicas`, `0 cantidades pendientes`. |
| **07** | Filtro en `MANTENIMIENTO 633` (`campamento_id=13`) | **PASÓ** | `109 registros` (`90 base + 19 adenda`), `685 unidades físicas`. |
| **08** | Filtro en artículos `SIN SEDE VERIFICADA` (`campamento_id=SIN_SEDE`) | **PASÓ** | `104 registros` (`61 INF + 43 OFI`), `108 unidades físicas`, `21 cantidades pendientes`. |
| **09** | Módulo Cocina sin datos sintéticos | **PASÓ** | `0` registros en vista empresarial (`area=COCINA`); `2` en vista sintética (`incluir_sinteticos=true`). |
| **10** | Creación de artículo nuevo vinculado a campamento | **PASÓ** | HTTP `201`, vinculado automáticamente a `campamento_id: 13`, `almacen_id: 11`, `CONFIRMADO`. |
| **11** | Registro de movimiento transaccional en campamento | **PASÓ** | HTTP `200`, actualización transaccional de stock verificada (`2 + 3 = 5`). |
| **12** | Creación de levantamiento físico en campamento | **PASÓ** | HTTP `201`, código `LEV-2026-0003` generado y vinculado a `MANTENIMIENTO 633`. |
| **13** | Exportación CSV de un campamento y global | **PASÓ** | Exportación `OPL`: `136 registros / 762 u.`; Exportación global: `433 registros / 1,971 u.`. |
| **14** | Restricción de usuario operativo a su campamento asignado | **PASÓ** | Usuario `27 Feb` ve `84` (y recibe HTTP `403` al pedir `OPL`); usuario `OPL` ve `136`; usuario `Mant 633` ve `109`. |
| **15** | Bloqueo exclusivo de gestión de usuarios para roles no developer | **PASÓ** | `almacen` y `supervisor` reciben HTTP `403` en `/api/v2/usuarios`; `developer` recibe HTTP `200`. |

---

## 14. PRUEBAS PLAYWRIGHT REALIZADAS

Se ejecutó la suite E2E `e2e/campamentos-conciliacion-stats.spec.js` en navegador real Chromium contra `http://localhost:5173`, comprobando visualmente:
- Login del Desarrollador Principal y renderizado del banner `Inventario Empresarial Conciliado con Levantamiento Documental`.
- Renderizado de la tabla **`INVENTARIO POR CAMPAMENTO`** con las filas de `ALMACÉN 27 DE FEBRERO (84 / 416)`, `OPL (136 / 762)`, `MANTENIMIENTO 633 (109 / 685)`, la fila `SIN SEDE VERIFICADA (104 / 108)` y el pie de tabla con el sello `CUADRE EXACTO (329 confirmados + 104 sin sede = 433)`.
- Navegación interactiva haciendo clic en cada campamento desde el Dashboard hacia el Inventario Maestro filtrado y verificando los conteos en pantalla.
- Verificación visual del módulo **Cocina y Comedor** mostrando `0 Reales` y `2 Sintéticos Aislados`.
- Verificación visual del módulo **Reportes y Exportación** mostrando `433` registros y `1,971` unidades físicas.
- Login de usuario operativo (`usuario-operativo@ejemplo.local`) verificando que solo visualiza los `136` activos y `762` unidades de `OPL`, y que el módulo de Administración de Usuarios no aparece en su menú lateral.

---

## 15. PENDIENTES QUE REQUIEREN DECISIÓN HUMANA

Para culminar el paso a operación productiva definitiva, se presentan los siguientes **4 puntos que requieren decisión explícita de la gerencia / Desarrollador Principal**:

1. **Clasificación de los 104 Artículos de `KM 19 AUT DUARTE` (`61 INFORMATICA` + `43 OFICINAS`):**
   - **Opción A:** Asignarlos a **`OPL`** si las oficinas administrativas y de informática del Km 19 operan bajo la administración de la sede `OPL`.
   - **Opción B:** Crear una cuarta sede administrativa independiente (ej. **`OFICINAS GENERALES KM 19`**) para separar los activos de oficina/informática del almacén operativo `OPL` y de `MANTENIMIENTO 633`.
   - **Opción C:** Clasificarlos individualmente por departamento/oficina (`OFICINA DE CONTABILIDAD`, `GERENCIA`, `INGENIERIA`, `RECURSOS HUMANOS`, `OFICINA PRINCIPAL`) entre las sedes existentes.
2. **Destino de los 3 Campamentos sin Respaldo en el Excel (`San Cristóbal`, `Azua`, `Pedernales`):**
   - Actualmente tienen `0` artículos y están en estado `PENDIENTE_VALIDACION` (fuera del bloque de sedes confirmadas). Debe decidirse si se mantienen en reserva para futuros proyectos regionales o si se desactivan (`activo = 0`).
3. **Verificación Física de las 23 Cantidades Pendientes (`NULL`):**
   - **En `ALMACÉN 27 DE FEBRERO` (2 registros):** `INF-001` (cantidad vacía en Excel) y `HER-220` (texto inválido `'B'` en columna cantidad del Excel).
   - **En `KM 19 AUT DUARTE` (21 registros):** `INF-065` a `INF-085` (equipos informáticos registrados sin cantidad numérica en las filas 71–91 de la hoja `INFORMATICA`).
4. **Autorización para Sincronización Futura con Clever Cloud (Producción):**
   - Todo el trabajo se ha realizado y verificado exclusivamente en local (`MariaDB :3308`). No se ejecutará ninguna escritura ni migración sobre Clever Cloud ni despliegue a Render/GitHub hasta recibir su autorización expresa y definir la ventana de mantenimiento con permisos DDL en Clever Cloud.
